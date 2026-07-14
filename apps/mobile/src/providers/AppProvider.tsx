import {
  calculatePortfolio,
  calculateRebalance,
  type ArcaClass,
  type PortfolioSummary,
} from "@arca/domain";
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
import {
  getSetting,
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
  onboarded: boolean;
  assets: Asset[];
  portfolio: PortfolioSummary;
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
  const [onboarded, setOnboarded] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState(emptyPortfolio);
  const [tolerance, setTolerance] = useState("5");
  const [rebalanceAcknowledged, setRebalanceAcknowledged] = useState(false);

  const refresh = useCallback(async () => {
    await migrateDatabase();
    // expo-sqlite shared statements can be invalidated when the same Android
    // connection prepares several statements concurrently. Keep startup reads
    // sequential and reuse the already loaded asset list.
    const nextAssets = await listAssets();
    const positions = await loadPositions(nextAssets);
    const targets = await getTargets();
    const completed = await getSetting("onboarding_complete");
    const toleranceValue = await getSetting("drift_tolerance");
    const nextPortfolio = calculatePortfolio(positions, targets);
    setAssets(nextAssets);
    setPortfolio(nextPortfolio);
    setOnboarded(completed === "true");
    setTolerance(toleranceValue ?? "5");
    await saveDailySnapshot(
      nextPortfolio.totalValue,
      nextPortfolio.allocations,
    );
    setRebalanceAcknowledged(await isLatestSnapshotAcknowledged());
    setReady(true);
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

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
      onboarded,
      assets,
      portfolio,
      tolerance,
      rebalanceAcknowledged,
      refresh,
      syncQuotes,
    }),
    [
      ready,
      onboarded,
      assets,
      portfolio,
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
  const { portfolio, tolerance } = useApp();
  return calculateRebalance(portfolio, tolerance);
}
