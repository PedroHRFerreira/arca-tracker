import { useState } from 'react';
import { Text, View } from 'react-native';
import { calculateControlSummary, ControlSettingsSchema, ControlDateSchema, controlSalaryDate, localDateString, parseMoneyInput, type ControlSettings, type ControlState } from '@arca/domain';
import { Button, Card } from '@/components/ui';
import { ControlChoices, ControlField, ControlToggle, controlDateLabel, controlMoney, controlStyles as s } from '@/components/ControlUI';

const amount = (value: string) => Math.round(Number(parseMoneyInput(value || '0')) * 100);
const display = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export function ControlSettingsForm({ state, busy, onSave, onReload }: { state: ControlState; busy: boolean; onSave: (settings: ControlSettings) => Promise<void>; onReload: () => void }) {
  const [settings, setSettings] = useState(state.settings);
  const [initial, setInitial] = useState(state.settings);
  const [salary, setSalary] = useState(display(settings.salaryAmountCents));
  const [buffer, setBuffer] = useState(display(settings.bufferCents));
  const [desired, setDesired] = useState(display(settings.desiredContributionCents));
  const [essential, setEssential] = useState(display(settings.essentialExpensesCents));
  const [holidays, setHolidays] = useState(settings.holidays.join('\n'));
  const [override, setOverride] = useState(settings.nextSalaryOverride ?? '');
  const [fixedDay, setFixedDay] = useState(String(settings.salaryFixedDay));
  const [months, setMonths] = useState(String(settings.reserveMonths));
  const [error, setError] = useState('');
  const [confirmActivation, setConfirmActivation] = useState(false);
  const signature = ({ alerts: _alerts, ...value }: ControlSettings) => JSON.stringify(value);
  const settingsChanged = signature(initial) !== signature(state.settings);
  const set = <K extends keyof ControlSettings>(key: K, value: ControlSettings[K]) => { setSettings(previous => ({ ...previous, [key]: value })); setConfirmActivation(false); };
  function reviewedSettings() {
    const dates = holidays.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
    dates.forEach(value => ControlDateSchema.parse(value));
    return ControlSettingsSchema.parse({ ...settings, alerts: state.settings.alerts, salaryAmountCents: amount(salary), bufferCents: amount(buffer),
      desiredContributionCents: amount(desired), essentialExpensesCents: amount(essential), reserveMonths: Number(months),
      salaryFixedDay: Number(fixedDay), holidays: [...new Set(dates)], nextSalaryOverride: override.trim() || null });
  }
  async function save(activate = false, stop = false) {
    setError('');
    try {
      if (settingsChanged) throw new Error('As configurações foram atualizadas. Carregue os dados atuais antes de salvar.');
      const next = reviewedSettings();
      if (activate) {
        const summary = calculateControlSummary({ ...state, settings: next }, localDateString());
        if (summary.investmentCapacityCents === null || summary.investmentCapacityCents < next.desiredContributionCents || next.desiredContributionCents === 0)
          throw new Error('Seu orçamento ainda não confirma esse aporte. Confira as pendências em Finanças e revise o valor desejado.');
        next.activeContributionCents = next.desiredContributionCents;
      }
      if (stop) next.activeContributionCents = 0;
      await onSave(next); setSettings(next); setInitial(next); setConfirmActivation(false);
    } catch (cause) { setError(cause instanceof Error && !('issues' in cause) ? cause.message : 'Confira os valores, os dias e as datas no formato AAAA-MM-DD.'); }
  }
  let salaryDate: string | null = null;
  try { salaryDate = controlSalaryDate(reviewedSettings(), localDateString().slice(0, 7)); } catch { /* Field validation appears on save. */ }
  const other = settings.salaryMode !== 'BUSINESS_DAY';
  return <View style={{ gap: 20 }}>
    {settingsChanged && <View style={s.warning}><Text style={s.text}>As configurações foram atualizadas em outra operação. Confira a versão atual para continuar; os textos que você está editando serão substituídos.</Text><Button title="Carregar configurações atualizadas" variant="secondary" disabled={busy} onPress={onReload} /></View>}
    <Card>
      <Text style={s.heading}>Seu salário</Text>
      <Text style={[s.help, { marginVertical: 12 }]}>A data é uma previsão. Só registramos o recebimento quando você confirmar ou conciliar o depósito.</Text>
      <ControlField label="Salário líquido mensal" currency value={salary} onChangeText={value => { setSalary(value); setConfirmActivation(false); }} />
      <ControlChoices label="Quando costuma receber?" value={other ? 'OTHER' : String(settings.salaryBusinessDay)}
        options={[1, 2, 3, 4, 5].map(day => ({ value: String(day), label: `${day}º dia útil` })).concat([{ value: 'OTHER', label: 'Outro' }])}
        onChange={value => value === 'OTHER' ? set('salaryMode', 'FIXED_DAY') : setSettings(previous => ({ ...previous, salaryMode: 'BUSINESS_DAY', salaryBusinessDay: Number(value) }))} />
      {other && <><ControlChoices label="Tipo de data" value={settings.salaryMode} onChange={value => set('salaryMode', value)}
        options={[{ value: 'FIXED_DAY', label: 'Dia fixo' }, { value: 'MANUAL', label: 'Informar a cada mês' }]} />
        {settings.salaryMode === 'FIXED_DAY' && <ControlField label="Dia do mês (1 a 31)" value={fixedDay} onChangeText={setFixedDay} keyboardType="number-pad" />}</>}
      <Text style={[s.help, { marginBottom: 15 }]}>Sábados contam no calendário salarial; domingos e feriados nacionais ficam de fora. Ajuste abaixo os feriados locais e a data prevista conforme sua empresa.</Text>
      <ControlField label="Próximo salário: ajuste opcional" help="AAAA-MM-DD. Deixe vazio para usar o calendário; obrigatório quando informar a cada mês." placeholder="2026-12-05" value={override} onChangeText={setOverride} autoCapitalize="none" />
      <ControlField label="Feriados estaduais e municipais" help="Uma data AAAA-MM-DD por linha. Os feriados nacionais já são considerados." placeholder="AAAA-MM-DD" value={holidays} onChangeText={setHolidays} multiline autoCapitalize="none" />
      <Text style={s.text}>Previsão deste mês: {controlDateLabel(salaryDate)}</Text>
    </Card>
    <Card>
      <Text style={[s.heading, { marginBottom: 18 }]}>Um orçamento que cabe na vida</Text>
      <ControlField label="Margem mensal para imprevistos" currency value={buffer} onChangeText={setBuffer} help="Dinheiro protegido no orçamento. É separado da sua reserva investida." />
      <ControlField label="Despesas essenciais mensais" currency value={essential} onChangeText={setEssential} help="Usado como referência quando você ainda não detalhou as despesas essenciais em Finanças." />
      <ControlField label="Meses de cobertura da reserva" value={months} onChangeText={setMonths} keyboardType="number-pad" />
      <ControlField label="Quanto gostaria de aportar por mês?" currency value={desired} onChangeText={value => { setDesired(value); setConfirmActivation(false); }} />
      <Text style={s.text}>Aporte ativo: {controlMoney(state.settings.activeContributionCents)}</Text>
      <Text style={s.help}>Ativar cria um compromisso de planejamento. O ARCA não movimenta dinheiro nem compra investimentos.</Text>
    </Card>
    <Card>
      <Text style={[s.heading, { marginBottom: 16 }]}>Conferência do seu cadastro</Text>
      <ControlToggle label="Conferi meus saldos atuais" help="Confira as contas e as datas dos saldos em Finanças. Limite de cartão não é saldo." value={settings.cashConfirmed} onChange={value => set('cashConfirmed', value)} />
      <ControlToggle label="Conferi despesas e compromissos" help="Revise faturas, compras e despesas fora do cartão, sem registrar a mesma conta duas vezes. As previsões também têm conferência própria." value={settings.obligationsReviewed} onChange={value => set('obligationsReviewed', value)} />
      <ControlToggle label="Revisei as informações do planejamento" help="Confirme salário, datas, margem e objetivos acima. Você pode corrigir depois." value={settings.reviewed} onChange={value => set('reviewed', value)} />
      {!!error && <Text accessibilityRole="alert" style={[s.error, { marginBottom: 12 }]}>{error}</Text>}
      <Button title={busy ? 'Salvando…' : 'Salvar minhas configurações'} disabled={busy || settingsChanged} onPress={() => void save()} />
      <View style={{ height: 12 }} />
      {confirmActivation ? <View style={s.notice}><Text style={s.text}>Confirma ativar o aporte desejado? O orçamento será conferido novamente antes de salvar.</Text>
        <Button title="Conferir orçamento e ativar" disabled={busy} onPress={() => void save(true)} />
        <Button title="Voltar à revisão" variant="secondary" disabled={busy} onPress={() => setConfirmActivation(false)} /></View>
        : <Button title="Revisar e ativar aporte mensal" variant="secondary" disabled={busy} onPress={() => setConfirmActivation(true)} />}
      {state.settings.activeContributionCents > 0 && <View style={{ marginTop: 12 }}><Button title="Desativar aporte recorrente" variant="secondary" disabled={busy} onPress={() => void save(false, true)} /></View>}
    </Card>
  </View>;
}
