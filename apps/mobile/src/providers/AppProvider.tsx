import {
  calculatePortfolio,
  calculateRebalance,
  applyControlCommand,
  type ArcaClass,
  type PortfolioSummary,
  type PlanningProfile,
} from "@arca/domain";
import Decimal from "decimal.js";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { fetchMarketQuote } from "@/api/market";
import { syncControl } from "@/api/control";
import { readFinanceKey } from "@/api/finance-key";
import { loadControlBundle, saveControlBundle, withControlLock } from "@/db/control";
import {
  getSetting,
  getActivePlan,
  getTargets,
  isLatestSnapshotAcknowledged,
  listAssets,
  loadPositions,
  migrateDatabase,
  saveDailySnapshot,
  saveQuote,
  type Asset,
} from "@/db/database";

interface AppContextValue {
  ready: boolean;
  startupError: string | null;
  onboarded: boolean;
  assets: Asset[];
  portfolio: PortfolioSummary;
  strategyPortfolio: PortfolioSummary;
  activePlan: PlanningProfile | null;
  reserveValue: string;
  registeredReserveValue: string;
  hasReserveAssets: boolean;
  tolerance: string;
  rebalanceAcknowledged: boolean;
  refresh: () => Promise<void>;
  syncQuotes: () => Promise<void>;
}

const emptyTargets = Object.fromEntries(
  ["BRAZIL_STOCKS", "REAL_ESTATE", "CASH_FIXED_INCOME", "INTERNATIONAL"].map(
    (key) => [key, "25"],
  ),
) as Record<ArcaClass, string>;
const emptyPortfolio = calculatePortfolio([], emptyTargets);
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState(emptyPortfolio);
  const [strategyPortfolio, setStrategyPortfolio] = useState(emptyPortfolio);
  const [activePlan, setActivePlan] = useState<PlanningProfile | null>(null);
  const [reserveValue, setReserveValue] = useState("0.00");
  const [registeredReserveValue, setRegisteredReserveValue] = useState("0.00");
  const [hasReserveAssets, setHasReserveAssets] = useState(false);
  const [tolerance, setTolerance] = useState("5");
  const [rebalanceAcknowledged, setRebalanceAcknowledged] = useState(false);

  const refresh = useCallback(() => withControlLock(async () => {
    setStartupError(null);
    try {
      await migrateDatabase();
      // expo-sqlite shared statements can be invalidated when the same Android
      // connection prepares several statements concurrently. Keep startup reads
      // sequential and reuse the already loaded asset list.
      const nextAssets = await listAssets();
      const positions = await loadPositions(nextAssets);
      const targets = await getTargets();
      const plan = await getActivePlan();
      const completed = await getSetting("onboarding_complete");
      const toleranceValue = await getSetting("drift_tolerance");
      const nextPortfolio = calculatePortfolio(positions, targets);
      const reserveIds = new Set(
        nextAssets
          .filter((asset) => asset.bucket === "RESERVE")
          .map((asset) => asset.id),
      );
      const registeredReserve = positions
        .filter((position) => reserveIds.has(position.assetId))
        .reduce(
          (total, position) => total.plus(position.marketValue),
          new Decimal(0),
        )
        .toFixed(2);
      setAssets(
        nextAssets.map((asset) => ({
          ...asset,
          currentValue:
            positions.find((position) => position.assetId === asset.id)
              ?.marketValue ?? "0.00",
        })),
      );
      setPortfolio(nextPortfolio);
      setStrategyPortfolio(
        calculatePortfolio(
          positions.filter((position) => !reserveIds.has(position.assetId)),
          targets,
        ),
      );
      setActivePlan(plan);
      setRegisteredReserveValue(registeredReserve);
      setHasReserveAssets(reserveIds.size > 0);
      setReserveValue(
        reserveIds.size > 0
          ? registeredReserve
          : new Decimal(plan?.reserveAmount ?? "0").toFixed(2),
      );
      setOnboarded(completed === "true");
      setTolerance(toleranceValue ?? "5");
      await saveDailySnapshot(
        nextPortfolio.totalValue,
        nextPortfolio.allocations,
      );
      setRebalanceAcknowledged(await isLatestSnapshotAcknowledged());
      try {
      const bundle = await loadControlBundle();
      // A new installation must pull an existing online budget before publishing
      // its portfolio. Offline edits to an already initialized cache remain local.
      const mayPublish = bundle.state.revision > 0 || !(await readFinanceKey());
      if (mayPublish && !bundle.conflict && !bundle.restorePending) {
        const cents = (value: string) => new Decimal(value).times(100).toDecimalPlaces(0).toNumber();
        const snapshot = {
          investedCents: cents(nextPortfolio.totalValue),
          reserveCents: cents(registeredReserve),
          contributionCents: bundle.state.settings.activeContributionCents,
          goalName: plan?.objective ?? null,
        };
        const previous = bundle.state.portfolio;
        const changed = !previous || previous.investedCents !== snapshot.investedCents ||
          previous.reserveCents !== snapshot.reserveCents || previous.contributionCents !== snapshot.contributionCents ||
          previous.goalName !== snapshot.goalName;
        const needsReview = previous && Date.now() - Date.parse(previous.updatedAt) >= 24 * 60 * 60 * 1000;
        if ((changed || needsReview) && (nextAssets.length > 0 || !previous?.investedCents)) {
          const now = new Date().toISOString();
          const command = { type: "SET_PORTFOLIO" as const, id: Crypto.randomUUID(), baseRevision: bundle.state.revision,
            createdAt: now, portfolio: { ...snapshot, updatedAt: now } };
          await saveControlBundle({ ...bundle, state: applyControlCommand(bundle.state, command), pending: [...bundle.pending, command] });
        }
      }
      } catch {
        // An unavailable finance cache/key must not prevent opening the portfolio.
      }
      setReady(true);
    } catch (error) {
      setStartupError(
        "Não foi possível abrir seus dados. Tente novamente; sua carteira não foi apagada.",
      );
      throw error;
    }
  }), []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  useEffect(() => {
    if (!ready) return;
    let running = false;
    const synchronize = async () => {
      if (running) return;
      running = true;
      try {
        if (!(await readFinanceKey())) return;
        await syncControl();
        await refresh();
        await syncControl();
      } catch {
        // The cached budget and its pending commands stay intact without network.
      } finally { running = false; }
    };
    void synchronize();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void synchronize(); });
    return () => subscription.remove();
  }, [ready, refresh]);

  const syncQuotes = useCallback(async () => {
    for (const asset of assets.filter((item) => item.quoteMode === "API")) {
      try {
        const quote = await fetchMarketQuote(asset.symbol);
        await saveQuote(asset.id, quote.price, quote.source, quote.capturedAt);
      } catch (error) {
        console.warn(`Falha ao atualizar ${asset.symbol}`, error);
      }
    }
    await refresh();
  }, [assets, refresh]);

  const value = useMemo(
    () => ({
      ready,
      startupError,
      onboarded,
      assets,
      portfolio,
      strategyPortfolio,
      activePlan,
      reserveValue,
      registeredReserveValue,
      hasReserveAssets,
      tolerance,
      rebalanceAcknowledged,
      refresh,
      syncQuotes,
    }),
    [
      ready,
      startupError,
      onboarded,
      assets,
      portfolio,
      strategyPortfolio,
      activePlan,
      reserveValue,
      registeredReserveValue,
      hasReserveAssets,
      tolerance,
      rebalanceAcknowledged,
      refresh,
      syncQuotes,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export function useRebalance() {
  const { strategyPortfolio, tolerance } = useApp();
  return calculateRebalance(strategyPortfolio, tolerance);
}
