import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useControl } from '@/providers/useControl';
import { controlRequest } from '@/api/control';
import { loadControlBundle } from '@/db/control';
import { ControlBankTransactionReview, type BankTransactionDecision, type ControlBankReviewData } from '@/components/ControlBankReview';
import { ControlChoices, ControlRow, ControlToggle, controlDateLabel, controlMoney, controlStyles as s } from '@/components/ControlUI';
import { Button, Card, ScreenHeader } from '@/components/ui';
import { colors } from '@/theme';

export default function FinanceBanks() {
  const control = useControl();
  const [review, setReview] = useState<ControlBankReviewData | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [accountLinks, setAccountLinks] = useState<Record<string, string>>({}); const [cardLinks, setCardLinks] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false); const [limit, setLimit] = useState(10); const [billLimit, setBillLimit] = useState(12);
  const working = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function readReview() {
    const next = await controlRequest<ControlBankReviewData>('banks/review');
    if (mounted.current) { setReview(next); setChecked(false); setAccountLinks({}); setCardLinks({}); }
  }
  async function perform(action: () => Promise<void>) {
    if (working.current) return; working.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error && cause.message === 'CONTROL_CONFLICT' ? 'Os dados online mudaram. Sincronize e revise novamente antes de confirmar.' : cause instanceof Error ? cause.message : 'Não foi possível consultar agora. Seus registros foram preservados.'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { void perform(async () => { await control.sync(); await readReview(); }); }, []);
  const disabled = busy || control.busy || !!control.conflict;
  const allLinks = review?.pendingLinks.every(link => !!(link.kind === 'ACCOUNT' ? accountLinks : cardLinks)[link.sourceId]) ?? false;
  async function apply() {
    await perform(async () => {
      await control.sync(); const current = await loadControlBundle();
      await controlRequest('banks/apply', { baseRevision: current.state.revision, accountLinks, cardLinks });
      await control.sync(); await readReview(); setMessage('Saldos e faturas conferidos foram aplicados. Revise os movimentos pendentes abaixo.');
    });
  }
  async function reconcile(decision: BankTransactionDecision) {
    // Each decision is serialized and the freshest accepted revision is used after synchronization.
    if (working.current) throw new Error('Uma atualização está em andamento. Aguarde.');
    working.current = true; setBusy(true); setError('');
    try {
      await control.sync(); const current = await loadControlBundle();
      await controlRequest('banks/transaction', { ...decision, baseRevision: current.state.revision });
      await control.sync(); await readReview(); setMessage('Decisão registrada. O valor não foi reaplicado sobre o saldo bancário.');
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader back title="Conferir meus bancos" subtitle="Traga os dados disponíveis, sem duplicar seus registros" />
    <Card><Text style={s.heading}>Consulta e conciliação</Text><Text style={[s.help, { marginVertical: 14 }]}>Primeiro confira contas, cartões e faturas. Depois vincule cada movimento ao que você já registrou ou crie um novo lançamento. Dados ausentes não significam saldo zero.</Text>
      <View style={{ gap: 12 }}><Button title={busy ? 'Consultando…' : 'Buscar atualização dos bancos'} disabled={disabled} onPress={() => void perform(async () => { await control.refreshBanks(); await readReview(); })} />
        <Button title="Configurar acesso em Meus bancos" variant="secondary" disabled={busy} onPress={() => router.push('/banks')} /></View>
    </Card>
    {busy && <ActivityIndicator color={colors.primary} accessibilityLabel="Atualizando revisão bancária" />}
    {!!(error || control.error) && <Text accessibilityRole="alert" style={s.error}>{error || control.error}</Text>}
    {!!message && <View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.text}>{message}</Text></View>}
    {!!control.conflict && <Card><Text style={s.label}>Há duas versões para revisar</Text><Text style={[s.help, { marginBottom: 14 }]}>Resolva as diferenças entre o aparelho e a base online antes de aplicar dados bancários.</Text><Button title="Revisar versões" onPress={() => router.push('/finance-settings')} /></Card>}
    {review && !review.bank && <Card><Text style={s.label}>Ainda não há uma consulta para conferir</Text><Text style={s.help}>Use “Buscar atualização dos bancos”. Se a integração não fornecer um cartão, mantenha seu cadastro manual em Finanças.</Text></Card>}
    {!!review?.bank && <>
      <Card><Text style={s.heading}>Dados retornados</Text><Text style={[s.help, { marginVertical: 12 }]}>Consulta: {new Date(review.bank.syncedAt).toLocaleString('pt-BR')}</Text>
        {review.bank.connections.map(connection => <ControlRow key={connection.id} title={connection.institution === 'NUBANK' ? 'Nubank' : connection.institution === 'MERCADO_PAGO' ? 'Mercado Pago' : connection.institution}
          detail={connection.status === 'UPDATED' ? 'Consulta disponível' : connection.status === 'LOGIN_REQUIRED' ? 'Autorize novamente no Meu Pluggy' : connection.status === 'UPDATING' ? 'Atualização em andamento' : 'Não foi possível atualizar'}
          hint={connection.updatedAt ? `Atualizado no banco: ${new Date(connection.updatedAt).toLocaleString('pt-BR')}` : 'Data de atualização não informada'} warning={connection.status !== 'UPDATED'} />)}
        {review.bank.accounts.map(account => <ControlRow key={account.id} title={account.name} amount={account.balanceCents === null ? 'Não informado' : controlMoney(account.balanceCents)} detail={`Saldo observado em ${new Date(account.observedAt).toLocaleString('pt-BR')}`} />)}
        {review.bank.cards.map(card => <ControlRow key={card.id} title={card.name} detail={`Limite total: ${card.limitCents === null ? 'não informado' : controlMoney(card.limitCents)}`} hint={`Limite utilizado: ${card.usedLimitCents === null ? 'não informado' : controlMoney(card.usedLimitCents)}. Não é saldo nem uma nova fatura.`} />)}
        {review.bank.cards.length === 0 && <Text style={s.help}>Nenhum cartão foi informado nesta consulta. Continue com o cadastro manual.</Text>}
      </Card>
      <Card><Text style={s.heading}>Faturas disponíveis</Text>
        {review.bank.bills.length === 0 && <Text style={[s.help, { marginTop: 12 }]}>Sem faturas disponíveis. Mantenha as previsões e os registros manuais; isso não significa que não há valores a pagar.</Text>}
        {review.bank.bills.slice(0, billLimit).map(bill => <ControlRow key={bill.id} title={review.bank!.cards.find(card => card.id === bill.cardId)?.name ?? 'Fatura'} detail={`Vencimento ${controlDateLabel(bill.dueDate)}`} amount={controlMoney(bill.totalCents)} hint="Fatura informada não comprova pagamento." />)}
        {review.bank.bills.length > billLimit && <Button title="Mostrar mais faturas" variant="secondary" onPress={() => setBillLimit(value => value + 12)} />}
      </Card>
      {!!review.pendingLinks.length && <Card><Text style={s.heading}>Evite cadastros repetidos</Text><Text style={[s.help, { marginVertical: 14 }]}>O banco pode estar informando uma conta ou cartão que você já cadastrou. Escolha o registro correspondente; crie outro apenas se forem diferentes.</Text>
        {review.pendingLinks.map(link => <ControlChoices key={link.sourceId} label={link.name} value={(link.kind === 'ACCOUNT' ? accountLinks : cardLinks)[link.sourceId] ?? ''}
          options={[...link.candidateIds.map(id => ({ value: id, label: (link.kind === 'ACCOUNT' ? control.state.accounts : control.state.cards).find(row => row.id === id)?.name ?? 'Cadastro existente' })), { value: 'new', label: link.kind === 'ACCOUNT' ? 'É uma nova conta' : 'É um novo cartão' }]}
          onChange={value => { (link.kind === 'ACCOUNT' ? setAccountLinks : setCardLinks)(previous => ({ ...previous, [link.sourceId]: value })); setChecked(false); }} />)}
      </Card>}
      <Card><ControlToggle label="Conferi contas, saldos, cartões e faturas" help="Autorizo aplicar os dados disponíveis e os vínculos escolhidos. Previsões futuras e movimentos pendentes continuam sujeitos à revisão." value={checked} onChange={setChecked} />
        <Button title="Aplicar saldos e faturas revisados" disabled={disabled || !checked || !allLinks} onPress={() => void apply()} /></Card>
      {!!review.pendingTransactions.length && <><View><Text style={s.heading}>Movimentos para conferir</Text><Text style={s.help}>{review.pendingTransactions.length} pendências. Compras no cartão são compromissos; o pagamento liquida a fatura sem criar outra despesa.</Text></View>
        {review.pendingTransactions.slice(0, limit).map(transaction => <ControlBankTransactionReview key={transaction.id} transaction={transaction} state={control.state} busy={disabled} onConfirm={reconcile} />)}
        {review.pendingTransactions.length > limit && <Button title="Mostrar mais movimentos" variant="secondary" disabled={disabled} onPress={() => setLimit(value => value + 10)} />}
      </>}
    </>}
    {!!review?.warnings.length && <Card><Text style={[s.heading, { marginBottom: 12 }]}>O que precisa de atenção</Text>{[...new Set(review.warnings)].map((warning, index) => <Text key={index} style={[s.help, { marginBottom: 10 }]}>{warning}</Text>)}</Card>}
  </ScrollView></SafeAreaView>;
}
