import { useState } from 'react';
import { Text, View } from 'react-native';
import type { ControlState } from '@arca/domain';
import { ControlChoices, ControlField, controlDateLabel, controlMoney, controlStyles as s } from '@/components/ControlUI';
import { Button, Card } from '@/components/ui';

export type ControlBankTransaction = { id: string; accountId: string; accountKind: 'BANK' | 'CREDIT'; description: string; amountCents: number; date: string;
  status: 'PENDING' | 'POSTED'; direction: 'CREDIT' | 'DEBIT'; kind: 'CASH_IN' | 'CASH_OUT' | 'OWN_TRANSFER' | 'INVESTMENT_TRANSFER' | 'CARD_PAYMENT' | 'CARD_PURCHASE' | 'CARD_REFUND' | 'CARD_CREDIT'; billId: string | null };
export type BankTransactionDecision = { transactionId: string; collection: 'incomes' | 'expenses' | 'payments' | 'purchases' | 'IGNORE'; entityId?: string; billId?: string; accountId?: string };
export type ControlBankReviewData = { bank: null | { syncedAt: string;
  accounts: { id: string; name: string; balanceCents: number | null; observedAt: string }[];
  cards: { id: string; name: string; limitCents: number | null; usedLimitCents: number | null }[];
  bills: { id: string; cardId: string; dueDate: string; totalCents: number }[];
  connections: { id: string; institution: string; status: string; updatedAt: string | null }[] };
  pendingLinks: { sourceId: string; kind: 'ACCOUNT' | 'CARD'; name: string; candidateIds: string[] }[];
  pendingTransactions: ControlBankTransaction[]; warnings: string[] };

const kinds: Record<ControlBankTransaction['kind'], string> = { CASH_IN: 'Entrada', CASH_OUT: 'Saída', OWN_TRANSFER: 'Transferência entre contas',
  INVESTMENT_TRANSFER: 'Movimentação de investimento', CARD_PAYMENT: 'Possível pagamento de fatura', CARD_PURCHASE: 'Compra no cartão', CARD_REFUND: 'Estorno', CARD_CREDIT: 'Crédito no cartão' };
export function ControlBankTransactionReview({ transaction: tx, state, busy, onConfirm }: { transaction: ControlBankTransaction; state: ControlState; busy: boolean; onConfirm: (decision: BankTransactionDecision) => Promise<void> }) {
  const [collection, setCollection] = useState<BankTransactionDecision['collection'] | ''>('');
  const [entity, setEntity] = useState(''); const [bill, setBill] = useState(''); const [account, setAccount] = useState('');
  const [query, setQuery] = useState(''); const [limit, setLimit] = useState(20);
  const [confirming, setConfirming] = useState(false); const [error, setError] = useState('');
  const eligible = tx.status === 'POSTED' && !['OWN_TRANSFER', 'CARD_REFUND', 'CARD_CREDIT'].includes(tx.kind);
  const options: { value: BankTransactionDecision['collection']; label: string }[] = [
    ...(eligible && tx.accountKind === 'BANK' && tx.kind !== 'CARD_PAYMENT' ? [{ value: tx.direction === 'CREDIT' ? 'incomes' as const : 'expenses' as const, label: tx.direction === 'CREDIT' ? 'Conciliar receita' : 'Conciliar despesa' }] : []),
    ...(eligible && tx.direction === 'DEBIT' && ['CARD_PAYMENT', 'CASH_OUT'].includes(tx.kind) ? [{ value: 'payments' as const, label: 'Pagamento de fatura' }] : []),
    ...(eligible && tx.kind === 'CARD_PURCHASE' ? [{ value: 'purchases' as const, label: 'Compra ou parcela' }] : []),
    { value: 'IGNORE', label: 'Não registrar este movimento' },
  ];
  const rows = collection && collection !== 'IGNORE' ? state[collection].filter(row => !row.cancelled && row.source !== 'BANK') : [];
  const matches = rows.filter(row => {
    const text = 'name' in row ? row.name : 'billId' in row ? state.cards.find(card => card.id === state.bills.find(b => b.id === row.billId)?.cardId)?.name ?? 'Pagamento' : '';
    return query ? text.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) : row.amountCents === tx.amountCents;
  });
  const needsBill = collection === 'payments' || collection === 'purchases';
  const needsAccount = collection !== '' && collection !== 'IGNORE' && collection !== 'purchases';
  const valid = !!collection && (collection === 'IGNORE' || ((entity === 'new' || rows.some(row => row.id === entity)) && (!needsBill || !!bill) && (!needsAccount || !!account)));
  const recordLabel = (row: typeof rows[number]) => {
    const title = 'name' in row ? row.name : 'Pagamento de fatura';
    return `${title} · ${controlMoney(row.amountCents)}`;
  };
  function choose(value: BankTransactionDecision['collection']) { setCollection(value); setEntity(''); setBill(''); setAccount(''); setConfirming(false); setError(''); }
  async function confirm() {
    if (!valid || busy) return; setError('');
    try { await onConfirm({ transactionId: tx.id, collection: collection as BankTransactionDecision['collection'],
      ...(entity && entity !== 'new' ? { entityId: entity } : {}), ...(bill ? { billId: bill } : {}), ...(account ? { accountId: account } : {}) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível conciliar. Atualize os dados e tente novamente.'); }
  }
  return <Card><Text style={s.label}>{tx.description}</Text><Text style={s.heading}>{controlMoney(tx.amountCents)}</Text>
    <Text style={[s.help, { marginVertical: 12 }]}>{controlDateLabel(tx.date)} · {kinds[tx.kind]} · {tx.status === 'POSTED' ? 'Informado pelo banco' : 'Pendente no banco'}</Text>
    <Text style={[s.help, { marginBottom: 12 }]}>O histórico explica um saldo já informado. Conciliar não soma nem desconta esse valor outra vez do saldo bancário.</Text>
    {!eligible && <Text style={[s.help, { marginBottom: 12 }]}>Este movimento exige conferência manual. Pendente não significa realizado; transferência, estorno e crédito de cartão não são novas receitas ou despesas.</Text>}
    <ControlChoices<BankTransactionDecision['collection'] | ''> label="O que este movimento representa?" value={collection} options={options} onChange={value => { if (value) choose(value); }} />
    {!!collection && collection !== 'IGNORE' && <>
      <ControlField label="Buscar um registro existente" value={query} onChangeText={value => { setQuery(value); setLimit(20); }} help="Sem busca, mostramos os registros com o mesmo valor. Confira datas e origem antes de vincular." />
      <ControlChoices label="Vincular ou criar" value={entity} options={[{ value: 'new', label: 'Criar novo registro' }, ...matches.slice(0, limit).map(row => ({ value: row.id, label: recordLabel(row) }))]}
        onChange={value => { setEntity(value); setConfirming(false); const row = rows.find(item => item.id === value); if (row && 'billId' in row && row.billId) setBill(row.billId); }} />
      {matches.length > limit && <Button title="Mostrar mais registros" variant="secondary" onPress={() => setLimit(previous => previous + 20)} />}
      {needsBill && <ControlChoices label="Qual fatura?" value={bill} options={state.bills.filter(row => !row.cancelled).map(row => ({ value: row.id,
        label: `${state.cards.find(card => card.id === row.cardId)?.name ?? 'Cartão'} · ${controlDateLabel(row.dueDate)} · ${controlMoney(row.totalCents)}` }))} onChange={value => { setBill(value); setConfirming(false); }}
        help="Escolha a fatura que este movimento realmente paga ou integra. O mês informado pelo banco pode ser diferente." />}
      {needsAccount && <ControlChoices label="Conta bancária do movimento" value={account} options={state.accounts.filter(row => !row.cancelled).map(row => ({ value: row.id, label: row.name }))} onChange={value => { setAccount(value); setConfirming(false); }} />}
    </>}
    {collection === 'IGNORE' && <Text style={[s.help, { marginBottom: 12 }]}>Você confirma que este movimento não deve gerar outro registro. A decisão fica salva para não reaparecer como pendência.</Text>}
    {confirming ? <View style={s.warning}><Text style={s.text}>{collection === 'IGNORE' ? 'Confirmar que não será registrado?' : `${entity === 'new' ? 'Criar um registro' : 'Atualizar o registro escolhido'} com ${controlMoney(tx.amountCents)}, na data ${controlDateLabel(tx.date)}?`}</Text>
      <Button title="Confirmar conciliação" disabled={busy || !valid} onPress={() => void confirm()} /><Button title="Continuar conferindo" variant="secondary" disabled={busy} onPress={() => setConfirming(false)} /></View>
      : <Button title="Revisar esta decisão" variant="secondary" disabled={busy || !valid} onPress={() => setConfirming(true)} />}
    {!!error && <Text style={[s.error, { marginTop: 12 }]}>{error}</Text>}
  </Card>;
}
