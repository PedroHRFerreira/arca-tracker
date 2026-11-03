import { describe, expect, it } from "vitest";
import {
  investmentTradeIdentity,
  ReviewedImportTradeSchema,
} from "../src/imports";

const valid = {
  symbol: "petr4",
  name: "Petrobras",
  arcaClass: "BRAZIL_STOCKS",
  assetType: "EQUITY",
  tradeDate: "2025-01-10",
  type: "BUY",
  quantity: "002.000",
  unitPrice: "30.5000",
};

describe("reviewed investment operations", () => {
  it("normalizes reviewed values without guessing their classification", () => {
    const trade = ReviewedImportTradeSchema.parse(valid);
    expect(trade).toMatchObject({
      symbol: "PETR4",
      quantity: "2",
      unitPrice: "30.5",
      fees: "0",
      broker: "",
      bucket: "LONG_TERM",
    });
    expect(
      ReviewedImportTradeSchema.safeParse({ ...valid, arcaClass: undefined })
        .success,
    ).toBe(false);
    expect(
      ReviewedImportTradeSchema.safeParse({
        ...valid,
        arcaClass: "CASH_FIXED_INCOME",
      }).success,
    ).toBe(false);
  });

  it.each([
    { tradeDate: "2025-02-29" },
    { tradeDate: "2025-13-01" },
    { tradeDate: "9999-01-01" },
    { quantity: "0" },
    { quantity: "NaN" },
    { unitPrice: "0" },
    { unitPrice: "1,50" },
    { fees: "-0.01" },
    { fees: "Infinity" },
    { bucket: "RESERVE" },
    { symbol: "SEM CODIGO" },
    { assetType: "FII", arcaClass: "BRAZIL_STOCKS" },
  ])("rejects invalid financial/date data: %j", (patch) => {
    expect(
      ReviewedImportTradeSchema.safeParse({ ...valid, ...patch }).success,
    ).toBe(false);
  });

  it("recognizes overlapping documents and canonical decimal identities", () => {
    const first = ReviewedImportTradeSchema.parse(valid);
    const second = ReviewedImportTradeSchema.parse({
      ...valid,
      name: "Nome diferente no extrato",
      broker: "Outra identificação",
      quantity: "2",
      unitPrice: "30.5",
    });
    expect(investmentTradeIdentity(first)).toBe(
      investmentTradeIdentity(second),
    );
    expect(investmentTradeIdentity(first)).not.toBe(
      investmentTradeIdentity({ ...second, fees: "0.01" }),
    );
  });
});
