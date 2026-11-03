import { calculateControlSummary, controlMonthObligations, controlMovementsForMonth } from './controlCalculations';
import type { ControlState } from './control';

export type ControlAlert = { key: string; title: string; body: string };
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function getControlAlerts(state: ControlState, today: string): ControlAlert[] {
  const alerts: ControlAlert[] = [];
  const summary = calculateControlSummary(state, today);
  const month = today.slice(0, 7);
  if (state.settings.alerts.bills) {
    const billMonths = new Set([month, ...state.bills.filter(row => !row.cancelled && row.dueDate >= today).map(row => row.month)]);
    for (const billMonth of billMonths) for (const obligation of controlMonthObligations(state, billMonth, today)) {
      if (obligation.kind !== 'BILL' || obligation.estimated) continue;
      const distance = Math.round((Date.parse(`${obligation.dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
      if ([7, 3, 1, 0].includes(distance)) alerts.push({ key: `bill:${obligation.id}:${obligation.dueDate}:${distance}`, title: distance === 0 ? 'Fatura vence hoje' : `Fatura vence em ${distance} dia${distance === 1 ? '' : 's'}`,
        body: `${obligation.name}: faltam ${money(obligation.amountCents)}. Confira antes de pagar.` });
    }
  }
  if (state.settings.alerts.budget) {
    if (summary.monthly.afterBufferCents < 0) alerts.push({ key: `budget:${month}`, title: 'Orçamento precisa de revisão', body: `A previsão do mês fica negativa em ${money(-summary.monthly.afterBufferCents)} após a margem. Confira recebimentos e vencimentos.` });
    const expenses = controlMovementsForMonth(state, month).expenses.filter(row => !row.cancelled && row.kind === 'EXPENSE');
    for (const category of state.categories.filter(row => !row.cancelled && row.budgetCents !== null && row.budgetCents > 0)) {
      const spent = expenses.filter(row => row.categoryId === category.id).reduce((sum, row) => sum + row.amountCents, 0) +
        state.purchases.filter(row => !row.cancelled && row.categoryId === category.id && row.dueDate.startsWith(month)).reduce((sum, row) => sum + row.amountCents, 0);
      if (spent >= category.budgetCents! * 0.8) alerts.push({ key: `category:${category.id}:${month}:${category.budgetCents}`, title: 'Acompanhe sua categoria', body: `${category.name} chegou a ${money(spent)} de ${money(category.budgetCents!)} planejados.` });
    }
  }
  if (state.settings.alerts.reserve && summary.reserveTargetCents > 0) for (const threshold of [25, 50, 75, 100]) {
    if (summary.reserveCents * 100 >= summary.reserveTargetCents * threshold) alerts.push({ key: `reserve:${summary.reserveTargetCents}:${threshold}`, title: `Reserva em ${threshold}% da meta`, body: `${money(summary.reserveCents)} registrados para uma meta de ${money(summary.reserveTargetCents)}.` });
  }
  if (state.settings.alerts.contribution && summary.activeContributionCents > 0 && summary.investmentCapacityCents !== null && summary.investmentCapacityCents >= summary.activeContributionCents)
    alerts.push({ key: `capacity:${month}`, title: 'Seu aporte cabe no orçamento revisado', body: `Há capacidade para ${money(summary.activeContributionCents)} hoje. Revise os dados antes de aportar; nenhum investimento foi realizado automaticamente.` });
  return alerts;
}
