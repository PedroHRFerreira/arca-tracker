import { describe, expect, it } from 'vitest';
import { applyControlCommand, calculateControlSummary, controlMovementsForMonth, ControlStateSchema, createControlState } from '@arca/domain';
import { prepareExpensePayment } from '../src/financePayments';

const now = '2028-02-06T15:00:00Z';
function initial(observedAt = now) {
  return ControlStateSchema.parse({ ...createControlState(now), settings: { reviewed: true, cashConfirmed: true, obligationsReviewed: true },
    accounts: [{ id: 'account', name: 'Conta de teste' }],
    balanceObservations: [{ id: 'anchor', accountId: 'account', balanceCents: 100000, observedAt, confirmed: true }],
    expenses: [{ id: 'expense', name: 'Conta mensal de teste', amountCents: 4000, dueDate: '2028-02-05', paymentMethod: 'CASH', recurrence: 'MONTHLY', verification: 'CONFIRMED' }],
    portfolio: { updatedAt: now, investedCents: 0, reserveCents: 0 },
  });
}
const input = { amount: '40,00', paidDate: '2028-02-05', accountId: 'account' };
describe('short monthly expense payment', () => {
  it('updates one expense without deducting a payment already included in the dated balance', () => {
    const state = initial();
    const paid = prepareExpensePayment(state, state.expenses[0]!, input, '2028-02-06');
    const next = applyControlCommand(state, { id: 'paid', baseRevision: 0, createdAt: now, type: 'UPSERT', collection: 'expenses', entity: paid });
    expect(next.expenses).toHaveLength(1);
    expect(next.expenses[0]).toMatchObject({ status: 'SETTLED', settledDate: '2028-02-05', settledAt: null, affectsCash: false });
    expect(calculateControlSummary(next, '2028-02-06').bankBalanceCents).toBe(100000);
    expect(controlMovementsForMonth(next, '2028-03').expenses[0]?.status).toBe('EXPECTED');
    expect(state.expenses[0]?.status).toBe('EXPECTED');
    expect(() => prepareExpensePayment(next, next.expenses[0]!, input, '2028-02-06')).toThrow('já foi pago');
  });
  it('saves a generated bank-linked recurrence as its own occurrence without reusing the bank identifier', () => {
    const state = initial();
    Object.assign(state.expenses[0]!, { source: 'BANK', externalId: 'bank-payment', status: 'SETTLED', settledDate: '2028-02-05' });
    const march = controlMovementsForMonth(state, '2028-03').expenses[0]!;
    const paid = prepareExpensePayment(state, march, { ...input, paidDate: '2028-03-05' }, '2028-03-06');
    const next = applyControlCommand(state, { id: 'march-paid', baseRevision: 0, createdAt: '2028-03-06T15:00:00Z', type: 'UPSERT', collection: 'expenses', entity: paid });
    expect(next.expenses).toHaveLength(2);
    expect(paid).toMatchObject({ parentId: 'expense', source: 'MANUAL', externalId: null });
    expect(controlMovementsForMonth(next, '2028-03').expenses).toHaveLength(1);
    expect(controlMovementsForMonth(next, '2028-04').expenses[0]?.status).toBe('EXPECTED');
  });
  it('requires review of a payment on the same day as the bank balance', () => {
    const state = initial();
    expect(() => prepareExpensePayment(state, state.expenses[0]!, { ...input, paidDate: '2028-02-06' }, '2028-02-06')).toThrow('saldo exibido');
    const paid = prepareExpensePayment(state, state.expenses[0]!, { ...input, paidDate: '2028-02-06', includedInBalance: true }, '2028-02-06');
    expect(paid.affectsCash).toBe(false);
  });
  it('does not assume a payment time or a safe surplus when a same-day payment is not reflected yet', () => {
    const state = initial();
    state.expenses[0] = prepareExpensePayment(state, state.expenses[0]!, { ...input, paidDate: '2028-02-06', includedInBalance: false }, '2028-02-06');
    expect(state.expenses[0]?.settledAt).toBeNull();
    expect(calculateControlSummary(state, '2028-02-06').gaps).toContain('Confira lançamentos e saldo registrados no mesmo dia.');
  });
  it('uses the local calendar when a bank balance was observed after midnight UTC', () => {
    const state = initial('2028-02-07T01:00:00Z');
    state.expenses[0] = prepareExpensePayment(state, state.expenses[0]!, { ...input, paidDate: '2028-02-06', includedInBalance: true }, '2028-02-06');
    expect(calculateControlSummary(state, '2028-02-06').bankBalanceCents).toBe(100000);
    expect(calculateControlSummary(state, '2028-02-06').gaps).not.toContain('Confirme o saldo de Conta de teste.');
  });
  it('rejects a future date, zero payment or missing account', () => {
    const state = initial();
    for (const patch of [{ paidDate: '2028-02-07' }, { amount: '0' }, { accountId: 'missing' }])
      expect(() => prepareExpensePayment(state, state.expenses[0]!, { ...input, ...patch }, '2028-02-06')).toThrow();
  });
  it('keeps card commitments in their invoice rather than settling a second expense', () => {
    const state = initial(); state.expenses[0]!.paymentMethod = 'CARD';
    expect(() => prepareExpensePayment(state, state.expenses[0]!, input, '2028-02-06')).toThrow('fatura');
  });
});
