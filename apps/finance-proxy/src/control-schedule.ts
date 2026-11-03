import { getControlAlerts } from '@arca/domain';
import { controlToday, discordConfigured } from './control-discord';
import { applyBankControlImport } from './control-bank';
import { refreshControlBankCache, type ControlEnv } from './control-router';
import { commitControlCommand, CONTROL_OWNER, readControlState, readDiscordConnection } from './control-store';

export async function runControlSchedule(env: ControlEnv): Promise<void> {
  if (!env.DB) return;
  let state = await readControlState(env.DB);
  const cache = await env.DB.prepare('SELECT updated_at FROM control_bank_cache WHERE id = 1').first<{ updated_at: string }>();
  if (cache && Date.now() - Date.parse(cache.updated_at) > 24 * 3600000) {
    try {
      const bank = await refreshControlBankCache(env);
      const ignored = await env.DB.prepare('SELECT id FROM control_bank_decisions').all<{ id: string }>();
      const ids = new Set(ignored.results.map(row => row.id));
      const review = applyBankControlImport(state, { ...bank, transactions: bank.transactions.filter(row => !ids.has(row.id)) });
      state = await commitControlCommand(env.DB, { id: crypto.randomUUID(), baseRevision: state.revision, createdAt: new Date().toISOString(), type: 'REPLACE_REVIEWED', state: review.state, confirmed: true });
    } catch { /* Cache and previously confirmed records remain available, with their original dates. */ }
  }
  await env.DB.prepare('DELETE FROM control_tokens WHERE expires_at < ?').bind(new Date(Date.now() - 86400000).toISOString()).run();
  if (!discordConfigured(env) || !state.settings.alerts.discord) return;
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: state.settings.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (localHour !== state.settings.alerts.hour) return;
  const connection = await readDiscordConnection(env.DB); if (!connection) return;
  for (const alert of getControlAlerts(state, controlToday(state)).slice(0, 20)) {
    const id = `discord:${alert.key}`;
    // A lease allows retry after a worker interruption while preventing simultaneous deliveries.
    const claimed = await env.DB.prepare("INSERT INTO control_deliveries(id,status,attempted_at) VALUES(?,'SENDING',?) ON CONFLICT(id) DO UPDATE SET status='SENDING',attempted_at=excluded.attempted_at WHERE control_deliveries.status != 'SENT' AND control_deliveries.attempted_at < ? RETURNING id")
      .bind(id, new Date().toISOString(), new Date(Date.now() - 15 * 60000).toISOString()).first();
    if (!claimed) continue;
    try {
      const nonceBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
      const nonce = Array.from(new Uint8Array(nonceBytes).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
      const response = await fetch(`https://discord.com/api/v10/channels/${connection.channel_id}/messages`, {
        method: 'POST', redirect: 'manual', headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ content: `${alert.title}\n${alert.body}`.replaceAll('@', '＠'), allowed_mentions: { parse: [] }, nonce, enforce_nonce: true }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        await env.DB.prepare('UPDATE discord_connection SET delivery_error = ? WHERE owner = ?').bind(response.status === 403 ? 'Mensagens privadas bloqueadas. Confira as permissões do Discord.' : 'Não foi possível entregar um alerta. Confira a conexão.', CONTROL_OWNER).run();
        await env.DB.prepare("UPDATE control_deliveries SET status='FAILED' WHERE id=?").bind(id).run();
        if (response.status === 403 || response.status === 429) break;
      } else {
        await response.body?.cancel();
        await env.DB.batch([
          env.DB.prepare("UPDATE control_deliveries SET status='SENT',delivered_at=? WHERE id=?").bind(new Date().toISOString(), id),
          env.DB.prepare('UPDATE discord_connection SET delivery_error=NULL WHERE owner=?').bind(CONTROL_OWNER),
        ]);
      }
    } catch { await env.DB.prepare("UPDATE control_deliveries SET status='FAILED' WHERE id=?").bind(id).run(); }
  }
}
