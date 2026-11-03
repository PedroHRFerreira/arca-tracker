import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { controlAddMonths, controlBillPaidCents, controlMovementsForMonth, localDateString, projectControlMonths } from '@arca/domain';
import { Button, Card, ScreenHeader } from '@/components/ui';
import { ControlEmpty, ControlRow, ControlSection, ControlTabs, controlDateLabel, controlMoney, controlMonthLabel, controlStyles as s } from '@/components/ControlUI';
import { PressFeedback } from '@/motion/Motion';
import { useControl } from '@/providers/useControl';
import { colors } from '@/theme';

const sections = [{ value: 'overview', label: 'Resumo' }, { value: 'incomes', label: 'Receitas' }, { value: 'expenses', label: 'Despesas' }, { value: 'cards', label: 'Cartões' }, { value: 'installments', label: 'Parcelas' }, { value: 'projection', label: 'Projeção' }, { value: 'reserve', label: 'Reserva' }] as const;
type Section = typeof sections[number]['value'];
const sourceLabel: Record<string, string> = { MANUAL: 'Informado por você', BANK: 'Importado do banco', DISCORD: 'Registrado no Discord', IMPORT: 'Importado de arquivo' };

export default function Finances() {
  const control = useControl();
  const { state, summary, ready, busy, error, conflict, pending, lastSyncAt } = control;
  const today = localDateString();
  const [section, setSection] = useState<Section>('overview');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [connectionError, setConnectionError] = useState('');
  const [conflictChoice, setConflictChoice] = useState<'REMOTE' | 'LOCAL' | null>(null);
  const movements = useMemo(() => controlMovementsForMonth(state, month), [state, month]);
  const monthly = useMemo(() => projectControlMonths(state, month, 1)[0]!, [state, month]);
  const projection = useMemo(() => {
    const [year, number] = month.split('-').map(Number);
    const untilApril = (2027 - year!) * 12 + 4 - number! + 1;
    return projectControlMonths(state, month, Math.min(120, Math.max(6, untilApril)));
  }, [state, month]);
  const edit = (kind: string, id?: string, extra?: Record<string, string>) => router.push({ pathname: '/finance-entry', params: { kind, ...(id ? { id } : {}), month, ...extra } });
  const go = (pathname: '/finance-settings' | '/finance-banks') => router.push(pathname);
  async function synchronize() {
    setConnectionError('');
    try { await control.sync(); } catch (cause) { setConnectionError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar. Seus registros continuam no aparelho.'); }
  }
  const hasUnreviewedBillPayments = state.bills.some(bill => !bill.cancelled && !bill.paymentStatusKnown);
  const currentBills = state.bills.filter(row => !row.cancelled && row.month === month);
  const purchases = state.purchases.filter(row => !row.cancelled && row.dueDate.slice(0, 7) === month).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const forecasts = state.forecasts.filter(row => !row.cancelled && row.month === month);
  const reserveProgress = summary.reserveTargetCents > 0 ? Math.min(100, summary.reserveCents / summary.reserveTargetCents * 100) : 0;
  const allEmpty = !state.accounts.length && !state.incomes.length && !state.expenses.length && !state.cards.length && !state.forecasts.length;
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void synchronize()} tintColor={colors.primary} />}>
      <ScreenHeader title="Finanças" subtitle="Seu dinheiro, com clareza" action={<PressFeedback accessibilityRole="button" accessibilityLabel="Configurações financeiras" onPress={() => go('/finance-settings')} style={styles.iconButton}><Ionicons name="options-outline" size={22} color={colors.primary} /></PressFeedback>} />
      {!ready ? <ControlEmpty title="Abrindo seu orçamento" detail="Estamos buscando seus registros neste aparelho." /> : <>
      <Card style={styles.hero}>
        <View style={styles.heroLabelRow}><Text style={styles.heroLabel}>SALDO NAS CONTAS</Text><Ionicons name="wallet-outline" size={23} color="#BAD7C8" /></View>
        <Text style={styles.heroAmount}>{controlMoney(summary.bankBalanceCents)}</Text>
        <Text style={styles.heroHelp}>Dinheiro nas contas cadastradas. Limite do cartão fica separado.</Text>
        <View style={styles.heroDivider} />
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.heroHelp}>{hasUnreviewedBillPayments ? 'Compromissos a conferir' : 'Compromissos nos cartões'}</Text><Text style={styles.heroMetric}>{controlMoney(summary.estimatedBillCommitmentsCents)}</Text><Text style={styles.heroSmall}>{hasUnreviewedBillPayments ? 'Pode incluir faturas já pagas. Confira a situação.' : 'Inclui previsões ainda não quitadas'}</Text></View>
          <View style={styles.metric}><Text style={styles.heroHelp}>Patrimônio investido</Text><Text style={styles.heroMetric}>{controlMoney(summary.investedCents)}</Text><Text style={styles.heroSmall}>{state.portfolio ? `Resumo de ${controlDateLabel(state.portfolio.updatedAt)}` : 'Atualize sua carteira'}</Text></View>
        </View>
      </Card>
      <View style={styles.shortcuts}>
        {([{ icon: 'add-outline', label: 'Receita', onPress: () => edit('income') }, { icon: 'remove-outline', label: 'Despesa', onPress: () => edit('expense') }, { icon: 'card-outline', label: 'Fatura', onPress: () => edit('bill') }, { icon: 'sync-outline', label: 'Sincronizar', onPress: () => void synchronize() }] as const).map(item => <PressFeedback key={item.label} accessibilityRole="button" accessibilityLabel={item.label} disabled={busy} onPress={item.onPress} style={styles.shortcut}>
          <View style={styles.shortcutIcon}><Ionicons name={item.icon} size={24} color={colors.primary} /></View><Text style={styles.shortcutLabel}>{item.label}</Text>
        </PressFeedback>)}
      </View>
      {!!(error || connectionError) && <View style={s.warning}><Text accessibilityRole="alert" style={s.error}>{connectionError || error}</Text><Text style={s.help}>Os registros locais foram preservados.</Text></View>}
      {conflict && <Card style={{ gap: 12, backgroundColor: '#FFF4E4' }}>
        <Text style={s.heading}>Há duas versões para revisar</Text><Text style={s.help}>A base online recebeu alterações enquanto havia registros neste aparelho. Escolha a versão completa que deseja manter; a escolha substitui a outra versão.</Text>
        <Text style={s.help}>Neste aparelho: {state.incomes.length} receitas, {state.expenses.length} despesas · Online: {conflict.incomes.length} receitas, {conflict.expenses.length} despesas.</Text>
        {conflictChoice ? <><Text style={s.text}>Confirmar a versão {conflictChoice === 'REMOTE' ? 'online e descartar as alterações locais pendentes' : 'deste aparelho e substituir a base online'}?</Text><Button disabled={busy} title="Confirmar versão escolhida" onPress={() => { void control.resolveConflict(conflictChoice).then(() => setConflictChoice(null)).catch(() => undefined); }} /><Button disabled={busy} variant="secondary" title="Voltar à revisão" onPress={() => setConflictChoice(null)} /></> : <><Button variant="secondary" title="Revisar escolha: versão online" onPress={() => setConflictChoice('REMOTE')} /><Button variant="secondary" title="Revisar escolha: versão deste aparelho" onPress={() => setConflictChoice('LOCAL')} /></>}
      </Card>}
      {allEmpty && <Card style={{ gap: 13 }}><Text style={s.heading}>Vamos organizar seu ponto de partida</Text><Text style={s.text}>Cadastre suas contas, confirme seus saldos e revise os compromissos. Uma previsão continua sendo previsão até o dinheiro realmente entrar ou sair.</Text><Button title="Configurar meu controle financeiro" onPress={() => go('/finance-settings')} /><Button title="Adicionar minha primeira conta" variant="secondary" onPress={() => edit('account')} /></Card>}
      <ControlTabs items={sections} value={section} onChange={setSection} />
      <View style={styles.monthBar}>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setMonth(controlAddMonths(month, -1))} style={styles.monthButton}><Ionicons name="chevron-back" size={20} color={colors.primary} /></PressFeedback>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Voltar ao mês atual" onPress={() => setMonth(today.slice(0, 7))} style={{ flex: 1 }}><Text style={styles.month}>{controlMonthLabel(month)}</Text></PressFeedback>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setMonth(controlAddMonths(month, 1))} style={styles.monthButton}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></PressFeedback>
      </View>
      {section === 'overview' && <>
        <Card style={{ gap: 13 }}><View style={styles.heroLabelRow}><Text style={s.heading}>Quanto posso investir agora?</Text><Ionicons name="leaf-outline" size={23} color={colors.primary} /></View>
          <Text style={styles.capacity}>{summary.investmentCapacityCents === null ? 'Vamos conferir seus dados' : controlMoney(summary.investmentCapacityCents)}</Text>
          <Text style={s.text}>{summary.investmentCapacityCents === null ? 'Para sugerir um valor seguro, precisamos dos saldos atuais e dos compromissos conferidos.' : 'Considera o caixa confirmado, os pagamentos antes do salário, as obrigações do mês e sua margem para imprevistos.'}</Text>
          {!!summary.gaps.length && <View style={s.notice}>{summary.gaps.map(gap => <Text key={gap} style={s.help}>• {gap}</Text>)}</View>}
          <View style={styles.metrics}><View style={styles.metric}><Text style={s.help}>Aporte desejado</Text><Text style={styles.value}>{controlMoney(summary.desiredContributionCents)}</Text></View><View style={styles.metric}><Text style={s.help}>Aporte recorrente ativo</Text><Text style={styles.value}>{controlMoney(summary.activeContributionCents)}</Text></View></View>
          <Button title="Revisar meus dados e aporte" variant="secondary" onPress={() => go('/finance-settings')} />
        </Card>
        <ControlSection title="Até o próximo salário"><Card>
          <ControlRow title="Quanto posso gastar" amount={summary.spendUntilSalaryCents === null ? 'A conferir' : controlMoney(summary.spendUntilSalaryCents)} detail={`Margem protegida: ${controlMoney(state.settings.bufferCents)}`} />
          <ControlRow title="Próximo salário previsto" detail="A data não confirma o depósito." amount={controlDateLabel(summary.nextSalaryDate)} onPress={() => go('/finance-settings')} />
          {summary.nextObligation ? <ControlRow title={summary.nextObligation.name} detail={`Próximo vencimento · ${controlDateLabel(summary.nextObligation.dueDate)}`} amount={controlMoney(summary.nextObligation.amountCents)} warning={summary.nextObligation.dueDate < today} onPress={() => edit(summary.nextObligation!.kind === 'BILL' ? 'bill' : summary.nextObligation!.kind === 'FORECAST' ? 'forecast' : summary.nextObligation!.kind === 'PURCHASE' ? 'purchase' : 'expense', summary.nextObligation!.id, { month: summary.nextObligation!.dueDate.slice(0, 7) })} /> : <Text style={[s.help, { paddingTop: 12 }]}>Nenhum compromisso pendente cadastrado.</Text>}
        </Card></ControlSection>
        <ControlSection title="Visão do mês" subtitle="Projeção do mês selecionado. Não é saldo disponível."><Card>
          <ControlRow title="Receitas previstas e recebidas" amount={controlMoney(monthly.incomeCents)} detail={`Recebidas: ${controlMoney(monthly.receivedCents)}`} />
          <ControlRow title="Despesas fora dos cartões" amount={controlMoney(monthly.expenseCents)} />
          <ControlRow title="Faturas e parcelas" amount={controlMoney(monthly.billsCents)} />
          <ControlRow title="Resultado antes da margem" amount={controlMoney(monthly.remainingCents)} warning={monthly.remainingCents < 0} />
          <ControlRow title="Após a margem de imprevistos" amount={controlMoney(monthly.afterBufferCents)} warning={monthly.afterBufferCents < 0} />
          {monthly.pendingReview && <Text style={[s.help, { paddingTop: 12 }]}>Há previsões pendentes de revisão. Não use este resultado como autorização de aporte.</Text>}
        </Card></ControlSection>
        <ControlSection title="Minhas contas" action={{ label: '+ Conta', onPress: () => edit('account') }}>
          {!state.accounts.some(row => !row.cancelled) ? <ControlEmpty title="Suas contas aparecem aqui" detail="Cadastre uma conta e confirme o saldo que aparece no banco." /> : state.accounts.filter(row => !row.cancelled).map(account => {
            const observation = state.balanceObservations.filter(row => !row.cancelled && row.accountId === account.id).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
            return <Card key={account.id} style={{ gap: 8 }}><ControlRow title={account.name} detail={sourceLabel[account.source]} onPress={() => edit('account', account.id)} />
              <ControlRow title="Último saldo informado" amount={observation ? controlMoney(observation.balanceCents) : 'A informar'} detail={observation ? `${controlDateLabel(observation.observedAt)} · ${observation.confirmed ? 'Conferido' : 'Precisa conferir'}` : 'O saldo não inclui limite do cartão.'} onPress={() => edit('balance', observation?.id, { accountId: account.id })} />
              <Button title="Conferir novo saldo" variant="secondary" onPress={() => edit('balance', undefined, { accountId: account.id })} />
            </Card>;
          })}
        </ControlSection>
        <ControlSection title="Conexões e acompanhamento"><Card>
          <ControlRow title="Revisar dados dos bancos" detail="Consulte apenas o que sua conexão disponibiliza." onPress={() => go('/finance-banks')} />
          <ControlRow title="Assistente no Discord" detail="Vincule sua conta e consulte seu orçamento em privado." onPress={() => go('/finance-settings')} />
          <ControlRow title="Categorias e limites de gasto" detail="Organize despesas e acompanhe seu orçamento." onPress={() => setSection('expenses')} />
        </Card></ControlSection>
      </>}
      {(section === 'incomes' || section === 'expenses') && <>
        <ControlSection title={section === 'incomes' ? 'Receitas do mês' : 'Despesas do mês'} subtitle={section === 'incomes' ? 'Previsto não significa recebido. Confirme cada depósito.' : 'Despesas no cartão entram na fatura, sem outra saída de caixa.'} action={{ label: '+ Adicionar', onPress: () => edit(section === 'incomes' ? 'income' : 'expense') }}>
          {movements[section].length ? <Card>{movements[section].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(row => <ControlRow key={row.id} title={row.name} amount={controlMoney(row.amountCents)}
            detail={`${controlDateLabel(row.dueDate)} · ${row.status === 'SETTLED' ? section === 'incomes' ? 'Recebida' : 'Registrada como paga' : 'Prevista'}${row.recurrence === 'MONTHLY' || row.parentId ? ' · Mensal' : ''}`}
            hint={`${sourceLabel[row.source]}${section === 'expenses' && 'paymentMethod' in row && row.paymentMethod === 'CARD' ? ' · Incluída no cartão' : ''}${row.verification === 'ESTIMATED' ? ' · Valor a conferir' : ''}`} onPress={() => edit(section === 'incomes' ? 'income' : 'expense', row.id)} />)}</Card> : <ControlEmpty title={section === 'incomes' ? 'Nenhuma receita registrada neste mês' : 'Nenhuma despesa registrada neste mês'} detail={section === 'incomes' ? 'O salário configurado aparece na projeção. Registre a receita e confirme apenas quando receber.' : 'Inclua despesas fixas e variáveis. Use repetição mensal para compromissos recorrentes.'} />}
        </ControlSection>
        {section === 'expenses' && <ControlSection title="Categorias e orçamento" action={{ label: '+ Categoria', onPress: () => edit('category') }}>
          {state.categories.some(row => !row.cancelled) ? <Card>{state.categories.filter(row => !row.cancelled).map(category => {
            const spent = movements.expenses.filter(row => row.kind === 'EXPENSE' && row.categoryId === category.id).reduce((total, row) => total + row.amountCents, 0) + purchases.filter(row => row.categoryId === category.id).reduce((total, row) => total + row.amountCents, 0);
            return <ControlRow key={category.id} title={category.name} amount={controlMoney(spent)} detail={category.budgetCents === null ? 'Sem limite mensal definido' : `Orçamento: ${controlMoney(category.budgetCents)}`} hint={category.essential ? 'Essencial para sua reserva' : undefined} warning={category.budgetCents !== null && spent > category.budgetCents} onPress={() => edit('category', category.id)} />;
          })}</Card> : <ControlEmpty title="Organize os gastos por categoria" detail="Defina limites mensais e identifique quais despesas são essenciais." />}
        </ControlSection>}
      </>}
      {section === 'cards' && <>
        <ControlSection title="Seus cartões" subtitle="Limite não é dinheiro disponível." action={{ label: '+ Cartão', onPress: () => edit('card') }}>
          {state.cards.filter(row => !row.cancelled).map(card => <Card key={card.id} style={{ gap: 10 }}>
            <ControlRow title={card.name} detail={sourceLabel[card.source]} onPress={() => edit('card', card.id)} />
            <View style={styles.metrics}><View style={styles.metric}><Text style={s.help}>Limite total</Text><Text style={styles.value}>{card.limitCents === null ? 'Não informado' : controlMoney(card.limitCents)}</Text></View><View style={styles.metric}><Text style={s.help}>Limite utilizado</Text><Text style={styles.value}>{card.usedLimitCents === null ? 'Não informado' : controlMoney(card.usedLimitCents)}</Text></View></View>
            <Text style={s.help}>Limite disponível: {card.limitCents === null || card.usedLimitCents === null ? 'não informado' : controlMoney(Math.max(0, card.limitCents - card.usedLimitCents))}</Text>
            <Button title="Adicionar fatura deste cartão" variant="secondary" onPress={() => edit('bill', undefined, { cardId: card.id })} />
          </Card>)}
          {!state.cards.some(row => !row.cancelled) && <ControlEmpty title="Cadastre seus cartões" detail="Mantenha limites e faturas separados. Os dados que o banco não disponibilizar podem ser informados por você." />}
        </ControlSection>
        <ControlSection title="Faturas do mês" action={{ label: '+ Fatura', onPress: () => edit('bill') }}>
          {currentBills.length ? currentBills.map(bill => { const paid = controlBillPaidCents(state, bill.id, today); const remaining = Math.max(0, bill.totalCents - paid); return <Card key={bill.id} style={{ gap: 10 }}>
            <ControlRow title={state.cards.find(card => card.id === bill.cardId)?.name ?? 'Fatura'} amount={controlMoney(bill.totalCents)} detail={`Vence em ${controlDateLabel(bill.dueDate)} · ${bill.verification === 'CONFIRMED' ? 'Valor conferido' : 'Estimativa'}`} onPress={() => edit('bill', bill.id)} />
            <ControlRow title={remaining === 0 ? 'Fatura quitada' : bill.paymentStatusKnown ? 'Falta pagar' : 'Pagamento a conferir'} amount={controlMoney(remaining)} detail={remaining > 0 && !bill.paymentStatusKnown ? `Pagamentos confirmados no ARCA: ${controlMoney(paid)}. Esta fatura pode já ter sido paga; confira a situação no banco.` : `Pagamentos confirmados: ${controlMoney(paid)}`} warning={remaining > 0 && bill.paymentStatusKnown && bill.dueDate < today} />
            {remaining > 0 && <Button title="Registrar pagamento realizado" onPress={() => edit('payment', undefined, { billId: bill.id })} />}
            {state.payments.filter(row => !row.cancelled && row.billId === bill.id).map(payment => <ControlRow key={payment.id} title="Pagamento registrado" amount={controlMoney(payment.amountCents)} detail={`${controlDateLabel(payment.paidDate)} · ${payment.confirmed ? 'Confirmado' : 'A confirmar'}`} onPress={() => edit('payment', payment.id)} />)}
          </Card>; }) : <ControlEmpty title="Nenhuma fatura neste mês" detail="Informe o total e o vencimento. O pagamento será registrado separadamente quando ocorrer." />}
        </ControlSection>
        <ControlSection title="Previsões combinadas" subtitle="Sem divisão por banco? Guarde o total para revisar depois." action={{ label: '+ Previsão', onPress: () => edit('forecast') }}>
          {forecasts.length ? <Card>{forecasts.map(row => <ControlRow key={row.id} title="Total previsto dos cartões" amount={controlMoney(row.totalCents)} detail={row.compositionReviewed ? 'Composição revisada · ainda é previsão' : 'Composição pendente de revisão'} hint="Faturas identificadas substituem sua parte no total." warning={!row.compositionReviewed} onPress={() => edit('forecast', row.id)} />)}</Card> : <ControlEmpty title="Nenhuma previsão combinada" detail="Use apenas quando ainda não souber as faturas de cada cartão. Não some o limite utilizado." />}
        </ControlSection>
      </>}
      {section === 'installments' && <ControlSection title="Compras e parcelas" subtitle="Registre cada parcela. Vincule à fatura para evitar duplicação." action={{ label: '+ Parcela', onPress: () => edit('purchase') }}>
        {purchases.length ? <Card>{purchases.map(row => <ControlRow key={row.id} title={row.name} amount={controlMoney(row.amountCents)} detail={`${row.installmentNumber}/${row.totalInstallments} · ${controlDateLabel(row.dueDate)} · ${state.cards.find(card => card.id === row.cardId)?.name ?? 'Cartão'}`} hint={row.billId ? 'Já incluída na fatura vinculada' : 'Confira o vínculo com a fatura'} onPress={() => edit('purchase', row.id)} />)}</Card> : <ControlEmpty title="Nenhuma parcela registrada neste mês" detail="Um limite utilizado ou uma previsão total não informa as parcelas individuais. Cadastre somente detalhes que você conhece." />}
      </ControlSection>}
      {section === 'projection' && <ControlSection title="Seu caminho nos próximos meses" subtitle="Receitas e compromissos previstos, sem rendimento de investimentos.">
        <View style={s.notice}><Text style={s.help}>Os resultados não são dinheiro disponível hoje. O 13º previsto só entra no saldo quando o depósito for confirmado. A margem mensal é {controlMoney(state.settings.bufferCents)}.</Text></View>
        {projection.map(row => <Card key={row.month} style={{ gap: 8 }}><Text style={s.heading}>{controlMonthLabel(row.month)}</Text><ControlRow title="Receitas previstas" amount={controlMoney(row.incomeCents)} /><ControlRow title="Despesas fora dos cartões" amount={controlMoney(row.expenseCents)} /><ControlRow title="Faturas e parcelas previstas" amount={controlMoney(row.billsCents)} /><ControlRow title="Resultado antes da margem" amount={controlMoney(row.remainingCents)} warning={row.remainingCents < 0} /><ControlRow title="Após a margem" amount={controlMoney(row.afterBufferCents)} warning={row.afterBufferCents < 0} />{row.pendingReview && <Text style={s.help}>Há informações pendentes de revisão neste mês.</Text>}<Button title="Revisar este mês" variant="secondary" onPress={() => { setMonth(row.month); setSection('cards'); }} /></Card>)}
      </ControlSection>}
      {section === 'reserve' && <>
        <Card style={{ gap: 13 }}><Text style={s.heading}>Sua reserva de emergência</Text><Text style={styles.capacity}>{controlMoney(summary.reserveCents)}</Text><Text style={s.help}>De {controlMoney(summary.reserveTargetCents)} · {state.settings.reserveMonths} meses de despesas essenciais</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${reserveProgress}%` }]} /></View><Text style={s.text}>Faltam {controlMoney(summary.reserveRemainingCents)} para sua meta atual.</Text><ControlRow title="Despesas essenciais por mês" amount={controlMoney(summary.essentialExpensesCents)} /><Text style={s.help}>Só investimentos efetivamente registrados como reserva entram neste total. A reserva faz parte do patrimônio investido e não é somada novamente.</Text><Button title="Registrar investimento na reserva" onPress={() => router.push('/contribution?bucket=RESERVE')} /><Button title="Revisar meta e despesas essenciais" variant="secondary" onPress={() => go('/finance-settings')} /></Card>
        <Card style={{ gap: 10 }}><Text style={s.heading}>Um passo de cada vez</Text><Text style={s.text}>Priorize liquidez e baixo risco. O aporte desejado é {controlMoney(summary.desiredContributionCents)}; o recorrente ativo é {controlMoney(summary.activeContributionCents)}.</Text><Text style={s.help}>A projeção de conclusão depende de aportes realizados e de capacidade financeira confirmada. O sistema não antecipa parcelas nem investe por você.</Text><Button title="Revisar meu plano" variant="secondary" onPress={() => router.push('/(tabs)/plan')} /></Card>
      </>}
      <View style={{ gap: 5 }}><Text style={s.help}>{pending.length ? `${pending.length} alteração(ões) salva(s) no aparelho, aguardando sincronização.` : lastSyncAt ? `Última sincronização: ${new Date(lastSyncAt).toLocaleString('pt-BR')}` : 'Registros salvos neste aparelho. Configure a conexão privada para compartilhar com o Discord.'}</Text><Text style={s.help}>Dados financeiros atualizados em {new Date(state.updatedAt).toLocaleString('pt-BR')}.</Text></View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  iconButton: { minWidth: 46, minHeight: 46, borderRadius: 17, backgroundColor: '#E8EFEB', alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: colors.primary, borderColor: colors.primary, padding: 24, gap: 12 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroLabel: { color: '#C8DFD3', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  heroAmount: { color: '#FFF', fontSize: 36, fontWeight: '800', letterSpacing: -1.2 },
  heroHelp: { color: '#D5E7DD', fontSize: 12, lineHeight: 19 },
  heroSmall: { color: '#B4D1C2', fontSize: 11, lineHeight: 17, marginTop: 4 },
  heroMetric: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 5 },
  heroDivider: { height: 1, backgroundColor: '#3B6D5C', marginVertical: 5 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 17 },
  metric: { flex: 1, minWidth: 110, gap: 4 },
  value: { fontSize: 18, fontWeight: '800', color: colors.ink },
  capacity: { color: colors.primary, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  shortcuts: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  shortcut: { flex: 1, alignItems: 'center', gap: 9, minHeight: 85 },
  shortcutIcon: { width: 52, height: 52, borderRadius: 20, backgroundColor: '#E7EEE9', alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { color: colors.ink, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  month: { fontWeight: '800', textTransform: 'capitalize', color: colors.ink, fontSize: 16, textAlign: 'center' },
  monthButton: { minWidth: 44, minHeight: 44, borderRadius: 15, backgroundColor: '#EAF0EC', justifyContent: 'center', alignItems: 'center' },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: '#E0EAE3', overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.success },
});
