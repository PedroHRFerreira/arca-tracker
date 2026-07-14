import { z } from 'zod';

export const arcaClasses = [
  'BRAZIL_STOCKS',
  'REAL_ESTATE',
  'CASH_FIXED_INCOME',
  'INTERNATIONAL',
] as const;

export const ArcaClassSchema = z.enum(arcaClasses);
export type ArcaClass = z.infer<typeof ArcaClassSchema>;

export const ARCA_LABELS: Record<ArcaClass, string> = {
  BRAZIL_STOCKS: 'Ações Brasil',
  REAL_ESTATE: 'Real Estate (FIIs)',
  CASH_FIXED_INCOME: 'Caixa e Renda Fixa',
  INTERNATIONAL: 'Bolsas Internacionais',
};

export const ARCA_SHORT_LABELS: Record<ArcaClass, string> = {
  BRAZIL_STOCKS: 'Ações',
  REAL_ESTATE: 'Real Estate',
  CASH_FIXED_INCOME: 'Caixa',
  INTERNATIONAL: 'Internacional',
};

export interface PositionInput {
  assetId: string;
  arcaClass: ArcaClass;
  marketValue: string;
  costBasis: string;
}

export interface ClassAllocation {
  arcaClass: ArcaClass;
  value: string;
  costBasis: string;
  percent: string;
  targetPercent: string;
  driftPercentagePoints: string;
  returnPercent: string | null;
}

export interface PortfolioSummary {
  totalValue: string;
  totalCostBasis: string;
  returnPercent: string | null;
  allocations: ClassAllocation[];
}

export interface ProjectionPoint {
  month: number;
  pessimistic: string;
  neutral: string;
  optimistic: string;
}

export interface SnapshotValue {
  capturedAt: string;
  totalValue: string;
}
