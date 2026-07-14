import Decimal from 'decimal.js';
import type { ProjectionPoint } from './types';

export interface ProjectionInput {
  presentValue: string;
  monthlyContribution: string;
  annualRatePercent: string;
  offsetPercentagePoints: string;
  years: number;
}

function monthlyRate(annualPercent: Decimal): Decimal {
  if (annualPercent.lessThanOrEqualTo(-100)) throw new Error('INVALID_ANNUAL_RATE');
  return annualPercent.div(100).plus(1).pow(new Decimal(1).div(12)).minus(1);
}

function futureValue(present: Decimal, contribution: Decimal, rate: Decimal, months: number): Decimal {
  if (rate.isZero()) return present.plus(contribution.mul(months));
  const factor = rate.plus(1).pow(months);
  return present.mul(factor).plus(contribution.mul(factor.minus(1).div(rate)));
}

export function calculateProjection(input: ProjectionInput): ProjectionPoint[] {
  if (!Number.isInteger(input.years) || input.years < 1 || input.years > 80) {
    throw new Error('INVALID_HORIZON');
  }
  const present = new Decimal(input.presentValue);
  const contribution = new Decimal(input.monthlyContribution);
  if (present.isNegative() || contribution.isNegative()) throw new Error('INVALID_AMOUNT');
  const neutralAnnual = new Decimal(input.annualRatePercent);
  const offset = new Decimal(input.offsetPercentagePoints).abs();
  const rates = {
    pessimistic: monthlyRate(neutralAnnual.minus(offset)),
    neutral: monthlyRate(neutralAnnual),
    optimistic: monthlyRate(neutralAnnual.plus(offset)),
  };
  const months = input.years * 12;
  const points: ProjectionPoint[] = [];

  for (let month = 0; month <= months; month += 1) {
    points.push({
      month,
      pessimistic: futureValue(present, contribution, rates.pessimistic, month).toFixed(2),
      neutral: futureValue(present, contribution, rates.neutral, month).toFixed(2),
      optimistic: futureValue(present, contribution, rates.optimistic, month).toFixed(2),
    });
  }
  return points;
}
