import {
  calculateLedger,
  nextContributionDate,
  getPlanTargets,
  localDateString,
  PlanningDraftSchema,
  PlanningProfileSchema,
  validatePlanningTargets,
  ReviewedImportTradeSchema,
  investmentTradeIdentity,
  type ReviewedImportTrade,
  type AssetBucket,
  type PlanningProfile,
  type ArcaClass,
  type PositionInput,
  type SnapshotValue,
} from "@arca/domain";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import Decimal from "decimal.js";

export type QuoteMode = "MANUAL" | "API";
export interface Asset {
  id: string;
  symbol: string;
  name: string;
  arcaClass: ArcaClass;
  assetType: string;
  quoteMode: QuoteMode;
  bucket: AssetBucket;
  active: number;
  price: string | null;
  priceCapturedAt: string | null;
  currentValue?: string;
}

let database: Promise<SQLite.SQLiteDatabase> | null = null;
let migration: Promise<void> | null = null;

export function getDatabase() {
  database ??= SQLite.openDatabaseAsync("arca-tracker.db");
  return database;
}

export function migrateDatabase(): Promise<void> {
  migration ??= performMigration().catch((error) => {
    migration = null;
    throw error;
  });
  return migration;
}

async function performMigration(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, arca_class TEXT NOT NULL,
      asset_type TEXT NOT NULL, quote_mode TEXT NOT NULL DEFAULT 'MANUAL', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS assets_symbol_active ON assets(symbol) WHERE active = 1;
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), type TEXT NOT NULL,
      trade_date TEXT NOT NULL, quantity TEXT NOT NULL, unit_price TEXT NOT NULL, fees TEXT NOT NULL DEFAULT '0', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS balance_adjustments (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), effective_date TEXT NOT NULL,
      balance TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), price TEXT NOT NULL,
      source TEXT NOT NULL, captured_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS quotes_asset_date ON quotes(asset_id, captured_at DESC);
    CREATE TABLE IF NOT EXISTS targets (arca_class TEXT PRIMARY KEY, target_percent TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projection_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1), annual_rate TEXT NOT NULL, monthly_contribution TEXT NOT NULL,
      offset_points TEXT NOT NULL, horizon_years INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (id TEXT PRIMARY KEY, captured_at TEXT NOT NULL UNIQUE, total_value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshot_positions (
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id), arca_class TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY(snapshot_id, arca_class)
    );
    CREATE TABLE IF NOT EXISTS rebalance_acknowledgements (snapshot_id TEXT PRIMARY KEY, acknowledged_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS saved_projections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, annual_rate TEXT NOT NULL, monthly_contribution TEXT NOT NULL,
      offset_points TEXT NOT NULL, horizon_years INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planning_profiles (
      kind TEXT PRIMARY KEY CHECK(kind IN ('draft', 'active')), profile_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  await db.withTransactionAsync(async () => {
    const assetColumns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(assets)",
    );
    if (!assetColumns.some((column) => column.name === "bucket")) {
      await db.execAsync(
        "ALTER TABLE assets ADD COLUMN bucket TEXT NOT NULL DEFAULT 'LONG_TERM' CHECK(bucket IN ('LONG_TERM', 'RESERVE'))",
      );
    }
    await db.runAsync(
      "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, ?)",
      new Date().toISOString(),
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)",
      new Date().toISOString(),
    );
    for (const arcaClass of [
      "BRAZIL_STOCKS",
      "REAL_ESTATE",
      "CASH_FIXED_INCOME",
      "INTERNATIONAL",
    ]) {
      await db.runAsync(
        "INSERT OR IGNORE INTO targets(arca_class, target_percent) VALUES (?, ?)",
        arcaClass,
        "25",
      );
    }
    await db.runAsync(
      "INSERT OR IGNORE INTO app_settings(key, value) VALUES ('onboarding_complete', 'false')",
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO app_settings(key, value) VALUES ('drift_tolerance', '5')",
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO app_settings(key, value) VALUES ('sync_frequency_minutes', '30')",
    );
    const previousProjection = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM projection_settings WHERE id=1",
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO app_settings(key,value) VALUES ('projection_legacy_available',?)",
      String(!!previousProjection),
    );
    await db.runAsync(
      "INSERT OR IGNORE INTO projection_settings(id, annual_rate, monthly_contribution, offset_points, horizon_years) VALUES (1, '0', '0', '0', 20)",
    );
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  return (
    (
      await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = ?",
        key,
      )
    )?.value ?? null
  );
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO app_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key,
    value,
  );
}

export async function getTargets(): Promise<Record<ArcaClass, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    arca_class: ArcaClass;
    target_percent: string;
  }>("SELECT * FROM targets");
  return Object.fromEntries(
    rows.map((row) => [row.arca_class, row.target_percent]),
  ) as Record<ArcaClass, string>;
}

export async function saveTargets(
  targets: Record<ArcaClass, string>,
): Promise<void> {
  validatePlanningTargets(targets);
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const [arcaClass, value] of Object.entries(targets)) {
      await db.runAsync(
        "UPDATE targets SET target_percent = ? WHERE arca_class = ?",
        value,
        arcaClass,
      );
    }
    await db.runAsync("DELETE FROM rebalance_acknowledgements");
    // Editing percentages turns a selected educational model into a custom plan.
    const row = await db.getFirstAsync<{ profile_json: string }>(
      "SELECT profile_json FROM planning_profiles WHERE kind='active'",
    );
    if (row) {
      const profile = PlanningProfileSchema.parse(JSON.parse(row.profile_json));
      const custom = PlanningProfileSchema.parse({
        ...profile,
        strategy: "CUSTOM",
        targets,
      });
      await db.runAsync(
        "UPDATE planning_profiles SET profile_json=?, updated_at=? WHERE kind='active'",
        JSON.stringify(custom),
        new Date().toISOString(),
      );
    }
  });
}

export async function getPlanningDraft(): Promise<PlanningProfile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ profile_json: string }>(
    "SELECT profile_json FROM planning_profiles WHERE kind='draft'",
  );
  return row ? PlanningDraftSchema.parse(JSON.parse(row.profile_json)) : null;
}

export async function savePlanningDraft(
  profile: PlanningProfile,
): Promise<void> {
  const parsed = PlanningDraftSchema.parse(profile);
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO planning_profiles(kind, profile_json, updated_at) VALUES ('draft', ?, ?) ON CONFLICT(kind) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at",
    JSON.stringify(parsed),
    new Date().toISOString(),
  );
}

export async function getActivePlan(): Promise<PlanningProfile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ profile_json: string }>(
    "SELECT profile_json FROM planning_profiles WHERE kind='active'",
  );
  return row ? PlanningProfileSchema.parse(JSON.parse(row.profile_json)) : null;
}

export async function activatePlan(profile: PlanningProfile): Promise<void> {
  const parsed = PlanningProfileSchema.parse(profile);
  const targets = getPlanTargets(parsed);
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    for (const kind of ["active", "draft"]) {
      await db.runAsync(
        "INSERT INTO planning_profiles(kind, profile_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(kind) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at",
        kind,
        JSON.stringify(parsed),
        now,
      );
    }
    for (const [arcaClass, target] of Object.entries(targets)) {
      await db.runAsync(
        "INSERT INTO targets(arca_class, target_percent) VALUES (?, ?) ON CONFLICT(arca_class) DO UPDATE SET target_percent=excluded.target_percent",
        arcaClass,
        target,
      );
    }
    await db.runAsync(
      "INSERT INTO app_settings(key, value) VALUES ('onboarding_complete', 'true') ON CONFLICT(key) DO UPDATE SET value='true'",
    );
    await db.runAsync("DELETE FROM rebalance_acknowledgements");
  });
}

export async function listAssets(): Promise<Asset[]> {
  const db = await getDatabase();
  return db.getAllAsync<Asset>(`SELECT a.id, a.symbol, a.name, a.arca_class AS arcaClass, a.asset_type AS assetType,
    a.quote_mode AS quoteMode, a.bucket, a.active, q.price, q.captured_at AS priceCapturedAt FROM assets a
    LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE asset_id = a.id ORDER BY captured_at DESC LIMIT 1)
    WHERE a.active = 1 ORDER BY a.name`);
}

export async function getAsset(assetId: string): Promise<Asset | null> {
  return (await listAssets()).find((asset) => asset.id === assetId) ?? null;
}

export async function listAssetTransactions(assetId: string): Promise<
  Array<{
    id: string;
    type: "BUY" | "SELL";
    tradeDate: string;
    quantity: string;
    unitPrice: string;
    fees: string;
  }>
> {
  const db = await getDatabase();
  return db.getAllAsync(
    "SELECT id, type, trade_date AS tradeDate, quantity, unit_price AS unitPrice, fees FROM transactions WHERE asset_id = ? ORDER BY trade_date DESC, created_at DESC",
    assetId,
  );
}

export async function archiveAsset(assetId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE assets SET active=0, updated_at=? WHERE id=?",
    new Date().toISOString(),
    assetId,
  );
}

export async function createAsset(
  input: Omit<
    Asset,
    "id" | "active" | "price" | "priceCapturedAt" | "bucket"
  > & { bucket?: AssetBucket },
): Promise<string> {
  const db = await getDatabase();
  if (input.bucket === "RESERVE" && input.arcaClass !== "CASH_FIXED_INCOME")
    throw new Error("RESERVA_RENDA_FIXA");
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO assets(id, symbol, name, arca_class, asset_type, quote_mode, bucket, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    input.symbol.trim().toUpperCase(),
    input.name.trim(),
    input.arcaClass,
    input.assetType,
    input.quoteMode,
    input.bucket ?? "LONG_TERM",
    now,
    now,
  );
  return id;
}

export async function setAssetBucket(
  assetId: string,
  bucket: AssetBucket,
): Promise<void> {
  if (bucket !== "RESERVE" && bucket !== "LONG_TERM")
    throw new Error("DESTINO_INVALIDO");
  const db = await getDatabase();
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("ATIVO_NAO_ENCONTRADO");
  if (bucket === "RESERVE" && asset.arcaClass !== "CASH_FIXED_INCOME")
    throw new Error("RESERVA_RENDA_FIXA");
  await db.runAsync(
    "UPDATE assets SET bucket=?, updated_at=? WHERE id=?",
    bucket,
    new Date().toISOString(),
    assetId,
  );
}

async function addTransactionRecords(input: {
  assetId: string;
  type: "BUY" | "SELL";
  tradeDate: string;
  quantity: string;
  unitPrice: string;
  fees?: string;
}): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getAllAsync<{
    type: "BUY" | "SELL";
    quantity: string;
    unitPrice: string;
    fees: string;
  }>(
    "SELECT type, quantity, unit_price AS unitPrice, fees FROM transactions WHERE asset_id = ? ORDER BY trade_date, created_at",
    input.assetId,
  );
  calculateLedger([
    ...existing,
    {
      type: input.type,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      fees: input.fees ?? "0",
    },
  ]);
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO transactions(id, asset_id, type, trade_date, quantity, unit_price, fees, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    Crypto.randomUUID(),
    input.assetId,
    input.type,
    input.tradeDate,
    input.quantity,
    input.unitPrice,
    input.fees ?? "0",
    now,
  );
  await db.runAsync(
    "INSERT INTO quotes(id, asset_id, price, source, captured_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    Crypto.randomUUID(),
    input.assetId,
    input.unitPrice,
    "TRANSACTION",
    now,
    now,
  );
}

export async function addTransaction(input: {
  assetId: string;
  type: "BUY" | "SELL";
  tradeDate: string;
  quantity: string;
  unitPrice: string;
  fees?: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(() => addTransactionRecords(input));
}

export async function recordAssetMovement(input: {
  assetId?: string;
  asset?: Parameters<typeof createAsset>[0];
  bucket?: AssetBucket;
  movement: {
    type: "BUY" | "SELL" | "BALANCE";
    date: string;
    quantity?: string;
    unitPrice?: string;
    balance?: string;
  };
}): Promise<string> {
  const movement = input.movement;
  nextContributionDate(movement.date, "MONTHLY", movement.date);
  const positive = (value: string | undefined, allowZero = false) => {
    const number = new Decimal(value ?? "NaN");
    if (!number.isFinite() || (allowZero ? number.lt(0) : number.lte(0)))
      throw new Error("VALOR_INVALIDO");
    return number.toString();
  };
  const balance =
    movement.type === "BALANCE" ? positive(movement.balance, true) : null;
  const quantity =
    movement.type !== "BALANCE" ? positive(movement.quantity) : null;
  const unitPrice =
    movement.type !== "BALANCE" ? positive(movement.unitPrice) : null;
  const db = await getDatabase();
  let id = input.assetId ?? "";
  await db.withTransactionAsync(async () => {
    if (!id) {
      if (!input.asset) throw new Error("ATIVO_NAO_ENCONTRADO");
      id = await createAsset(input.asset);
    }
    if (!(await getAsset(id))) throw new Error("ATIVO_NAO_ENCONTRADO");
    if (input.bucket) await setAssetBucket(id, input.bucket);
    if (balance !== null)
      await addBalanceAdjustment(id, movement.date, balance);
    else
      await addTransactionRecords({
        assetId: id,
        type: movement.type as "BUY" | "SELL",
        tradeDate: movement.date,
        quantity: quantity!,
        unitPrice: unitPrice!,
      });
  });
  return id;
}

export async function addBalanceAdjustment(
  assetId: string,
  effectiveDate: string,
  balance: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO balance_adjustments(id, asset_id, effective_date, balance, created_at) VALUES (?, ?, ?, ?, ?)",
    Crypto.randomUUID(),
    assetId,
    effectiveDate,
    balance,
    new Date().toISOString(),
  );
}

export async function saveQuote(
  assetId: string,
  price: string,
  source: string,
  capturedAt: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO quotes(id, asset_id, price, source, captured_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    Crypto.randomUUID(),
    assetId,
    price,
    source,
    capturedAt,
    new Date().toISOString(),
  );
}

const importRegistryKey = "investment_import_transactions_v1";
const externalImportRegistryKey = "finance_import_sources_v1";
export type InvestmentImportOptions = { sourceKeys: string[] };
type ExternalImportReference = { transactionId: string; fingerprint: string };

function normalizeImportBroker(broker: string): string {
  const normalized = broker.trim().replace(/\s+/g, " ").toUpperCase();
  return ["NUBANK", "NU INVEST", "NUINVEST", "EASYNVEST"].includes(normalized)
    ? "NUBANK" : normalized;
}

function externalTradeFingerprint(trade: ReviewedImportTrade): string {
  return JSON.stringify([investmentTradeIdentity(trade), normalizeImportBroker(trade.broker), trade.arcaClass, trade.assetType]);
}

function readExternalImportRegistry(value: string | null): Map<string, ExternalImportReference> {
  if (!value) return new Map();
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.values(parsed).some((entry) => !entry || typeof entry !== "object" ||
        typeof entry.transactionId !== "string" || typeof entry.fingerprint !== "string"))
    throw new Error("O histórico da conexão está inválido. Restaure um backup válido.");
  return new Map(Object.entries(parsed as Record<string, ExternalImportReference>));
}
let importQueue: Promise<unknown> = Promise.resolve();

function serializeInvestmentImport<T>(operation: () => Promise<T>): Promise<T> {
  const result = importQueue.then(operation, operation);
  importQueue = result.catch(() => undefined);
  return result;
}

function readImportRegistry(value: string | null): Map<string, string> {
  if (!value) return new Map();
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string"))
    return new Map(parsed.map((id) => [id, ""]));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((broker) => typeof broker !== "string")
  )
    throw new Error(
      "O histórico de importações está inválido. Restaure um backup válido.",
    );
  return new Map(Object.entries(parsed as Record<string, string>));
}

type ImportLedgerRow = {
  id: string;
  tradeDate: string;
  type: "BUY" | "SELL";
  quantity: string;
  unitPrice: string;
  fees: string;
  createdAt: string;
};

async function prepareInvestmentImport(input: ReviewedImportTrade[], options?: InvestmentImportOptions) {
  if (!input.length || input.length > 2000)
    throw new Error("Selecione entre 1 e 2.000 operações para importar.");
  const trades = input.map((trade) => ReviewedImportTradeSchema.parse(trade));
  if (options && (options.sourceKeys.length !== trades.length ||
      new Set(options.sourceKeys).size !== trades.length ||
      options.sourceKeys.some((key) => typeof key !== "string" || !key.length || key.length > 1000)))
    throw new Error("Identificadores de origem inválidos ou repetidos.");
  const sourceKeys = new Map(trades.map((trade, index) => [trade, options?.sourceKeys[index]]));
  const db = await getDatabase();
  const importedIds = readImportRegistry(await getSetting(importRegistryKey));
  const externalRefs = options ? readExternalImportRegistry(await getSetting(externalImportRegistryKey)) : new Map<string, ExternalImportReference>();
  const linkedTransactionIds = new Set([...externalRefs.values()].map((reference) => reference.transactionId));
  for (const trade of trades) {
    const sourceKey = sourceKeys.get(trade);
    const previous = sourceKey ? externalRefs.get(sourceKey) : undefined;
    if (previous && previous.fingerprint !== externalTradeFingerprint(trade))
      throw new Error(`${trade.symbol}: o provedor corrigiu uma operação já importada. Revise manualmente antes de sincronizar novamente.`);
  }
  const additions: ReviewedImportTrade[] = [];
  const assets = new Map<string, Asset | null>();
  const warnings = new Set<string>();
  let duplicates = 0;
  for (const symbol of new Set(trades.map((trade) => trade.symbol))) {
    const candidates = await db.getAllAsync<Asset>(
      "SELECT id,symbol,name,arca_class AS arcaClass,asset_type AS assetType,quote_mode AS quoteMode,bucket,active FROM assets WHERE UPPER(symbol)=?",
      symbol,
    );
    if (candidates.some((asset) => asset.active !== 1))
      throw new Error(
        `${symbol}: existe um cadastro arquivado. Revise esse ativo antes de importar para evitar duplicar sua carteira.`,
      );
    if (candidates.length > 1)
      throw new Error(
        `${symbol}: há mais de um cadastro. Revise os ativos antes de importar.`,
      );
    const asset = candidates[0] ?? null;
    assets.set(symbol, asset);
    const group = trades.filter((trade) => trade.symbol === symbol);
    const reference = group[0]!;
    if (
      group.some(
        (trade) =>
          trade.arcaClass !== reference.arcaClass ||
          trade.assetType !== reference.assetType,
      )
    )
      throw new Error(
        `${symbol}: escolha o mesmo tipo e categoria em todas as operações.`,
      );
    if (
      asset &&
      (asset.arcaClass !== reference.arcaClass ||
        (asset.assetType !== "MARKET" &&
          asset.assetType !== reference.assetType) ||
        asset.bucket !== "LONG_TERM")
    )
      throw new Error(
        `${symbol}: tipo, categoria ou destino diferentes do cadastro atual. Revise a operação; o cadastro existente será preservado.`,
      );
    const existing = asset
      ? await db.getAllAsync<ImportLedgerRow>(
          "SELECT id,type,trade_date AS tradeDate,quantity,unit_price AS unitPrice,fees,created_at AS createdAt FROM transactions WHERE asset_id=? ORDER BY trade_date,created_at",
          asset.id,
        )
      : [];
    const matches = new Map<string, ImportLedgerRow[]>();
    for (const row of existing) {
      const key = investmentTradeIdentity({ ...row, symbol });
      const rows = matches.get(key) ?? [];
      rows.push(row);
      matches.set(key, rows);
    }
    const newForSymbol: ReviewedImportTrade[] = [];
    for (const trade of group) {
      const candidates = matches.get(investmentTradeIdentity(trade)) ?? [];
      const sourceKey = sourceKeys.get(trade);
      const previous = sourceKey ? externalRefs.get(sourceKey) : undefined;
      if (previous) {
        const index = candidates.findIndex((candidate) => candidate.id === previous.transactionId);
        if (index < 0)
          throw new Error(`${symbol}: a operação vinculada à conexão foi alterada ou removida. Revise manualmente antes de importar.`);
        candidates.splice(index, 1);
        duplicates++;
        continue;
      }
      const matchIndex = candidates.findIndex((candidate) => {
        if (options && linkedTransactionIds.has(candidate.id)) return false;
        const broker = importedIds.get(candidate.id) ?? "";
        return (
          !broker ||
          !trade.broker ||
          normalizeImportBroker(broker) === normalizeImportBroker(trade.broker)
        );
      });
      const match =
        matchIndex < 0 ? undefined : candidates.splice(matchIndex, 1)[0];
      if (match) {
        duplicates++;
        if (sourceKey) {
          externalRefs.set(sourceKey, { transactionId: match.id, fingerprint: externalTradeFingerprint(trade) });
          linkedTransactionIds.add(match.id);
        }
        if (!importedIds.has(match.id))
          warnings.add(
            `${symbol}: uma operação idêntica já foi registrada manualmente ou veio de um backup antigo. Ela será ignorada para evitar duplicidade.`,
          );
        else if (!trade.broker || !importedIds.get(match.id))
          warnings.add(
            `${symbol}: há uma operação idêntica sem identificação completa da corretora. Ela será ignorada; confira as duplicatas antes de confirmar.`,
          );
      } else {
        additions.push(trade);
        newForSymbol.push(trade);
      }
    }
    // Validate the entire chronological ledger, including already-recorded future sales.
    // A historical buy must not be appended after a sale simply because it was imported later.
    const chronological = [...existing, ...newForSymbol].sort((a, b) =>
      a.tradeDate.localeCompare(b.tradeDate),
    );
    try {
      calculateLedger(chronological);
    } catch {
      throw new Error(
        `${symbol}: a venda supera a quantidade disponível na data. Inclua as compras anteriores ou revise as operações.`,
      );
    }
  }
  return {
    additions,
    assets,
    importedIds,
    sourceKeys,
    externalRefs,
    duplicates,
    warnings: [...warnings],
  };
}

export async function previewInvestmentImport(
  trades: ReviewedImportTrade[],
  options?: InvestmentImportOptions,
): Promise<{
  newCount: number;
  duplicateCount: number;
  warnings: string[];
}> {
  await migrateDatabase();
  return serializeInvestmentImport(async () => {
    const prepared = await prepareInvestmentImport(trades, options);
    return {
      newCount: prepared.additions.length,
      duplicateCount: prepared.duplicates,
      warnings: prepared.warnings,
    };
  });
}

/** Rechecks duplicates and positions while holding the write transaction; preview is never trusted. */
export async function commitInvestmentImport(
  trades: ReviewedImportTrade[],
  options?: InvestmentImportOptions,
): Promise<{ imported: number; duplicates: number }> {
  await migrateDatabase();
  return serializeInvestmentImport(async () => {
    const db = await getDatabase();
    let result = { imported: 0, duplicates: 0 };
    await db.withTransactionAsync(async () => {
      const prepared = await prepareInvestmentImport(trades, options);
      for (const [symbol, current] of prepared.assets) {
        const additions = prepared.additions.filter(
          (trade) => trade.symbol === symbol,
        );
        if (!additions.length) continue;
        const first = additions[0]!;
        const assetId =
          current?.id ??
          (await createAsset({
            symbol,
            name: first.name,
            arcaClass: first.arcaClass,
            assetType: first.assetType,
            quoteMode: "API",
            bucket: "LONG_TERM",
          }));
        const createdAt = Date.now();
        for (const [index, trade] of additions.entries()) {
          const id = Crypto.randomUUID();
          await db.runAsync(
            "INSERT INTO transactions(id,asset_id,type,trade_date,quantity,unit_price,fees,created_at) VALUES (?,?,?,?,?,?,?,?)",
            id,
            assetId,
            trade.type,
            trade.tradeDate,
            trade.quantity,
            trade.unitPrice,
            trade.fees,
            new Date(createdAt + index).toISOString(),
          );
          prepared.importedIds.set(id, trade.broker);
          const sourceKey = prepared.sourceKeys.get(trade);
          if (sourceKey) prepared.externalRefs.set(sourceKey, { transactionId: id, fingerprint: externalTradeFingerprint(trade) });
        }
        const latest = [...additions]
          .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
          .at(-1)!;
        await saveQuote(
          assetId,
          latest.unitPrice,
          "IMPORTED_TRANSACTION",
          `${latest.tradeDate}T00:00:00.000Z`,
        );
      }
      if (prepared.additions.length)
        await setSetting(
          importRegistryKey,
          JSON.stringify(Object.fromEntries(prepared.importedIds)),
        );
      if (options)
        await setSetting(externalImportRegistryKey, JSON.stringify(Object.fromEntries(prepared.externalRefs)));
      result = {
        imported: prepared.additions.length,
        duplicates: prepared.duplicates,
      };
    });
    return result;
  });
}

export async function loadPositions(
  knownAssets?: Asset[],
): Promise<PositionInput[]> {
  const db = await getDatabase();
  const assets = knownAssets ?? (await listAssets());
  const result: PositionInput[] = [];
  for (const asset of assets) {
    const balance = await db.getFirstAsync<{ balance: string }>(
      "SELECT balance FROM balance_adjustments WHERE asset_id = ? ORDER BY effective_date DESC, created_at DESC LIMIT 1",
      asset.id,
    );
    if (balance) {
      result.push({
        assetId: asset.id,
        arcaClass: asset.arcaClass,
        marketValue: balance.balance,
        costBasis: balance.balance,
      });
      continue;
    }
    const transactions = await db.getAllAsync<{
      type: "BUY" | "SELL";
      quantity: string;
      unitPrice: string;
      fees: string;
    }>(
      "SELECT type, quantity, unit_price AS unitPrice, fees FROM transactions WHERE asset_id = ? ORDER BY trade_date, created_at",
      asset.id,
    );
    const ledger = calculateLedger(transactions);
    const marketValue = new Decimal(ledger.quantity)
      .mul(asset.price ?? ledger.averageCost)
      .toFixed(2);
    result.push({
      assetId: asset.id,
      arcaClass: asset.arcaClass,
      marketValue,
      costBasis: ledger.costBasis,
    });
  }
  return result;
}

export async function saveDailySnapshot(
  totalValue: string,
  allocations: Array<{ arcaClass: ArcaClass; value: string }>,
): Promise<void> {
  const db = await getDatabase();
  const day = localDateString();
  const id = `snapshot:${day}`;
  const existing = await db.getFirstAsync<{ totalValue: string }>(
    "SELECT total_value AS totalValue FROM portfolio_snapshots WHERE id = ?",
    id,
  );
  const existingPositions = await db.getAllAsync<{
    arcaClass: ArcaClass;
    value: string;
  }>(
    "SELECT arca_class AS arcaClass, value FROM snapshot_positions WHERE snapshot_id = ? ORDER BY arca_class",
    id,
  );
  const normalizedNext = allocations
    .map(({ arcaClass, value }) => ({ arcaClass, value }))
    .sort((a, b) => a.arcaClass.localeCompare(b.arcaClass));
  const changed =
    existing != null &&
    (existing.totalValue !== totalValue ||
      JSON.stringify(existingPositions) !== JSON.stringify(normalizedNext));
  await db.withTransactionAsync(async () => {
    if (changed)
      await db.runAsync(
        "DELETE FROM rebalance_acknowledgements WHERE snapshot_id = ?",
        id,
      );
    await db.runAsync(
      "INSERT INTO portfolio_snapshots(id, captured_at, total_value) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET total_value=excluded.total_value",
      id,
      `${day}T23:59:59.000Z`,
      totalValue,
    );
    for (const item of allocations)
      await db.runAsync(
        "INSERT INTO snapshot_positions(snapshot_id, arca_class, value) VALUES (?, ?, ?) ON CONFLICT(snapshot_id, arca_class) DO UPDATE SET value=excluded.value",
        id,
        item.arcaClass,
        item.value,
      );
  });
}

export async function listSnapshots(): Promise<SnapshotValue[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ capturedAt: string; totalValue: string }>(
    "SELECT captured_at AS capturedAt, total_value AS totalValue FROM portfolio_snapshots ORDER BY captured_at",
  );
  return rows;
}

export async function listClassSnapshots(): Promise<
  Array<{ capturedAt: string; arcaClass: ArcaClass; value: string }>
> {
  const db = await getDatabase();
  return db.getAllAsync(
    "SELECT s.captured_at AS capturedAt, p.arca_class AS arcaClass, p.value FROM snapshot_positions p JOIN portfolio_snapshots s ON s.id=p.snapshot_id ORDER BY s.captured_at, p.arca_class",
  );
}

export async function acknowledgeLatestSnapshot(): Promise<void> {
  const db = await getDatabase();
  const latest = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM portfolio_snapshots ORDER BY captured_at DESC LIMIT 1",
  );
  if (latest)
    await db.runAsync(
      "INSERT OR REPLACE INTO rebalance_acknowledgements(snapshot_id, acknowledged_at) VALUES (?, ?)",
      latest.id,
      new Date().toISOString(),
    );
}

export async function isLatestSnapshotAcknowledged(): Promise<boolean> {
  const db = await getDatabase();
  const latest = await db.getFirstAsync<{
    acknowledged: number;
  }>(`SELECT EXISTS(
    SELECT 1 FROM portfolio_snapshots s JOIN rebalance_acknowledgements a ON a.snapshot_id=s.id
    WHERE s.id=(SELECT id FROM portfolio_snapshots ORDER BY captured_at DESC LIMIT 1)
  ) AS acknowledged`);
  return latest?.acknowledged === 1;
}

export async function getProjectionSettings() {
  const db = await getDatabase();
  return db.getFirstAsync<{
    annualRate: string;
    monthlyContribution: string;
    offsetPoints: string;
    horizonYears: number;
  }>(
    "SELECT annual_rate AS annualRate, monthly_contribution AS monthlyContribution, offset_points AS offsetPoints, horizon_years AS horizonYears FROM projection_settings WHERE id = 1",
  );
}

export async function saveProjectionSettings(value: {
  annualRate: string;
  monthlyContribution: string;
  offsetPoints: string;
  horizonYears: number;
}) {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE projection_settings SET annual_rate=?, monthly_contribution=?, offset_points=?, horizon_years=? WHERE id=1",
    value.annualRate,
    value.monthlyContribution,
    value.offsetPoints,
    value.horizonYears,
  );
}

const backupColumns = {
  assets: [
    "id",
    "symbol",
    "name",
    "arca_class",
    "asset_type",
    "quote_mode",
    "bucket",
    "active",
    "created_at",
    "updated_at",
  ],
  transactions: [
    "id",
    "asset_id",
    "type",
    "trade_date",
    "quantity",
    "unit_price",
    "fees",
    "created_at",
  ],
  balance_adjustments: [
    "id",
    "asset_id",
    "effective_date",
    "balance",
    "created_at",
  ],
  quotes: ["id", "asset_id", "price", "source", "captured_at", "created_at"],
  targets: ["arca_class", "target_percent"],
  app_settings: ["key", "value"],
  projection_settings: [
    "id",
    "annual_rate",
    "monthly_contribution",
    "offset_points",
    "horizon_years",
  ],
  portfolio_snapshots: ["id", "captured_at", "total_value"],
  snapshot_positions: ["snapshot_id", "arca_class", "value"],
  rebalance_acknowledgements: ["snapshot_id", "acknowledged_at"],
  saved_projections: [
    "id",
    "name",
    "annual_rate",
    "monthly_contribution",
    "offset_points",
    "horizon_years",
    "created_at",
  ],
  planning_profiles: ["kind", "profile_json", "updated_at"],
} as const;

export async function exportDatabaseJson() {
  const db = await getDatabase();
  const tables: Record<string, unknown[]> = {};
  for (const name of Object.keys(backupColumns))
    tables[name] = await db.getAllAsync(`SELECT * FROM ${name}`);
  return { version: 2, exportedAt: new Date().toISOString(), tables };
}

export async function restoreDatabaseJson(value: unknown): Promise<void> {
  if (
    !value ||
    typeof value !== "object" ||
    ![1, 2].includes((value as { version: number }).version)
  )
    throw new Error("BACKUP_VERSION_UNSUPPORTED");
  const tables = (value as { tables?: unknown }).tables;
  const version = (value as { version: number }).version;
  if (!tables || typeof tables !== "object") throw new Error("BACKUP_INVALID");
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const names = Object.keys(backupColumns) as Array<
      keyof typeof backupColumns
    >;
    for (const name of [...names].reverse())
      await db.runAsync(`DELETE FROM ${name}`);
    for (const name of names) {
      const rows =
        (tables as Record<string, unknown>)[name] ??
        (version === 1 && name === "planning_profiles" ? [] : undefined);
      if (!Array.isArray(rows)) throw new Error(`BACKUP_TABLE_MISSING:${name}`);
      const columns = backupColumns[name];
      for (const row of rows) {
        if (!row || typeof row !== "object")
          throw new Error(`BACKUP_ROW_INVALID:${name}`);
        const record = row as Record<string, unknown>;
        const values = columns.map((column) =>
          version === 1 && name === "assets" && column === "bucket"
            ? "LONG_TERM"
            : record[column],
        );
        if (name === "planning_profiles") {
          if (record.kind !== "active" && record.kind !== "draft")
            throw new Error("BACKUP_PLAN_INVALID");
          const schema =
            record.kind === "active"
              ? PlanningProfileSchema
              : PlanningDraftSchema;
          schema.parse(JSON.parse(String(record.profile_json)));
        }
        if (values.some((item) => item === undefined))
          throw new Error(`BACKUP_COLUMN_MISSING:${name}`);
        await db.runAsync(
          `INSERT INTO ${name}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          values as SQLite.SQLiteBindValue[],
        );
      }
    }
    if (version === 1) await setSetting("projection_legacy_available", "true");
  });
}
