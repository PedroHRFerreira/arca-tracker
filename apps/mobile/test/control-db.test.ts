import { beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { applyControlCommand, createControlState, type ControlCommand } from '@arca/domain';

const shared = vi.hoisted(() => ({ adapter: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => shared.adapter }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/api/finance-key', () => ({ readFinanceKey: async () => 'synthetic-personal-access-key-at-least-32-characters' }));
let sql: Database;
let database: typeof import('../src/db/database');
let control: typeof import('../src/db/control');
let api: typeof import('../src/api/control');
beforeEach(async () => {
  vi.resetModules(); vi.unstubAllGlobals(); vi.stubGlobal('__DEV__', true);
  process.env.EXPO_PUBLIC_FINANCE_PROXY_URL = 'https://synthetic.example';
  const SQL = await initSqlJs(); sql = new SQL.Database();
  const rows = (query: string, values: SqlValue[]) => {
    const statement = sql.prepare(query);
    try { statement.bind(values); const result = []; while (statement.step()) result.push(statement.getAsObject()); return result; }
    finally { statement.free(); }
  };
  shared.adapter = {
    execAsync: async (query: string) => { sql.exec(query); },
    runAsync: async (query: string, ...values: SqlValue[]) => { sql.run(query, (Array.isArray(values[0]) ? values[0] : values) as SqlValue[]); return { changes: sql.getRowsModified(), lastInsertRowId: 1 }; },
    getAllAsync: async (query: string, ...values: SqlValue[]) => rows(query, values),
    getFirstAsync: async (query: string, ...values: SqlValue[]) => rows(query, values)[0] ?? null,
    withTransactionAsync: async (operation: () => Promise<void>) => { sql.run('BEGIN'); try { await operation(); sql.run('COMMIT'); } catch (error) { sql.run('ROLLBACK'); throw error; } },
  };
  database = await import('../src/db/database'); control = await import('../src/db/control'); api = await import('../src/api/control');
  await database.migrateDatabase();
});
const account = (id: string) => ({ type: 'UPSERT' as const, collection: 'accounts' as const, entity: { id, name: `Conta ${id}` } });
function fakeServer() {
  let state = createControlState('2026-06-01T12:00:00Z');
  let interruptAfterCommit = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    if (input.endsWith('/state')) return Response.json({ state, status: { discordConfigured: false, discordLinked: false, deliveryError: null } });
    const body = JSON.parse(String(options?.body)) as { command: ControlCommand };
    if (body.command.baseRevision !== state.revision) return Response.json({ error: 'REVISION_CONFLICT' }, { status: 409 });
    state = applyControlCommand(state, body.command);
    if (interruptAfterCommit) { interruptAfterCommit = false; throw new TypeError('offline'); }
    return Response.json({ state });
  }));
  return { get state() { return state; }, mutate(command: ControlCommand) { state = applyControlCommand(state, command); }, interrupt() { interruptAfterCommit = true; } };
}
describe('control local persistence and synchronization', () => {
  it('refreshes subscribers only after a complete restore and keeps online review required', async () => {
    await control.dispatchControlCommand(account('backup'));
    const backup = await database.exportDatabaseJson();
    await control.dispatchControlCommand(account('later'));
    const notify = vi.fn(); const unsubscribe = control.subscribeControl(notify);
    await control.restoreLocalBackup(backup);
    expect(notify).toHaveBeenCalledTimes(1);
    const bundle = await control.loadControlBundle();
    expect(bundle.state.accounts.map(row => row.id)).toEqual(['backup']);
    expect(bundle.restorePending).toBe(true);
    await expect(control.restoreLocalBackup({ version: 3, tables: {} })).rejects.toThrow();
    expect(notify).toHaveBeenCalledTimes(1);
    expect((await control.loadControlBundle()).state.accounts.map(row => row.id)).toEqual(['backup']);
    unsubscribe();
  });
  it('serializes a restore with an in-flight local operation', async () => {
    await control.dispatchControlCommand(account('backup'));
    const backup = await database.exportDatabaseJson();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = control.withControlLock(() => gate);
    let restored = false;
    const restore = control.restoreLocalBackup(backup).then(() => { restored = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(restored).toBe(false);
    release(); await pending; await restore;
    expect(restored).toBe(true);
  });
  it('serializes concurrent offline edits without dropping a command', async () => {
    await Promise.all([control.dispatchControlCommand(account('one')), control.dispatchControlCommand(account('two'))]);
    const bundle = await control.loadControlBundle();
    expect(bundle.state.accounts).toHaveLength(2); expect(bundle.pending).toHaveLength(2);
    expect(bundle.pending.map(command => command.baseRevision)).toEqual([0, 1]);
  });
  it('recovers a response lost after commit without importing the operation twice', async () => {
    const server = fakeServer();
    await control.dispatchControlCommand(account('one')); await control.dispatchControlCommand(account('two'));
    server.interrupt();
    await expect(api.syncControl()).rejects.toThrow('Sem conexão');
    expect((await control.loadControlBundle()).pending).toHaveLength(2);
    await api.syncControl();
    expect(server.state.accounts).toHaveLength(2); expect(server.state.revision).toBe(2);
    expect((await control.loadControlBundle()).pending).toEqual([]);
  });
  it('preserves local edits and remote state on conflict until explicit review', async () => {
    const server = fakeServer(); await control.dispatchControlCommand(account('local'));
    server.mutate({ ...account('remote'), id: 'remote-command', baseRevision: 0, createdAt: '2026-06-01T13:00:00Z' });
    await expect(api.syncControl()).rejects.toThrow('Revise');
    const bundle = await control.loadControlBundle();
    expect(bundle.state.accounts[0]?.id).toBe('local'); expect(bundle.conflict?.accounts[0]?.id).toBe('remote');
    await api.resolveControlConflict('REMOTE');
    expect((await control.loadControlBundle()).state.accounts[0]?.id).toBe('remote');
  });
  it('exports version 3, restores locally, and requires review before any online overwrite', async () => {
    fakeServer(); await control.dispatchControlCommand(account('one'));
    const backup = await database.exportDatabaseJson(); expect(backup.version).toBe(3);
    expect(JSON.stringify(backup)).not.toContain('synthetic-personal-access-key');
    await database.restoreDatabaseJson(backup);
    expect((await control.loadControlBundle()).restorePending).toBe(true);
    await expect(api.syncControl()).rejects.toThrow('backup restaurado');
    expect((await control.loadControlBundle()).conflict).not.toBeNull();
  });
  it.each([1, 2])('restores a version %s backup without finance data or portfolio loss', async version => {
    const id = await database.createAsset({ symbol: 'TEST3', name: 'Ativo sintético', arcaClass: 'BRAZIL_STOCKS', assetType: 'EQUITY', quoteMode: 'MANUAL' });
    await database.addTransaction({ assetId: id, type: 'BUY', tradeDate: '2026-01-05', quantity: '2', unitPrice: '10' });
    const backup = await database.exportDatabaseJson(); backup.version = version;
    if (version === 1) delete backup.tables.planning_profiles;
    await database.restoreDatabaseJson(backup);
    expect((await database.listAssets())[0]?.symbol).toBe('TEST3');
    expect((await control.loadControlBundle()).state.accounts).toEqual([]);
  });
});
