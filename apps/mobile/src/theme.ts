export const colors = {
  background: "#F5F7FB",
  surface: "#FFFFFF",
  ink: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  primary: "#083BCE",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#059669",
  successSoft: "#D1FAE5",
  actions: "#1057D8",
  realEstate: "#22C55E",
  cash: "#EF4444",
  international: "#8B5CF6",
  warning: "#F59E0B",
  navy: "#111827",
} as const;

export const arcaColors = {
  BRAZIL_STOCKS: colors.actions,
  REAL_ESTATE: colors.realEstate,
  CASH_FIXED_INCOME: colors.cash,
  INTERNATIONAL: colors.international,
} as const;

export const money = (value: string | number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value));

export const pct = (value: string | number) =>
  `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
