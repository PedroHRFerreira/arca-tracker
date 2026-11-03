import { ControlDateSchema, ControlStateSchema, type ControlState, type ControlSettings, type ControlIncome, type ControlExpense } from './control';

const day = (date: Date) => date.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${ControlDateSchema.parse(value)}T12:00:00Z`);
const monthOf = (value: string) => value.slice(0, 7);
const active = <T extends { cancelled: boolean }>(rows: T[]) => rows.filter(row => !row.cancelled);
function addCents(...values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total fora do limite de precisão.');
  return total;
}
export function controlMonthDate(month: string, anchorDay: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year!, number!, 0, 12)).getUTCDate();
  return `${month}-${String(Math.min(last, anchorDay)).padStart(2, '0')}`;
}
export function controlAddMonths(month: string, amount: number): string {
  const value = date(`${month}-01`); value.setUTCMonth(value.getUTCMonth() + amount); return monthOf(day(value));
}
/** Only nationally fixed holidays; employer/local and movable holidays remain explicit user dates. */
export function controlNationalHolidays(year: number): string[] {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (year >= 2024) fixed.push('11-20');
  return fixed.map(value => `${year}-${value}`);
}
export function controlSalaryDate(settings: ControlSettings, month: string): string | null {
  if (settings.nextSalaryOverride && monthOf(settings.nextSalaryOverride) === month) return settings.nextSalaryOverride;
  if (settings.salaryMode === 'MANUAL') return null;
  if (settings.salaryMode === 'FIXED_DAY') return controlMonthDate(month, settings.salaryFixedDay);
  const holidays = new Set([...controlNationalHolidays(Number(month.slice(0, 4))), ...settings.holidays]);
  const cursor = date(`${month}-01`);
  let businessDays = 0;
  for (let count = 0; count < 62; count++) {
    const value = day(cursor);
    if (cursor.getUTCDay() !== 0 && !holidays.has(value)) businessDays++;
    if (businessDays === settings.salaryBusinessDay) return value;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}
export function nextControlSalaryDate(settings: ControlSettings, today: string): string | null {
  ControlDateSchema.parse(today);
  if (settings.nextSalaryOverride && settings.nextSalaryOverride >= today) return settings.nextSalaryOverride;
  for (let offset = 0; offset < 3; offset++) {
    const value = controlSalaryDate(settings, controlAddMonths(monthOf(today), offset));
    if (value && value >= today) return value;
  }
  return null;
}

type Movement = ControlIncome | ControlExpense;
function movementsForMonth<T extends Movement>(rows: T[], month: string): T[] {
  return rows.filter(row => !row.cancelled && row.status !== 'CANCELLED').flatMap(row => {
    if (monthOf(row.dueDate) === month) return [row];
    if (row.recurrence !== 'MONTHLY' || row.dueDate > `${month}-31` || (row.recurrenceEnd && row.recurrenceEnd < `${month}-01`)) return [];
    if (rows.some(other => other.parentId === row.id && monthOf(other.dueDate) === month)) return [];
    return [{ ...row, id: `${row.id}:${month}`, parentId: row.id, recurrence: 'NONE', dueDate: controlMonthDate(month, Number(row.dueDate.slice(8))), status: 'EXPECTED', settledDate: null, settledAt: null }];
  });
}
export type ControlObligation = { id: string; name: string; dueDate: string; amountCents: number; estimated: boolean; kind: 'EXPENSE' | 'BILL' | 'FORECAST' | 'PURCHASE' };

export function controlBillPaidCents(state: ControlState, billId: string, throughDate?: string): number {
  return addCents(...active(state.payments).filter(row => row.billId === billId && row.confirmed && (!throughDate || row.paidDate <= throughDate)).map(row => row.amountCents));
}
export function controlMonthObligations(state: ControlState, month: string, today: string): ControlObligation[] {
  const bills = active(state.bills).filter(row => row.month === month);
  const forecasts = active(state.forecasts).filter(row => row.month === month);
  const result: ControlObligation[] = [];
  for (const row of movementsForMonth(state.expenses, month)) {
    if (row.status === 'SETTLED' || row.kind === 'TRANSFER') continue;
    if (row.paymentMethod === 'CARD' && (bills.some(bill => bill.id === row.billId) || forecasts.some(forecast => forecast.includesRecurring))) continue;
    result.push({ id: row.id, name: row.name, dueDate: row.dueDate, amountCents: row.amountCents, estimated: row.verification !== 'CONFIRMED', kind: 'EXPENSE' });
  }
  for (const bill of bills) {
    const amountCents = Math.max(0, bill.totalCents - controlBillPaidCents(state, bill.id, today));
    if (amountCents) result.push({ id: bill.id, name: state.cards.find(row => row.id === bill.cardId)?.name ?? 'Fatura', dueDate: bill.dueDate,
      amountCents, estimated: bill.verification !== 'CONFIRMED' || !bill.paymentStatusKnown, kind: 'BILL' });
  }
  for (const forecast of forecasts) {
    const included = bills.filter(bill => forecast.cardIds.length === 0 || forecast.cardIds.includes(bill.cardId));
    const residual = Math.max(0, forecast.totalCents - addCents(...included.map(row => row.totalCents)));
    if (residual) result.push({ id: forecast.id, name: 'Faturas previstas — composição a conferir', dueDate: `${month}-01`,
      amountCents: residual, estimated: true, kind: 'FORECAST' });
  }
  const covered = (cardId: string) => forecasts.some(row => row.includesRecurring && (row.cardIds.length === 0 || row.cardIds.includes(cardId)));
  for (const purchase of active(state.purchases).filter(row => monthOf(row.dueDate) === month)) {
    if ((purchase.billId && bills.some(row => row.id === purchase.billId)) || covered(purchase.cardId)) continue;
    result.push({ id: purchase.id, name: purchase.name, dueDate: purchase.dueDate, amountCents: purchase.amountCents,
      estimated: purchase.verification !== 'CONFIRMED', kind: 'PURCHASE' });
  }
  return result;
}

export type ControlMonthProjection = {
  month: string; incomeCents: number; expenseCents: number; billsCents: number; remainingCents: number;
  afterBufferCents: number; confirmedIncomeCents: number; receivedCents: number; pendingReview: boolean;
};
export function projectControlMonths(input: ControlState, startMonth: string, count = 6): ControlMonthProjection[] {
  const state = ControlStateSchema.parse(input);
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('Quantidade de meses inválida.');
  return Array.from({ length: count }, (_, index) => {
    const month = controlAddMonths(startMonth, index);
    const incomes = movementsForMonth(state.incomes, month).filter(row => row.kind !== 'TRANSFER');
    const hasSalary = incomes.some(row => row.kind === 'SALARY');
    const incomeCents = addCents(...incomes.map(row => row.amountCents), hasSalary ? 0 : state.settings.salaryAmountCents);
    const expenses = movementsForMonth(state.expenses, month).filter(row => row.kind === 'EXPENSE' &&
      (row.paymentMethod === 'CASH' || (!state.bills.some(bill => !bill.cancelled && bill.id === row.billId) &&
        !state.forecasts.some(forecast => !forecast.cancelled && forecast.month === month && forecast.includesRecurring))));
    const expenseCents = addCents(...expenses.map(row => row.amountCents));
    const bills = active(state.bills).filter(row => row.month === month);
    const forecasts = active(state.forecasts).filter(row => row.month === month);
    let billsCents = addCents(...bills.map(row => row.totalCents));
    for (const forecast of forecasts) {
      const included = bills.filter(row => forecast.cardIds.length === 0 || forecast.cardIds.includes(row.cardId));
      billsCents = addCents(billsCents, Math.max(0, forecast.totalCents - addCents(...included.map(row => row.totalCents))));
    }
    const unbilled = active(state.purchases).filter(row => monthOf(row.dueDate) === month &&
      !bills.some(bill => row.billId === bill.id) && !forecasts.some(f => f.cardIds.length === 0 || f.cardIds.includes(row.cardId)));
    billsCents = addCents(billsCents, ...unbilled.map(row => row.amountCents));
    const remainingCents = addCents(incomeCents, -expenseCents, -billsCents);
    return { month, incomeCents, expenseCents, billsCents, remainingCents, afterBufferCents: remainingCents - state.settings.bufferCents,
      confirmedIncomeCents: addCents(...incomes.filter(row => row.verification === 'CONFIRMED').map(row => row.amountCents)),
      receivedCents: addCents(...active(state.incomes).filter(row => row.kind !== 'TRANSFER' && row.status === 'SETTLED' && row.settledDate && monthOf(row.settledDate) === month).map(row => row.amountCents)),
      pendingReview: forecasts.some(row => !row.compositionReviewed) || !state.settings.obligationsReviewed ||
        (forecasts.some(row => row.includesRecurring) && addCents(...movementsForMonth(state.expenses, month).filter(row => row.paymentMethod === 'CARD' && row.kind === 'EXPENSE').map(row => row.amountCents)) > billsCents),
    };
  });
}

export type ControlSummary = {
  bankBalanceCents: number; investedCents: number; reserveCents: number; reserveTargetCents: number;
  reserveRemainingCents: number; usedLimitCents: number; unpaidBillsCents: number;
  availableLimitCents: number | null;
  estimatedBillCommitmentsCents: number; essentialExpensesCents: number;
  nextSalaryDate: string | null; nextObligation: ControlObligation | null;
  spendUntilSalaryCents: number | null; investmentCapacityCents: number | null;
  desiredContributionCents: number; activeContributionCents: number;
  gaps: string[]; obligations: ControlObligation[]; monthly: ControlMonthProjection;
};
export function calculateControlSummary(input: ControlState, today: string): ControlSummary {
  const state = ControlStateSchema.parse(input); ControlDateSchema.parse(today);
  const gaps = new Set<string>();
  if (!state.settings.reviewed) gaps.add('Revise seu cadastro financeiro inicial.');
  if (!state.settings.cashConfirmed) gaps.add('Confirme seus saldos bancários atuais.');
  if (!state.settings.obligationsReviewed) gaps.add('Revise as despesas e os compromissos do período.');
  if (!state.portfolio) gaps.add('Atualize o resumo da carteira, mesmo que ainda não tenha investimentos.');
  else if (state.portfolio.updatedAt.slice(0, 10) > today || date(today).getTime() - new Date(state.portfolio.updatedAt).getTime() > 7 * 86400000)
    gaps.add('Atualize o resumo da carteira para conferir a reserva.');
  const observations = new Map<string, typeof state.balanceObservations[number]>();
  for (const row of active(state.balanceObservations)) {
    if (row.observedAt.slice(0, 10) > today) continue;
    if (!observations.has(row.accountId) || row.observedAt > observations.get(row.accountId)!.observedAt) observations.set(row.accountId, row);
  }
  const accounts = active(state.accounts);
  if (!accounts.length) gaps.add('Cadastre ao menos uma conta com saldo confirmado.');
  let bankBalanceCents = 0;
  for (const account of accounts) {
    const observation = observations.get(account.id);
    if (!observation) { gaps.add(`Confirme o saldo de ${account.name}.`); continue; }
    if (!observation.confirmed) gaps.add(`O saldo de ${account.name} precisa de confirmação.`);
    if (date(today).getTime() - Date.parse(observation.observedAt) > 2 * 86400000)
      gaps.add(`Atualize o saldo de ${account.name} para conferir a capacidade atual.`);
    bankBalanceCents = addCents(bankBalanceCents, observation.balanceCents);
  }
  const includeAfterAnchor = (accountId: string | null, settledDate: string, settledAt: string | null, affectsCash: boolean) => {
    if (!affectsCash || settledDate > today) return false;
    const anchor = accountId ? observations.get(accountId) : undefined;
    if (!anchor) { gaps.add('Vincule os recebimentos e pagamentos a uma conta com saldo confirmado.'); return false; }
    if (settledAt) return settledAt > anchor.observedAt;
    const anchorDate = anchor.observedAt.slice(0, 10);
    if (settledDate === anchorDate) gaps.add('Confira lançamentos e saldo registrados no mesmo dia.');
    return settledDate > anchorDate;
  };
  for (const row of active(state.incomes)) {
    if (row.status !== 'SETTLED' || row.kind === 'TRANSFER') continue;
    if (!row.settledDate) { gaps.add('Informe a data de recebimento.'); continue; }
    if (row.verification !== 'CONFIRMED') gaps.add('Confirme os recebimentos registrados como realizados.');
    if (includeAfterAnchor(row.accountId, row.settledDate, row.settledAt, row.affectsCash)) bankBalanceCents = addCents(bankBalanceCents, row.amountCents);
  }
  for (const row of active(state.expenses)) {
    if (row.status !== 'SETTLED' || row.paymentMethod === 'CARD' || row.kind === 'TRANSFER') continue;
    if (!row.settledDate) { gaps.add('Informe a data do pagamento.'); continue; }
    if (row.verification !== 'CONFIRMED') gaps.add('Confirme os pagamentos registrados como realizados.');
    if (includeAfterAnchor(row.accountId, row.settledDate, row.settledAt, row.affectsCash)) bankBalanceCents = addCents(bankBalanceCents, -row.amountCents);
  }
  for (const row of active(state.payments)) if (row.confirmed && includeAfterAnchor(row.accountId, row.paidDate, row.paidAt, row.affectsCash)) bankBalanceCents = addCents(bankBalanceCents, -row.amountCents);
  let nextSalaryDate = nextControlSalaryDate(state.settings, today);
  if (nextSalaryDate === today && active(state.incomes).some(row => row.kind === 'SALARY' && row.status === 'SETTLED' && row.settledDate && row.settledDate <= today && monthOf(row.dueDate) === monthOf(today)))
    nextSalaryDate = controlSalaryDate(state.settings, controlAddMonths(monthOf(today), 1));
  if (!nextSalaryDate) gaps.add('Informe a próxima data prevista de salário.');
  const currentMonth = monthOf(today);
  const obligations = [controlMonthObligations(state, currentMonth, today),
    ...(nextSalaryDate && monthOf(nextSalaryDate) !== currentMonth ? [controlMonthObligations(state, monthOf(nextSalaryDate), today)] : [])].flat();
  // Include overdue commitments from earlier periods: an unpaid bill does not vanish at month-end.
  for (const month of new Set([...state.bills.filter(row => !row.cancelled && row.month < currentMonth).map(row => row.month),
    ...state.forecasts.filter(row => !row.cancelled && row.month < currentMonth).map(row => row.month),
    ...state.expenses.filter(row => !row.cancelled && row.status === 'EXPECTED' && monthOf(row.dueDate) < currentMonth).map(row => monthOf(row.dueDate))]))
    obligations.push(...controlMonthObligations(state, month, today));
  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const pendingForecast = active(state.forecasts).some(row => row.month >= currentMonth && !row.compositionReviewed);
  if (pendingForecast) gaps.add('Confira a composição das faturas previstas.');
  for (const forecastMonth of new Set(active(state.forecasts).filter(row => row.month >= currentMonth && row.includesRecurring).map(row => row.month))) {
    const projection = projectControlMonths(state, forecastMonth, 1)[0]!;
    const recurring = addCents(...movementsForMonth(state.expenses, forecastMonth).filter(row => row.paymentMethod === 'CARD' && row.kind === 'EXPENSE').map(row => row.amountCents));
    if (recurring > projection.billsCents) gaps.add(`As faturas de ${forecastMonth} são menores que as despesas de cartão cadastradas. Confira quais gastos continuam ativos.`);
  }
  if (active(state.bills).some(row => !row.paymentStatusKnown && controlBillPaidCents(state, row.id, today) < row.totalCents))
    gaps.add('Confira quais faturas importadas já foram pagas. O histórico não comprova saldo devedor.');
  if (active(state.expenses).some(row => row.status !== 'CANCELLED' && row.paymentMethod === 'CARD' &&
    !active(state.bills).some(bill => bill.id === row.billId) &&
    !active(state.forecasts).some(forecast => forecast.month === monthOf(row.dueDate) && forecast.includesRecurring)))
    gaps.add('Vincule as despesas de cartão a uma fatura ou previsão revisada.');
  if (active(state.bills).some(bill => addCents(...active(state.purchases).filter(row => row.billId === bill.id).map(row => row.amountCents)) > bill.totalCents))
    gaps.add('As compras vinculadas excedem o valor de uma fatura. Confira sua composição.');
  if (obligations.some(row => row.estimated && row.kind !== 'FORECAST')) gaps.add('Confirme os valores dos compromissos previstos.');
  const beforeSalary = addCents(...obligations.filter(row => !nextSalaryDate || row.dueDate <= nextSalaryDate).map(row => row.amountCents));
  const throughMonth = addCents(...obligations.filter(row => monthOf(row.dueDate) <= currentMonth).map(row => row.amountCents));
  const spend = Math.max(0, bankBalanceCents - beforeSalary - state.settings.bufferCents);
  // No anticipated salary/13th finances a contribution made today.
  const capacity = Math.max(0, Math.min(spend, bankBalanceCents - throughMonth - state.settings.bufferCents));
  const reserveCents = state.portfolio?.reserveCents ?? 0;
  const essentialExpensesCents = effectiveControlEssentialCents(state, currentMonth);
  const reserveTargetCents = essentialExpensesCents * state.settings.reserveMonths;
  const billMonths = new Set([...active(state.bills).map(row => row.month), ...active(state.forecasts).map(row => row.month), ...active(state.purchases).map(row => monthOf(row.dueDate))]);
  const estimatedBillCommitmentsCents = addCents(...[...billMonths].flatMap(month => controlMonthObligations(state, month, today)
    .filter(row => row.kind !== 'EXPENSE').map(row => row.amountCents)));
  return { bankBalanceCents, investedCents: state.portfolio?.investedCents ?? 0, reserveCents, reserveTargetCents,
    reserveRemainingCents: Math.max(0, reserveTargetCents - reserveCents),
    usedLimitCents: addCents(...active(state.cards).map(row => row.usedLimitCents ?? 0)),
    availableLimitCents: active(state.cards).some(row => row.limitCents === null || row.usedLimitCents === null) ? null :
      addCents(...active(state.cards).map(row => Math.max(0, row.limitCents! - row.usedLimitCents!))),
    unpaidBillsCents: addCents(...active(state.bills).map(row => Math.max(0, row.totalCents - controlBillPaidCents(state, row.id, today)))),
    estimatedBillCommitmentsCents, essentialExpensesCents,
    nextSalaryDate, nextObligation: obligations[0] ?? null,
    spendUntilSalaryCents: gaps.size ? null : spend, investmentCapacityCents: gaps.size ? null : capacity,
    desiredContributionCents: state.settings.desiredContributionCents, activeContributionCents: state.settings.activeContributionCents,
    gaps: [...gaps], obligations, monthly: projectControlMonths(state, currentMonth, 1)[0]!,
  };
}

/** Itemized essential costs replace the manual baseline; card bills are never added to this baseline. */
export function effectiveControlEssentialCents(state: ControlState, month: string): number {
  const essentials = movementsForMonth(state.expenses, month).filter(row => row.kind === 'EXPENSE' &&
    (row.essential || state.categories.some(category => !category.cancelled && category.id === row.categoryId && category.essential)));
  return essentials.length ? addCents(...essentials.map(row => row.amountCents)) : state.settings.essentialExpensesCents;
}

/** Materialize one occurrence before confirming receipt/payment; the parent remains a forecast template. */
export function controlMovementsForMonth(state: ControlState, month: string) {
  controlMonthDate(month, 1);
  return { incomes: movementsForMonth(state.incomes, month), expenses: movementsForMonth(state.expenses, month) };
}
