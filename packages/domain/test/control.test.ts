import { describe, expect, it } from 'vitest';
import {
  applyControlCommand, calculateControlSummary, ControlCommandSchema, ControlConflictError,
  ControlStateSchema, ControlSettingsSchema, createControlState, controlSalaryDate,
  nextControlSalaryDate, projectControlMonths, controlMovementsForMonth, effectiveControlEssentialCents,
  type ControlState,
} from '../src';

const now = '2028-02-01T12:00:00Z';
function state(patch: Record<string, unknown> = {}): ControlState {
  const initial = createControlState(now);
  return ControlStateSchema.parse({ ...initial,
    settings: { ...initial.settings, reviewed: true, cashConfirmed: true, obligationsReviewed: true },
    accounts: [{ id: 'bank', name: 'Conta teste' }],
    balanceObservations: [{ id: 'anchor', accountId: 'bank', balanceCents: 300000, observedAt: now, confirmed: true }],
    portfolio: { updatedAt: now, investedCents: 10000, reserveCents: 10000 },
    ...patch,
  });
}

describe('control commands and strict contracts', () => {
  it('creates a private empty draft without treating forecasts as actual holdings', () => {
    const draft = createControlState(now);
    expect(draft.settings).toMatchObject({ salaryMode: 'BUSINESS_DAY', salaryBusinessDay: 5,
      bufferCents: 20000, desiredContributionCents: 25000, activeContributionCents: 0, reserveMonths: 3 });
    expect(calculateControlSummary(draft, '2028-02-01').investmentCapacityCents).toBeNull();
    expect(draft.portfolio).toBeNull();
    expect(draft.incomes).toEqual([]);
  });
  it('applies a mutation once and rejects stale revisions', () => {
    const initial = state();
    const command = ControlCommandSchema.parse({ id: 'c1', baseRevision: 0, createdAt: now,
      type: 'UPSERT', collection: 'incomes', entity: { id: 'income1', name: 'Extra', amountCents: 1000, dueDate: '2028-02-02' } });
    const next = applyControlCommand(initial, command);
    expect(next.revision).toBe(1);
    expect(next.incomes).toHaveLength(1);
    expect(applyControlCommand(next, command)).toEqual(next);
    expect(() => applyControlCommand(next, { ...command, id: 'c2' })).toThrow(ControlConflictError);
    expect(initial.incomes).toHaveLength(0);
  });
  it('cancels rather than silently deletes and validates monetary precision', () => {
    const initial = state({ expenses: [{ id: 'e1', name: 'Serviço', dueDate: '2028-02-04', amountCents: 100 }] });
    const next = applyControlCommand(initial, { id: 'cancel', baseRevision: 0, createdAt: now,
      type: 'CANCEL', collection: 'expenses', entityId: 'e1' });
    expect(next.expenses[0]?.cancelled).toBe(true);
    expect(projectControlMonths(next, '2028-02', 1)[0]?.expenseCents).toBe(0);
    expect(() => state({ expenses: [{ id: 'e1', name: 'Inválido', dueDate: '2028-02-31', amountCents: 1.5 }] })).toThrow();
    expect(() => ControlStateSchema.parse({ ...state(), secret: 'not-allowed' })).toThrow();
  });
  it('rejects duplicate provider IDs, orphan references and overlapping forecasts', () => {
    expect(() => state({ accounts: [{ id: 'a', name: 'A', source: 'BANK', externalId: 'same' }, { id: 'b', name: 'B', source: 'BANK', externalId: 'same' }] })).toThrow();
    expect(() => state({ payments: [{ id: 'p', billId: 'missing', amountCents: 1, paidDate: '2028-02-01' }] })).toThrow();
    expect(() => state({ forecasts: [{ id: 'f1', month: '2028-02', totalCents: 100 }, { id: 'f2', month: '2028-02', totalCents: 200 }] })).toThrow();
  });
});

describe('salary calendar', () => {
  it('counts Saturdays, excludes Sundays and national and local holidays', () => {
    const settings = ControlSettingsSchema.parse({});
    expect(controlSalaryDate(settings, '2027-01')).toBe('2027-01-07');
    expect(controlSalaryDate({ ...settings, salaryBusinessDay: 1 }, '2027-01')).toBe('2027-01-02');
    expect(controlSalaryDate({ ...settings, holidays: ['2027-01-04'] }, '2027-01')).toBe('2027-01-08');
    expect(controlSalaryDate({ ...settings, salaryBusinessDay: 1 }, '2026-11')).toBe('2026-11-03');
  });
  it('clamps fixed days, moves across years and honors explicit overrides', () => {
    const settings = ControlSettingsSchema.parse({ salaryMode: 'FIXED_DAY', salaryFixedDay: 31 });
    expect(controlSalaryDate(settings, '2028-02')).toBe('2028-02-29');
    expect(controlSalaryDate(settings, '2027-02')).toBe('2027-02-28');
    expect(nextControlSalaryDate(settings, '2027-12-31')).toBe('2027-12-31');
    expect(nextControlSalaryDate(settings, '2028-01-01')).toBe('2028-01-31');
    expect(nextControlSalaryDate({ ...settings, nextSalaryOverride: '2028-01-03' }, '2028-01-01')).toBe('2028-01-03');
    expect(nextControlSalaryDate({ ...settings, salaryMode: 'MANUAL' }, '2028-01-01')).toBeNull();
  });
});

describe('cash, commitments and reserves', () => {
  it('keeps credit limits and expected salary out of cash and blocks pending forecasts', () => {
    const initial = state({ settings: { ...state().settings, salaryAmountCents: 600000 },
      cards: [{ id: 'card', name: 'Cartão', limitCents: 1000000, usedLimitCents: 900000 }],
      forecasts: [{ id: 'f', month: '2028-02', totalCents: 50000 }],
    });
    const result = calculateControlSummary(initial, '2028-02-01');
    expect(result.bankBalanceCents).toBe(300000);
    expect(result.availableLimitCents).toBe(100000);
    expect(result.monthly.incomeCents).toBe(600000);
    expect(result.investmentCapacityCents).toBeNull();
    expect(result.estimatedBillCommitmentsCents).toBe(50000);
  });
  it('settles a card liability with exactly one cash outflow, including partial payments', () => {
    const initial = state({ cards: [{ id: 'c', name: 'Cartão' }],
      bills: [{ id: 'b', cardId: 'c', month: '2028-02', totalCents: 50000, dueDate: '2028-02-04', verification: 'CONFIRMED' }],
      purchases: [{ id: 'purchase', cardId: 'c', billId: 'b', name: 'Compra', purchaseDate: '2028-01-20', dueDate: '2028-02-04', amountCents: 50000 }],
      expenses: [{ id: 'card-expense', name: 'Compra', amountCents: 50000, dueDate: '2028-02-04', paymentMethod: 'CARD', billId: 'b' }],
      payments: [{ id: 'p', billId: 'b', accountId: 'bank', amountCents: 20000, paidDate: '2028-02-02', confirmed: true }],
    });
    const result = calculateControlSummary(initial, '2028-02-03');
    expect(result.bankBalanceCents).toBe(280000);
    expect(result.unpaidBillsCents).toBe(30000);
    expect(result.monthly.billsCents).toBe(50000);
    expect(result.monthly.expenseCents).toBe(0);
    expect(result.investmentCapacityCents).toBe(230000);
    expect(result.usedLimitCents).toBe(0);
    expect(result.availableLimitCents).toBeNull();
  });
  it('replaces aggregate forecasts with identified bills without duplicating either', () => {
    const initial = state({ cards: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
      forecasts: [{ id: 'f', month: '2028-02', totalCents: 100000, compositionReviewed: true }],
      bills: [{ id: 'b', cardId: 'c1', month: '2028-02', totalCents: 60000, dueDate: '2028-02-04', verification: 'CONFIRMED' }],
      payments: [{ id: 'p', billId: 'b', accountId: 'bank', amountCents: 60000, paidDate: '2028-02-02', confirmed: true }],
    });
    const result = calculateControlSummary(initial, '2028-02-03');
    expect(result.monthly.billsCents).toBe(100000);
    expect(result.estimatedBillCommitmentsCents).toBe(40000);
    expect(result.bankBalanceCents).toBe(240000);
    expect(result.investmentCapacityCents).toBe(180000);
  });
  it('does not replay imported history before the balance observation or invent income from transfers', () => {
    const initial = state({ incomes: [
      { id: 'old', name: 'Antigo', amountCents: 200000, dueDate: '2028-01-30', settledDate: '2028-01-30', status: 'SETTLED', accountId: 'bank' },
      { id: 'transfer', name: 'Transferência própria', kind: 'TRANSFER', amountCents: 50000, dueDate: '2028-02-02', settledDate: '2028-02-02', status: 'SETTLED', accountId: 'bank' },
      { id: 'received', name: 'Extra', amountCents: 10000, dueDate: '2028-02-02', settledDate: '2028-02-02', status: 'SETTLED', accountId: 'bank' },
      { id: 'future', name: '13º', kind: 'THIRTEENTH', amountCents: 150000, dueDate: '2028-02-20' },
    ] });
    expect(calculateControlSummary(initial, '2028-02-03').bankBalanceCents).toBe(310000);
    expect(projectControlMonths(initial, '2028-02', 1)[0]?.receivedCents).toBe(10000);
  });
  it('requires account matching and same-day reconciliation rather than guessing cash', () => {
    const noAccount = state({ incomes: [{ id: 'i', name: 'Extra', amountCents: 10000, dueDate: '2028-02-02', settledDate: '2028-02-02', status: 'SETTLED' }] });
    expect(calculateControlSummary(noAccount, '2028-02-03').investmentCapacityCents).toBeNull();
    const sameDay = state({ incomes: [{ id: 'i', name: 'Extra', amountCents: 10000, accountId: 'bank', dueDate: '2028-02-01', settledDate: '2028-02-01', status: 'SETTLED' }] });
    expect(calculateControlSummary(sameDay, '2028-02-01').investmentCapacityCents).toBeNull();
    const stamped = state({ incomes: [{ ...sameDay.incomes[0], settledAt: '2028-02-01T13:00:00Z' }] });
    expect(calculateControlSummary(stamped, '2028-02-01').bankBalanceCents).toBe(310000);
  });
  it('does not spend future income and protects all current month commitments and buffer', () => {
    const initial = state({ expenses: [{ id: 'rent', name: 'Moradia', amountCents: 275000, dueDate: '2028-02-20', verification: 'CONFIRMED' }],
      incomes: [{ id: 'salary', name: 'Salário', kind: 'SALARY', amountCents: 500000, dueDate: '2028-02-05', verification: 'CONFIRMED' }],
    });
    const result = calculateControlSummary(initial, '2028-02-01');
    expect(result.spendUntilSalaryCents).toBe(280000);
    expect(result.investmentCapacityCents).toBe(5000);
    expect(result.activeContributionCents).toBe(0);
  });
  it('recalculates reserve from essential cash and card costs, without adding bills', () => {
    const initial = state({ cards: [{ id: 'card', name: 'Cartão' }],
      expenses: [{ id: 'rent', name: 'Moradia', amountCents: 100000, dueDate: '2028-02-10', essential: true, verification: 'CONFIRMED' },
        { id: 'power', name: 'Energia', amountCents: 20000, dueDate: '2028-02-10', essential: true, paymentMethod: 'CARD', billId: 'bill' }],
      bills: [{ id: 'bill', cardId: 'card', month: '2028-02', totalCents: 30000, dueDate: '2028-02-10', verification: 'CONFIRMED' }],
    });
    expect(effectiveControlEssentialCents(initial, '2028-02')).toBe(120000);
    expect(calculateControlSummary(initial, '2028-02-01')).toMatchObject({ reserveTargetCents: 360000, reserveCents: 10000, investedCents: 10000, reserveRemainingCents: 350000 });
  });
  it('blocks disconnected card expenses and keeps overdue obligations across months', () => {
    const initial = state({ expenses: [{ id: 'card', name: 'Cartão', amountCents: 10000, dueDate: '2028-01-20', paymentMethod: 'CARD', verification: 'CONFIRMED' }] });
    const result = calculateControlSummary(initial, '2028-02-01');
    expect(result.obligations.find(row => row.id === 'card')?.amountCents).toBe(10000);
    expect(result.investmentCapacityCents).toBeNull();
  });
});

describe('recurrence materialization', () => {
  it('generates a forecast and replaces one paid occurrence without changing its template', () => {
    const initial = state({ expenses: [{ id: 'monthly', name: 'Assinatura', amountCents: 12000, dueDate: '2028-01-31', settledDate: '2028-01-31', status: 'SETTLED', recurrence: 'MONTHLY', verification: 'CONFIRMED' }] });
    const occurrence = controlMovementsForMonth(initial, '2028-02').expenses[0]!;
    expect(occurrence).toMatchObject({ id: 'monthly:2028-02', parentId: 'monthly', recurrence: 'NONE', dueDate: '2028-02-29', status: 'EXPECTED' });
    const paid = applyControlCommand(initial, ControlCommandSchema.parse({ id: 'materialize', baseRevision: 0, createdAt: now, type: 'UPSERT', collection: 'expenses',
      entity: { ...occurrence, status: 'SETTLED', settledDate: '2028-02-29', accountId: 'bank' } }));
    expect(projectControlMonths(paid, '2028-02', 1)[0]?.expenseCents).toBe(12000);
    expect(controlMovementsForMonth(paid, '2028-02').expenses).toHaveLength(1);
    expect(controlMovementsForMonth(paid, '2028-03').expenses[0]?.dueDate).toBe('2028-03-31');
  });
});
