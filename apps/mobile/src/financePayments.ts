import Decimal from 'decimal.js';
import { ControlDateSchema, ControlExpenseSchema, controlObservationDate, parseMoneyInput, type ControlExpense, type ControlState } from '@arca/domain';

export function expensePaymentReference(state: ControlState, accountId: string, paidDate: string) {
  const anchor = state.balanceObservations.filter(row => !row.cancelled && row.confirmed && row.accountId === accountId)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  return { anchor, sameDay: !!anchor && controlObservationDate(anchor.observedAt, state.settings.timezone) === paidDate };
}

/** Updates this occurrence; it never creates a second expense or executes a bank payment. */
export function prepareExpensePayment(state: ControlState, expense: ControlExpense, input: {
  amount: string; paidDate: string; accountId: string; includedInBalance?: boolean;
}, today: string): ControlExpense {
  if (!input.paidDate) throw new Error('Escolha quando você pagou: hoje, ontem ou outra data.');
  const paidDate = ControlDateSchema.parse(input.paidDate);
  if (paidDate > today) throw new Error('O pagamento realizado não pode ter data futura.');
  if (expense.cancelled || expense.status !== 'EXPECTED' || expense.paymentMethod !== 'CASH' || expense.kind !== 'EXPENSE')
    throw new Error('Este gasto já foi pago ou deve ser acompanhado pela fatura do cartão.');
  if (!state.accounts.some(row => row.id === input.accountId && !row.cancelled)) throw new Error('Escolha a conta de onde saiu o dinheiro.');
  const amountCents = new Decimal(parseMoneyInput(input.amount)).mul(100).toDecimalPlaces(0).toNumber();
  if (amountCents <= 0) throw new Error('Informe o valor efetivamente pago.');
  const { anchor, sameDay } = expensePaymentReference(state, input.accountId, paidDate);
  if (sameDay && input.includedInBalance === undefined) throw new Error('Confirme se o saldo exibido já desconta este pagamento.');
  const anchorDate = anchor ? controlObservationDate(anchor.observedAt, state.settings.timezone) : null;
  const affectsCash = sameDay ? input.includedInBalance === false : !anchorDate || paidDate > anchorDate;
  const generated = !state.expenses.some(row => row.id === expense.id);
  return ControlExpenseSchema.parse({ ...expense,
    ...(generated ? { source: 'MANUAL', externalId: null } : {}),
    amountCents, status: 'SETTLED', verification: 'CONFIRMED', accountId: input.accountId,
    settledDate: paidDate, settledAt: null, affectsCash,
  });
}
