import { beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { defaultPlanningProfile } from "@arca/domain";

const state = vi.hoisted(() => ({ adapter: null as unknown }));
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => state.adapter,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
let sql: Database;
let db: typeof import("../src/db/database");

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
});

describe("planning persistence against SQLite", () => {
  it("reevaluates previously dismissed alerts after changing the investment plan", async () => {
    await db.migrateDatabase();
    await db.saveDailySnapshot("100", [
      { arcaClass: "CASH_FIXED_INCOME", value: "100" },
    ]);
    await db.acknowledgeLatestSnapshot();
    expect(await db.isLatestSnapshotAcknowledged()).toBe(true);
    const profile = defaultPlanningProfile();
    await db.activatePlan(profile);
    expect(await db.isLatestSnapshotAcknowledged()).toBe(false);
    await db.acknowledgeLatestSnapshot();
    await db.saveTargets({
      BRAZIL_STOCKS: "0",
      REAL_ESTATE: "0",
      CASH_FIXED_INCOME: "100",
      INTERNATIONAL: "0",
    });
    expect(await db.isLatestSnapshotAcknowledged()).toBe(false);
    expect((await db.getActivePlan())?.strategy).toBe("CUSTOM");
  });

  it("rolls back new assets and bucket changes when recording fails", async () => {
    await db.migrateDatabase();
    await expect(
      db.recordAssetMovement({
        asset: {
          symbol: "FAILED",
          name: "Falha",
          arcaClass: "BRAZIL_STOCKS",
          assetType: "ETF",
          quoteMode: "MANUAL",
        },
        movement: {
          type: "SELL",
          date: "2026-01-01",
          quantity: "1",
          unitPrice: "100",
        },
      }),
    ).rejects.toThrow("INSUFFICIENT_POSITION");
    expect(await db.listAssets()).toHaveLength(0);
    const id = await db.createAsset({
      symbol: "SELIC",
      name: "Caixa",
      arcaClass: "CASH_FIXED_INCOME",
      assetType: "TREASURY",
      quoteMode: "MANUAL",
    });
    await expect(
      db.recordAssetMovement({
        assetId: id,
        bucket: "RESERVE",
        movement: {
          type: "SELL",
          date: "2026-01-01",
          quantity: "1",
          unitPrice: "100",
        },
      }),
    ).rejects.toThrow();
    expect((await db.getAsset(id))?.bucket).toBe("LONG_TERM");
    await db.recordAssetMovement({
      assetId: id,
      bucket: "RESERVE",
      movement: { type: "BALANCE", date: "2026-01-01", balance: "0" },
    });
    expect((await db.getAsset(id))?.bucket).toBe("RESERVE");
  });

  it("migrates a legacy asset and preserves existing settings and positions", async () => {
    sql.run(
      "CREATE TABLE assets (id TEXT PRIMARY KEY, symbol TEXT, name TEXT, arca_class TEXT, asset_type TEXT, quote_mode TEXT, active INTEGER, created_at TEXT, updated_at TEXT)",
    );
    sql.run(
      "INSERT INTO assets VALUES ('legacy','BOVA11','Minha carteira','BRAZIL_STOCKS','ETF','MANUAL',1,'2026-01-01','2026-01-01')",
    );
    sql.run("CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT)");
    sql.run("INSERT INTO app_settings VALUES ('onboarding_complete','true')");
    await db.migrateDatabase();
    expect((await db.listAssets())[0]).toMatchObject({
      id: "legacy",
      bucket: "LONG_TERM",
    });
    expect(await db.getSetting("onboarding_complete")).toBe("true");
    expect(await db.getActivePlan()).toBeNull();
    await db.migrateDatabase();
    expect(await db.listAssets()).toHaveLength(1);
  });

  it("persists a draft independently and activates plan and targets together", async () => {
    await db.migrateDatabase();
    const profile = {
      ...defaultPlanningProfile(),
      objective: "Minha casa",
      strategy: "ARCA" as const,
      contributionAmount: "400",
      essentialExpenses: "1000",
    };
    await db.savePlanningDraft(profile);
    expect(await db.getActivePlan()).toBeNull();
    await db.activatePlan(profile);
    const edited = {
      ...profile,
      objective: "Outro objetivo",
      strategy: "CUSTOM" as const,
      targets: { ...profile.targets, INTERNATIONAL: "0" },
    };
    await db.savePlanningDraft(edited);
    expect((await db.getPlanningDraft())?.objective).toBe("Outro objetivo");
    expect((await db.getActivePlan())?.objective).toBe("Minha casa");
    await expect(db.activatePlan(edited)).rejects.toThrow();
    expect((await db.getActivePlan())?.objective).toBe("Minha casa");
    expect((await db.getTargets()).INTERNATIONAL).toBe("25");
  });

  it("restores v1 backups with long-term default and no fabricated plan", async () => {
    await db.migrateDatabase();
    const id = await db.createAsset({
      symbol: "BOVA11",
      name: "ETF",
      arcaClass: "BRAZIL_STOCKS",
      assetType: "ETF",
      quoteMode: "MANUAL",
    });
    await db.addTransaction({
      assetId: id,
      type: "BUY",
      tradeDate: "2026-01-01",
      quantity: "2",
      unitPrice: "100",
    });
    const backup = await db.exportDatabaseJson();
    const tables = structuredClone(backup.tables);
    delete tables.planning_profiles;
    tables.assets = tables.assets.map((row) => {
      const asset = { ...(row as Record<string, unknown>) };
      delete asset.bucket;
      return asset;
    });
    await db.restoreDatabaseJson({ version: 1, tables });
    expect((await db.listAssets())[0]?.bucket).toBe("LONG_TERM");
    expect((await db.loadPositions())[0]?.marketValue).toBe("200.00");
    expect(await db.getActivePlan()).toBeNull();
  });

  it("round-trips reserve buckets and plans and rolls back a malformed backup", async () => {
    await db.migrateDatabase();
    const id = await db.createAsset({
      symbol: "RESERVA",
      name: "Reserva",
      arcaClass: "CASH_FIXED_INCOME",
      assetType: "BALANCE",
      quoteMode: "MANUAL",
      bucket: "RESERVE",
    });
    await db.addBalanceAdjustment(id, "2026-01-01", "500");
    await db.activatePlan({
      ...defaultPlanningProfile(),
      essentialExpenses: "1000",
      contributionAmount: "100",
    });
    const backup = await db.exportDatabaseJson();
    await db.restoreDatabaseJson(backup);
    expect((await db.listAssets())[0]?.bucket).toBe("RESERVE");
    expect((await db.getActivePlan())?.contributionAmount).toBe("100");
    const bad = structuredClone(backup);
    bad.tables.planning_profiles = [
      { kind: "active", profile_json: "{}", updated_at: "today" },
    ];
    await expect(db.restoreDatabaseJson(bad)).rejects.toThrow();
    expect((await db.listAssets())[0]?.id).toBe(id);
    expect((await db.getActivePlan())?.contributionAmount).toBe("100");
  });
});
