import { ControlStateSchema, applyControlCommand, type ControlState } from '@arca/domain';
import * as Crypto from 'expo-crypto';
import { loadControlBundle, saveControlBundle, withControlLock } from '@/db/control';
import { setSetting } from '@/db/database';
import { readFinanceKey } from './finance-key';

const service = process.env.EXPO_PUBLIC_FINANCE_PROXY_URL?.trim().replace(/\/$/, '') ?? '';
export type ControlServiceStatus = { discordConfigured: boolean; discordLinked: boolean; deliveryError: string | null };
let status: ControlServiceStatus = { discordConfigured: false, discordLinked: false, deliveryError: null };
export const getControlServiceStatus = () => status;
export async function controlRequest<T>(path: string, body?: unknown): Promise<T> {
  const key = await readFinanceKey();
  if (!key) throw new Error('Conecte sua chave pessoal em Meus bancos para sincronizar. O cadastro local continua disponível.');
  let url: URL;
  try { url = new URL(service); } catch { throw new Error('O serviço privado não está configurado nesta versão.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !(url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))))
    throw new Error('Endereço do serviço privado inválido.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(`${service}/v1/control/${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 409) throw new Error('CONTROL_CONFLICT');
      if (response.status === 401) throw new Error('Sua chave pessoal não foi aceita. Confira a conexão em Meus bancos.');
      if (response.status === 503 || response.status === 404) throw new Error('O controle online ainda não está disponível. Seus registros locais foram preservados.');
      if (response.status === 429) throw new Error('Limite temporário de consultas. Aguarde e tente novamente.');
      throw new Error('Não foi possível atualizar agora. Seus registros locais foram preservados.');
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A consulta demorou. Seus registros locais foram preservados.');
    if (error instanceof TypeError) throw new Error('Sem conexão. Você pode consultar e registrar dados no aparelho.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function syncControl(): Promise<ControlState> {
  return withControlLock(async () => {
    const bundle = await loadControlBundle();
    const response = await controlRequest<{ state: unknown; status: ControlServiceStatus }>('state');
    let remote = ControlStateSchema.parse(response.state); status = response.status;
    if (bundle.restorePending) {
      await saveControlBundle({ ...bundle, conflict: remote });
      throw new Error('Revise o backup restaurado antes de substituir ou manter os dados online.');
    }
    const pending = bundle.pending.filter(command => !remote.appliedCommandIds.includes(command.id));
    if (pending.length && pending[0]!.baseRevision !== remote.revision) {
      await saveControlBundle({ ...bundle, pending, conflict: remote });
      throw new Error('Os dados online mudaram. Revise o conflito antes de sincronizar.');
    }
    for (let i = 0; i < pending.length; i++) {
      try {
        const applied = await controlRequest<{ state: unknown }>('commands', { command: pending[i] });
        remote = ControlStateSchema.parse(applied.state);
        // Persist every acknowledgement before the next request, including after a network interruption.
        let optimistic = remote;
        for (const command of pending.slice(i + 1)) optimistic = applyControlCommand(optimistic, command);
        await saveControlBundle({ ...bundle, state: optimistic, base: remote, pending: pending.slice(i + 1), conflict: null, lastSyncAt: new Date().toISOString() });
      } catch (error) {
        if (error instanceof Error && error.message === 'CONTROL_CONFLICT') {
          const latest = await controlRequest<{ state: unknown }>('state');
          const current = await loadControlBundle();
          await saveControlBundle({ ...current, conflict: ControlStateSchema.parse(latest.state) });
          throw new Error('Outro registro alterou os dados. Revise as duas versões para continuar.');
        }
        throw error;
      }
    }
    await saveControlBundle({ state: remote, base: remote, pending: [], conflict: null, lastSyncAt: new Date().toISOString(), restorePending: false });
    return remote;
  });
}

/** Called only after the screen has displayed both versions and received explicit confirmation. */
export async function resolveControlConflict(choice: 'REMOTE' | 'LOCAL'): Promise<void> {
  await withControlLock(async () => {
    const bundle = await loadControlBundle();
    const latest = await controlRequest<{ state: unknown }>('state');
    const remote = ControlStateSchema.parse(latest.state);
    if (!bundle.conflict || bundle.conflict.revision !== remote.revision) throw new Error('A versão online mudou novamente. Atualize a revisão.');
    if (choice === 'REMOTE') await saveControlBundle({ state: remote, base: remote, pending: [], conflict: null, lastSyncAt: new Date().toISOString(), restorePending: false });
    else {
      const command = { id: Crypto.randomUUID(), baseRevision: remote.revision, createdAt: new Date().toISOString(), type: 'REPLACE_REVIEWED' as const, state: bundle.state, confirmed: true as const };
      const result = await controlRequest<{ state: unknown }>('commands', { command });
      const state = ControlStateSchema.parse(result.state);
      await saveControlBundle({ state, base: state, pending: [], conflict: null, lastSyncAt: new Date().toISOString(), restorePending: false });
    }
    await setSetting('control_restore_pending_v1', 'false');
  });
}
export async function refreshControlBanks(): Promise<void> { await syncControl(); await controlRequest('banks/refresh', {}); await syncControl(); }
export async function createDiscordPairing(): Promise<{ token: string; expiresAt: string; installUrl: string }> { return controlRequest('discord/pair', {}); }
export async function unlinkControlDiscord(): Promise<void> { await controlRequest('discord/unlink', {}); status = { ...status, discordLinked: false }; }
