import { beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import {
  ReviewedImportTradeSchema,
  type ReviewedImportTrade,
} from "@arca/domain";

const state = vi.hoisted(() => ({ adapter: null as unknown }));
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => state.adapter,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
let sql: Database;
let db: typeof import("../src/db/database");
const trade = (patch: Partial<ReviewedImportTrade> = {}): ReviewedImportTrade =>
  ReviewedImportTradeSchema.parse({
    symbol: "PETR4",
    name: "Petrobras",
    arcaClass: "BRAZIL_STOCKS",
    assetType: "EQUITY",
    tradeDate: "2025-01-10",
    type: "BUY",
    quantity: "2",
    unitPrice: "30",
    ...patch,
  });

beforeEach(async () => {
  vi.resetModules();
  const SQL = await initSqlJs();
  sql = new SQL.Database();
  const all = (query: string, values: SqlValue[]) => {
    const statement = sql.prepare(query);
    try {
      statement.bind(values);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  };
  state.adapter = {
    execAsync: async (query: string) => {
      sql.exec(query);
    },
    runAsync: async (query: string, ...values: SqlValue[]) => {
      sql.run(
        query,
        (Array.isArray(values[0]) ? values[0] : values) as SqlValue[],
      );
      return { changes: sql.getRowsModified(), lastInsertRowId: 1 };
    },
    getAllAsync: async (query: string, ...values: SqlValue[]) =>
      all(query, values),
    getFirstAsync: async (query: string, ...values: SqlValue[]) =>
      all(query, values)[0] ?? null,
    withTransactionAsync: async (operation: () => Promise<void>) => {
      sql.run("BEGIN");
      try {
        await operation();
        sql.run("COMMIT");
      } catch (error) {
        sql.run("ROLLBACK");
        throw error;
      }
    },
  };
  db = await import("../src/db/database");
  await db.migrateDatabase();
});

describe("reviewed document imports against SQLite", () => {
  it("previews without mutation, preserves identical legitimate rows, and skips reimports", async () => {
    expect(await db.previewInvestmentImport([trade(), trade()])).toEqual({
      newCount: 2,
      duplicateCount: 0,
      warnings: [],
    });
    expect(await db.listAssets()).toHaveLength(0);
    expect(await db.commitInvestmentImport([trade(), trade()])).toEqual({
      imported: 2,
      duplicates: 0,
    });
    expect(await db.commitInvestmentImport([trade(), trade()])).toEqual({
      imported: 0,
      duplicates: 2,
    });
    expect(
      await db.commitInvestmentImport([trade(), trade(), trade()]),
    ).toEqual({ imported: 1, duplicates: 2 });
    const asset = (await db.listAssets())[0]!;
    expect(asset).toMatchObject({
      symbol: "PETR4",
      arcaClass: "BRAZIL_STOCKS",
      bucket: "LONG_TERM",
      quoteMode: "API",
    });
    expect(await db.listAssetTransactions(asset.id)).toHaveLength(3);
    expect((await db.loadPositions())[0]?.marketValue).toBe("180.00");
  });

  it("rechecks concurrent commits instead of trusting an earlier preview", async () => {
    await db.previewInvestmentImport([trade()]);
    const results = await Promise.all([
      db.commitInvestmentImport([trade()]),
      db.commitInvestmentImport([trade()]),
    ]);
    expect(results).toEqual([
      { imported: 1, duplicates: 0 },
      { imported: 0, duplicates: 1 },
    ]);
    expect(await db.previewInvestmentImport([trade()])).toMatchObject({
      newCount: 0,
      duplicateCount: 1,
      warnings: [expect.stringContaining("corretora")],
    });
  });

  it("warns and skips a matching manually registered operation", async () => {
    const id = await db.createAsset({
      symbol: "PETR4",
      name: "Meu nome",
      arcaClass: "BRAZIL_STOCKS",
      assetType: "MARKET",
      quoteMode: "MANUAL",
    });
    await db.addTransaction({
      assetId: id,
      type: "BUY",
      tradeDate: "2025-01-10",
      quantity: "2.0",
      unitPrice: "30.00",
    });
    expect(await db.previewInvestmentImport([trade()])).toMatchObject({
      newCount: 0,
      duplicateCount: 1,
      warnings: [expect.stringContaining("manualmente")],
    });
    expect(await db.commitInvestmentImport([trade()])).toEqual({
      imported: 0,
      duplicates: 1,
    });
    expect(await db.getAsset(id)).toMatchObject({
      name: "Meu nome",
      assetType: "MARKET",
      quoteMode: "MANUAL",
    });
  });

  it("validates a merged chronological ledger before committing", async () => {
    await db.commitInvestmentImport([trade({ tradeDate: "2025-03-01" })]);
    await expect(
      db.commitInvestmentImport([
        trade({ tradeDate: "2025-02-01", type: "SELL", quantity: "1" }),
      ]),
    ).rejects.toThrow("data");
    expect(
      await db.commitInvestmentImport([
        trade({ tradeDate: "2025-02-01", type: "SELL", quantity: "1" }),
        trade({ tradeDate: "2025-01-01", quantity: "1" }),
      ]),
    ).toEqual({ imported: 2, duplicates: 0 });
    expect((await db.loadPositions())[0]?.marketValue).toBe("60.00");
  });

  it("rejects an oversell across assets without creating either new asset", async () => {
    await expect(
      db.commitInvestmentImport([
        trade(),
        trade({ symbol: "VALE3", name: "Vale", type: "SELL" }),
      ]),
    ).rejects.toThrow("VALE3");
    expect(await db.listAssets()).toHaveLength(0);
    expect(await db.getSetting("investment_import_transactions_v1")).toBeNull();
  });

  it("rolls back prior asset, transaction, quote and registry writes on a storage failure", async () => {
    sql.run(
      "CREATE TRIGGER fail_import BEFORE INSERT ON transactions WHEN NEW.quantity='99' BEGIN SELECT RAISE(ABORT,'storage failure'); END",
    );
    await expect(
      db.commitInvestmentImport([
        trade(),
        trade({ symbol: "VALE3", name: "Vale", quantity: "99" }),
      ]),
    ).rejects.toThrow("storage failure");
    expect(await db.listAssets()).toHaveLength(0);
    const backup = await db.exportDatabaseJson();
    expect(backup.tables.transactions).toHaveLength(0);
    expect(backup.tables.quotes).toHaveLength(0);
    expect(await db.getSetting("investment_import_transactions_v1")).toBeNull();
  });

  it("keeps newer actual quotes and timestamps imported prices on their historical trade date", async () => {
    await db.commitInvestmentImport([trade()]);
    const id = (await db.listAssets())[0]!.id;
    expect((await db.getAsset(id))?.priceCapturedAt).toBe(
      "2025-01-10T00:00:00.000Z",
    );
    await db.saveQuote(id, "45", "BRAPI", "2025-05-01T14:00:00.000Z");
    await db.commitInvestmentImport([
      trade({ tradeDate: "2025-02-01", unitPrice: "35" }),
    ]);
    expect(await db.getAsset(id)).toMatchObject({
      price: "45",
      priceCapturedAt: "2025-05-01T14:00:00.000Z",
    });
  });

  it("refuses archived assets and classification conflicts without changing the original", async () => {
    await db.commitInvestmentImport([trade()]);
    const id = (await db.listAssets())[0]!.id;
    await expect(
      db.commitInvestmentImport([trade({ arcaClass: "INTERNATIONAL" })]),
    ).rejects.toThrow("cadastro atual");
    expect((await db.getAsset(id))?.arcaClass).toBe("BRAZIL_STOCKS");
    await db.archiveAsset(id);
    await expect(db.commitInvestmentImport([trade()])).rejects.toThrow(
      "arquivado",
    );
    expect((await db.exportDatabaseJson()).tables.assets).toHaveLength(1);
  });

  it("restores import deduplication in new backups and accepts a legacy backup without a registry", async () => {
    await db.commitInvestmentImport([trade()]);
    const backup = await db.exportDatabaseJson();
    await db.restoreDatabaseJson(backup);
    expect(await db.previewInvestmentImport([trade()])).toMatchObject({
      newCount: 0,
      duplicateCount: 1,
      warnings: [expect.stringContaining("corretora")],
    });
    const legacy = structuredClone(backup);
    legacy.version = 1;
    delete legacy.tables.planning_profiles;
    legacy.tables.app_settings = legacy.tables.app_settings.filter(
      (row) =>
        (row as { key: string }).key !== "investment_import_transactions_v1",
    );
    legacy.tables.assets = legacy.tables.assets.map((row) => {
      const copy = { ...(row as Record<string, unknown>) };
      delete copy.bucket;
      return copy;
    });
    await db.restoreDatabaseJson(legacy);
    expect(await db.previewInvestmentImport([trade()])).toMatchObject({
      newCount: 0,
      duplicateCount: 1,
      warnings: [expect.stringContaining("backup antigo")],
    });
    expect(await db.commitInvestmentImport([trade()])).toEqual({
      imported: 0,
      duplicates: 1,
    });
  });

  it("keeps economic twins from different known brokers and restores their provenance", async () => {
    await db.commitInvestmentImport([trade({ broker: "Nubank" })]);
    expect(
      await db.commitInvestmentImport([trade({ broker: "Outra corretora" })]),
    ).toEqual({ imported: 1, duplicates: 0 });
    const backup = await db.exportDatabaseJson();
    await db.restoreDatabaseJson(backup);
    expect(
      await db.previewInvestmentImport([
        trade({ broker: " NUBANK " }),
        trade({ broker: "Outra corretora" }),
      ]),
    ).toEqual({ newCount: 0, duplicateCount: 2, warnings: [] });
    expect(await db.previewInvestmentImport([trade()])).toMatchObject({
      newCount: 0,
      duplicateCount: 1,
      warnings: [expect.stringContaining("corretora")],
    });
  });
});
