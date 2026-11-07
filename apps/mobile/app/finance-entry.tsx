import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ControlDateSchema, controlCollectionSchemas, controlMovementsForMonth, localDateString, parseMoneyInput, type ControlCollection, type ControlState } from '@arca/domain';
import { useControl } from '@/providers/useControl';
import { Button, Card, ScreenHeader } from '@/components/ui';
import { ControlChoices, ControlField, ControlToggle, controlDateLabel, controlMoney, controlStyles as s } from '@/components/ControlUI';
import { colors } from '@/theme';
import { financeErrorMessage } from '@/financeValidation';
import { localObservationMinute, observationTimestamp } from '@/financeObservation';

const kinds: Record<string, ControlCollection> = { account: 'accounts', balance: 'balanceObservations', income: 'incomes', expense: 'expenses', card: 'cards', bill: 'bills', purchase: 'purchases', payment: 'payments', forecast: 'forecasts', category: 'categories' };
const labels: Record<ControlCollection, string> = { accounts: 'Conta bancária', balanceObservations: 'Saldo da conta', incomes: 'Receita', expenses: 'Despesa', cards: 'Cartão de crédito', bills: 'Fatura', purchases: 'Compra ou parcela', payments: 'Pagamento de fatura', forecasts: 'Previsão das faturas', categories: 'Categoria e orçamento' };
type Form = Record<string, string | boolean>;
type Entity = Record<string, unknown> & { id: string; cancelled?: boolean };
const amountText = (value: unknown) => typeof value === 'number' ? (Math.abs(value) / 100).toFixed(2) : '';
const sameDayTimestamp = (value: string, oldDate?: unknown, oldTimestamp?: unknown) => oldDate === value && typeof oldTimestamp === 'string' ? oldTimestamp : value === localDateString() ? new Date().toISOString() : null;
function findEntity(state: ControlState, collection: ControlCollection, id?: string, month?: string): Entity | undefined {
  if (!id) return undefined;
  const direct = state[collection].find(row => row.id === id);
  if (direct) return direct as Entity;
  if ((collection === 'incomes' || collection === 'expenses') && month) return controlMovementsForMonth(state, month)[collection].find(row => row.id === id) as Entity | undefined;
  return undefined;
}

export default function FinanceEntry() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; accountId?: string; billId?: string; cardId?: string; month?: string }>();
  const collection = kinds[params.kind ?? ''] ?? (params.kind && params.kind in controlCollectionSchemas ? params.kind as ControlCollection : 'expenses');
  const { state, ready, busy, save, conflict } = useControl();
  const [form, setForm] = useState<Form>({});
  const [error, setError] = useState('');
  const [review, setReview] = useState<Entity | null>(null);
  const [cancelReview, setCancelReview] = useState(false);
  const original = useRef<Entity | undefined>(undefined);
  const initialized = useRef(false);
  const entityId = useRef(Crypto.randomUUID());
  const today = localDateString();
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    const old = findEntity(state, collection, params.id, params.month);
    if (params.id && !old) { setError('Este registro não está disponível. Volte e atualize a lista.'); return; }
    original.current = old;
    if (old) entityId.current = old.id;
    const bill = state.bills.find(row => row.id === (old?.billId ?? params.billId));
    const source: Record<string, unknown> = old ?? {};
    setForm({
      name: String(source.name ?? ''), amount: amountText(source.amountCents ?? source.totalCents ?? source.balanceCents),
      limit: amountText(source.limitCents), usedLimit: amountText(source.usedLimitCents), budget: amountText(source.budgetCents),
      negative: typeof source.balanceCents === 'number' && source.balanceCents < 0,
      accountId: String(source.accountId ?? params.accountId ?? ''), cardId: String(source.cardId ?? params.cardId ?? bill?.cardId ?? ''),
      billId: String(source.billId ?? params.billId ?? ''), categoryId: String(source.categoryId ?? ''),
      dueDate: String(source.dueDate ?? (params.month ? `${params.month}-01` : today)),
      settledDate: String(source.settledDate ?? today), paidDate: String(source.paidDate ?? today), purchaseDate: String(source.purchaseDate ?? today),
      month: String(source.month ?? params.month ?? today.slice(0, 7)),
      observedAt: localObservationMinute(String(source.observedAt ?? new Date().toISOString())),
      status: String(source.status ?? 'EXPECTED'), verification: String(source.verification ?? 'ESTIMATED'),
      confirmed: source.confirmed === true, affectsCash: source.affectsCash !== false,
      kind: String(source.kind ?? (collection === 'incomes' ? 'EXTRA' : 'EXPENSE')),
      paymentMethod: String(source.paymentMethod ?? 'CASH'), essential: source.essential === true,
      recurrence: String(source.recurrence ?? 'NONE'), recurrenceEnd: String(source.recurrenceEnd ?? ''),
      dueDay: source.dueDay ? String(source.dueDay) : '',
      installmentNumber: String(source.installmentNumber ?? 1), totalInstallments: String(source.totalInstallments ?? 1),
      includesRecurring: source.includesRecurring !== false, paymentStatusKnown: source.paymentStatusKnown !== false, compositionReviewed: source.compositionReviewed === true,
      cardIds: Array.isArray(source.cardIds) ? source.cardIds.join('|') : '',
    });
  }, [ready, state, collection, params.id, params.month, params.accountId, params.billId, params.cardId, today]);
  const text = (key: string) => String(form[key] ?? '');
  const flag = (key: string) => form[key] === true;
  const set = (key: string, value: string | boolean) => { setForm(old => ({ ...old, [key]: value, ...(key === 'cardId' ? { billId: '' } : {}), ...(key === 'paymentMethod' && value === 'CARD' ? { status: 'EXPECTED' } : {}) })); setReview(null); setCancelReview(false); setError(''); };
  const cents = (key: string, optional = false): number | null => {
    if (!text(key).trim() && optional) return null;
    if (!text(key).trim()) throw new Error('Preencha o valor em reais.');
    return Math.round(Number(parseMoneyInput(text(key))) * 100);
  };
  const date = (key: string, past = false) => {
    const result = ControlDateSchema.safeParse(text(key));
    if (!result.success) throw new Error('Informe uma data válida no formato ano-mês-dia. Exemplo: 2026-11-03.');
    if (past && result.data > today) throw new Error('Um recebimento ou pagamento realizado não pode ter data futura.');
    return result.data;
  };
  const numeric = (key: string, optional = false) => { if (!text(key) && optional) return null; if (!/^\d+$/.test(text(key))) throw new Error('Informe um número inteiro válido.'); return Number(text(key)); };
  const reference = (key: string, required = false) => { const value = text(key); if (!value && required) throw new Error('Selecione a conta, o cartão ou a fatura correspondente.'); return value || null; };
  function build(): Entity {
    const base = { ...(original.current ?? {}), id: entityId.current, source: original.current?.source ?? 'MANUAL', cancelled: false };
    const name = text('name').trim();
    const verification = text('verification');
    let entity: Record<string, unknown>;
    if (collection === 'accounts') entity = { ...base, name };
    else if (collection === 'balanceObservations') {
      const observedAt = observationTimestamp(text('observedAt'), original.current?.observedAt);
      entity = { ...base, accountId: reference('accountId', true), balanceCents: cents('amount')! * (flag('negative') ? -1 : 1), observedAt, confirmed: flag('confirmed') };
    } else if (collection === 'incomes' || collection === 'expenses') {
      const status = text('status');
      const settledDate = status === 'SETTLED' ? date('settledDate', true) : null;
      if (status === 'SETTLED' && text('paymentMethod') !== 'CARD' && !text('accountId')) throw new Error('Escolha a conta do recebimento ou pagamento realizado.');
      const dueDate = date('dueDate');
      const recurrenceEnd = text('recurrenceEnd') ? date('recurrenceEnd') : null;
      if (recurrenceEnd && recurrenceEnd < dueDate) throw new Error('O fim da repetição deve ser posterior à primeira data.');
      entity = { ...base, name, amountCents: cents('amount'), dueDate, status, verification: status === 'SETTLED' ? 'CONFIRMED' : verification,
        accountId: reference('accountId'), categoryId: reference('categoryId'), recurrence: text('recurrence'), recurrenceEnd,
        settledDate, settledAt: settledDate ? sameDayTimestamp(settledDate, original.current?.settledDate, original.current?.settledAt) : null,
        affectsCash: flag('affectsCash'), kind: text('kind') };
      if (collection === 'expenses') entity = { ...entity, paymentMethod: text('paymentMethod'), billId: reference('billId'), essential: flag('essential') };
    } else if (collection === 'cards') entity = { ...base, name, limitCents: cents('limit', true), usedLimitCents: cents('usedLimit', true), dueDay: numeric('dueDay', true) };
    else if (collection === 'bills') entity = { ...base, cardId: reference('cardId', true), month: text('month'), totalCents: cents('amount'), dueDate: date('dueDate'), verification, includesRecurring: flag('includesRecurring'), paymentStatusKnown: flag('paymentStatusKnown') };
    else if (collection === 'purchases') entity = { ...base, cardId: reference('cardId', true), billId: reference('billId'), name, amountCents: cents('amount'), purchaseDate: date('purchaseDate', true), dueDate: date('dueDate'),
      categoryId: reference('categoryId'), installmentNumber: numeric('installmentNumber'), totalInstallments: numeric('totalInstallments'), verification };
    else if (collection === 'payments') {
      if (!flag('confirmed')) throw new Error('Confirme que o pagamento foi efetivamente realizado.');
      if (!text('accountId') && flag('affectsCash')) throw new Error('Escolha a conta de onde saiu o pagamento.');
      const paidDate = date('paidDate', true);
      entity = { ...base, billId: reference('billId', true), amountCents: cents('amount'), paidDate, paidAt: sameDayTimestamp(paidDate, original.current?.paidDate, original.current?.paidAt), accountId: reference('accountId'), confirmed: true, affectsCash: flag('affectsCash') };
    } else if (collection === 'forecasts') entity = { ...base, month: text('month'), totalCents: cents('amount'), cardIds: text('cardIds').split('|').filter(Boolean), includesRecurring: flag('includesRecurring'), compositionReviewed: flag('compositionReviewed') };
    else entity = { ...base, name, budgetCents: cents('budget', true), essential: flag('essential') };
    const parsed = controlCollectionSchemas[collection].safeParse(entity);
    if (!parsed.success) throw parsed.error;
    return parsed.data as Entity;
  }
  function assertUnchanged() {
    if (conflict) throw new Error('Há alterações em outro aparelho. Resolva a revisão em Finanças antes de salvar.');
    const latest = findEntity(state, collection, params.id, params.month);
    if (JSON.stringify(latest) !== JSON.stringify(original.current)) throw new Error('Este registro mudou durante a edição. Volte à lista e abra-o novamente para revisar.');
  }
  function prepare() { try { assertUnchanged(); setReview(build()); setError(''); } catch (cause) { setError(financeErrorMessage(cause, 'Revise os campos.')); } }
  async function persist(cancel = false) {
    try {
      assertUnchanged();
      if (cancel && state[collection].some(row => row.id === entityId.current)) await save({ type: 'CANCEL', collection, entityId: entityId.current });
      else await save({ type: 'UPSERT', collection, entity: cancel ? { ...original.current, cancelled: true } : review! });
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)/finances');
    } catch (cause) { setReview(null); setCancelReview(false); setError(financeErrorMessage(cause)); }
  }
  const field = (key: string, label: string, help?: string, currency = false) => <ControlField key={key} label={label} help={help} currency={currency} value={text(key)} onChangeText={value => set(key, value)} autoCapitalize="none" />;
  const toggle = (key: string, label: string, help?: string) => <ControlToggle key={key} label={label} help={help} value={flag(key)} onChange={value => set(key, value)} />;
  const choices = (key: string, label: string, options: { value: string; label: string }[], help?: string) => <ControlChoices key={key} label={label} help={help} value={text(key)} options={options} onChange={value => set(key, value)} />;
  const accounts = [{ value: '', label: 'A informar' }, ...state.accounts.filter(row => !row.cancelled || row.id === text('accountId')).map(row => ({ value: row.id, label: row.name }))];
  const cards = [{ value: '', label: 'Escolher cartão' }, ...state.cards.filter(row => !row.cancelled || row.id === text('cardId')).map(row => ({ value: row.id, label: row.name }))];
  const bills = [{ value: '', label: 'Ainda não vinculada' }, ...state.bills.filter(row => !row.cancelled && (!text('cardId') || row.cardId === text('cardId'))).map(row => ({ value: row.id, label: `${state.cards.find(card => card.id === row.cardId)?.name ?? 'Cartão'} · ${row.month} · ${controlMoney(row.totalCents)}` }))];
  const categories = [{ value: '', label: 'Sem categoria' }, ...state.categories.filter(row => !row.cancelled).map(row => ({ value: row.id, label: row.name }))];
  const movement = collection === 'incomes' || collection === 'expenses';
  const amountLabel = collection === 'balanceObservations' ? 'Saldo da conta (R$)' : collection === 'forecasts' ? 'Total previsto dos cartões (R$)' : collection === 'bills' ? 'Total da fatura (R$)' : collection === 'purchases' ? 'Valor desta parcela (R$)' : 'Valor (R$)';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: 70 }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader back title={`${params.id ? 'Revisar' : 'Adicionar'} ${labels[collection].toLowerCase()}`} subtitle="Cada registro tem seu lugar no seu orçamento" />
      {!ready ? <Text style={s.help}>Abrindo seus registros…</Text> : <>
      {original.current?.source === 'BANK' && <View style={s.warning}><Text style={s.text}>Registro importado do banco</Text><Text style={s.help}>Prefira ajustar categoria e conferência. Os valores de origem podem ser atualizados na próxima consulta bancária.</Text></View>}
      {original.current?.parentId != null && <View style={s.notice}><Text style={s.help}>Esta é uma ocorrência da repetição mensal. Sua confirmação ou cancelamento vale apenas para este mês.</Text></View>}
      {['accounts', 'incomes', 'expenses', 'cards', 'purchases', 'categories'].includes(collection) && field('name', collection === 'accounts' ? 'Nome da conta' : collection === 'cards' ? 'Nome do cartão' : 'Descrição', 'Ex.: salário, mercado ou nome da instituição.')}
      {['balanceObservations', 'incomes', 'expenses', 'bills', 'purchases', 'payments', 'forecasts'].includes(collection) && field('amount', amountLabel, collection === 'purchases' ? 'Registre cada parcela pelo seu valor e vencimento. Não informe o total da compra em todas as parcelas.' : undefined, true)}
      {collection === 'balanceObservations' && <>
        {choices('accountId', 'De qual conta?', accounts)}
        {!state.accounts.some(row => !row.cancelled) && <Button title="Cadastrar conta primeiro" variant="secondary" onPress={() => router.replace('/finance-entry?kind=account')} />}
        {toggle('negative', 'Minha conta está com saldo negativo')}
        {field('observedAt', 'Data e hora deste saldo', 'Formato: ano-mês-diaThora:minuto. Consulte o saldo atual no banco antes de confirmar.')}
        {toggle('confirmed', 'Conferi o saldo no banco', 'O saldo é uma referência da conta nesta data e hora. Lançamentos anteriores não serão somados novamente.')}
      </>}
      {movement && <>
        {choices('kind', 'Tipo de lançamento', collection === 'incomes' ? [{ value: 'SALARY', label: 'Salário' }, { value: 'THIRTEENTH', label: '13º salário' }, { value: 'EXTRA', label: 'Outra receita' }, { value: 'TRANSFER', label: 'Transferência própria' }] : [{ value: 'EXPENSE', label: 'Despesa' }, { value: 'TRANSFER', label: 'Transferência própria' }, { value: 'INVESTMENT', label: 'Saída para investir' }])}
        {text('kind') === 'TRANSFER' && <Text style={s.help}>Transferências próprias não contam como receita ou despesa. Atualize os saldos das contas de origem e destino para refletir a movimentação.</Text>}
        {collection === 'expenses' && choices('paymentMethod', 'Como será pago?', [{ value: 'CASH', label: 'Saldo da conta' }, { value: 'CARD', label: 'Cartão de crédito' }])}
        {choices('status', collection === 'incomes' ? 'Você já recebeu?' : text('paymentMethod') === 'CARD' ? 'Situação do compromisso' : 'Você já pagou?', [{ value: 'EXPECTED', label: 'Ainda previsto' }, ...(text('paymentMethod') === 'CARD' && collection === 'expenses' ? [] : [{ value: 'SETTLED', label: collection === 'incomes' ? 'Recebi de verdade' : 'Já paguei' }])])}
        {text('status') === 'SETTLED' && field('settledDate', collection === 'incomes' ? 'Data do recebimento' : 'Data do pagamento', 'Formato: ano-mês-dia. Registre somente o que já ocorreu.')}
        {field('dueDate', collection === 'incomes' ? 'Data prevista para receber' : 'Data de vencimento', 'Formato: ano-mês-dia.')}
        {choices('accountId', collection === 'incomes' ? 'Conta de recebimento' : 'Conta do pagamento', accounts)}
        {text('paymentMethod') === 'CARD' && collection === 'expenses' && <>
          {choices('billId', 'Já está incluída em qual fatura?', bills, 'Não haverá uma segunda saída de caixa. O dinheiro sai quando você registra o pagamento da fatura.')}
          <Text style={s.help}>Para acompanhar cada parcela, use Compra ou parcela. A fatura continua sendo o compromisso de pagamento.</Text>
        </>}
        {choices('categoryId', 'Categoria', categories)}
        {collection === 'expenses' && toggle('essential', 'É uma despesa essencial', 'Usada para recalcular a meta da reserva, sem somar a fatura novamente.')}
        {choices('recurrence', 'Repetição', [{ value: 'NONE', label: 'Somente esta vez' }, { value: 'MONTHLY', label: 'Todo mês' }], 'As próximas ocorrências permanecem previstas até você confirmar cada uma.')}
        {text('recurrence') === 'MONTHLY' && field('recurrenceEnd', 'Última data da repetição (opcional)', 'Deixe vazio para continuar. Se o dia não existir, será usado o último dia do mês.')}
        {text('kind') === 'INVESTMENT' && <View style={s.notice}><Text style={s.help}>Esta saída acompanha o caixa. Registre o investimento realizado também na Carteira para atualizar seu patrimônio; o orçamento não cria uma posição automaticamente.</Text></View>}
        {text('status') === 'SETTLED' && text('paymentMethod') !== 'CARD' && toggle('affectsCash', 'Atualizar o caixa após o saldo de referência', 'Desative se o saldo confirmado da conta já inclui esta movimentação. Lançamentos anteriores ao saldo não são reaplicados.')}
      </>}
      {collection === 'cards' && <>
        {field('limit', 'Limite total (R$)', 'Opcional. Deixe vazio quando não souber.', true)}
        {field('usedLimit', 'Limite utilizado (R$)', 'Já inclui compras e parcelas. Não será adicionado às faturas.', true)}
        {field('dueDay', 'Dia habitual de vencimento (opcional)', 'Um número entre 1 e 31. A data de cada fatura pode ser ajustada.')}
      </>}
      {(collection === 'bills' || collection === 'purchases') && choices('cardId', 'Qual cartão?', cards)}
      {(collection === 'bills' || collection === 'purchases') && !state.cards.some(row => !row.cancelled) && <Button title="Cadastrar cartão primeiro" variant="secondary" onPress={() => router.replace('/finance-entry?kind=card')} />}
      {(collection === 'bills' || collection === 'forecasts') && field('month', 'Mês da fatura', 'Formato: ano-mês, por exemplo 2026-11.')}
      {collection === 'bills' && <>{field('dueDate', 'Vencimento desta fatura', 'Formato: ano-mês-dia.')}{toggle('includesRecurring', 'O total já inclui despesas recorrentes')}{toggle('paymentStatusKnown', 'Conferi a situação de pagamento desta fatura', 'O valor informado pelo banco não comprova que a fatura continua em aberto. Confira pagamentos já realizados antes de confirmar.')}</>}
      {collection === 'purchases' && <>
        {field('purchaseDate', 'Data da compra', 'Formato: ano-mês-dia.')}
        {field('dueDate', 'Vencimento desta parcela', 'Formato: ano-mês-dia.')}
        {field('installmentNumber', 'Número desta parcela')}{field('totalInstallments', 'Quantidade total de parcelas')}
        {choices('billId', 'Esta parcela já está incluída em uma fatura?', bills, 'Vincule para não somar a parcela e a fatura novamente.')}
        {choices('categoryId', 'Categoria da compra', categories)}
      </>}
      {collection === 'payments' && <>
        {choices('billId', 'Qual fatura está sendo paga?', bills)}
        {choices('accountId', 'Conta de onde saiu o dinheiro', accounts)}
        {field('paidDate', 'Data do pagamento realizado', 'Formato: ano-mês-dia.')}
        {toggle('confirmed', 'Confirmo que este pagamento já ocorreu', 'Pode ser um pagamento parcial. A fatura mantém o saldo restante.')}
        {toggle('affectsCash', 'Atualizar o caixa após o saldo de referência', 'Desative se o saldo confirmado da conta já inclui este pagamento.')}
      </>}
      {collection === 'forecasts' && <>
        <View style={s.notice}><Text style={s.help}>Informe o total combinado. Faturas identificadas ocuparão sua parte nesta previsão, sem duplicação. Uma previsão não cria parcelas nem pagamentos.</Text></View>
        <Text style={s.label}>Quais cartões estão incluídos?</Text>
        <Text style={s.help}>Sem seleção significa todos os cartões. Não crie previsões sobrepostas no mesmo mês.</Text>
        {state.cards.filter(row => !row.cancelled).map(card => <ControlToggle key={card.id} label={card.name} value={text('cardIds').split('|').includes(card.id)} onChange={checked => set('cardIds', checked ? [...text('cardIds').split('|').filter(Boolean), card.id].join('|') : text('cardIds').split('|').filter(id => id !== card.id).join('|'))} />)}
        {toggle('includesRecurring', 'O total já inclui despesas recorrentes')}
        {toggle('compositionReviewed', 'Conferi a composição e os valores desta previsão', 'Antes de confirmar, verifique se as recorrências dos cartões continuam cabendo no total de cada mês. A previsão continua sendo uma estimativa.')}
      </>}
      {collection === 'categories' && <>{field('budget', 'Orçamento mensal (R$)', 'Opcional. Usado para acompanhar os gastos desta categoria.', true)}{toggle('essential', 'Esta categoria é essencial', 'Despesas classificadas aqui entram na base da reserva.')}</>}
      {(movement && text('status') !== 'SETTLED' || collection === 'bills' || collection === 'purchases') && choices('verification', 'Você conferiu o valor?', [{ value: 'ESTIMATED', label: 'É uma estimativa' }, { value: 'CONFIRMED', label: 'Valor conferido' }])}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {review ? <Card style={{ gap: 14, backgroundColor: '#EDF3EF' }}>
        <Text style={s.heading}>Tudo certo para salvar?</Text>
        <Text style={s.text}>{String(review.name ?? labels[collection])}</Text>
        {typeof (review.amountCents ?? review.totalCents ?? review.balanceCents) === 'number' && <Text style={s.heading}>{controlMoney(Number(review.amountCents ?? review.totalCents ?? review.balanceCents))}</Text>}
        {!!(review.dueDate ?? review.paidDate) && <Text style={s.help}>Data: {controlDateLabel(String(review.dueDate ?? review.paidDate))}</Text>}
        <Text style={s.help}>Este registro atualiza seu acompanhamento. Ele não executa pagamento, transferência nem compra no banco.</Text>
        <Button disabled={busy} title={busy ? 'Salvando…' : 'Confirmar e salvar'} onPress={() => void persist()} />
        <Button disabled={busy} title="Continuar editando" variant="secondary" onPress={() => setReview(null)} />
      </Card> : <Button title="Revisar registro" disabled={busy || !initialized.current || (!!params.id && !original.current)} onPress={prepare} />}
      {!!params.id && original.current && !original.current.cancelled && <>
        {cancelReview ? <View style={[s.warning, { gap: 12 }]}><Text style={s.text}>Cancelar este registro?</Text><Text style={s.help}>Ele sairá dos cálculos. O histórico será preservado. Uma repetição mensal cancelada deixa de gerar próximas ocorrências.</Text><Button title="Confirmar cancelamento" variant="danger" disabled={busy} onPress={() => void persist(true)} /><Button title="Manter registro" variant="secondary" disabled={busy} onPress={() => setCancelReview(false)} /></View> : <Button title="Cancelar este registro" variant="secondary" disabled={busy} onPress={() => { setReview(null); setCancelReview(true); }} />}
      </>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
