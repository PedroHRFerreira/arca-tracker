import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { FinanceSnapshot } from '@arca/domain';
const state = vi.hoisted(() => ({
  key: vi.fn(), write: vi.fn(), remove: vi.fn(), load: vi.fn(), save: vi.fn(), auto: vi.fn(), commit: vi.fn(), setAuto: vi.fn(), run: vi.fn(),
}));
vi.mock('../src/api/finance-key', () => ({ readFinanceKey: state.key, writeFinanceKey: state.write, deleteFinanceKey: state.remove }));
vi.mock('@/db/finance', () => ({ loadFinanceSnapshot: state.load, saveFinanceSnapshot: state.save, getFinanceAutoImport: state.auto, commitFinanceImport: state.commit, setFinanceAutoImport: state.setAuto }));
vi.mock('@/db/database', () => ({ migrateDatabase: vi.fn(), getDatabase: async () => ({ runAsync: state.run }) }));
const sample = (): FinanceSnapshot => ({ version: 1, syncedAt: '2026-11-02T20:00:00Z', connections: [{ id: 'connection', name: 'Nubank', institution: 'NUBANK', status: 'UPDATED', updatedAt: '2026-11-02T20:00:00Z' }], accounts: [{ id: 'account', connectionId: 'connection', name: 'Conta bancária', kind: 'BANK', balance: '10', currency: 'BRL' }], investments: [], trades: [], warnings: [] });
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv('EXPO_PUBLIC_FINANCE_PROXY_URL', 'https://private.example');
  state.key.mockResolvedValue('synthetic-owner-key-32-characters-long');
  state.load.mockResolvedValue(null); state.auto.mockResolvedValue(false);
  state.commit.mockResolvedValue({ imported: 1, duplicates: 0, pending: 0, warnings: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('private finance client', () => {
  it('validates a new key before replacing a working key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    const api = await import('../src/api/finance');
    await expect(api.saveFinanceAccessKey('synthetic-wrong-key-at-least-32-characters')).rejects.toThrow('inválida');
    expect(state.write).not.toHaveBeenCalled();
  });
  it('shares concurrent refreshes and never imports positions when automatic import is off', async () => {
    const fetcher = vi.fn(async () => Response.json(sample())); vi.stubGlobal('fetch', fetcher);
    const api = await import('../src/api/finance');
    const [first, second] = await Promise.all([api.syncFinance(), api.syncFinance()]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(first).toEqual(second);
    expect(state.commit).not.toHaveBeenCalled(); expect(state.save).toHaveBeenCalledTimes(1);
  });
  it('keeps cached positions on a partial bank failure and blocks importing that connection', async () => {
    state.load.mockResolvedValue(sample()); state.auto.mockResolvedValue(true);
    const fresh = sample(); fresh.connections[0]!.status = 'ERROR'; fresh.accounts = [];
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fresh)));
    const api = await import('../src/api/finance'); const result = await api.syncFinance();
    expect(result.snapshot.accounts).toHaveLength(1);
    expect(result.snapshot.connections[0]!.status).toBe('ERROR');
    expect(state.commit).toHaveBeenCalledWith(expect.objectContaining({ accounts: [], connections: [expect.objectContaining({ status: 'ERROR' })] }));
  });
  it('keeps manual review warnings recoverable without discarding fresh data', async () => {
    state.auto.mockResolvedValue(true); state.commit.mockRejectedValue(new Error('Revise a operação alterada.'));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(sample())));
    const api = await import('../src/api/finance'); const result = await api.syncFinance();
    expect(result.warnings).toContain('Revise a operação alterada.'); expect(state.save).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite local cache after disconnection during a request', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const api = await import('../src/api/finance'); const running = api.syncFinance();
    const rejected = expect(running).rejects.toThrow('encerrada');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const disconnected = api.disconnectFinance(); finish(Response.json(sample()));
    await rejected; await disconnected;
    expect(state.save).not.toHaveBeenCalled(); expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.run).toHaveBeenCalledWith('DELETE FROM app_settings WHERE key = ?', 'finance_snapshot_v1');
    expect(state.setAuto).toHaveBeenCalledWith(false);
  });
  it('ends a stalled request with an actionable timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))));
    const api = await import('../src/api/finance');
    const rejected = expect(api.syncFinance()).rejects.toThrow('demorou');
    await vi.advanceTimersByTimeAsync(55000); await rejected;
    expect(state.save).not.toHaveBeenCalled();
  });
  it('rejects malformed provider data without changing the cached portfolio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balance: 100 })));
    const api = await import('../src/api/finance'); await expect(api.syncFinance()).rejects.toThrow('incompletos');
    expect(state.save).not.toHaveBeenCalled(); expect(state.commit).not.toHaveBeenCalled();
  });
});
