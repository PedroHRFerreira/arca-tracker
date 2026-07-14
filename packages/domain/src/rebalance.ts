import Decimal from 'decimal.js';
import type { ArcaClass, PortfolioSummary } from './types';

export interface RebalanceSuggestion {
  arcaClass: ArcaClass;
  currentValue: string;
  targetValue: string;
  driftPercentagePoints: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  amount: string;
  outsideTolerance: boolean;
}

export interface RebalancePlan {
  totalToMove: string;
  suggestions: RebalanceSuggestion[];
}

export function calculateRebalance(
  portfolio: PortfolioSummary,
  tolerancePercentagePoints: string,
): RebalancePlan {
  const total = new Decimal(portfolio.totalValue);
  const tolerance = new Decimal(tolerancePercentagePoints);
  const suggestions = portfolio.allocations
    .map((allocation): RebalanceSuggestion => {
      const current = new Decimal(allocation.value);
      const target = total.mul(allocation.targetPercent).div(100);
      const delta = target.minus(current);
      const outsideTolerance = new Decimal(allocation.driftPercentagePoints).abs().greaterThan(tolerance);
      const action = !outsideTolerance || delta.abs().lessThan(0.01)
        ? 'HOLD'
        : delta.isPositive() ? 'BUY' : 'SELL';
      return {
        arcaClass: allocation.arcaClass,
        currentValue: current.toFixed(2),
        targetValue: target.toFixed(2),
        driftPercentagePoints: allocation.driftPercentagePoints,
        action,
        amount: action === 'HOLD' ? '0.00' : delta.abs().toFixed(2),
        outsideTolerance,
      };
    })
    .sort((a, b) => new Decimal(b.driftPercentagePoints).abs().comparedTo(new Decimal(a.driftPercentagePoints).abs()));

  const totalToMove = suggestions
    .filter((suggestion) => suggestion.action === 'BUY')
    .reduce((sum, suggestion) => sum.plus(suggestion.amount), new Decimal(0));

  return { totalToMove: totalToMove.toFixed(2), suggestions };
}
