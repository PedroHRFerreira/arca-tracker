import { beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import type { FinanceSnapshot } from "@arca/domain";

const state = vi.hoisted(() => ({ adapter: null as unknown }));
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: async () => state.adapter }));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
let sql: Database;
let db: typeof import("../src/db/database");
let finance: typeof import("../src/db/finance");

const snapshot = (): FinanceSnapshot => ({
  version: 1, syncedAt: "2026-01-01T12:00:00Z",
  connections: [{ id: "synthetic-connection", institution: "NUBANK", name: "Instituição de teste", status: "UPDATED", updatedAt: null }],
  accounts: [],
  investments: [{ id: "synthetic-investment", connectionId: "synthetic-connection", symbol: "PETR4", name: "Investimento de teste", type: "EQUITY", quantity: "2", unitPrice: "30", value: "60", currency: "BRL", updatedAt: null }],
  trades: [{ id: "synthetic-trade", connectionId: "synthetic-connection", investmentId: "synthetic-investment", type: "BUY", tradeDate: "2025-01-10", quantity: "2", unitPrice: "30", fees: "0" }], warnings: [],
});

beforeEach(async () => {
  vi.resetModules();
  const SQL = await initSqlJs(); sql = new SQL.Database();
  const all = (query: string, values: SqlValue[]) => {
    const statement = sql.prepare(query);
    try { statement.bind(values); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; }
    finally { statement.free(); }
  };
  state.adapter = {
    execAsync: async (query: string) => { sql.exec(query); },
    runAsync: async (query: string, ...values: SqlValue[]) => {
      sql.run(query, (Array.isArray(values[0]) ? values[0] : values) as SqlValue[]);
      return { changes: sql.getRowsModified(), lastInsertRowId: 1 };
    },
    getAllAsync: async (query: string, ...values: SqlValue[]) => all(query, values),
    getFirstAsync: async (query: string, ...values: SqlValue[]) => all(query, values)[0] ?? null,
    withTransactionAsync: async (operation: () => Promise<void>) => {
      sql.run("BEGIN");
      try { await operation(); sql.run("COMMIT"); } catch (error) { sql.run("ROLLBACK"); throw error; }
    },
  };
  db = await import("../src/db/database"); finance = await import("../src/db/finance");
  await db.migrateDatabase();
});

describe("finance SQLite imports", () => {
  it("previews without mutation and commits repeated/concurrent sync exactly once", async () => {
    expect(await finance.getFinanceAutoImport()).toBe(false);
    expect(await finance.previewFinanceImport(snapshot())).toMatchObject({ newCount: 1, duplicateCount: 0 });
    expect(await db.listAssets()).toHaveLength(0);
    const results = await Promise.all([finance.commitFinanceImport(snapshot()), finance.commitFinanceImport(snapshot())]);
    expect(results).toMatchObject([{ imported: 1, duplicates: 0 }, { imported: 0, duplicates: 1 }]);
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(1);
  });

  it("blocks provider corrections with the same source ID and retains the actual ledger", async () => {
    await finance.commitFinanceImport(snapshot());
    const corrected = snapshot(); corrected.trades[0]!.quantity = "3";
    await expect(finance.previewFinanceImport(corrected)).rejects.toThrow("corrigiu");
    await expect(finance.commitFinanceImport(corrected)).rejects.toThrow("corrigiu");
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(1);
  });

  it("retains source identity across partial snapshots and blocks corrections when a trade returns", async () => {
    await finance.commitFinanceImport(snapshot());
    const partial = snapshot();
    partial.trades = [];
    await finance.saveFinanceSnapshot(partial);
    expect(await finance.commitFinanceImport(partial)).toMatchObject({ imported: 0, duplicates: 0 });
    const corrected = snapshot(); corrected.trades[0]!.unitPrice = "31";
    await expect(finance.commitFinanceImport(corrected)).rejects.toThrow("corrigiu");
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 0, duplicates: 1 });
  });

  it("never imports cached trades from a connection that needs attention", async () => {
    const input = snapshot(); input.connections[0]!.status = "LOGIN_REQUIRED";
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 0, pending: 1 });
    expect(await db.listAssets()).toHaveLength(0);
  });

  it("detects a source-linked ledger transaction removed outside the sync", async () => {
    await finance.commitFinanceImport(snapshot());
    sql.run("DELETE FROM transactions");
    await expect(finance.commitFinanceImport(snapshot())).rejects.toThrow("alterada ou removida");
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(0);
  });

  it("preserves legitimate identical provider rows and changed ordering across sync", async () => {
    const input = snapshot(); input.trades.push({ ...input.trades[0]!, id: "synthetic-trade-2" });
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 2 });
    input.trades.reverse();
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 0, duplicates: 2 });
    input.trades.unshift({ ...input.trades[0]!, id: "synthetic-trade-3" });
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 1, duplicates: 2 });
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(3);
  });

  it("matches prior Nu Invest document imports and persists their source identity", async () => {
    await db.commitInvestmentImport([{
      symbol: "PETR4", name: "Petrobras", arcaClass: "BRAZIL_STOCKS", assetType: "EQUITY",
      tradeDate: "2025-01-10", type: "BUY", quantity: "2", unitPrice: "30", fees: "0", broker: "Nu Invest", bucket: "LONG_TERM",
    }]);
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await db.getSetting("finance_import_sources_v1")).toContain("synthetic-trade");
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(1);
  });

  it("matches manually registered identical transactions without duplicating the portfolio", async () => {
    const assetId = await db.createAsset({ symbol: "PETR4", name: "Petrobras", arcaClass: "BRAZIL_STOCKS", assetType: "EQUITY", quoteMode: "MANUAL" });
    await db.addTransaction({ assetId, type: "BUY", tradeDate: "2025-01-10", quantity: "2", unitPrice: "30" });
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 0, duplicates: 1 });
    expect((await db.exportDatabaseJson()).tables.transactions).toHaveLength(1);
  });

  it("rolls back source identity, assets, quotes and transactions together on storage failure", async () => {
    sql.run("CREATE TRIGGER fail_source BEFORE INSERT ON app_settings WHEN NEW.key='finance_import_sources_v1' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await expect(finance.commitFinanceImport(snapshot())).rejects.toThrow("synthetic failure");
    const backup = await db.exportDatabaseJson();
    expect(backup.tables.assets).toHaveLength(0); expect(backup.tables.transactions).toHaveLength(0); expect(backup.tables.quotes).toHaveLength(0);
    expect(await db.getSetting("investment_import_transactions_v1")).toBeNull();
    expect(await db.getSetting("finance_import_sources_v1")).toBeNull();
    sql.run("DROP TRIGGER fail_source");
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 1 });
  });

  it("does not import missing fees, foreign currencies, or positions without transactions", async () => {
    const input = snapshot(); input.trades[0]!.fees = null;
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 0, pending: 1 });
    input.trades[0]!.fees = "0"; input.investments[0]!.currency = "USD";
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 0, pending: 1 });
    input.trades = []; await finance.saveFinanceSnapshot(input);
    expect(await finance.commitFinanceImport(input)).toMatchObject({ imported: 0, pending: 0 });
    expect(await db.listAssets()).toHaveLength(0);
  });

  it("backs up snapshot, preference and dedup refs, and accepts old backups with no finance settings", async () => {
    await finance.saveFinanceSnapshot(snapshot()); await finance.setFinanceAutoImport(true);
    await finance.commitFinanceImport(snapshot());
    const backup = await db.exportDatabaseJson(); await db.restoreDatabaseJson(backup);
    expect(await finance.loadFinanceSnapshot()).toEqual(snapshot()); expect(await finance.getFinanceAutoImport()).toBe(true);
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 0, duplicates: 1 });
    const legacy = structuredClone(backup); legacy.version = 1; delete legacy.tables.planning_profiles;
    legacy.tables.app_settings = legacy.tables.app_settings.filter((item) => !(item as { key: string }).key.startsWith("finance_"));
    await db.restoreDatabaseJson(legacy);
    expect(await finance.loadFinanceSnapshot()).toBeNull(); expect(await finance.getFinanceAutoImport()).toBe(false);
    expect(await finance.commitFinanceImport(snapshot())).toMatchObject({ imported: 0, duplicates: 1 });
  });
});
