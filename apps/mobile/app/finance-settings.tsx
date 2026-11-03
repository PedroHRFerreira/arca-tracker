import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useControl } from '@/providers/useControl';
import { ControlSettingsForm } from '@/components/ControlSettingsForm';
import { ControlSettingsConflict } from '@/components/ControlSettingsConflict';
import { ControlDiscord } from '@/components/ControlDiscord';
import { Button, Card, ScreenHeader } from '@/components/ui';
import { controlStyles as s } from '@/components/ControlUI';
import { enableControlBillReminders } from '@/notifications';
import { colors } from '@/theme';
import type { ControlSettings } from '@arca/domain';

export default function FinanceSettings() {
  const control = useControl();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);
  const [formGeneration, setFormGeneration] = useState(0);
  async function save(settings: ControlSettings) {
    setMessage(''); await control.save({ type: 'SET_SETTINGS', settings });
    setMessage('Configurações salvas neste aparelho. Sincronize para atualizar a base privada e o Discord.');
  }
  async function toggleAlert(key: keyof Omit<ControlSettings['alerts'], 'hour'>, value: boolean) {
    if (control.busy || alertBusy) return; setAlertBusy(true); setError(''); setMessage('');
    try {
      const nextState = { ...control.state, settings: { ...control.state.settings, alerts: { ...control.state.settings.alerts, [key]: value } } };
      if (key !== 'discord' && value && !(await enableControlBillReminders(nextState))) {
        setMessage(Platform.OS === 'web'
          ? 'Os lembretes no aparelho ficam disponíveis no aplicativo Android instalado. No navegador, você pode continuar usando seu controle financeiro normalmente.'
          : 'A permissão de notificações não foi concedida. Você pode usar o aplicativo e ativar os lembretes depois.'); return;
      }
      await control.save({ type: 'SET_SETTINGS', settings: { alerts: { ...control.state.settings.alerts, [key]: value } } });
      setMessage('Preferência salva. Os outros lembretes foram mantidos. Sincronize para atualizar os alertas do Discord.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a preferência.'); }
    finally { setAlertBusy(false); }
  }
  const alerts: { key: keyof Omit<ControlSettings['alerts'], 'hour'>; title: string; detail: string }[] = [
    { key: 'bills', title: 'Vencimento de contas e faturas', detail: 'Lembretes no aparelho 7, 3 e 1 dia antes e no vencimento.' },
    { key: 'budget', title: 'Orçamento e categorias', detail: 'Aviso de orçamento negativo e de categorias com limite configurado.' },
    { key: 'reserve', title: 'Evolução da reserva', detail: 'Marcos de 25%, 50%, 75% e 100% da sua meta.' },
    { key: 'contribution', title: 'Aportes sustentáveis', detail: 'Aviso quando houver capacidade. Sem cobrança de aportes desativados.' },
    { key: 'discord', title: 'Receber alertas no Discord', detail: 'Mensagens privadas para a conta vinculada. Depende da sincronização.' },
  ];
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <ScreenHeader back title="Seu planejamento" subtitle="Datas, margem e controles do seu orçamento" />
      {!control.ready ? <ActivityIndicator color={colors.primary} accessibilityLabel="Carregando configurações" /> : <>
        {!!message && <View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.text}>{message}</Text></View>}
        {!!(error || control.error) && <Text accessibilityRole="alert" style={s.error}>{error || control.error}</Text>}
        {control.conflict ? <ControlSettingsConflict local={control.state} remote={control.conflict} busy={control.busy} onResolve={control.resolveConflict} /> :
          <ControlSettingsForm key={formGeneration} state={control.state} busy={control.busy} onSave={save} onReload={() => setFormGeneration(value => value + 1)} />}
        <Card><Text style={s.heading}>Lembretes do controle financeiro</Text>
          <Text style={[s.help, { marginVertical: 14 }]}>Os lembretes de aporte, revisão mensal e atualização semanal que você já configurou continuam separados.</Text>
          {alerts.map(alert => <View key={alert.key} style={[s.row, { flexWrap: 'nowrap' }]}><View style={{ flex: 1 }}><Text style={s.label}>{alert.title}</Text><Text style={s.help}>{alert.detail}</Text></View>
            <Switch accessibilityLabel={alert.title} value={control.state.settings.alerts[alert.key]} trackColor={{ true: colors.primary }}
              disabled={control.busy || alertBusy || !!control.conflict || (alert.key === 'discord' && !control.serviceStatus.discordLinked)} onValueChange={value => void toggleAlert(alert.key, value)} /></View>)}
          <Text style={[s.help, { marginTop: 14 }]}>Horário dos avisos: {String(control.state.settings.alerts.hour).padStart(2, '0')}:00 · {control.state.settings.timezone}</Text>
        </Card>
        <ControlDiscord status={control.serviceStatus} onRefresh={control.sync} />
        <Card><Text style={s.heading}>Seus dados privados</Text><Text style={[s.help, { marginVertical: 14 }]}>{control.pending.length} alterações aguardando sincronização. {control.lastSyncAt ? `Última sincronização: ${new Date(control.lastSyncAt).toLocaleString('pt-BR')}.` : 'Ainda não sincronizado.'}</Text>
          <Button title={control.busy ? 'Atualizando…' : 'Sincronizar base privada'} disabled={control.busy || !!control.conflict} onPress={() => { setMessage(''); void control.sync().then(() => setMessage('Base privada atualizada.')).catch(() => undefined); }} />
          <Text style={[s.help, { marginTop: 12 }]}>Sem conexão, os registros continuam neste aparelho. Conflitos precisam de revisão antes de substituir qualquer versão.</Text>
        </Card>
      </>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
