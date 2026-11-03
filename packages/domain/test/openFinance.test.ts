import { describe, expect, it } from "vitest";
import { FinanceSnapshotSchema, getFinanceTotals, prepareFinanceTrades, type FinanceSnapshot } from "../src/openFinance";

const snapshot = (): FinanceSnapshot => ({
  version: 1, syncedAt: "2026-01-01T12:00:00Z",
  connections: [{ id: "synthetic-connection", institution: "NUBANK", name: "Instituição de teste", status: "UPDATED", updatedAt: null }],
  accounts: [
    { id: "synthetic-bank", connectionId: "synthetic-connection", name: "Conta de teste", kind: "BANK", balance: "0.1", currency: "BRL" },
    { id: "synthetic-credit", connectionId: "synthetic-connection", name: "Cartão de teste", kind: "CREDIT", balance: "500", currency: "BRL" },
  ],
  investments: [{ id: "synthetic-investment", connectionId: "synthetic-connection", symbol: "PETR4", name: "Investimento de teste", type: "EQUITY", quantity: "2", unitPrice: "30", value: "60", currency: "BRL", updatedAt: null }],
  trades: [{ id: "synthetic-trade", connectionId: "synthetic-connection", investmentId: "synthetic-investment", type: "BUY", tradeDate: "2025-01-10", quantity: "2", unitPrice: "30", fees: "0" }],
  warnings: [],
});

describe("read-only finance snapshot", () => {
  it("classifies only catalog-backed transactions with explicit fees", () => {
    expect(prepareFinanceTrades(snapshot())).toMatchObject({ pending: 0, eligible: [{ sourceKey: JSON.stringify(["pluggy", "synthetic-connection", "synthetic-trade"]), trade: { symbol: "PETR4", arcaClass: "BRAZIL_STOCKS", fees: "0", broker: "Nubank" } }] });
  });

  it.each(["fees", "currency", "symbol", "unknown-symbol", "type", "institution"])("keeps unverified %s pending", (reason) => {
    const input = snapshot();
    if (reason === "fees") input.trades[0]!.fees = null;
    if (reason === "currency") input.investments[0]!.currency = "USD";
    if (reason === "symbol") input.investments[0]!.symbol = null;
    if (reason === "unknown-symbol") input.investments[0]!.symbol = "ZZZZ11";
    if (reason === "type") input.investments[0]!.type = "FUND";
    if (reason === "institution") input.connections[0]!.institution = "OTHER";
    expect(prepareFinanceTrades(input)).toMatchObject({ pending: 1, eligible: [] });
  });

  it("never generates a purchase from an investment position", () => {
    const input = snapshot();
    input.trades = [];
    expect(prepareFinanceTrades(input)).toEqual({ eligible: [], pending: 0, warnings: [] });
  });

  it.each(["UPDATING", "LOGIN_REQUIRED", "ERROR"] as const)("keeps cached trades from a %s connection pending", (status) => {
    const input = snapshot();
    input.connections[0]!.status = status;
    expect(prepareFinanceTrades(input)).toMatchObject({ pending: 1, eligible: [] });
  });

  it("keeps credit and positions separate, excludes foreign currencies, and adds exact decimals", () => {
    const input = snapshot();
    input.accounts.push({ ...input.accounts[0]!, id: "synthetic-bank-2", balance: "0.2" }, { ...input.accounts[0]!, id: "synthetic-usd", balance: "999", currency: "USD" });
    expect(getFinanceTotals(input)).toEqual({ bankBalance: "0.3", creditBalance: "500", investmentsValue: "60" });
    input.accounts[0]!.balance = "999999999999999999.999999999999";
    expect(getFinanceTotals(input).bankBalance).toBe("1000000000000000000.199999999999");
  });

  it("rejects secrets, malformed dates, invalid decimals, duplicate IDs and dangling references", () => {
    expect(FinanceSnapshotSchema.safeParse({ ...snapshot(), apiKey: "synthetic-forbidden-field" }).success).toBe(false);
    for (const quantity of ["NaN", "Infinity", "1e10", "-1", "0", "1.0000000000001", "1000000000000000000"]) {
      const input = snapshot(); input.trades[0]!.quantity = quantity;
      expect(FinanceSnapshotSchema.safeParse(input).success).toBe(false);
    }
    const input = snapshot();
    input.trades[0]!.tradeDate = "2025-02-30";
    expect(FinanceSnapshotSchema.safeParse(input).success).toBe(false);
    input.trades[0]!.tradeDate = "2025-01-10";
    input.trades[0]!.connectionId = "missing";
    expect(FinanceSnapshotSchema.safeParse(input).success).toBe(false);
    input.trades[0]!.connectionId = "synthetic-connection";
    input.accounts.push(input.accounts[0]!);
    expect(FinanceSnapshotSchema.safeParse(input).success).toBe(false);
  });
});
