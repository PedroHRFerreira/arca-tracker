import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  allocateContribution,
  calculatePortfolio,
  calculateBudget,
  currencyInputValue,
  formatCurrencyInput,
  planningHorizonLabel,
  contributionDates,
  defaultPlanningProfile,
  evaluatePlan,
  getPlanTargets,
  nextContributionDate,
  parseMoneyInput,
  PlanningDraftSchema,
  PlanningProfileSchema,
  projectPlan,
  type PlanningProfile,
} from "../src";

function profile(input: Partial<PlanningProfile> = {}): PlanningProfile {
  return {
    ...defaultPlanningProfile(),
    strategy: "ARCA",
    essentialExpenses: "1000",
    reserveAmount: "6000",
    ...input,
  };
}

describe("planning validation and localized amounts", () => {
  it("accepts Portuguese amounts without losing cents and rejects malformed values", () => {
    expect(parseMoneyInput("R$ 1.234,56")).toBe("1234.56");
    expect(parseMoneyInput("1.000")).toBe("1000.00");
    expect(parseMoneyInput("10,50")).toBe("10.50");
    expect(parseMoneyInput("10.50")).toBe("10.50");
    for (const invalid of ["-1", "1,234", "NaN", "1.23,00", "", "1e3"]) {
      expect(() => parseMoneyInput(invalid)).toThrow();
    }
  });

  it("validates real dates, bounds and custom totals; preserves incomplete draft targets", () => {
    expect(
      PlanningProfileSchema.safeParse(
        profile({ firstContributionDate: "2026-02-30" }),
      ).success,
    ).toBe(false);
    expect(
      PlanningProfileSchema.safeParse(
        profile({ firstContributionDate: "2028-02-29" }),
      ).success,
    ).toBe(true);
    expect(
      PlanningProfileSchema.safeParse(profile({ reserveMonths: 0 })).success,
    ).toBe(false);
    const incomplete = profile({
      strategy: "CUSTOM",
      targets: { ...defaultPlanningProfile().targets, BRAZIL_STOCKS: "0" },
    });
    expect(PlanningDraftSchema.safeParse(incomplete).success).toBe(true);
    expect(PlanningProfileSchema.safeParse(incomplete).success).toBe(false);
    expect(() => getPlanTargets(incomplete)).toThrow();
    expect(
      PlanningProfileSchema.safeParse(
        profile({ targets: { ...incomplete.targets, BRAZIL_STOCKS: "-1" } }),
      ).success,
    ).toBe(false);
  });
});

describe("financial stages and educational strategies", () => {
  it("prioritizes debt then reserve then investments without creating assets", () => {
    expect(evaluatePlan(profile({ hasExpensiveDebt: true })).phase).toBe(
      "DEBT",
    );
    expect(evaluatePlan(profile({ reserveAmount: "5000" }))).toMatchObject({
      phase: "RESERVE",
      reserveTarget: "6000.00",
      reserveGap: "1000.00",
    });
    expect(evaluatePlan(profile()).phase).toBe("INVEST");
  });

  it("replaces declared reserve by registered reserve rather than adding both", () => {
    expect(evaluatePlan(profile(), "4000")).toMatchObject({
      phase: "RESERVE",
      reserveValue: "4000.00",
      reserveGap: "2000.00",
    });
    expect(evaluatePlan(profile(), "0").reserveGap).toBe("6000.00");
    expect(evaluatePlan(profile()).reserveValue).toBe("6000.00");
  });

  it("keeps ARCA at quarters and applies duration and risk limits to SIMPLE", () => {
    expect(Object.values(getPlanTargets(profile()))).toEqual([
      "25",
      "25",
      "25",
      "25",
    ]);
    const simple = profile({
      strategy: "SIMPLE",
      experience: "EXPERIENCED",
      liquidityNeed: "LONG_TERM",
      lossReaction: "BUY_MORE",
      incomeStability: "STABLE",
    });
    expect(
      getPlanTargets({ ...simple, horizonYears: 2.9 }).CASH_FIXED_INCOME,
    ).toBe("100");
    expect(
      getPlanTargets({ ...simple, horizonYears: 3 }).CASH_FIXED_INCOME,
    ).toBe("80");
    expect(
      getPlanTargets({ ...simple, horizonYears: 5 }).CASH_FIXED_INCOME,
    ).toBe("80");
    expect(
      getPlanTargets({ ...simple, horizonYears: 5.1 }).CASH_FIXED_INCOME,
    ).toBe("40");
    expect(
      getPlanTargets({ ...simple, lossReaction: "WAIT" }).CASH_FIXED_INCOME,
    ).toBe("60");
    expect(
      getPlanTargets({ ...simple, lossReaction: "SELL" }).CASH_FIXED_INCOME,
    ).toBe("80");
    expect(
      getPlanTargets({ ...simple, experience: "UNKNOWN" }).CASH_FIXED_INCOME,
    ).toBe("80");
    expect(
      getPlanTargets({ ...simple, incomeStability: "UNKNOWN" })
        .CASH_FIXED_INCOME,
    ).toBe("80");
    expect(
      getPlanTargets({ ...simple, liquidityNeed: "SHORT_TERM" })
        .CASH_FIXED_INCOME,
    ).toBe("100");
  });
});

describe("contribution direction", () => {
  const empty = calculatePortfolio([], defaultPlanningProfile().targets);
  it("routes debt and reserves first; invests reserve overflow", () => {
    expect(
      allocateContribution({
        profile: profile({ hasExpensiveDebt: true }),
        portfolio: empty,
        amount: "50",
      }).debt,
    ).toBe("50.00");
    const result = allocateContribution({
      profile: profile({ reserveAmount: "5990" }),
      portfolio: empty,
      amount: "20",
    });
    expect(result.reserve).toBe("10.00");
    expect(Object.values(result.investments)).toEqual([
      "2.50",
      "2.50",
      "2.50",
      "2.50",
    ]);
  });

  it("never suggests sales and sends new money only toward deficits", () => {
    const portfolio = calculatePortfolio(
      [
        {
          assetId: "1",
          arcaClass: "BRAZIL_STOCKS",
          marketValue: "1000",
          costBasis: "1000",
        },
      ],
      defaultPlanningProfile().targets,
    );
    const result = allocateContribution({
      profile: profile(),
      portfolio,
      amount: "100",
    });
    expect(result.investments.BRAZIL_STOCKS).toBe("0.00");
    expect(Object.values(result.investments)).toEqual([
      "0.00",
      "33.34",
      "33.33",
      "33.33",
    ]);
  });

  it("preserves exact cents for small and uneven amounts", () => {
    for (const amount of ["0.01", "0.03", "1.01", "9999999999999999.99"]) {
      const result = allocateContribution({
        profile: profile(),
        portfolio: empty,
        amount,
      });
      const total = Object.values(result.investments).reduce(
        (sum, share) => sum.plus(share),
        new Decimal(result.reserve).plus(result.debt),
      );
      expect(total.eq(amount)).toBe(true);
      expect(
        Object.values(result.investments).every((share) =>
          new Decimal(share).gte(0),
        ),
      ).toBe(true);
    }
  });
});

describe("local calendar scheduling", () => {
  it("anchors day 31 across short months and leap years", () => {
    expect(contributionDates("2028-01-31", "MONTHLY", "2028-04-30")).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
      "2028-04-30",
    ]);
    expect(contributionDates("2026-12-31", "MONTHLY", "2027-03-31")).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    expect(nextContributionDate("2026-01-31", "MONTHLY", "2026-03-01")).toBe(
      "2026-03-31",
    );
  });

  it("uses exactly 7 or 15 calendar days including year and DST changes", () => {
    expect(contributionDates("2026-12-25", "WEEKLY", "2027-01-08")).toEqual([
      "2026-12-25",
      "2027-01-01",
      "2027-01-08",
    ]);
    expect(
      contributionDates("2026-12-25", "FORTNIGHTLY", "2027-01-25"),
    ).toEqual(["2026-12-25", "2027-01-09", "2027-01-24"]);
    expect(nextContributionDate("2026-03-01", "WEEKLY", "2026-03-08")).toBe(
      "2026-03-08",
    );
    expect(nextContributionDate("2026-03-01", "WEEKLY", "2026-03-09")).toBe(
      "2026-03-15",
    );
    expect(contributionDates("2027-01-01", "MONTHLY", "2026-12-01")).toEqual(
      [],
    );
    expect(() => nextContributionDate("2026-02-29", "MONTHLY")).toThrow();
  });
});

describe("schedule-based projection", () => {
  it("defaults to no yield and counts real contribution dates", () => {
    const points = projectPlan({
      profile: profile({
        firstContributionDate: "2026-01-31",
        initialAmount: "1000",
        contributionAmount: "100",
      }),
      startDate: "2026-01-01",
      throughDate: "2026-03-31",
    });
    expect(points.at(-1)).toEqual({
      date: "2026-03-31",
      contributed: "1300.00",
      value: "1300.00",
    });
    const weekly = projectPlan({
      profile: profile({
        firstContributionDate: "2026-01-01",
        frequency: "WEEKLY",
        initialAmount: "0",
        contributionAmount: "10",
      }),
      startDate: "2026-01-01",
      throughDate: "2026-01-31",
    });
    expect(weekly.at(-1)?.value).toBe("50.00");
  });

  it("does not repeat past contributions and applies only explicit rate scenarios", () => {
    const input = {
      profile: profile({
        firstContributionDate: "2026-01-01",
        contributionAmount: "100",
      }),
      presentValue: "1000",
      startDate: "2026-02-01",
      throughDate: "2027-02-01",
    };
    expect(projectPlan(input).at(-1)?.contributed).toBe("2300.00");
    const growth = projectPlan({ ...input, annualRatePercent: "8" }).at(-1)!;
    expect(new Decimal(growth.value).gt(growth.contributed)).toBe(true);
    expect(() =>
      projectPlan({ ...input, annualRatePercent: "-100" }),
    ).toThrow();
  });
});

describe("masked money and budget capacity", () => {
  it("keeps cents while typing, accepts formatted paste and rejects negative values", () => {
    expect(currencyInputValue("1")).toBe("0.01");
    expect(currencyInputValue("123456")).toBe("1234.56");
    expect(currencyInputValue("R$ 1.234,56")).toBe("1234.56");
    expect(currencyInputValue("")).toBe("0.00");
    expect(formatCurrencyInput("1234.56")).toBe("R$ 1.234,56");
    expect(() => currencyInputValue("-100")).toThrow();
    expect(() => currencyInputValue("1e3")).toThrow();
    expect(parseMoneyInput(formatCurrencyInput("0.01"))).toBe("0.01");
  });
  it("restores old profiles with no invented income and preserves their strategy", () => {
    const legacy: Record<string, unknown> = { ...profile() };
    delete legacy.monthlyIncome;
    delete legacy.monthlyCommitments;
    delete legacy.budgetConfigured;
    const restored = PlanningProfileSchema.parse(legacy);
    expect(restored.strategy).toBe("ARCA");
    expect(calculateBudget(restored).configured).toBe(false);
    expect(defaultPlanningProfile().strategy).toBe("SIMPLE");
  });
  it("subtracts non-overlapping expenses and leaves half the surplus free", () => {
    const p = profile({
      budgetConfigured: true,
      monthlyIncome: "3000",
      essentialExpenses: "1800",
      monthlyCommitments: "400",
      contributionAmount: "300",
    });
    expect(calculateBudget(p)).toMatchObject({
      available: "800.00",
      suggestedContribution: "400.00",
      plannedMonthly: "300.00",
      exceedsCapacity: false,
    });
    expect(calculateBudget({ ...p, monthlyCommitments: "2000" })).toMatchObject(
      {
        available: "0.00",
        suggestedContribution: "0.00",
        exceedsCapacity: true,
      },
    );
    expect(
      PlanningProfileSchema.safeParse({ ...p, contributionAmount: "801" })
        .success,
    ).toBe(false);
    expect(
      PlanningDraftSchema.safeParse({ ...p, contributionAmount: "801" })
        .success,
    ).toBe(true);
  });
  it("allows for months with five weekly or three 15-day contributions", () => {
    const p = profile({
      budgetConfigured: true,
      monthlyIncome: "2000",
      essentialExpenses: "1000",
      monthlyCommitments: "0",
      contributionAmount: "200",
    });
    expect(calculateBudget({ ...p, frequency: "WEEKLY" })).toMatchObject({
      maxOccurrences: 5,
      plannedMonthly: "1000.00",
      suggestedContribution: "100.00",
      exceedsCapacity: false,
    });
    expect(calculateBudget({ ...p, frequency: "FORTNIGHTLY" })).toMatchObject({
      maxOccurrences: 3,
      suggestedContribution: "166.66",
      suggestedMonthly: "499.98",
    });
    expect(
      calculateBudget({ ...p, frequency: "WEEKLY", contributionAmount: "201" })
        .exceedsCapacity,
    ).toBe(true);
  });
  it("displays short horizons as months and sends short simple goals to fixed income", () => {
    for (const months of [3, 6, 12, 24, 36])
      expect(planningHorizonLabel(months / 12)).toBe(`${months} meses`);
    expect(
      getPlanTargets({ ...profile(), strategy: "SIMPLE", horizonYears: 0.25 })
        .CASH_FIXED_INCOME,
    ).toBe("100");
  });
});
