import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { createDiscordPairing, unlinkControlDiscord, type ControlServiceStatus } from '@/api/control';
import { Button, Card } from '@/components/ui';
import { controlStyles as s } from '@/components/ControlUI';

export function ControlDiscord({ status, onRefresh }: { status: ControlServiceStatus; onRefresh: () => Promise<unknown> }) {
  const [pair, setPair] = useState<Awaited<ReturnType<typeof createDiscordPairing>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir agora.'); }
    finally { setBusy(false); }
  }
  let installUrl: string | null = null;
  try { const url = new URL(pair?.installUrl ?? ''); if (url.protocol === 'https:' && url.hostname === 'discord.com' && url.pathname === '/oauth2/authorize') installUrl = url.href; } catch { /* Unconfigured bot has no install link. */ }
  return <Card><Text style={s.heading}>Seu assistente no Discord</Text>
    <Text style={[s.help, { marginVertical: 14 }]}>Consulte seu orçamento com comandos e botões em uma conversa privada. Registros de receitas, despesas e pagamentos sempre pedem confirmação.</Text>
    {!status.discordConfigured ? <View style={s.notice}>
      <Text style={s.label}>A configuração do bot ainda não foi concluída</Text>
      <Text style={s.text}>1. Crie o aplicativo do bot no Discord Developer Portal.</Text>
      <Text style={s.text}>2. No serviço privado do ARCA, configure a chave pública, o identificador e o token do bot, além do endereço de interações.</Text>
      <Text style={s.text}>3. Registre os comandos e valide o recebimento de uma mensagem privada. Depois, atualize esta tela para vincular sua conta.</Text>
      <Text style={s.help}>A configuração externa é feita no servidor. Não informe senhas bancárias nem tokens neste aplicativo.</Text>
      <Button title="Abrir portal do Discord" variant="secondary" onPress={() => void Linking.openURL('https://discord.com/developers/applications').catch(() => setError('Não foi possível abrir o portal.'))} />
    </View> : status.discordLinked ? <View style={{ gap: 12 }}>
      <Text style={s.text}>Sua conta está vinculada. Abra a conversa privada com o bot para usar /saldo, /faturas ou /reserva.</Text>
      {!!status.deliveryError && <Text style={s.error}>Uma mensagem privada não pôde ser entregue. Abra a conversa com o bot e confira as permissões de mensagens no Discord.</Text>}
      {confirmUnlink ? <View style={s.warning}><Text style={s.text}>Desvincular interrompe o acesso e os alertas do Discord. Seus registros financeiros continuam no ARCA.</Text>
        <Button title="Confirmar desvinculação" variant="danger" disabled={busy} onPress={() => void run(async () => { await unlinkControlDiscord(); setPair(null); setConfirmUnlink(false); await onRefresh(); })} />
        <Button title="Manter vinculado" variant="secondary" disabled={busy} onPress={() => setConfirmUnlink(false)} /></View>
        : <Button title="Desvincular Discord" variant="secondary" disabled={busy} onPress={() => setConfirmUnlink(true)} />}
    </View> : <View style={{ gap: 12 }}>
      <Button title={busy ? 'Preparando…' : 'Gerar código para vincular'} disabled={busy} onPress={() => void run(async () => { setPair(await createDiscordPairing()); })} />
      {!!pair && <View style={s.notice}><Text style={s.label}>Use este código somente na conversa privada com o bot</Text>
        <Text selectable style={[s.text, { fontWeight: '800', fontSize: 24 }]}>{pair.token}</Text>
        <Text style={s.help}>Expira em {new Date(pair.expiresAt).toLocaleString('pt-BR')}. Uso único. Selecione o texto para copiar e envie /conectar com o código.</Text>
        {!!installUrl && <Button title="Adicionar o bot no Discord" variant="secondary" onPress={() => void Linking.openURL(installUrl!).catch(() => setError('Não foi possível abrir o Discord.'))} />}
        <Button title="Já vinculei: atualizar situação" variant="secondary" disabled={busy} onPress={() => void run(async () => { await onRefresh(); })} />
      </View>}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={[s.error, { marginTop: 14 }]}>{error}</Text>}
  </Card>;
}
