import { evaluatePlan, getPlanTargets, type ControlState, type ControlSummary, type PlanningProfile } from '@arca/domain';

export type FinanceAction = { kind: 'ACCOUNT' | 'BALANCE' | 'BILL' | 'FORECAST' | 'REVIEW' | 'INVEST' | 'BUDGET'; id?: string; accountId?: string; month?: string };
export type FinanceGuidance = { title: string; detail: string; label: string; action: FinanceAction };

/** Turns the existing calculation into one concrete action; it never computes a new balance. */
export function financeNextStep(state: ControlState, summary: ControlSummary, today: string): FinanceGuidance {
  const accounts = state.accounts.filter(row => !row.cancelled);
  if (!accounts.length) return { title: 'Comece pela sua conta', detail: 'Informe a conta e o saldo que aparece no banco. Isso é diferente do limite do cartão.', label: 'Adicionar minha conta', action: { kind: 'ACCOUNT' } };
  const account = accounts.find(row => {
    const latest = state.balanceObservations.filter(item => !item.cancelled && item.accountId === row.id && item.observedAt.slice(0, 10) <= today).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    return !latest?.confirmed || Date.parse(`${today}T00:00:00Z`) - Date.parse(latest.observedAt) > 2 * 86400000;
  });
  if (account) return { title: 'Confira o saldo de hoje', detail: `Atualize o saldo de ${account.name}. Sem essa confirmação, ainda não dá para dizer quanto você pode separar.`, label: `Conferir saldo · ${account.name}`, action: { kind: 'BALANCE', accountId: account.id } };
  const bill = state.bills.filter(row => !row.cancelled && !row.paymentStatusKnown).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (bill) return { title: 'Essa fatura já foi paga?', detail: `A fatura de ${state.cards.find(card => card.id === bill.cardId)?.name ?? 'seu cartão'} vence em ${bill.dueDate.split('-').reverse().join('/')}. Confira a situação antes de tratar o valor como dívida.`, label: 'Conferir situação da fatura', action: { kind: 'BILL', id: bill.id } };
  const forecast = state.forecasts.filter(row => !row.cancelled && !row.compositionReviewed).sort((a, b) => a.month.localeCompare(b.month))[0];
  if (forecast) return { title: 'Confira o que está nas faturas', detail: 'O total previsto dos cartões ainda precisa de revisão. Confira as despesas incluídas para não contá-las duas vezes.', label: `Revisar previsão · ${forecast.month.split('-').reverse().join('/')}`, action: { kind: 'FORECAST', id: forecast.id, month: forecast.month } };
  if (summary.investmentCapacityCents === null) return { title: 'Vamos conferir seu orçamento', detail: 'Revise as informações pendentes para saber o que realmente sobra depois das contas e da margem de segurança.', label: 'Revisar meu orçamento', action: { kind: 'REVIEW' } };
  if (summary.investmentCapacityCents <= 0) return { title: 'Preserve seu dinheiro neste momento', detail: 'O caixa confirmado ainda não comporta um novo aporte. Confira despesas e vencimentos antes de separar dinheiro.', label: 'Ver despesas do mês', action: { kind: 'BUDGET' } };
  return { title: 'Seu orçamento permite um próximo passo', detail: 'Compare opções para sua reserva ou para o longo prazo, com um valor limitado à capacidade de hoje.', label: 'Ver onde posso investir', action: { kind: 'INVEST' } };
}

export function investmentBudget(summary: ControlSummary, profile: PlanningProfile | null) {
  if (summary.investmentCapacityCents === null) return { stage: 'REVIEW' as const, amountCents: 0 };
  if (summary.investmentCapacityCents <= 0) return { stage: 'WAIT' as const, amountCents: 0 };
  if (!profile) return { stage: 'PROFILE' as const, amountCents: 0 };
  if (evaluatePlan(profile, (summary.reserveCents / 100).toFixed(2)).phase === 'DEBT') return { stage: 'DEBT' as const, amountCents: 0 };
  if (summary.reserveRemainingCents === 0 && (profile.horizonYears < 3 || profile.liquidityNeed === 'SHORT_TERM') && Number(getPlanTargets(profile).CASH_FIXED_INCOME) < 100)
    return { stage: 'HORIZON' as const, amountCents: 0 };
  return { stage: summary.reserveRemainingCents > 0 ? 'RESERVE' as const : 'LONG_TERM' as const,
    amountCents: Math.min(summary.investmentCapacityCents, summary.desiredContributionCents > 0 ? summary.desiredContributionCents : summary.investmentCapacityCents,
      summary.reserveRemainingCents > 0 ? summary.reserveRemainingCents : summary.investmentCapacityCents) };
}
