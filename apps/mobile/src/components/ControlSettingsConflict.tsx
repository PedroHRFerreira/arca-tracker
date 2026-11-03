import { useState } from 'react';
import { Text, View } from 'react-native';
import { calculateControlSummary, localDateString, type ControlState } from '@arca/domain';
import { Button, Card } from '@/components/ui';
import { controlMoney, controlStyles as s } from '@/components/ControlUI';

const names = { incomes: 'Receitas', expenses: 'Despesas', bills: 'Faturas', accounts: 'Contas', cards: 'Cartões',
  purchases: 'Compras e parcelas', payments: 'Pagamentos', forecasts: 'Previsões', balanceObservations: 'Saldos', categories: 'Categorias' } as const;
function describe(row: Record<string, unknown>) {
  const cents = row.amountCents ?? row.totalCents ?? row.balanceCents;
  return [row.name ?? row.month ?? 'Registro', typeof cents === 'number' ? controlMoney(cents) : '', row.dueDate ?? row.paidDate ?? '',
    typeof row.limitCents === 'number' ? `Limite ${controlMoney(row.limitCents)}` : '',
    typeof row.usedLimitCents === 'number' ? `Utilizado ${controlMoney(row.usedLimitCents)}` : '',
    typeof row.budgetCents === 'number' ? `Orçamento ${controlMoney(row.budgetCents)}` : '',
    typeof row.installmentNumber === 'number' ? `Parcela ${row.installmentNumber}/${row.totalInstallments}` : '',
    row.compositionReviewed === true ? 'Composição conferida' : row.compositionReviewed === false ? 'Composição pendente' : '',
    row.cancelled ? 'Cancelado' : row.status === 'SETTLED' ? 'Confirmado como realizado' : row.status === 'EXPECTED' ? 'Previsto' : ''].filter(Boolean).join(' · ');
}
export function ControlSettingsConflict({ local, remote, busy, onResolve }: { local: ControlState; remote: ControlState; busy: boolean; onResolve: (choice: 'LOCAL' | 'REMOTE') => Promise<void> }) {
  const [choice, setChoice] = useState<'LOCAL' | 'REMOTE' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const differences = Object.entries(names).flatMap(([collection, label]) => {
    const key = collection as keyof typeof names;
    const ids = new Set([...local[key].map(row => row.id), ...remote[key].map(row => row.id)]);
    return [...ids].flatMap(id => {
      const here = local[key].find(row => row.id === id); const online = remote[key].find(row => row.id === id);
      return JSON.stringify(here) === JSON.stringify(online) ? [] : [{ id: `${key}:${id}`, label,
        local: here ? describe(here) : 'Ausente nesta versão', remote: online ? describe(online) : 'Ausente nesta versão' }];
    });
  });
  const localSummary = calculateControlSummary(local, localDateString()); const remoteSummary = calculateControlSummary(remote, localDateString());
  return <Card><Text style={s.heading}>Revise as duas versões</Text>
    <Text style={[s.help, { marginVertical: 14 }]}>O aparelho e a base online têm alterações diferentes. Escolher uma versão substitui a outra. Confira receitas, faturas e demais diferenças antes de continuar.</Text>
    {[{ title: 'Neste aparelho', state: local, summary: localSummary }, { title: 'Online', state: remote, summary: remoteSummary }].map(item => <View key={item.title} style={[s.notice, { marginBottom: 12 }]}>
      <Text style={s.label}>{item.title} · revisão {item.state.revision}</Text>
      <Text style={s.text}>Saldo: {controlMoney(item.summary.bankBalanceCents)}</Text>
      <Text style={s.text}>Salário configurado: {controlMoney(item.state.settings.salaryAmountCents)}</Text>
      <Text style={s.text}>Receitas: {item.state.incomes.filter(row => !row.cancelled).length} · Faturas: {item.state.bills.filter(row => !row.cancelled).length}</Text>
      <Text style={s.text}>Faturas a pagar: {controlMoney(item.summary.unpaidBillsCents)}</Text>
    </View>)}
    {differences.slice(0, showAll ? differences.length : 12).map(row => <View key={row.id} style={s.row}><Text style={s.label}>{row.label}</Text>
      <Text style={[s.help, { width: '100%' }]}>Aparelho: {row.local}</Text><Text style={[s.help, { width: '100%' }]}>Online: {row.remote}</Text></View>)}
    {differences.length > 12 && !showAll && <Button title={`Ver todas as ${differences.length} diferenças`} variant="secondary" onPress={() => setShowAll(true)} />}
    {JSON.stringify(local.settings) !== JSON.stringify(remote.settings) && <Text style={[s.help, { marginVertical: 12 }]}>As configurações também diferem. A versão escolhida define calendário, margem, reserva, revisões e alertas.</Text>}
    {JSON.stringify(local.portfolio) !== JSON.stringify(remote.portfolio) && <Text style={[s.help, { marginVertical: 12 }]}>O resumo de investimentos também difere. A carteira registrada no aparelho permanece preservada.</Text>}
    <View style={{ gap: 12, marginTop: 18 }}>
      <Button title="Usar versão online neste aparelho" variant="secondary" disabled={busy} onPress={() => setChoice('REMOTE')} />
      <Button title="Substituir online pela versão do aparelho" variant="secondary" disabled={busy} onPress={() => setChoice('LOCAL')} />
      {!!choice && <View style={s.warning}><Text style={s.text}>{choice === 'LOCAL' ? 'Substituir os registros online pelos deste aparelho?' : 'Descartar alterações locais e usar os registros online?'}</Text>
        <Button title="Conferi as diferenças e confirmo" disabled={busy} onPress={() => { setError(''); void onResolve(choice).catch(cause => setError(cause instanceof Error ? cause.message : 'Atualize e tente novamente.')); }} />
        <Button title="Continuar conferindo" variant="secondary" disabled={busy} onPress={() => setChoice(null)} /></View>}
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  </Card>;
}
