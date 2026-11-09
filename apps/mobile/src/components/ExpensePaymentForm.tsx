import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ControlDateSchema, type ControlExpense, type ControlState } from '@arca/domain';
import { Button, Card, ScreenHeader } from '@/components/ui';
import { ControlChoices, ControlField, controlDateLabel, controlMoney, controlStyles as s } from '@/components/ControlUI';
import { expensePaymentReference, prepareExpensePayment } from '@/financePayments';
import { financeErrorMessage } from '@/financeValidation';
import { colors } from '@/theme';

export function ExpensePaymentForm({ state, expense, today, busy, onSave }: {
  state: ControlState; expense: ControlExpense; today: string; busy: boolean; onSave: (expense: ControlExpense) => Promise<void>;
}) {
  const initial = useRef(JSON.stringify(expense));
  const saving = useRef(false);
  const [amount, setAmount] = useState((expense.amountCents / 100).toFixed(2));
  const [paidDate, setPaidDate] = useState('');
  const [accountId, setAccountId] = useState(expense.accountId ?? '');
  const [included, setIncluded] = useState('');
  const [error, setError] = useState('');
  const changed = initial.current !== JSON.stringify(expense);
  const reference = ControlDateSchema.safeParse(paidDate).success ? expensePaymentReference(state, accountId, paidDate) : null;
  const yesterday = new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);
  const [customDate, setCustomDate] = useState(false);
  const chooseDate = (value: string) => { setCustomDate(value === 'OTHER'); setPaidDate(value === 'OTHER' ? '' : value); setIncluded(''); setError(''); };
  async function confirm() {
    if (saving.current || busy) return;
    saving.current = true; setError('');
    try {
      if (changed) throw new Error('Este gasto foi atualizado. Volte à lista para conferir a versão atual.');
      const paid = prepareExpensePayment(state, expense, { amount, paidDate, accountId,
        includedInBalance: included ? included === 'YES' : undefined }, today);
      await onSave(paid);
    } catch (cause) { setError(financeErrorMessage(cause, 'Confira o valor, a data e a conta do pagamento.')); }
    finally { saving.current = false; }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader back title="Confirmar pagamento" subtitle="Registre o que você já pagou" />
      <Card style={{ gap: 12 }}><Text style={s.heading}>{expense.name.replace(/\s*[—–-]\s*conferir vencimento$/i, '')}</Text>
        <Text style={s.help}>A confirmação vale para esta conta neste mês. Os próximos meses continuam previstos.</Text>
        <ControlField label="Quanto você pagou?" currency value={amount} onChangeText={setAmount} />
        <ControlChoices label="Quando você pagou?" value={customDate ? 'OTHER' : paidDate}
          options={[{ value: today, label: 'Hoje' }, { value: yesterdayDate, label: 'Ontem' }, { value: 'OTHER', label: 'Outra data' }]} onChange={chooseDate} />
        {customDate && <ControlField label="Data do pagamento" value={paidDate} onChangeText={value => { setPaidDate(value); setIncluded(''); }} placeholder="AAAA-MM-DD" help="Informe a data em que o dinheiro saiu da conta." autoCapitalize="none" />}
        {!!paidDate && ControlDateSchema.safeParse(paidDate).success && <Text style={s.help}>Pagamento em {controlDateLabel(paidDate)}.</Text>}
        <ControlChoices label="De qual conta saiu o dinheiro?" value={accountId} options={state.accounts.filter(row => !row.cancelled).map(row => ({ value: row.id, label: row.name }))}
          onChange={value => { setAccountId(value); setIncluded(''); }} />
        {reference?.sameDay && <View style={s.notice}><ControlChoices label={`O saldo de ${controlMoney(reference.anchor!.balanceCents)} já desconta este pagamento?`} value={included}
          options={[{ value: 'YES', label: 'Sim, já inclui' }, { value: 'NO', label: 'Ainda não' }]} onChange={setIncluded} />
          <Text style={s.help}>Isso evita descontar o pagamento duas vezes. Se ainda não inclui, o saldo precisará ser atualizado antes de confirmar uma sobra para investir.</Text></View>}
        {changed && <Text accessibilityRole="alert" style={s.error}>Este gasto foi atualizado. Volte à lista e confira antes de continuar.</Text>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Button title={busy ? 'Salvando…' : 'Confirmar que já paguei'} disabled={busy || changed} onPress={() => void confirm()} />
      </Card>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
