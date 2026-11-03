import { describe, expect, it } from "vitest";
import {
  BANK_CAPABILITIES,
  getBankCapability,
  getBanksForInvestment,
} from "../src/banks";

describe("verified bank investment families", () => {
  it.each(["EQUITY", "ETF", "FII", "TREASURY"] as const)(
    "points %s to Nubank without claiming Mercado Pago offers it",
    (assetType) => {
      expect(getBanksForInvestment(assetType).map((bank) => bank.institution)).toEqual([
        "NUBANK",
      ]);
    },
  );

  it("allows checking fixed income and funds at both banks", () => {
    for (const assetType of ["FIXED_INCOME", "FUND"] as const) {
      expect(getBanksForInvestment(assetType).map((bank) => bank.institution)).toEqual([
        "NUBANK",
        "MERCADO_PAGO",
      ]);
    }
  });

  it("does not infer capabilities or an opening destination for other institutions", () => {
    expect(getBankCapability("OTHER")).toBeUndefined();
  });

  it("keeps public family evidence and explicitly requires account-level confirmation", () => {
    for (const bank of BANK_CAPABILITIES) {
      expect(bank.verifiedAt).toBe("2026-11-02");
      expect(bank.availabilityNote).toContain("Confirme no banco");
      expect(bank.availabilityNote).toContain("Open Finance");
      expect(bank.sources.some((source) => source.url === bank.instructionsUrl)).toBe(true);
      expect(bank.sources.some((source) =>
        source.url === `https://play.google.com/store/apps/details?id=${bank.androidPackageName}`,
      )).toBe(true);
    }
  });
});
