import Decimal from 'decimal.js';
import {
  arcaClasses,
  type ArcaClass,
  type ClassAllocation,
  type PortfolioSummary,
  type PositionInput,
} from './types';

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

const ZERO = new Decimal(0);

function percent(numerator: Decimal, denominator: Decimal): Decimal | null {
  return denominator.isZero() ? null : numerator.div(denominator).mul(100);
}

export function calculatePortfolio(
  positions: PositionInput[],
  targets: Record<ArcaClass, string>,
): PortfolioSummary {
  const totalValue = positions.reduce((sum, item) => sum.plus(item.marketValue), ZERO);
  const totalCost = positions.reduce((sum, item) => sum.plus(item.costBasis), ZERO);

  const allocations: ClassAllocation[] = arcaClasses.map((arcaClass) => {
    const inClass = positions.filter((position) => position.arcaClass === arcaClass);
    const value = inClass.reduce((sum, item) => sum.plus(item.marketValue), ZERO);
    const costBasis = inClass.reduce((sum, item) => sum.plus(item.costBasis), ZERO);
    const allocationPercent = percent(value, totalValue) ?? ZERO;
    const target = new Decimal(targets[arcaClass]);
    const classReturn = percent(value.minus(costBasis), costBasis);

    return {
      arcaClass,
      value: value.toFixed(2),
      costBasis: costBasis.toFixed(2),
      percent: allocationPercent.toFixed(4),
      targetPercent: target.toFixed(4),
      driftPercentagePoints: allocationPercent.minus(target).toFixed(4),
      returnPercent: classReturn?.toFixed(4) ?? null,
    };
  });

  return {
    totalValue: totalValue.toFixed(2),
    totalCostBasis: totalCost.toFixed(2),
    returnPercent: percent(totalValue.minus(totalCost), totalCost)?.toFixed(4) ?? null,
    allocations,
  };
}

export interface TransactionLike {
  type: 'BUY' | 'SELL';
  quantity: string;
  unitPrice: string;
  fees?: string;
}

export interface PositionLedger {
  quantity: string;
  costBasis: string;
  averageCost: string;
}

export function calculateLedger(transactions: TransactionLike[]): PositionLedger {
  let quantity = ZERO;
  let costBasis = ZERO;

  for (const transaction of transactions) {
    const units = new Decimal(transaction.quantity);
    const price = new Decimal(transaction.unitPrice);
    const fees = new Decimal(transaction.fees ?? 0);
    if (!units.isPositive() || price.isNegative() || fees.isNegative()) {
      throw new Error('INVALID_TRANSACTION');
    }

    if (transaction.type === 'BUY') {
      quantity = quantity.plus(units);
      costBasis = costBasis.plus(units.mul(price)).plus(fees);
      continue;
    }

    if (units.greaterThan(quantity)) throw new Error('INSUFFICIENT_POSITION');
    const averageCost = quantity.isZero() ? ZERO : costBasis.div(quantity);
    costBasis = costBasis.minus(averageCost.mul(units));
    quantity = quantity.minus(units);
    if (quantity.isZero()) costBasis = ZERO;
  }

  return {
    quantity: quantity.toString(),
    costBasis: costBasis.toFixed(2),
    averageCost: quantity.isZero() ? '0.00' : costBasis.div(quantity).toFixed(6),
  };
}
