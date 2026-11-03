import Decimal from "decimal.js";
import { z } from "zod";
import { getAssetCatalogMetadata } from "./catalog";
import { ReviewedImportTradeSchema, type ReviewedImportTrade } from "./imports";

const id = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(160);
const timestamp = z.string().datetime({ offset: true });
const currency = z.string().regex(/^[A-Z]{3}$/);
const decimal = (signed = false) => z.string()
  .regex(signed ? /^-?\d{1,18}(?:\.\d{1,12})?$/ : /^\d{1,18}(?:\.\d{1,12})?$/)
  .transform((value) => new Decimal(value).toFixed());
const positiveDecimal = decimal().refine((value) => new Decimal(value).gt(0));
const tradeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

/** Normalized private financial data, without credentials or provider tokens. */
export const FinanceSnapshotSchema = z.object({
  version: z.literal(1),
  syncedAt: timestamp,
  connections: z.array(z.object({
    id, institution: z.enum(["NUBANK", "MERCADO_PAGO", "OTHER"]), name,
    status: z.enum(["UPDATED", "UPDATING", "LOGIN_REQUIRED", "ERROR"]),
    updatedAt: timestamp.nullable(),
  }).strict()).max(100),
  accounts: z.array(z.object({
    id, connectionId: id, name, kind: z.enum(["BANK", "CREDIT"]),
    balance: decimal(true), currency,
  }).strict()).max(1000),
  investments: z.array(z.object({
    id, connectionId: id, symbol: z.string().trim().min(1).max(32).nullable(), name,
    type: z.enum(["EQUITY", "ETF", "FII", "FIXED_INCOME", "FUND", "OTHER"]),
    // Optional for previously saved snapshots. Withdrawn positions retain their trade references.
    status: z.enum(["ACTIVE", "WITHDRAWN"]).optional(),
    quantity: decimal().nullable(), unitPrice: decimal().nullable(), value: decimal().nullable(),
    currency, updatedAt: timestamp.nullable(),
  }).strict()).max(5000),
  trades: z.array(z.object({
    id, investmentId: id, connectionId: id, type: z.enum(["BUY", "SELL"]),
    tradeDate, quantity: positiveDecimal, unitPrice: positiveDecimal, fees: decimal().nullable(),
  }).strict()).max(2000),
  warnings: z.array(z.string().max(500)).max(200),
}).strict().superRefine((snapshot, ctx) => {
  for (const field of ["connections", "accounts", "investments", "trades"] as const) {
    const seen = new Set<string>();
    snapshot[field].forEach((item, index) => {
      // Trade IDs are scoped to their connection; provider account and investment IDs are global.
      const key = field === "trades" ? JSON.stringify([(item as { connectionId: string }).connectionId, item.id]) : item.id;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [field, index, "id"], message: "Identificador repetido." });
      seen.add(key);
    });
  }
  const connections = new Set(snapshot.connections.map((item) => item.id));
  const investments = new Map(snapshot.investments.map((item) => [item.id, item]));
  for (const field of ["accounts", "investments", "trades"] as const) {
    snapshot[field].forEach((item, index) => {
      if (!connections.has(item.connectionId)) ctx.addIssue({ code: "custom", path: [field, index, "connectionId"], message: "Conexão desconhecida." });
    });
  }
  snapshot.trades.forEach((item, index) => {
    if (investments.get(item.investmentId)?.connectionId !== item.connectionId)
      ctx.addIssue({ code: "custom", path: ["trades", index, "investmentId"], message: "Investimento não pertence à conexão." });
  });
});

export type FinanceSnapshot = z.infer<typeof FinanceSnapshotSchema>;

export function prepareFinanceTrades(input: FinanceSnapshot): {
  eligible: { sourceKey: string; trade: ReviewedImportTrade }[];
  pending: number;
  warnings: string[];
} {
  const snapshot = FinanceSnapshotSchema.parse(input);
  const investments = new Map(snapshot.investments.map((item) => [item.id, item]));
  const connections = new Map(snapshot.connections.map((item) => [item.id, item]));
  const eligible: { sourceKey: string; trade: ReviewedImportTrade; investmentId: string }[] = [];
  const incomplete = new Set<string>();
  const warnings = new Set(snapshot.warnings);
  let pending = 0;
  for (const row of snapshot.trades) {
    const investment = investments.get(row.investmentId)!;
    const connection = connections.get(row.connectionId)!;
    const catalog = investment.symbol ? getAssetCatalogMetadata(investment.symbol) : undefined;
    if (investment.currency !== "BRL" || row.fees === null || !catalog ||
        catalog.assetType === "TREASURY" || catalog.assetType !== investment.type ||
        connection.institution === "OTHER" || connection.status !== "UPDATED") {
      pending++;
      incomplete.add(investment.id);
      warnings.add(`${investment.name}: operação pendente de revisão (conexão, código, categoria, instituição, moeda ou taxas sem confirmação).`);
      continue;
    }
    const parsed = ReviewedImportTradeSchema.safeParse({
      symbol: catalog.symbol, name: catalog.name, arcaClass: catalog.arcaClass,
      assetType: catalog.assetType, tradeDate: row.tradeDate, type: row.type,
      quantity: row.quantity, unitPrice: row.unitPrice, fees: row.fees,
      broker: connection.institution === "NUBANK" ? "Nubank" : "Mercado Pago",
    });
    if (!parsed.success) {
      pending++;
      incomplete.add(investment.id);
      warnings.add(`${investment.name}: operação pendente de revisão da data ou dos valores.`);
      continue;
    }
    eligible.push({ sourceKey: JSON.stringify(["pluggy", row.connectionId, row.id]), trade: parsed.data, investmentId: investment.id });
  }
  // Import an investment's confirmed history together. Otherwise a pending sale could leave a false holding.
  const ExactDecimal = Decimal.clone({ precision: 80 });
  for (const investment of snapshot.investments) {
    if (investment.status !== "WITHDRAWN") continue;
    const delta = snapshot.trades.filter(row => row.investmentId === investment.id)
      .reduce((sum, row) => row.type === "BUY" ? sum.plus(row.quantity) : sum.minus(row.quantity), new ExactDecimal(0));
    if (delta.gt(0)) incomplete.add(investment.id);
  }
  const confirmed = eligible.filter(item => {
    if (!incomplete.has(item.investmentId)) return true;
    pending++;
    warnings.add(`${investments.get(item.investmentId)!.name}: revise o histórico completo deste investimento antes de importar parte das compras e vendas.`);
    return false;
  }).map(({ sourceKey, trade }) => ({ sourceKey, trade }));
  return { eligible: confirmed, pending, warnings: [...warnings] };
}

/** Informational totals. Never add these provider positions to the ARCA ledger holdings. */
export function getFinanceTotals(input: FinanceSnapshot): {
  bankBalance: string; creditBalance: string; investmentsValue: string;
} {
  const snapshot = FinanceSnapshotSchema.parse(input);
  const ExactDecimal = Decimal.clone({ precision: 80 });
  const total = (values: string[]) => values.reduce((sum, value) => sum.plus(value), new ExactDecimal(0)).toFixed();
  return {
    bankBalance: total(snapshot.accounts.filter((item) => item.kind === "BANK" && item.currency === "BRL").map((item) => item.balance)),
    creditBalance: total(snapshot.accounts.filter((item) => item.kind === "CREDIT" && item.currency === "BRL").map((item) => item.balance)),
    investmentsValue: total(snapshot.investments.filter((item) => item.status !== "WITHDRAWN" && item.currency === "BRL" && item.value !== null).map((item) => item.value!)),
  };
}
