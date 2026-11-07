import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { createControlState, type ControlCommand } from '@arca/domain';
import worker, { type FinanceRuntime } from '../src/index';
import { commitControlCommand, issueControlToken, readControlState } from '../src/control-store';
import { handleDiscord, verifyDiscordRequest } from '../src/control-discord';
import { applyAvailableControlBankData } from '../src/control-router';
import { runControlSchedule } from '../src/control-schedule';
import type { BankControlImport } from '../src/control-bank';

let runtime: Miniflare;
let db: D1Database;
const now = '2026-06-01T12:00:00Z';
const mutation = (id = 'synthetic-command', revision = 0): ControlCommand => ({ id, baseRevision: revision, createdAt: now, type: 'UPSERT', collection: 'accounts', entity: { id: 'account-one', name: 'Conta de teste' } });
beforeEach(async () => {
  runtime = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-01-01', d1Databases: { DB: 'control-test' } });
  db = await runtime.getD1Database('DB') as unknown as D1Database;
  await db.exec(readFileSync(new URL('../migrations/0001_control.sql', import.meta.url), 'utf8').replaceAll('\n', ' '));
  await db.exec(readFileSync(new URL('../migrations/0002_configuration.sql', import.meta.url), 'utf8').replaceAll('\n', ' '));
});
afterEach(async () => { vi.unstubAllGlobals(); vi.useRealTimers(); await runtime.dispose(); });

describe('private control persistence', () => {
  it('commits a command once and rejects reuse with another payload', async () => {
    const first = await commitControlCommand(db, mutation());
    expect(first.revision).toBe(1);
    expect((await commitControlCommand(db, mutation())).revision).toBe(1);
    await expect(commitControlCommand(db, { ...mutation(), entity: { id: 'other', name: 'Outro' } } as ControlCommand)).rejects.toThrow('COMMAND_ID_REUSED');
    expect((await db.prepare('SELECT COUNT(*) AS count FROM control_commands').first<{ count: number }>())?.count).toBe(1);
  });
  it('allows exactly one concurrent writer and preserves the losing revision', async () => {
    await readControlState(db);
    const results = await Promise.allSettled([commitControlCommand(db, mutation('one')), commitControlCommand(db, mutation('two'))]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
    expect((await readControlState(db)).revision).toBe(1);
  });
  it('rolls back the state when the audit insert fails', async () => {
    await readControlState(db);
    await db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON control_commands BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    await expect(commitControlCommand(db, mutation())).rejects.toThrow();
    expect((await readControlState(db)).revision).toBe(0);
    expect((await readControlState(db)).accounts).toEqual([]);
  });
  it('preserves audit identities when replacing a reviewed backup', async () => {
    await commitControlCommand(db, mutation());
    const restored = createControlState(now);
    await commitControlCommand(db, { id: 'restore', baseRevision: 1, createdAt: now, type: 'REPLACE_REVIEWED', state: restored, confirmed: true });
    expect((await readControlState(db)).appliedCommandIds).toEqual(['synthetic-command', 'restore']);
  });
  it('keeps the current read-only API compatible and protects the new write API', async () => {
    const env: FinanceRuntime = { DB: db, ALLOWED_ORIGINS: 'http://localhost:8083,http://localhost:8084,http://localhost:8085', PLUGGY_CLIENT_ID: 'synthetic-client', PLUGGY_CLIENT_SECRET: 'synthetic-secret', PERSONAL_ITEMS_JSON: '[]', ARCA_FINANCE_TOKEN: 'synthetic-private-token-at-least-32-characters' };
    expect((await worker.fetch(new Request('https://test.example/v1/control/state'), env)).status).toBe(401);
    const headers = { authorization: `Bearer ${env.ARCA_FINANCE_TOKEN}`, 'content-type': 'application/json' };
    const state = await worker.fetch(new Request('https://test.example/v1/control/state', { headers }), env);
    expect(state.status).toBe(200); expect(state.headers.get('cache-control')).toContain('no-store');
    expect((await worker.fetch(new Request('https://test.example/v1/control/commands', { method: 'POST', headers, body: JSON.stringify({ command: mutation() }) }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://test.example/v1/control/commands', { method: 'POST', headers, body: JSON.stringify({ command: mutation('stale', 0) }) }), env)).status).toBe(409);
    expect((await worker.fetch(new Request('https://test.example/v1/control/commands', { method: 'POST', headers, body: '{bad' }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://test.example/v1/payments', { method: 'POST', headers }), env)).status).toBe(405);
  });
});

describe('automatic bank facts in the shared ledger', () => {
  const item = '11111111-1111-4111-8111-111111111111';
  const sourceId = `pluggy:${item}:account:account-upstream`;
  function environment(): FinanceRuntime {
    return { DB: db, ALLOWED_ORIGINS: 'http://localhost:8083,http://localhost:8084,http://localhost:8085', PLUGGY_CLIENT_ID: 'synthetic-client', PLUGGY_CLIENT_SECRET: 'synthetic-secret',
      PERSONAL_ITEMS_JSON: JSON.stringify([{ id: item, institution: 'NUBANK' }]), ARCA_FINANCE_TOKEN: 'synthetic-private-token-at-least-32-characters' };
  }
  function bank(): BankControlImport {
    const timestamp = new Date().toISOString();
    return { version: 1, syncedAt: timestamp, connections: [{ id: item, institution: 'NUBANK', status: 'UPDATED', updatedAt: timestamp, accountsComplete: true, transactionsComplete: true, billsComplete: true }],
      accounts: [{ id: sourceId, externalId: 'account-upstream', connectionId: item, institution: 'NUBANK', name: 'Conta exemplo', balanceCents: 5432, observedAt: timestamp }], cards: [], bills: [], transactions: [], warnings: [] };
  }
  async function link() {
    await commitControlCommand(db, { ...mutation(), entity: { id: 'account-one', name: 'Conta exemplo', source: 'BANK', externalId: sourceId } } as ControlCommand);
  }
  async function cache(value: BankControlImport) {
    await db.prepare('INSERT INTO control_bank_cache(id,payload_json,updated_at) VALUES(1,?,?)').bind(JSON.stringify(value), value.syncedAt).run();
  }
  it('applies a new dated balance once and leaves repeated updates without extra revisions', async () => {
    await link(); const value = bank();
    await applyAvailableControlBankData(environment(), value);
    let state = await readControlState(db);
    expect(state.revision).toBe(2); expect(state.balanceObservations).toHaveLength(1);
    expect(state.balanceObservations[0]?.balanceCents).toBe(5432);
    await applyAvailableControlBankData(environment(), value);
    state = await readControlState(db); expect(state.revision).toBe(2);
    expect(state.incomes).toEqual([]); expect(state.expenses).toEqual([]);
  });
  it('applies an already fresh cache in the hourly task without a new provider call', async () => {
    await link(); await cache(bank()); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await runControlSchedule(environment());
    expect(fetcher).not.toHaveBeenCalled();
    expect((await readControlState(db)).balanceObservations[0]?.balanceCents).toBe(5432);
  });
  it('refreshes provider data and the ledger together through the existing API', async () => {
    await link();
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(String(input)); expect(url.origin).toBe('https://api.pluggy.ai');
      if (url.pathname === '/auth') return Response.json({ apiKey: 'synthetic-key' });
      if (url.pathname === `/items/${item}`) return Response.json({ id: item, connector: { name: 'MeuPluggy' }, status: 'UPDATED', lastUpdatedAt: new Date().toISOString() });
      if (url.pathname === '/accounts') return Response.json({ results: [{ id: 'account-upstream', itemId: item, type: 'BANK', currencyCode: 'BRL', balance: 54.32 }], totalPages: 1 });
      if (url.pathname === '/v2/transactions') return Response.json({ results: [], next: null });
      throw new Error('Unexpected endpoint');
    }));
    const env = environment();
    const response = await worker.fetch(new Request('https://test.example/v1/control/banks/refresh', { method: 'POST', headers: { authorization: `Bearer ${env.ARCA_FINANCE_TOKEN}`, 'content-type': 'application/json' }, body: '{}' }), env);
    expect(response.status).toBe(200);
    expect((await readControlState(db)).balanceObservations[0]?.balanceCents).toBe(5432);
  });
  it('rereads after a concurrent edit instead of overwriting it with the bank preview', async () => {
    await link();
    let raced = false;
    const racingDb = new Proxy(db, { get(target, property) {
      if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          await commitControlCommand(db, { ...mutation('concurrent', 1), entity: { id: 'manual-other', name: 'Outra conta preservada' } } as ControlCommand);
        }
        return db.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await applyAvailableControlBankData({ ...environment(), DB: racingDb }, bank());
    expect(raced).toBe(true);
    const state = await readControlState(db);
    expect(state.accounts.map(row => row.id)).toEqual(['account-one', 'manual-other']);
    expect(state.balanceObservations[0]?.balanceCents).toBe(5432);
    expect(state.revision).toBe(3);
  });
});

describe('Discord owner privacy and confirmation', () => {
  async function signed(input: unknown) {
    const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
    const publicKey = hex(await crypto.subtle.exportKey('raw', keys.publicKey));
    const raw = JSON.stringify(input); const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = hex(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(timestamp + raw)));
    const request = new Request('https://test.example/discord/interactions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp }, body: raw });
    return { request, raw, env: { DB: db, DISCORD_PUBLIC_KEY: publicKey, DISCORD_BOT_TOKEN: 'synthetic-bot-token', DISCORD_APPLICATION_ID: '123456789012345678' } };
  }
  it('verifies the raw payload and rejects tampering', async () => {
    const input = await signed({ type: 1 });
    expect(await verifyDiscordRequest(input.request, input.raw, input.env.DISCORD_PUBLIC_KEY)).toBe(true);
    expect(await verifyDiscordRequest(input.request, `${input.raw} `, input.env.DISCORD_PUBLIC_KEY)).toBe(false);
    expect(await (await handleDiscord(input.request, input.env)).json()).toEqual({ type: 1 });
  });
  it('does not disclose financial data in guilds or group/private channel contexts', async () => {
    for (const context of [0, 2]) {
      const input = await signed({ type: 2, id: 'interaction-one', context, user: { id: 'owner' }, channel_id: 'channel', data: { name: 'saldo' } });
      const response = JSON.stringify(await (await handleDiscord(input.request, input.env)).json());
      expect(response).toContain('conversa privada'); expect(response).not.toContain('Saldo em contas');
    }
  });
  it('pairs once, rejects other owners, and confirms a mutation once', async () => {
    await commitControlCommand(db, mutation());
    const pair = await issueControlToken(db, 'PAIR', { owner: 'personal' });
    const interaction = { type: 2, id: 'interaction-pair', context: 1, user: { id: 'owner' }, channel_id: 'channel', data: { name: 'conectar', options: [{ name: 'codigo', value: pair.token }] } };
    let input = await signed(interaction);
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('foi vinculado');
    input = await signed(interaction);
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('expirado');
    input = await signed({ ...interaction, user: { id: 'other' }, data: { name: 'saldo' } });
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).not.toContain('Saldo em contas');
    input = await signed({ ...interaction, id: 'interaction-income', data: { name: 'registrar', options: [{ name: 'tipo', value: 'receita' }, { name: 'valor', value: '12,34' }, { name: 'descricao', value: 'Extra de teste' }, { name: 'conta', value: 'account-one' }] } });
    const preview = await (await handleDiscord(input.request, input.env)).json() as { data: { components: { components: { custom_id: string }[] }[] } };
    expect((await readControlState(db)).incomes).toHaveLength(0);
    const confirm = preview.data.components[0]!.components[0]!.custom_id;
    input = await signed({ type: 3, id: 'click', context: 1, user: { id: 'owner' }, channel_id: 'channel', data: { custom_id: confirm } });
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('Registro confirmado');
    input = await signed({ type: 3, id: 'click-again', context: 1, user: { id: 'owner' }, channel_id: 'channel', data: { custom_id: confirm } });
    await handleDiscord(input.request, input.env);
    expect((await readControlState(db)).incomes).toHaveLength(1);
    expect((await readControlState(db)).incomes[0]!.amountCents).toBe(1234);
  });
  it('links a salary receipt to its forecast and rejects duplicate or future receipts', async () => {
    await commitControlCommand(db, mutation());
    await commitControlCommand(db, { id: 'salary-forecast', baseRevision: 1, createdAt: now, type: 'UPSERT', collection: 'incomes', entity: { id: 'expected-salary', name: 'Salário previsto', kind: 'SALARY', amountCents: 12500, dueDate: '2026-05-20', accountId: 'account-one' } } as ControlCommand);
    await db.prepare('INSERT INTO discord_connection(owner,user_id,channel_id,linked_at) VALUES(?,?,?,?)').bind('personal', 'owner', 'channel', now).run();
    const interaction = { type: 2, id: 'salary-received', context: 1, user: { id: 'owner' }, channel_id: 'channel', data: { name: 'registrar', options: [{ name: 'tipo', value: 'receita' }, { name: 'valor', value: '125,00' }, { name: 'descricao', value: 'Salário' }, { name: 'conta', value: 'account-one' }, { name: 'data', value: '2026-05-20' }, { name: 'lancamento', value: 'expected-salary' }] } };
    let input = await signed(interaction);
    const preview = await (await handleDiscord(input.request, input.env)).json() as { data: { components: { components: { custom_id: string }[] }[] } };
    const confirm = preview.data.components[0]!.components[0]!.custom_id;
    input = await signed({ ...interaction, type: 3, id: 'salary-confirm', data: { custom_id: confirm } });
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('Registro confirmado');
    const state = await readControlState(db);
    expect(state.incomes).toHaveLength(1);
    expect(state.incomes[0]).toMatchObject({ id: 'expected-salary', kind: 'SALARY', status: 'SETTLED', settledAt: null });
    const options = interaction.data.options.filter(row => row.name !== 'lancamento');
    input = await signed({ ...interaction, id: 'salary-repeat', data: { name: 'registrar', options } });
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('Há lançamentos');
    input = await signed({ ...interaction, id: 'future-receipt', data: { name: 'registrar', options: options.map(row => row.name === 'data' ? { ...row, value: '2999-01-01' } : row) } });
    expect(JSON.stringify(await (await handleDiscord(input.request, input.env)).json())).toContain('Datas futuras');
    expect((await readControlState(db)).revision).toBe(state.revision);
  });
});
