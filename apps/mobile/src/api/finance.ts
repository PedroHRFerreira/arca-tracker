import { FinanceSnapshotSchema, type FinanceSnapshot } from '@arca/domain';
import { commitFinanceImport, getFinanceAutoImport, loadFinanceSnapshot, saveFinanceSnapshot, setFinanceAutoImport } from '@/db/finance';
import { getDatabase, migrateDatabase } from '@/db/database';
import { readFinanceKey, writeFinanceKey, deleteFinanceKey } from './finance-key';

const service = process.env.EXPO_PUBLIC_FINANCE_PROXY_URL?.trim().replace(/\/$/, '') ?? '';
function validService(): boolean {
  try {
    const url = new URL(service);
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
      (url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  } catch { return false; }
}
export const FINANCE_SERVICE_AVAILABLE = validService();
let syncing: Promise<FinanceSyncResult> | null = null;
let generation = 0;
export type FinanceSyncResult = { snapshot: FinanceSnapshot; imported: number; duplicates: number; pending: number; warnings: string[] };

export async function getFinanceAccessStatus(): Promise<boolean> { return Boolean(await readFinanceKey()); }

async function fetchSnapshot(key: string): Promise<FinanceSnapshot> {
  if (!FINANCE_SERVICE_AVAILABLE) throw new Error('A conexão pessoal ainda não foi configurada para esta versão.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(`${service}/v1/snapshot`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Chave de acesso inválida. Confira a chave pessoal da conexão.');
      if (response.status === 429) throw new Error('Muitas consultas em pouco tempo. Aguarde alguns minutos e tente novamente.');
      if (response.status === 503) throw new Error('A conexão pessoal está temporariamente indisponível. Seus registros foram preservados.');
      throw new Error('Não foi possível consultar os bancos agora. Tente novamente em alguns minutos.');
    }
    const raw: unknown = await response.json();
    const parsed = FinanceSnapshotSchema.safeParse(raw);
    if (!parsed.success) throw new Error('A consulta retornou dados incompletos. Seus registros foram preservados.');
    return parsed.data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A consulta demorou mais que o esperado. Confira a conexão e tente novamente.');
    if (error instanceof TypeError) throw new Error('Sem conexão com o serviço. Você pode consultar os últimos dados salvos.');
    throw error;
  } finally { clearTimeout(timeout); }
}

/** Validate the candidate before replacing any working key. Never save provider credentials. */
export async function saveFinanceAccessKey(value: string): Promise<void> {
  const key = value.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) throw new Error('Confira a chave de acesso pessoal. Ela é diferente da senha do banco.');
  const current = generation;
  await fetchSnapshot(key);
  if (current !== generation) throw new Error('A configuração mudou. Tente conectar novamente.');
  await writeFinanceKey(key);
}

function mergeFailedConnections(fresh: FinanceSnapshot, previous: FinanceSnapshot | null): FinanceSnapshot {
  if (!previous) return fresh;
  const failed = new Set(fresh.connections.filter(connection => connection.status !== 'UPDATED').map(connection => connection.id));
  const cached = new Set(previous.connections.filter(connection => failed.has(connection.id)).map(connection => connection.id));
  if (!cached.size) return fresh;
  const merge = <T extends { connectionId: string }>(rows: T[], oldRows: T[]) => [...rows.filter(row => !cached.has(row.connectionId)), ...oldRows.filter(row => cached.has(row.connectionId))];
  return FinanceSnapshotSchema.parse({
    ...fresh,
    connections: fresh.connections.map(connection => cached.has(connection.id) ? { ...connection, updatedAt: previous.connections.find(old => old.id === connection.id)?.updatedAt ?? null } : connection),
    accounts: merge(fresh.accounts, previous.accounts), investments: merge(fresh.investments, previous.investments), trades: merge(fresh.trades, previous.trades),
  });
}

export async function syncFinance(): Promise<FinanceSyncResult> {
  if (syncing) return syncing;
  const current = generation;
  const task = (async () => {
    const key = await readFinanceKey();
    if (!key) throw new Error('Conecte sua chave de acesso pessoal primeiro.');
    const fresh = await fetchSnapshot(key);
    if (current !== generation) throw new Error('A conexão foi encerrada.');
    const snapshot = mergeFailedConnections(fresh, await loadFinanceSnapshot());
    let result = { imported: 0, duplicates: 0, pending: 0, warnings: [] as string[] };
    if (await getFinanceAutoImport()) {
      try { result = await commitFinanceImport(fresh); }
      catch (error) { result.warnings.push(error instanceof Error ? error.message : 'Revise as operações antes de atualizar a carteira.'); }
    }
    if (current !== generation) throw new Error('A conexão foi encerrada.');
    await saveFinanceSnapshot(snapshot);
    return { snapshot, ...result, warnings: [...new Set([...snapshot.warnings, ...result.warnings])] };
  })();
  syncing = task;
  try { return await task; } finally { if (syncing === task) syncing = null; }
}

export async function disconnectFinance(): Promise<void> {
  generation++;
  // Finish any in-flight local commit before clearing connection data. Ledger entries stay registered.
  const running = syncing;
  if (running) await running.catch(() => undefined);
  await deleteFinanceKey();
  await migrateDatabase();
  const db = await getDatabase();
  await db.runAsync('DELETE FROM app_settings WHERE key = ?', 'finance_snapshot_v1');
  await setFinanceAutoImport(false);
}
