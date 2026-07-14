import {
  calculateLedger,
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
  active: number;
  price: string | null;
  priceCapturedAt: string | null;
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
  `);
  await db.withTransactionAsync(async () => {
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
    await db.runAsync(
      "INSERT OR IGNORE INTO projection_settings(id, annual_rate, monthly_contribution, offset_points, horizon_years) VALUES (1, '8', '1000', '3', 20)",
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
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const [arcaClass, value] of Object.entries(targets)) {
      await db.runAsync(
        "UPDATE targets SET target_percent = ? WHERE arca_class = ?",
        value,
        arcaClass,
      );
    }
  });
}

export async function listAssets(): Promise<Asset[]> {
  const db = await getDatabase();
  return db.getAllAsync<Asset>(`SELECT a.id, a.symbol, a.name, a.arca_class AS arcaClass, a.asset_type AS assetType,
    a.quote_mode AS quoteMode, a.active, q.price, q.captured_at AS priceCapturedAt FROM assets a
    LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE asset_id = a.id ORDER BY captured_at DESC LIMIT 1)
    WHERE a.active = 1 ORDER BY a.name`);
}

export async function getAsset(assetId: string): Promise<Asset | null> {
  return (await listAssets()).find((asset) => asset.id === assetId) ?? null;
}

export async function listAssetTransactions(
  assetId: string,
): Promise<
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
  input: Omit<Asset, "id" | "active" | "price" | "priceCapturedAt">,
): Promise<string> {
  const db = await getDatabase();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO assets(id, symbol, name, arca_class, asset_type, quote_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    input.symbol.trim().toUpperCase(),
    input.name.trim(),
    input.arcaClass,
    input.assetType,
    input.quoteMode,
    now,
    now,
  );
  return id;
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
  await db.withTransactionAsync(async () => {
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
  });
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
  const day = new Date().toISOString().slice(0, 10);
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
} as const;

export async function exportDatabaseJson() {
  const db = await getDatabase();
  const tables: Record<string, unknown[]> = {};
  for (const name of Object.keys(backupColumns))
    tables[name] = await db.getAllAsync(`SELECT * FROM ${name}`);
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

export async function restoreDatabaseJson(value: unknown): Promise<void> {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { version?: unknown }).version !== 1
  )
    throw new Error("BACKUP_VERSION_UNSUPPORTED");
  const tables = (value as { tables?: unknown }).tables;
  if (!tables || typeof tables !== "object") throw new Error("BACKUP_INVALID");
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const names = Object.keys(backupColumns) as Array<
      keyof typeof backupColumns
    >;
    for (const name of [...names].reverse())
      await db.runAsync(`DELETE FROM ${name}`);
    for (const name of names) {
      const rows = (tables as Record<string, unknown>)[name];
      if (!Array.isArray(rows)) throw new Error(`BACKUP_TABLE_MISSING:${name}`);
      const columns = backupColumns[name];
      for (const row of rows) {
        if (!row || typeof row !== "object")
          throw new Error(`BACKUP_ROW_INVALID:${name}`);
        const record = row as Record<string, unknown>;
        const values = columns.map((column) => record[column]);
        if (values.some((item) => item === undefined))
          throw new Error(`BACKUP_COLUMN_MISSING:${name}`);
        await db.runAsync(
          `INSERT INTO ${name}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          values as SQLite.SQLiteBindValue[],
        );
      }
    }
  });
}
