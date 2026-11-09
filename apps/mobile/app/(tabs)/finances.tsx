import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { controlAddMonths, controlBillPaidCents, controlMovementsForMonth, localDateString, projectControlMonths } from '@arca/domain';
import { Button, Card } from '@/components/ui';
import { ControlEmpty, ControlRow, ControlSection, controlDateLabel, controlMoney, controlMonthLabel, controlStyles as s } from '@/components/ControlUI';
import { PressFeedback, useReducedMotion } from '@/motion/Motion';
import { useControl } from '@/providers/useControl';
import { colors } from '@/theme';
import { financeNextStep, type FinanceAction } from '@/financeGuidance';
import { FinanceInvestmentGuide } from '@/components/FinanceInvestmentGuide';

const mainSections = [{ value: 'overview', label: 'Resumo' }, { value: 'incomes', label: 'Movimentos' }, { value: 'cards', label: 'Cartões' }, { value: 'more', label: 'Mais' }] as const;
type Section = 'overview' | 'incomes' | 'expenses' | 'cards' | 'installments' | 'projection' | 'reserve' | 'accounts' | 'investments' | 'more';
const sourceLabel: Record<string, string> = { MANUAL: 'Informado por você', BANK: 'Importado do banco', DISCORD: 'Registrado no Discord', IMPORT: 'Importado de arquivo' };

export default function Finances() {
  const params = useLocalSearchParams<{ view?: string; month?: string }>();
  const control = useControl();
  const { state, summary, ready, busy, error, conflict, pending, lastSyncAt } = control;
  const today = localDateString();
  const [section, setSection] = useState<Section>('overview');
  const [month, setMonth] = useState(today.slice(0, 7));
  useEffect(() => {
    if (params.view !== 'expenses') return;
    setSection('expenses');
    if (params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) setMonth(params.month);
  }, [params.view, params.month]);
  const [showGaps, setShowGaps] = useState(false);
  const [showData, setShowData] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { fontScale } = useWindowDimensions();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    opacity.stopAnimation();
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0.45);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
    animation.start(); return () => animation.stop();
  }, [section, reduced, opacity]);
  const selectedMain = section === 'expenses' ? 'incomes' : ['overview', 'incomes', 'cards'].includes(section) ? section : 'more';
  function showSection(next: Section) {
    if (section === next) return;
    setSection(next); if (next === 'overview') setMonth(today.slice(0, 7));
  }

  const movements = useMemo(() => controlMovementsForMonth(state, month), [state, month]);
  const monthly = useMemo(() => projectControlMonths(state, month, 1)[0]!, [state, month]);
  const projection = useMemo(() => {
    const [year, number] = month.split('-').map(Number);
    const untilApril = (2027 - year!) * 12 + 4 - number! + 1;
    return projectControlMonths(state, month, Math.min(120, Math.max(6, untilApril)));
  }, [state, month]);
  const edit = (kind: string, id?: string, extra?: Record<string, string>) => router.push({ pathname: '/finance-entry', params: { kind, ...(id ? { id } : {}), month, ...extra } });
  const go = (pathname: '/finance-settings' | '/finance-banks') => router.push(pathname);
  async function synchronize() { try { await control.sync(); } catch { /* The hook displays the actionable error. */ } }
  const currentBills = state.bills.filter(row => !row.cancelled && row.month === month);
  const purchases = state.purchases.filter(row => !row.cancelled && row.dueDate.slice(0, 7) === month).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const forecasts = state.forecasts.filter(row => !row.cancelled && row.month === month);
  const reserveProgress = summary.reserveTargetCents > 0 ? Math.min(100, summary.reserveCents / summary.reserveTargetCents * 100) : 0;
  const nextStep = financeNextStep(state, summary, today);
  function takeAction(action: FinanceAction) {
    if (action.kind === 'ACCOUNT') edit('account');
    else if (action.kind === 'BALANCE') edit('balance', undefined, { accountId: action.accountId! });
    else if (action.kind === 'BILL') edit('bill', action.id);
    else if (action.kind === 'FORECAST') edit('forecast', action.id, { month: action.month! });
    else if (action.kind === 'INVEST') showSection('investments');
    else if (action.kind === 'BUDGET') showSection('expenses');
    else go('/finance-settings');
  }

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView ref={scroll} contentContainerStyle={[s.content, styles.content, { paddingBottom: 110 + Math.max(0, fontScale - 1) * 62 }]} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void synchronize()} tintColor={colors.primary} />}>
      <View style={styles.header}><View style={{ flex: 1, minWidth: 190 }}><Text style={styles.pageTitle}>Finanças</Text><Text style={s.help}>Um passo de cada vez.</Text></View><View style={styles.headerActions}>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Sincronizar dados financeiros" disabled={busy} onPress={() => void synchronize()} style={styles.iconButton}><Ionicons name="sync-outline" size={21} color={colors.primary} /></PressFeedback>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Configurações financeiras" onPress={() => go('/finance-settings')} style={styles.iconButton}><Ionicons name="options-outline" size={21} color={colors.primary} /></PressFeedback>
      </View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }} contentContainerStyle={styles.navigation}><View accessibilityRole="tablist" style={{ flexDirection: 'row', flexGrow: 1 }}>{mainSections.map(item => <PressFeedback key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: selectedMain === item.value }} onPress={() => showSection(item.value)} style={[styles.navItem, selectedMain === item.value && styles.navSelected]}><Text numberOfLines={1} style={[styles.navLabel, selectedMain === item.value && styles.navLabelSelected]}>{item.label}</Text></PressFeedback>)}</View></ScrollView>
      {!ready ? <ControlEmpty title="Abrindo seu orçamento" detail="Estamos buscando seus registros neste aparelho." /> : <Animated.View style={{ gap: 18, opacity }}>
      {!!error && !conflict && <View style={[s.warning, styles.notice]}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Text style={s.help}>Seus registros continuam no aparelho.</Text><Button title="Tentar sincronizar novamente" variant="secondary" disabled={busy} onPress={() => void synchronize()} /></View>}
      {conflict && <Card style={[styles.card, { backgroundColor: '#FFF6E8' }]}><Text style={styles.sectionTitle}>Precisamos conferir duas versões</Text><Text style={s.help}>Há diferenças entre este aparelho e a base online. Compare os registros antes de escolher qual manter.</Text><Button title="Comparar versões dos meus dados" onPress={() => go('/finance-settings')} /></Card>}
      {!['overview', 'more', 'incomes', 'expenses', 'cards'].includes(section) && <PressFeedback accessibilityRole="button" accessibilityLabel="Voltar a todos os detalhes" onPress={() => showSection('more')} style={styles.backLink}><Ionicons name="arrow-back" size={18} color={colors.primary} /><Text style={styles.link}>Todos os detalhes</Text></PressFeedback>}
      {['incomes', 'expenses'].includes(section) && <View style={styles.movementTabs}>{([{ value: 'incomes', label: 'Entradas' }, { value: 'expenses', label: 'Saídas' }] as const).map(item => <PressFeedback key={item.value} accessibilityRole="tab" accessibilityState={{ selected: section === item.value }} onPress={() => showSection(item.value)} style={[styles.movementTab, section === item.value && styles.movementActive]}><Text style={[styles.navLabel, section === item.value && styles.navLabelSelected]}>{item.label}</Text></PressFeedback>)}</View>}
      {['incomes', 'expenses', 'cards', 'installments', 'projection'].includes(section) && <View style={styles.monthBar}>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setMonth(controlAddMonths(month, -1))} style={styles.monthButton}><Ionicons name="chevron-back" size={20} color={colors.primary} /></PressFeedback>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Voltar ao mês atual" onPress={() => setMonth(today.slice(0, 7))} style={{ flex: 1 }}><Text style={styles.month}>{controlMonthLabel(month)}</Text></PressFeedback>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setMonth(controlAddMonths(month, 1))} style={styles.monthButton}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></PressFeedback>
      </View>}
      {section === 'overview' && <>
        <View style={styles.balance}><View style={{ flex: 1, minWidth: 0 }}><Text style={s.help}>Saldo nas contas</Text><Text testID="finance-balance-amount" maxFontSizeMultiplier={1.2} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.balanceAmount}>{controlMoney(summary.bankBalanceCents)}</Text></View><PressFeedback accessibilityRole="button" accessibilityLabel="Ver minhas contas e saldos" onPress={() => showSection('accounts')} style={styles.iconButton}><Ionicons name="wallet-outline" size={22} color={colors.primary} /></PressFeedback></View>
        <Card style={styles.nextStep}><Text style={styles.eyebrow}>SEU PRÓXIMO PASSO</Text><Text style={styles.nextTitle}>{nextStep.title}</Text><Text style={styles.nextCopy}>{nextStep.detail}</Text><Button title={nextStep.label} disabled={!!conflict} onPress={() => takeAction(nextStep.action)} />
          {!!summary.gaps.length && <><PressFeedback accessibilityRole="button" accessibilityState={{ expanded: showGaps }} accessibilityLabel="Ver o que falta conferir" onPress={() => setShowGaps(!showGaps)} style={styles.disclosure}><Text style={styles.link}>{showGaps ? 'Recolher pendências' : `O que falta conferir? (${summary.gaps.length})`}</Text><Ionicons name={showGaps ? 'chevron-up' : 'chevron-down'} size={17} color={colors.primary} /></PressFeedback>{showGaps && <View style={{ gap: 12 }}>{summary.gaps.map((gap, index) => <Text key={gap} style={s.help}>{index + 1}. {gap}</Text>)}</View>}</>}
        </Card>
        <View style={styles.summaryRows}>
          <ControlRow title="Faturas deste mês" amount={controlMoney(monthly.billsCents)} detail={monthly.pendingReview ? 'Previsão · precisa conferir' : 'Total previsto, inclusive faturas já pagas'} onPress={() => { setMonth(today.slice(0, 7)); showSection('cards'); }} />
          <ControlRow title="Pode gastar até o salário" amount={summary.spendUntilSalaryCents === null ? 'A conferir' : controlMoney(summary.spendUntilSalaryCents)} detail={`Próximo salário previsto: ${controlDateLabel(summary.nextSalaryDate)}`} onPress={() => go('/finance-settings')} />
        </View>
        <View style={styles.entryActions}>{([{ label: 'Adicionar entrada', icon: 'add-outline', kind: 'income' }, { label: 'Adicionar saída', icon: 'remove-outline', kind: 'expense' }] as const).map(item => <PressFeedback key={item.kind} accessibilityRole="button" onPress={() => edit(item.kind)} style={styles.entryAction}><Ionicons name={item.icon} size={19} color={colors.primary} /><Text style={styles.entryLabel}>{item.label}</Text></PressFeedback>)}</View>
        <PressFeedback accessibilityRole="button" accessibilityLabel="Onde investir? Ver valor, opções e motivos" onPress={() => showSection('investments')} style={styles.investLink}><View style={{ flex: 1, gap: 5 }}><Text style={styles.sectionTitle}>Onde investir?</Text><Text style={s.help}>Valor, opções e motivos para seu momento.</Text></View><Ionicons name="arrow-forward" size={21} color={colors.primary} /></PressFeedback>
      </>}
      {section === 'more' && <>
        <Text style={styles.sectionTitle}>O que você quer organizar?</Text>
        <Card style={styles.card}>
          <ControlRow title="Minhas contas" detail="Confira os saldos de cada banco" onPress={() => showSection('accounts')} />
          <ControlRow title="Compras e parcelas" detail="Veja o que ainda está comprometido" onPress={() => showSection('installments')} />
          <ControlRow title="Próximos meses" detail="Receitas e compromissos previstos" onPress={() => showSection('projection')} />
          <ControlRow title="Reserva de emergência" detail="Meta e progresso com dinheiro já investido" onPress={() => showSection('reserve')} />
          <ControlRow title="Onde investir?" detail="Opções com justificativa e próximos passos" onPress={() => showSection('investments')} />
        </Card>
        <Card style={styles.card}><ControlRow title="Conferir dados dos bancos" detail="Revise importações antes de adicioná-las" onPress={() => go('/finance-banks')} /><ControlRow title="Configurações e Discord" detail="Salário, margem, metas e lembretes" onPress={() => go('/finance-settings')} /></Card>
        <PressFeedback accessibilityRole="button" accessibilityState={{ expanded: showData }} onPress={() => setShowData(!showData)} style={styles.disclosure}><Text style={styles.link}>Dados e sincronização</Text><Ionicons name={showData ? 'chevron-up' : 'chevron-down'} size={17} color={colors.primary} /></PressFeedback>
        {showData && <View style={{ gap: 10 }}><Text style={s.help}>{pending.length ? `${pending.length} alteração(ões) salva(s) no aparelho, aguardando sincronização.` : lastSyncAt ? `Última sincronização: ${new Date(lastSyncAt).toLocaleString('pt-BR')}` : 'Registros salvos neste aparelho. Conecte seu acesso em Meus bancos para sincronizar.'}</Text><Text style={s.help}>Base atualizada em {new Date(state.updatedAt).toLocaleString('pt-BR')}.</Text><Button title="Sincronizar agora" variant="secondary" disabled={busy} onPress={() => void synchronize()} /></View>}
      </>}
      {section === 'accounts' && <ControlSection title="Minhas contas" action={{ label: '+ Conta', onPress: () => edit('account') }}>
        {!state.accounts.some(row => !row.cancelled) ? <ControlEmpty title="Suas contas aparecem aqui" detail="Cadastre uma conta e confirme o saldo que aparece no banco." /> : state.accounts.filter(row => !row.cancelled).map(account => {
          const observation = state.balanceObservations.filter(row => !row.cancelled && row.accountId === account.id).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
          return <Card key={account.id} style={styles.card}><ControlRow title={account.name} detail={sourceLabel[account.source]} onPress={() => edit('account', account.id)} /><ControlRow title="Último saldo informado" amount={observation ? controlMoney(observation.balanceCents) : 'A informar'} detail={observation ? `${controlDateLabel(observation.observedAt)} · ${observation.confirmed ? 'Conferido' : 'Precisa conferir'}` : 'O saldo não inclui limite do cartão.'} onPress={() => edit('balance', observation?.id, { accountId: account.id })} /><Button title="Conferir novo saldo" variant="secondary" onPress={() => edit('balance', undefined, { accountId: account.id })} /></Card>;
        })}
      </ControlSection>}
      {section === 'investments' && <FinanceInvestmentGuide state={state} summary={summary} conflict={!!conflict} onReview={() => takeAction(nextStep.action)} />}
      {(section === 'incomes' || section === 'expenses') && <>
        <ControlSection title={section === 'incomes' ? 'Receitas do mês' : 'Despesas do mês'} subtitle={section === 'incomes' ? 'Previsto não significa recebido. Confirme cada depósito.' : 'Despesas no cartão entram na fatura, sem outra saída de caixa.'} action={{ label: '+ Adicionar', onPress: () => edit(section === 'incomes' ? 'income' : 'expense') }}>
          {movements[section].length ? <Card style={styles.card}>{movements[section].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(row => <View key={row.id}><ControlRow title={row.name.replace(/\s*[—–-]\s*conferir vencimento$/i, '')} amount={controlMoney(row.amountCents)}
            detail={`${row.status === 'SETTLED' && row.settledDate ? `${section === 'incomes' ? 'Recebida' : 'Paga'} em ${controlDateLabel(row.settledDate)}` : `${/conferir vencimento$/i.test(row.name) ? 'Vencimento a conferir' : controlDateLabel(row.dueDate)} · ${row.status === 'SETTLED' ? section === 'incomes' ? 'Recebida' : 'Registrada como paga' : 'Prevista'}`}${row.recurrence === 'MONTHLY' || row.parentId ? ' · Mensal' : ''}`}
            hint={`${sourceLabel[row.source]}${section === 'expenses' && 'paymentMethod' in row && row.paymentMethod === 'CARD' ? ' · Incluída no cartão' : ''}${row.verification === 'ESTIMATED' ? ' · Valor a conferir' : ''}`} onPress={() => edit(section === 'incomes' ? 'income' : 'expense', row.id)} />
            {section === 'expenses' && row.status === 'EXPECTED' && 'paymentMethod' in row && row.paymentMethod === 'CASH' && row.kind === 'EXPENSE' && <Button title="Já paguei" variant="secondary" onPress={() => edit('expense', row.id, { action: 'pay' })} />}
          </View>)}</Card> : <ControlEmpty title={section === 'incomes' ? 'Nenhuma receita registrada neste mês' : 'Nenhuma despesa registrada neste mês'} detail={section === 'incomes' ? 'O salário configurado aparece na projeção. Registre a receita e confirme apenas quando receber.' : 'Inclua despesas fixas e variáveis. Use repetição mensal para compromissos recorrentes.'} />}
        </ControlSection>
        {section === 'expenses' && <ControlSection title="Categorias e orçamento" action={{ label: '+ Categoria', onPress: () => edit('category') }}>
          {state.categories.some(row => !row.cancelled) ? <Card style={styles.card}>{state.categories.filter(row => !row.cancelled).map(category => {
            const spent = movements.expenses.filter(row => row.kind === 'EXPENSE' && row.categoryId === category.id).reduce((total, row) => total + row.amountCents, 0) + purchases.filter(row => row.categoryId === category.id).reduce((total, row) => total + row.amountCents, 0);
            return <ControlRow key={category.id} title={category.name} amount={controlMoney(spent)} detail={category.budgetCents === null ? 'Sem limite mensal definido' : `Orçamento: ${controlMoney(category.budgetCents)}`} hint={category.essential ? 'Essencial para sua reserva' : undefined} warning={category.budgetCents !== null && spent > category.budgetCents} onPress={() => edit('category', category.id)} />;
          })}</Card> : <ControlEmpty title="Organize os gastos por categoria" detail="Defina limites mensais e identifique quais despesas são essenciais." />}
        </ControlSection>}
      </>}
      {section === 'cards' && <>
        <ControlSection title="Seus cartões" subtitle="Limite não é dinheiro disponível." action={{ label: '+ Cartão', onPress: () => edit('card') }}>
          {state.cards.filter(row => !row.cancelled).map(card => <Card key={card.id} style={{ ...styles.card, gap: 10 }}>
            <ControlRow title={card.name} detail={sourceLabel[card.source]} onPress={() => edit('card', card.id)} />
            <View style={styles.metrics}><View style={styles.metric}><Text style={s.help}>Limite total</Text><Text style={styles.value}>{card.limitCents === null ? 'Não informado' : controlMoney(card.limitCents)}</Text></View><View style={styles.metric}><Text style={s.help}>Limite utilizado</Text><Text style={styles.value}>{card.usedLimitCents === null ? 'Não informado' : controlMoney(card.usedLimitCents)}</Text></View></View>
            <Text style={s.help}>Limite disponível: {card.limitCents === null || card.usedLimitCents === null ? 'não informado' : controlMoney(Math.max(0, card.limitCents - card.usedLimitCents))}</Text>
            <Button title="Adicionar fatura deste cartão" variant="secondary" onPress={() => edit('bill', undefined, { cardId: card.id })} />
          </Card>)}
          {!state.cards.some(row => !row.cancelled) && <ControlEmpty title="Cadastre seus cartões" detail="Mantenha limites e faturas separados. Os dados que o banco não disponibilizar podem ser informados por você." />}
        </ControlSection>
        <ControlSection title="Faturas do mês" action={{ label: '+ Fatura', onPress: () => edit('bill') }}>
          {currentBills.length ? currentBills.map(bill => { const paid = controlBillPaidCents(state, bill.id, today); const remaining = Math.max(0, bill.totalCents - paid); return <Card key={bill.id} style={{ ...styles.card, gap: 10 }}>
            <ControlRow title={state.cards.find(card => card.id === bill.cardId)?.name ?? 'Fatura'} amount={controlMoney(bill.totalCents)} detail={`Vence em ${controlDateLabel(bill.dueDate)} · ${bill.verification === 'CONFIRMED' ? 'Valor conferido' : 'Estimativa'}`} onPress={() => edit('bill', bill.id)} />
            <ControlRow title={remaining === 0 ? 'Fatura quitada' : bill.paymentStatusKnown ? 'Falta pagar' : 'Pagamento a conferir'} amount={controlMoney(remaining)} detail={remaining > 0 && !bill.paymentStatusKnown ? `Pagamentos confirmados no ARCA: ${controlMoney(paid)}. Esta fatura pode já ter sido paga; confira a situação no banco.` : `Pagamentos confirmados: ${controlMoney(paid)}`} warning={remaining > 0 && bill.paymentStatusKnown && bill.dueDate < today} />
            {remaining > 0 && <Button title="Registrar pagamento realizado" onPress={() => edit('payment', undefined, { billId: bill.id })} />}
            {state.payments.filter(row => !row.cancelled && row.billId === bill.id).map(payment => <ControlRow key={payment.id} title="Pagamento registrado" amount={controlMoney(payment.amountCents)} detail={`${controlDateLabel(payment.paidDate)} · ${payment.confirmed ? 'Confirmado' : 'A confirmar'}`} onPress={() => edit('payment', payment.id)} />)}
          </Card>; }) : <ControlEmpty title="Nenhuma fatura neste mês" detail="Informe o total e o vencimento. O pagamento será registrado separadamente quando ocorrer." />}
        </ControlSection>
        <ControlSection title="Previsões combinadas" subtitle="Sem divisão por banco? Guarde o total para revisar depois." action={{ label: '+ Previsão', onPress: () => edit('forecast') }}>
          {forecasts.length ? <Card style={styles.card}>{forecasts.map(row => <ControlRow key={row.id} title="Total previsto dos cartões" amount={controlMoney(row.totalCents)} detail={row.compositionReviewed ? 'Composição revisada · ainda é previsão' : 'Composição pendente de revisão'} hint="Faturas identificadas substituem sua parte no total." warning={!row.compositionReviewed} onPress={() => edit('forecast', row.id)} />)}</Card> : <ControlEmpty title="Nenhuma previsão combinada" detail="Use apenas quando ainda não souber as faturas de cada cartão. Não some o limite utilizado." />}
        </ControlSection>
      </>}
      {section === 'installments' && <ControlSection title="Compras e parcelas" subtitle="Registre cada parcela. Vincule à fatura para evitar duplicação." action={{ label: '+ Parcela', onPress: () => edit('purchase') }}>
        {purchases.length ? <Card style={styles.card}>{purchases.map(row => <ControlRow key={row.id} title={row.name} amount={controlMoney(row.amountCents)} detail={`${row.installmentNumber}/${row.totalInstallments} · ${controlDateLabel(row.dueDate)} · ${state.cards.find(card => card.id === row.cardId)?.name ?? 'Cartão'}`} hint={row.billId ? 'Já incluída na fatura vinculada' : 'Confira o vínculo com a fatura'} onPress={() => edit('purchase', row.id)} />)}</Card> : <ControlEmpty title="Nenhuma parcela registrada neste mês" detail="Um limite utilizado ou uma previsão total não informa as parcelas individuais. Cadastre somente detalhes que você conhece." />}
      </ControlSection>}
      {section === 'projection' && <ControlSection title="Seu caminho nos próximos meses" subtitle="Receitas e compromissos previstos, sem rendimento de investimentos.">
        <View style={s.notice}><Text style={s.help}>Os resultados não são dinheiro disponível hoje. O 13º previsto só entra no saldo quando o depósito for confirmado. A margem mensal é {controlMoney(state.settings.bufferCents)}.</Text></View>
        {projection.map(row => <Card key={row.month} style={{ ...styles.card, gap: 8 }}><Text style={s.heading}>{controlMonthLabel(row.month)}</Text><ControlRow title="Receitas previstas" amount={controlMoney(row.incomeCents)} /><ControlRow title="Despesas não incluídas nas faturas" amount={controlMoney(row.expenseCents)} detail="Inclui contas pagas pelo saldo e gastos de cartão que ainda não estão nos totais abaixo." /><ControlRow title="Faturas e parcelas previstas" amount={controlMoney(row.billsCents)} /><ControlRow title="Resultado antes da margem" amount={controlMoney(row.remainingCents)} warning={row.remainingCents < 0} /><ControlRow title="Após a margem" amount={controlMoney(row.afterBufferCents)} warning={row.afterBufferCents < 0} />{row.pendingReview && <Text style={s.help}>Há informações pendentes de revisão neste mês.</Text>}<Button title="Revisar este mês" variant="secondary" onPress={() => { setMonth(row.month); showSection('cards'); }} /></Card>)}
      </ControlSection>}
      {section === 'reserve' && <>
        <Card style={{ ...styles.card, gap: 13 }}><Text style={s.heading}>Sua reserva de emergência</Text><Text style={styles.capacity}>{controlMoney(summary.reserveCents)}</Text><Text style={s.help}>De {controlMoney(summary.reserveTargetCents)} · {state.settings.reserveMonths} meses de despesas essenciais</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${reserveProgress}%` }]} /></View><Text style={s.text}>Faltam {controlMoney(summary.reserveRemainingCents)} para sua meta atual.</Text><ControlRow title="Despesas essenciais por mês" amount={controlMoney(summary.essentialExpensesCents)} /><Text style={s.help}>Só investimentos efetivamente registrados como reserva entram neste total. A reserva faz parte do patrimônio investido e não é somada novamente.</Text><Button title="Registrar investimento na reserva" onPress={() => router.push('/contribution?bucket=RESERVE')} /><Button title="Revisar meta e despesas essenciais" variant="secondary" onPress={() => go('/finance-settings')} /></Card>
        <Card style={{ ...styles.card, gap: 10 }}><Text style={s.heading}>Um passo de cada vez</Text><Text style={s.text}>Priorize liquidez e baixo risco. O aporte desejado é {controlMoney(summary.desiredContributionCents)}; o recorrente ativo é {controlMoney(summary.activeContributionCents)}.</Text><Text style={s.help}>A projeção de conclusão depende de aportes realizados e de capacidade financeira confirmada. O sistema não antecipa parcelas nem investe por você.</Text><Button title="Revisar meu plano" variant="secondary" onPress={() => router.push('/(tabs)/plan')} /></Card>
      </>}
      </Animated.View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 16 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  pageTitle: { color: colors.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginBottom: 3 },
  iconButton: { minWidth: 44, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBF0ED' },
  navigation: { minWidth: '100%' },
  navItem: { flexGrow: 1, flexShrink: 0, minHeight: 46, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  navSelected: { borderBottomColor: colors.primary },
  navLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  navLabelSelected: { color: colors.primary, fontWeight: '800' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
  balanceAmount: { fontSize: 33, fontWeight: '800', letterSpacing: -1, color: colors.ink, marginTop: 5 },
  card: { borderRadius: 12, borderColor: colors.border, padding: 18, gap: 10 },
  nextStep: { borderRadius: 12, backgroundColor: '#EDF3EF', borderColor: '#DCE7E0', padding: 18, gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.primary },
  nextTitle: { fontSize: 21, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  nextCopy: { fontSize: 14, lineHeight: 22, color: '#53685D' },
  sectionTitle: { fontSize: 19, lineHeight: 26, fontWeight: '800', color: colors.ink },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  link: { color: colors.primary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  backLink: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44 },
  notice: { borderRadius: 12 },
  summaryRows: { paddingHorizontal: 2 },
  entryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  entryAction: { flex: 1, minWidth: 120, borderWidth: 1, borderColor: '#D9E4DD', minHeight: 46, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  entryLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, flexShrink: 1 },
  investLink: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  movementTabs: { flexDirection: 'row', gap: 10 },
  movementTab: { paddingHorizontal: 20, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  movementActive: { backgroundColor: '#E5EEE8', borderColor: '#C6D9CC' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 17 },
  metric: { flex: 1, minWidth: 110, gap: 4 },
  value: { fontSize: 18, fontWeight: '800', color: colors.ink },
  capacity: { color: colors.primary, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  month: { fontWeight: '700', textTransform: 'capitalize', color: colors.ink, fontSize: 15, textAlign: 'center' },
  monthButton: { minWidth: 44, minHeight: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  progressTrack: { height: 6, backgroundColor: '#E0EAE3', overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', backgroundColor: colors.success },
});
