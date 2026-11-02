export const colors = {
  background: "#F5F7F6",
  surface: "#FFFFFF",
  ink: "#152D25",
  muted: "#68786F",
  border: "#E5EBE7",
  primary: "#104C3B",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#059669",
  successSoft: "#D1FAE5",
  actions: "#376CA0",
  realEstate: "#A46E30",
  cash: "#397959",
  international: "#81719F",
  warning: "#F59E0B",
  navy: "#104C3B",
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

export const layout = { maxWidth: 520, tabBottomSpace: 140 } as const;
