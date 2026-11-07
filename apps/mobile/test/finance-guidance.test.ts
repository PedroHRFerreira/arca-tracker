import { describe, expect, it } from 'vitest';
import { calculateControlSummary, ControlStateSchema, createControlState, defaultPlanningProfile } from '@arca/domain';
import { financeNextStep, investmentBudget } from '../src/financeGuidance';

const today = '2028-02-01';
const now = `${today}T12:00:00Z`;
function readyState() {
  const draft = createControlState(now);
  return ControlStateSchema.parse({ ...draft,
    settings: { ...draft.settings, reviewed: true, cashConfirmed: true, obligationsReviewed: true, essentialExpensesCents: 10000 },
    accounts: [{ id: 'account', name: 'Conta exemplo' }],
    balanceObservations: [{ id: 'balance', accountId: 'account', balanceCents: 100000, observedAt: now, confirmed: true }],
    portfolio: { updatedAt: now, investedCents: 0, reserveCents: 0 },
  });
}
describe('finance guidance using confirmed financial calculations', () => {
  it('starts with an account and directs an unconfirmed balance to the specific account', () => {
    const draft = createControlState(now);
    expect(financeNextStep(draft, calculateControlSummary(draft, today), today).action.kind).toBe('ACCOUNT');
    const state = readyState(); state.balanceObservations[0]!.confirmed = false;
    const summary = calculateControlSummary(state, today);
    expect(summary.investmentCapacityCents).toBeNull();
    expect(financeNextStep(state, summary, today).action).toEqual({ kind: 'BALANCE', accountId: 'account' });
  });
  it('asks whether an imported bill was paid instead of telling the user to pay it again', () => {
    const state = ControlStateSchema.parse({ ...readyState(), cards: [{ id: 'card', name: 'Cartão exemplo' }], bills: [{ id: 'bill', cardId: 'card', month: '2028-02', totalCents: 20000, dueDate: '2028-02-04', paymentStatusKnown: false }] });
    const step = financeNextStep(state, calculateControlSummary(state, today), today);
    expect(step.title).toBe('Essa fatura já foi paga?');
    expect(step.action).toEqual({ kind: 'BILL', id: 'bill' });
  });
  it('never provides an investment amount when review is pending or the cash is insufficient', () => {
    const state = readyState(); state.settings.obligationsReviewed = false;
    expect(investmentBudget(calculateControlSummary(state, today), defaultPlanningProfile())).toEqual({ stage: 'REVIEW', amountCents: 0 });
    state.settings.obligationsReviewed = true; state.balanceObservations[0]!.balanceCents = 100;
    expect(investmentBudget(calculateControlSummary(state, today), defaultPlanningProfile())).toEqual({ stage: 'WAIT', amountCents: 0 });
  });
  it('opens the specific aggregate forecast whose composition still needs review', () => {
    const state = ControlStateSchema.parse({ ...readyState(), forecasts: [{ id: 'forecast', month: '2028-03', totalCents: 50000 }] });
    expect(financeNextStep(state, calculateControlSummary(state, today), today).action).toEqual({ kind: 'FORECAST', id: 'forecast', month: '2028-03' });
  });
  it('limits an example to confirmed capacity, the desired amount and the remaining reserve', () => {
    const state = readyState(); const summary = calculateControlSummary(state, today);
    const profile = { ...defaultPlanningProfile(), essentialExpenses: '100', reserveMonths: 3, hasExpensiveDebt: false };
    expect(investmentBudget(summary, profile)).toEqual({ stage: 'RESERVE', amountCents: 25000 });
    expect(investmentBudget({ ...summary, investmentCapacityCents: 9999 }, profile).amountCents).toBe(9999);
    expect(investmentBudget({ ...summary, reserveRemainingCents: 50 }, profile).amountCents).toBe(50);
  });
  it('requires a plan and respects an unresolved expensive-debt stage', () => {
    const state = readyState(); const summary = calculateControlSummary(state, today);
    expect(investmentBudget(summary, null).stage).toBe('PROFILE');
    expect(investmentBudget(summary, { ...defaultPlanningProfile(), hasExpensiveDebt: true })).toEqual({ stage: 'DEBT', amountCents: 0 });
    expect(investmentBudget({ ...summary, reserveRemainingCents: 0 }, { ...defaultPlanningProfile(), hasExpensiveDebt: false }).stage).toBe('LONG_TERM');
  });
  it('asks for review when a short-term goal still allocates money to variable income', () => {
    const summary = { ...calculateControlSummary(readyState(), today), reserveRemainingCents: 0 };
    const profile = { ...defaultPlanningProfile(), hasExpensiveDebt: false, horizonYears: 1, strategy: 'ARCA' as const };
    expect(investmentBudget(summary, profile).stage).toBe('HORIZON');
    expect(investmentBudget(summary, { ...profile, strategy: 'SIMPLE' }).stage).toBe('LONG_TERM');
  });
});
