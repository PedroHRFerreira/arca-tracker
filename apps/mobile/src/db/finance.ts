import { FinanceSnapshotSchema, prepareFinanceTrades, type FinanceSnapshot } from "@arca/domain";
import { commitInvestmentImport, getSetting, migrateDatabase, previewInvestmentImport, setSetting } from "./database";

const snapshotKey = "finance_snapshot_v1";
const autoImportKey = "finance_auto_import_v1";

export async function loadFinanceSnapshot(): Promise<FinanceSnapshot | null> {
  await migrateDatabase();
  const value = await getSetting(snapshotKey);
  return value === null ? null : FinanceSnapshotSchema.parse(JSON.parse(value));
}

export async function saveFinanceSnapshot(input: FinanceSnapshot): Promise<void> {
  const snapshot = FinanceSnapshotSchema.parse(input);
  await migrateDatabase();
  await setSetting(snapshotKey, JSON.stringify(snapshot));
}

export async function getFinanceAutoImport(): Promise<boolean> {
  await migrateDatabase();
  return (await getSetting(autoImportKey)) === "true";
}

export async function setFinanceAutoImport(enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") throw new Error("Preferência de importação inválida.");
  await migrateDatabase();
  await setSetting(autoImportKey, String(enabled));
}

export async function previewFinanceImport(snapshot: FinanceSnapshot) {
  const prepared = prepareFinanceTrades(snapshot);
  if (!prepared.eligible.length)
    return { newCount: 0, duplicateCount: 0, pending: prepared.pending, warnings: prepared.warnings };
  const result = await previewInvestmentImport(prepared.eligible.map((item) => item.trade), {
    sourceKeys: prepared.eligible.map((item) => item.sourceKey),
  });
  return { ...result, pending: prepared.pending, warnings: [...new Set([...prepared.warnings, ...result.warnings])] };
}

/** Only verified transactions enter the ledger. Positions and balances remain informational. */
export async function commitFinanceImport(snapshot: FinanceSnapshot) {
  const prepared = prepareFinanceTrades(snapshot);
  if (!prepared.eligible.length)
    return { imported: 0, duplicates: 0, pending: prepared.pending, warnings: prepared.warnings };
  const result = await commitInvestmentImport(prepared.eligible.map((item) => item.trade), {
    sourceKeys: prepared.eligible.map((item) => item.sourceKey),
  });
  return { ...result, pending: prepared.pending, warnings: prepared.warnings };
}
