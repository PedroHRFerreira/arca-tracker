import Decimal from "decimal.js";
import { z } from "zod";
import { arcaClasses, type ArcaClass, type PortfolioSummary } from "./types";

export type PlanningTargets = Record<ArcaClass, string>;
export const ContributionFrequencySchema = z.enum([
  "MONTHLY",
  "WEEKLY",
  "FORTNIGHTLY",
]);
export type ContributionFrequency = z.infer<typeof ContributionFrequencySchema>;
export type FinancialPhase = "DEBT" | "RESERVE" | "INVEST";
export type AssetBucket = "RESERVE" | "LONG_TERM";

/** A decimal in the persistence format. Localized input is converted at the UI boundary. */
const amountSchema = z
  .string()
  .regex(
    /^\d+(?:\.\d{1,2})?$/,
    "Informe um valor positivo com até dois centavos.",
  )
  .refine((value) => new Decimal(value).isFinite(), "Valor inválido.");
const percentageSchema = amountSchema.refine(
  (value) => new Decimal(value).lte(100),
  "O percentual deve ser entre 0 e 100.",
);
const targetsSchema = z.object({
  BRAZIL_STOCKS: percentageSchema,
  REAL_ESTATE: percentageSchema,
  CASH_FIXED_INCOME: percentageSchema,
  INTERNATIONAL: percentageSchema,
});

export function localDateString(date = new Date()): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("DATA_INVALIDA");
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, 12);
  // setFullYear avoids Date's special treatment of years below 100.
  date.setFullYear(year);
  if (year < 1900 || year > 9999 || localDateString(date) !== value)
    throw new Error("DATA_INVALIDA");
  return date;
}

const dateSchema = z.string().refine((value) => {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}, "Use uma data válida no formato AAAA-MM-DD.");

export const PlanningDraftSchema = z.object({
  objective: z.string().trim().min(1, "Descreva seu objetivo.").max(160),
  goalAmount: amountSchema,
  horizonYears: z.number().finite().min(0.1).max(100),
  initialAmount: amountSchema,
  existingInvestments: amountSchema,
  contributionAmount: amountSchema,
  frequency: ContributionFrequencySchema,
  firstContributionDate: dateSchema,
  essentialExpenses: amountSchema,
  monthlyIncome: amountSchema.default("0"),
  monthlyCommitments: amountSchema.default("0"),
  budgetConfigured: z.boolean().default(false),
  incomeStability: z.enum(["STABLE", "VARIABLE", "UNKNOWN"]),
  hasExpensiveDebt: z.boolean(),
  reserveAmount: amountSchema,
  reserveMonths: z.number().int().min(1).max(36),
  experience: z.enum(["BEGINNER", "SOME", "EXPERIENCED", "UNKNOWN"]),
  liquidityNeed: z.enum(["SHORT_TERM", "LONG_TERM", "UNKNOWN"]),
  lossReaction: z.enum(["SELL", "WAIT", "BUY_MORE", "UNKNOWN"]),
  strategy: z.enum(["ARCA", "SIMPLE", "CUSTOM"]),
  targets: targetsSchema,
});
export const PlanningProfileSchema = PlanningDraftSchema.superRefine(
  (value, context) => {
    if (calculateBudget(value).exceedsCapacity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contributionAmount"],
        message: "O aporte ultrapassa a sobra mensal informada.",
      });
    }
    if (value.strategy === "CUSTOM" && !sumTargets(value.targets).eq(100)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: "Os percentuais precisam somar 100%.",
      });
    }
  },
);
export type PlanningProfile = z.infer<typeof PlanningProfileSchema>;

export function defaultPlanningProfile(): PlanningProfile {
  return {
    objective: "Construir patrimônio",
    goalAmount: "0",
    horizonYears: 10,
    initialAmount: "0",
    existingInvestments: "0",
    contributionAmount: "0",
    frequency: "MONTHLY",
    firstContributionDate: localDateString(),
    essentialExpenses: "0",
    monthlyIncome: "0",
    monthlyCommitments: "0",
    budgetConfigured: false,
    incomeStability: "UNKNOWN",
    hasExpensiveDebt: false,
    reserveAmount: "0",
    reserveMonths: 6,
    experience: "UNKNOWN",
    liquidityNeed: "UNKNOWN",
    lossReaction: "UNKNOWN",
    strategy: "SIMPLE",
    targets: {
      BRAZIL_STOCKS: "25",
      REAL_ESTATE: "25",
      CASH_FIXED_INCOME: "25",
      INTERNATIONAL: "25",
    },
  };
}

/** Accept pt-BR decimal input, never silently truncate malformed input. */
export function parseMoneyInput(input: string): string {
  const value = input
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  const normalized = value.includes(",")
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value)
      ? value.replace(/\./g, "").replace(",", ".")
      : ""
    : /^\d{1,3}(?:\.\d{3})+$/.test(value)
      ? value.replace(/\./g, "")
      : value;
  return new Decimal(amountSchema.parse(normalized)).toFixed(2);
}

function sumTargets(targets: PlanningTargets): Decimal {
  return arcaClasses.reduce(
    (sum, key) => sum.plus(targets[key]),
    new Decimal(0),
  );
}

export function validatePlanningTargets(
  targets: PlanningTargets,
): PlanningTargets {
  const parsed = targetsSchema.parse(targets);
  if (!sumTargets(parsed).eq(100))
    throw new Error("Os percentuais precisam somar 100%.");
  return parsed;
}

/** Educational product defaults, not an official suitability assessment. */
export function simpleEquityPercent(profile: PlanningProfile): number {
  if (profile.objective === "Formar uma reserva") return 0;
  if (profile.horizonYears < 3 || profile.liquidityNeed === "SHORT_TERM")
    return 0;
  if (profile.horizonYears <= 5) return 20;
  if (
    profile.experience === "UNKNOWN" ||
    profile.liquidityNeed === "UNKNOWN" ||
    profile.lossReaction === "UNKNOWN" ||
    profile.incomeStability === "UNKNOWN"
  )
    return 20;
  if (profile.lossReaction === "SELL") return 20;
  if (
    profile.lossReaction === "BUY_MORE" &&
    profile.experience === "EXPERIENCED"
  )
    return 60;
  return 40;
}

export function getPlanTargets(profile: PlanningProfile): PlanningTargets {
  if (profile.strategy === "CUSTOM")
    return validatePlanningTargets(profile.targets);
  if (profile.strategy === "ARCA")
    return {
      BRAZIL_STOCKS: "25",
      REAL_ESTATE: "25",
      CASH_FIXED_INCOME: "25",
      INTERNATIONAL: "25",
    };
  const equity = simpleEquityPercent(profile);
  return {
    BRAZIL_STOCKS: String(equity / 2),
    REAL_ESTATE: "0",
    CASH_FIXED_INCOME: String(100 - equity),
    INTERNATIONAL: String(equity / 2),
  };
}

export function evaluatePlan(
  profile: PlanningProfile,
  registeredReserve?: string,
) {
  // Once reserve assets are recorded their balance replaces the declaration.
  // Never add a declared amount to its ledger representation.
  const reserveValue = new Decimal(registeredReserve ?? profile.reserveAmount);
  const reserveTarget = new Decimal(profile.essentialExpenses).mul(
    profile.reserveMonths,
  );
  const reserveGap = Decimal.max(0, reserveTarget.minus(reserveValue));
  const phase: FinancialPhase = profile.hasExpensiveDebt
    ? "DEBT"
    : reserveGap.gt(0)
      ? "RESERVE"
      : "INVEST";
  const explanation =
    phase === "DEBT"
      ? "Primeiro, organize as dívidas caras. Confirme quando estiverem resolvidas para avançar."
      : phase === "RESERVE"
        ? `Monte uma reserva de ${profile.reserveMonths} meses das despesas essenciais, com liquidez e baixo risco.`
        : "Sua reserva está coberta. Direcione os próximos aportes para a carteira do seu objetivo.";
  return {
    phase,
    reserveValue: reserveValue.toFixed(2),
    reserveTarget: reserveTarget.toFixed(2),
    reserveGap: reserveGap.toFixed(2),
    targets: getPlanTargets(profile),
    explanation,
    equityPercent: simpleEquityPercent(profile),
  };
}

/** Largest-remainder apportionment preserves every cent, including tiny contributions. */
function distributeCents(amount: Decimal, weights: Decimal[]): string[] {
  const cents = amount.mul(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const total = weights.reduce(
    (sum, weight) => sum.plus(weight),
    new Decimal(0),
  );
  if (total.eq(0)) return weights.map(() => "0.00");
  const shares = weights.map((weight, index) => {
    const exact = cents.mul(weight).div(total);
    const floor = exact.floor();
    return { index, cents: floor, remainder: exact.minus(floor) };
  });
  let left = cents
    .minus(shares.reduce((sum, share) => sum.plus(share.cents), new Decimal(0)))
    .toNumber();
  for (const share of [...shares].sort(
    (a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index,
  )) {
    if (left-- <= 0) break;
    share.cents = share.cents.plus(1);
  }
  return shares.map((share) => share.cents.div(100).toFixed(2));
}

export function allocateContribution(input: {
  profile: PlanningProfile;
  portfolio: PortfolioSummary;
  reserveValue?: string;
  amount?: string;
}) {
  const amount = new Decimal(
    amountSchema.parse(input.amount ?? input.profile.contributionAmount),
  );
  const evaluation = evaluatePlan(input.profile, input.reserveValue);
  const debt = evaluation.phase === "DEBT" ? amount : new Decimal(0);
  const reserve =
    evaluation.phase === "DEBT"
      ? new Decimal(0)
      : Decimal.min(amount, evaluation.reserveGap);
  const invest = amount.minus(debt).minus(reserve);
  const currentTotal = new Decimal(input.portfolio.totalValue);
  const targets = getPlanTargets(input.profile);
  // Deficits at the post-contribution total naturally cover all investable money.
  const deficits = arcaClasses.map((key) =>
    Decimal.max(
      0,
      currentTotal
        .plus(invest)
        .mul(targets[key])
        .div(100)
        .minus(
          input.portfolio.allocations.find((item) => item.arcaClass === key)
            ?.value ?? "0",
        ),
    ),
  );
  const shares = distributeCents(invest, deficits);
  return {
    debt: debt.toFixed(2),
    reserve: reserve.toFixed(2),
    investments: Object.fromEntries(
      arcaClasses.map((key, index) => [key, shares[index]!]),
    ) as PlanningTargets,
    total: amount.toFixed(2),
  };
}

function occurrence(
  firstDate: string,
  frequency: ContributionFrequency,
  index: number,
): string {
  const anchor = parseLocalDate(firstDate);
  if (frequency === "MONTHLY") {
    const day = anchor.getDate();
    anchor.setDate(1);
    anchor.setMonth(anchor.getMonth() + index);
    const lastDay = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0,
      12,
    ).getDate();
    anchor.setDate(Math.min(day, lastDay));
  } else
    anchor.setDate(
      anchor.getDate() + index * (frequency === "WEEKLY" ? 7 : 15),
    );
  return localDateString(anchor);
}

export function nextContributionDate(
  firstDate: string,
  frequency: ContributionFrequency,
  fromDate = localDateString(),
): string {
  parseLocalDate(firstDate);
  parseLocalDate(fromDate);
  ContributionFrequencySchema.parse(frequency);
  // At most a few thousand dates for real-world horizons; no UTC/DST arithmetic.
  for (let index = 0; index < 200000; index++) {
    const candidate = occurrence(firstDate, frequency, index);
    if (candidate >= fromDate) return candidate;
  }
  throw new Error("INTERVALO_DE_DATAS_EXCEDIDO");
}

export function contributionDates(
  firstDate: string,
  frequency: ContributionFrequency,
  throughDate: string,
): string[] {
  parseLocalDate(firstDate);
  parseLocalDate(throughDate);
  ContributionFrequencySchema.parse(frequency);
  const dates: string[] = [];
  for (let index = 0; index < 200000; index++) {
    const candidate = occurrence(firstDate, frequency, index);
    if (candidate > throughDate) return dates;
    dates.push(candidate);
  }
  throw new Error("INTERVALO_DE_DATAS_EXCEDIDO");
}

export function projectPlan(input: {
  profile: PlanningProfile;
  startDate?: string;
  throughDate: string;
  presentValue?: string;
  annualRatePercent?: string;
}): Array<{ date: string; contributed: string; value: string }> {
  const startDate = input.startDate ?? localDateString();
  parseLocalDate(startDate);
  parseLocalDate(input.throughDate);
  if (input.throughDate < startDate)
    throw new Error("INTERVALO_DE_DATAS_INVALIDO");
  const rate = new Decimal(input.annualRatePercent ?? "0");
  if (!rate.isFinite() || rate.lte(-100)) throw new Error("TAXA_INVALIDA");
  let value = new Decimal(
    amountSchema.parse(input.presentValue ?? input.profile.initialAmount),
  );
  let contributed = value;
  let previous = startDate;
  const points = [
    {
      date: startDate,
      contributed: contributed.toFixed(2),
      value: value.toFixed(2),
    },
  ];
  const calendarDays = (date: string) => {
    const parsed = parseLocalDate(date);
    return (
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) /
      86400000
    );
  };
  for (const date of contributionDates(
    input.profile.firstContributionDate,
    input.profile.frequency,
    input.throughDate,
  ).filter((date) => date >= startDate)) {
    value = value
      .mul(
        rate
          .div(100)
          .plus(1)
          .pow((calendarDays(date) - calendarDays(previous)) / 365.25),
      )
      .plus(input.profile.contributionAmount);
    contributed = contributed.plus(input.profile.contributionAmount);
    points.push({
      date,
      contributed: contributed.toFixed(2),
      value: value.toFixed(2),
    });
    previous = date;
  }
  if (input.throughDate > previous) {
    value = value.mul(
      rate
        .div(100)
        .plus(1)
        .pow(
          (calendarDays(input.throughDate) - calendarDays(previous)) / 365.25,
        ),
    );
    points.push({
      date: input.throughDate,
      contributed: contributed.toFixed(2),
      value: value.toFixed(2),
    });
  }
  return points;
}

/** Monetary keyboard uses cents; reject negative/invalid pastes rather than changing their meaning. */
export function currencyInputValue(raw: string): string {
  if (!/^(?:R\$)?[\s\d.,]*$/.test(raw.trim()))
    throw new Error("Use somente valores em reais, sem sinal negativo.");
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "") || "0";
  if (digits.length > 14) throw new Error("O valor informado é muito alto.");
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

export function formatCurrencyInput(value: string): string {
  const [whole, cents] = new Decimal(amountSchema.parse(value))
    .toFixed(2)
    .split(".");
  return `R$ ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

export function planningHorizonLabel(years: number): string {
  const months = Math.round(years * 12);
  return months <= 36 || months % 12 !== 0
    ? `${months} meses`
    : `${months / 12} anos`;
}

/** An explicit product starting point, not a prescribed savings rate. */
export function calculateBudget(profile: PlanningProfile) {
  const income = new Decimal(profile.monthlyIncome ?? "0");
  const expenses = new Decimal(profile.essentialExpenses).plus(
    profile.monthlyCommitments ?? "0",
  );
  const remaining = income.minus(expenses);
  const available = Decimal.max(0, remaining);
  const maxOccurrences =
    profile.frequency === "MONTHLY"
      ? 1
      : profile.frequency === "WEEKLY"
        ? 5
        : 3;
  const plannedMonthly = new Decimal(profile.contributionAmount).mul(
    maxOccurrences,
  );
  const suggestedContribution = available
    .mul(0.5)
    .div(maxOccurrences)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);
  return {
    configured: profile.budgetConfigured ?? false,
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    remaining: remaining.toFixed(2),
    available: available.toFixed(2),
    maxOccurrences,
    plannedMonthly: plannedMonthly.toFixed(2),
    suggestedMonthly: suggestedContribution.mul(maxOccurrences).toFixed(2),
    suggestedContribution: suggestedContribution.toFixed(2),
    exceedsCapacity: !!profile.budgetConfigured && plannedMonthly.gt(available),
  };
}
