import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareFinanceTrades, getFinanceTotals } from '@arca/domain';
import { loadPersonalSnapshot } from '../src/provider';
import worker from '../src/index';

const itemId = '11111111-1111-4111-8111-111111111111';
const item = { id: itemId, institution: 'NUBANK' as const };
const fees = Object.fromEntries(['serviceTax', 'brokerageFee', 'incomeTax', 'tradingAssetsNoticeFee', 'maintenanceFee', 'settlementFee', 'clearingFee', 'stockExchangeFee', 'custodyFee', 'operatingFee', 'other'].map(name => [name, 0]));
const env: FinanceEnv = { ALLOWED_ORIGINS: 'http://localhost:8083,http://localhost:8084', PLUGGY_CLIENT_ID: 'synthetic-client', PLUGGY_CLIENT_SECRET: 'synthetic-secret', ARCA_FINANCE_TOKEN: 'synthetic-private-key-at-least-32-characters', PERSONAL_ITEMS_JSON: JSON.stringify([item]) };
function provider(overrides: { expenses?: unknown; accounts?: unknown[]; itemStatus?: string; badInvestments?: boolean; pages?: boolean } = {}) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(init?.redirect).toBe('manual');
    if (url.pathname === '/auth') return Response.json({ apiKey: 'synthetic-api-key' });
    expect(init?.headers).toMatchObject({ 'X-API-KEY': 'synthetic-api-key' });
    if (url.pathname === `/items/${itemId}`) return Response.json({ id: itemId, connector: { name: 'MeuPluggy' }, status: overrides.itemStatus ?? 'UPDATED', lastUpdatedAt: '2026-11-02T20:00:00Z' });
    if (url.pathname === '/accounts') return Response.json({ results: overrides.accounts ?? [{ id: 'bank-1', itemId, type: 'BANK', name: 'Sensitive name', number: 'secret-number', balance: 30, currencyCode: 'BRL', owner: 'Private person' }, { id: 'card-1', itemId, type: 'CREDIT', balance: 75, currencyCode: 'BRL', creditData: { creditLimit: 10000 } }], totalPages: 1 });
    if (url.pathname === '/investments') {
      if (overrides.badInvestments) return new Response('sensitive provider diagnostic', { status: 403 });
      return Response.json({ results: [{ id: 'investment-1', itemId, name: 'Petrobras PN', code: 'PETR4', type: 'EQUITY', subtype: 'STOCK', currencyCode: 'BRL', quantity: 3, value: 32, balance: 96, status: 'ACTIVE', date: '2026-11-02T20:00:00Z' }], totalPages: 1 });
    }
    if (url.pathname === '/investments/investment-1/transactions') return Response.json({ results: [{ id: `trade-${url.searchParams.get('page')}`, type: 'BUY', quantity: 3, value: 32, amount: 96, date: '2026-11-02T00:00:00Z', tradeDate: '2026-11-04T00:00:00Z', expenses: Object.hasOwn(overrides, 'expenses') ? overrides.expenses : fees }], totalPages: overrides.pages ? 2 : 1 });
    throw new Error('Unexpected provider route');
  });
}
afterEach(() => vi.unstubAllGlobals());
describe('personal normalized bank data', () => {
  it('returns normalized holdings and trades, with no identifiers or credit limits presented as balance', async () => {
    const fetcher = provider();
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.accounts.map(account => account.balance)).toEqual(['30', '75']);
    expect(result.investments[0]).toMatchObject({ quantity: '3', unitPrice: '32', value: '96', type: 'EQUITY' });
    expect(result.trades[0]).toMatchObject({ quantity: '3', unitPrice: '32', fees: '0', tradeDate: '2026-11-02' });
    expect(JSON.stringify(result)).not.toMatch(/Private person|secret-number|creditLimit|apiKey|Sensitive name/);
  });
  it.each([undefined, {}, { brokerageFee: 0 }, { ...fees, other: null }])('keeps absent or partial costs unknown: %j', async expenses => {
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, provider({ expenses }));
    expect(result.trades[0]?.fees).toBeNull();
  });
  it('does not generate a transaction from a bank position', async () => {
    const base = provider();
    const fetcher: typeof fetch = async (input, init) => String(input).includes('/transactions') ? Response.json({ results: [], totalPages: 0 }) : base(input, init);
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.investments).toHaveLength(1); expect(result.trades).toHaveLength(0);
  });
  it('fetches subsequent transaction pages', async () => {
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, provider({ pages: true }));
    expect(result.trades.map(trade => trade.id)).toEqual(['trade-1', 'trade-2']);
  });
  it('keeps fully withdrawn history available without counting it as current holdings', async () => {
    const base = provider();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await base(input, init);
      if (String(input).includes('/transactions')) {
        const body = await response.json() as { results: Record<string, unknown>[] };
        body.results.push({ ...body.results[0]!, id: 'full-sale', type: 'SELL' });
        return Response.json(body);
      }
      if (new URL(String(input)).pathname !== '/investments') return response;
      const body = await response.json() as { results: Record<string, unknown>[] };
      body.results[0]!.status = 'TOTAL_WITHDRAWAL';
      return Response.json(body);
    };
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.investments[0]?.status).toBe('WITHDRAWN');
    expect(getFinanceTotals(result).investmentsValue).toBe('0');
    expect(result.trades).toHaveLength(2);
    expect(prepareFinanceTrades(result).eligible).toHaveLength(2);
    expect(result.connections[0]?.status).toBe('UPDATED');
  });
  it('blocks automatic import when pagination omits a later sale', async () => {
    const base = provider();
    const fetcher: typeof fetch = async (input, init) => String(input).includes('/transactions')
      ? Response.json({ results: [{ id: `buy-${new URL(String(input)).searchParams.get('page')}`, type: 'BUY', quantity: 1, value: 32, date: '2026-11-02T00:00:00Z', expenses: fees }], totalPages: 4 }) : base(input, init);
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.connections[0]?.status).toBe('ERROR');
    expect(prepareFinanceTrades(result).eligible).toEqual([]);
  });
  it('blocks automatic import when one transaction endpoint fails', async () => {
    const base = provider();
    const fetcher: typeof fetch = async (input, init) => String(input).includes('/transactions') ? new Response('', { status: 503 }) : base(input, init);
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.connections[0]?.status).toBe('ERROR');
    expect(prepareFinanceTrades(result).eligible).toEqual([]);
  });
  it('does not treat IOF provisions as charged transaction fees', async () => {
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, provider({ expenses: { ...fees, iofProvision: 3 } }));
    expect(result.trades[0]?.fees).toBeNull();
  });
  it('requires execution date rather than falling back to settlement date', async () => {
    const base = provider();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await base(input, init);
      if (!String(input).includes('/transactions')) return response;
      const body = await response.json() as { results: Record<string, unknown>[] };
      delete body.results[0]!.date;
      return Response.json(body);
    };
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.trades).toEqual([]); expect(result.connections[0]?.status).toBe('ERROR');
  });
  it('does not infer currency or bank saldo from missing values', async () => {
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, provider({ accounts: [{ id: 'bad', itemId, type: 'BANK', balance: 42 }] }));
    expect(result.accounts).toEqual([]); expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('does not read products when bank authorization expired', async () => {
    const fetcher = provider({ itemStatus: 'LOGIN_ERROR' });
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, fetcher);
    expect(result.connections[0]?.status).toBe('LOGIN_REQUIRED'); expect(result.accounts).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('isolates unavailable investments without forwarding provider diagnostics', async () => {
    const result = await loadPersonalSnapshot({ clientId: 'client', clientSecret: 'secret', items: [item] }, provider({ badInvestments: true }));
    expect(result.accounts).toHaveLength(2); expect(result.investments).toHaveLength(0);
    expect(result.connections[0]?.status).toBe('ERROR');
    expect(JSON.stringify(result)).not.toContain('sensitive provider diagnostic');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
describe('private service authorization', () => {
  it('rejects a missing or public proxy token before contacting Pluggy', async () => {
    const fetcher = provider(); vi.stubGlobal('fetch', fetcher);
    for (const token of ['', 'public-market-token']) {
      const response = await worker.fetch(new Request('https://private.example/v1/snapshot', { headers: { authorization: `Bearer ${token}` } }), env);
      expect(response.status).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows only configured origins and read routes', async () => {
    expect((await worker.fetch(new Request('https://private.example/v1/snapshot', { headers: { origin: 'https://untrusted.example' } }), env)).status).toBe(403);
    expect((await worker.fetch(new Request('https://private.example/v1/payments', { method: 'POST' }), env)).status).toBe(405);
    const response = await worker.fetch(new Request('https://private.example/health', { headers: { origin: 'http://localhost:8084' } }), env);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8084');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
  it('returns only configured connections and private no-cache data', async () => {
    vi.stubGlobal('fetch', provider());
    const response = await worker.fetch(new Request('https://private.example/v1/snapshot?itemId=another-user', { headers: { authorization: `Bearer ${env.ARCA_FINANCE_TOKEN}` } }), env);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    const result = await response.json() as { connections: { id: string }[] };
    expect(result.connections.map(item => item.id)).toEqual([itemId]);
  });
  it('does not return auth secrets or provider response text on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret-body', { status: 401 })));
    const response = await worker.fetch(new Request('https://private.example/v1/snapshot', { headers: { authorization: `Bearer ${env.ARCA_FINANCE_TOKEN}` } }), env);
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'PROVIDER_AUTH' });
  });
});
