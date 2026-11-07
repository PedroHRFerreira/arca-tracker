import { describe, expect, it } from 'vitest';
import { applyControlCommand, ControlStateSchema, createControlState, type ControlState } from '../src';

const now = '2028-02-06T12:00:00Z';
function initial(): ControlState {
  return ControlStateSchema.parse({ ...createControlState(now), cards: [{ id: 'card', name: 'Cartão exemplo' }],
    bills: [{ id: 'bill', cardId: 'card', month: '2028-02', dueDate: '2028-02-04', totalCents: 10000, paymentStatusKnown: false }],
  });
}
function pay(state: ControlState, amountCents: number, patch = {}) {
  return applyControlCommand(state, { id: `command-${state.revision}`, baseRevision: state.revision, createdAt: now, type: 'UPSERT', collection: 'payments',
    entity: { id: 'payment', billId: 'bill', amountCents, paidDate: '2028-02-05', confirmed: true, affectsCash: false, ...patch } });
}

describe('confirmed payment resolves bill review', () => {
  it('marks a covered bill reviewed without adding another payment', () => {
    const next = pay(initial(), 10000);
    expect(next.bills[0]?.paymentStatusKnown).toBe(true);
    expect(next.payments).toHaveLength(1);
  });
  it.each([{ amount: 9000, patch: {} }, { amount: 10000, patch: { confirmed: false } }, { amount: 10000, patch: { paidDate: '2028-03-01' } }])('does not infer settlement from partial, unconfirmed or future payments: %o', ({ amount, patch }) => {
    expect(pay(initial(), amount, patch).bills[0]?.paymentStatusKnown).toBe(false);
  });
  it('reopens review when the confirmed payment is reduced or cancelled', () => {
    const paid = pay(initial(), 10000);
    expect(pay(paid, 5000).bills[0]?.paymentStatusKnown).toBe(false);
    const cancelled = applyControlCommand(paid, { id: 'cancel', baseRevision: paid.revision, createdAt: now, type: 'CANCEL', collection: 'payments', entityId: 'payment' });
    expect(cancelled.bills[0]?.paymentStatusKnown).toBe(false);
  });
  it('uses existing confirmed payments in a reviewed replacement without duplicating them', () => {
    const state = ControlStateSchema.parse({ ...initial(), payments: [{ id: 'old', billId: 'bill', amountCents: 10000, paidDate: '2028-02-05', confirmed: true, affectsCash: false }] });
    const next = applyControlCommand(state, { id: 'replace', baseRevision: 0, createdAt: now, type: 'REPLACE_REVIEWED', state, confirmed: true });
    expect(next.bills[0]?.paymentStatusKnown).toBe(true);
    expect(next.payments).toHaveLength(1);
  });
});
