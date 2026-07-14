import { describe, expect, it } from 'vitest';
import {
  aggregateSnapshots,
  calculateLedger,
  calculatePortfolio,
  calculateProjection,
  calculateRebalance,
  type ArcaClass,
} from '../src';

const targets: Record<ArcaClass, string> = {
  BRAZIL_STOCKS: '25', REAL_ESTATE: '25', CASH_FIXED_INCOME: '25', INTERNATIONAL: '25',
};

describe('portfolio engine', () => {
  it('calculates allocation and simple return', () => {
    const summary = calculatePortfolio([
      { assetId: '1', arcaClass: 'BRAZIL_STOCKS', marketValue: '300', costBasis: '250' },
      { assetId: '2', arcaClass: 'CASH_FIXED_INCOME', marketValue: '100', costBasis: '100' },
    ], targets);
    expect(summary.totalValue).toBe('400.00');
    expect(summary.returnPercent).toBe('14.2857');
    expect(summary.allocations[0]?.percent).toBe('75.0000');
  });

  it('uses weighted average cost and rejects overselling', () => {
    expect(calculateLedger([
      { type: 'BUY', quantity: '10', unitPrice: '10' },
      { type: 'BUY', quantity: '10', unitPrice: '20' },
      { type: 'SELL', quantity: '5', unitPrice: '30' },
    ])).toEqual({ quantity: '15', costBasis: '225.00', averageCost: '15.000000' });
    expect(() => calculateLedger([{ type: 'SELL', quantity: '1', unitPrice: '10' }])).toThrow('INSUFFICIENT_POSITION');
  });
});

describe('rebalance engine', () => {
  it('counts only purchases as total movement', () => {
    const portfolio = calculatePortfolio([
      { assetId: '1', arcaClass: 'BRAZIL_STOCKS', marketValue: '700', costBasis: '700' },
      { assetId: '2', arcaClass: 'REAL_ESTATE', marketValue: '100', costBasis: '100' },
      { assetId: '3', arcaClass: 'CASH_FIXED_INCOME', marketValue: '100', costBasis: '100' },
      { assetId: '4', arcaClass: 'INTERNATIONAL', marketValue: '100', costBasis: '100' },
    ], targets);
    expect(calculateRebalance(portfolio, '5').totalToMove).toBe('450.00');
  });
});

describe('projection engine', () => {
  it('handles a zero annual rate', () => {
    const points = calculateProjection({ presentValue: '1000', monthlyContribution: '100', annualRatePercent: '0', offsetPercentagePoints: '0', years: 1 });
    expect(points.at(-1)?.neutral).toBe('2200.00');
  });

  it('produces ordered scenarios', () => {
    const final = calculateProjection({ presentValue: '1000', monthlyContribution: '100', annualRatePercent: '8', offsetPercentagePoints: '3', years: 10 }).at(-1)!;
    expect(Number(final.pessimistic)).toBeLessThan(Number(final.neutral));
    expect(Number(final.neutral)).toBeLessThan(Number(final.optimistic));
  });
});

describe('history aggregation', () => {
  it('keeps the last snapshot in each month', () => {
    const result = aggregateSnapshots([
      { capturedAt: '2026-01-01T10:00:00Z', totalValue: '10' },
      { capturedAt: '2026-01-31T10:00:00Z', totalValue: '20' },
      { capturedAt: '2026-02-01T10:00:00Z', totalValue: '30' },
    ], 'MONTHLY');
    expect(result.map((item) => item.totalValue)).toEqual(['20', '30']);
  });
});
