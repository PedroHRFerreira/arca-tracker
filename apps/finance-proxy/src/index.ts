import { PersonalItemsSchema, ProviderError, loadPersonalSnapshot } from './provider';

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', ...headers },
});

async function matchesToken(candidate: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(candidate));
}

export default {
  async fetch(request: Request, env: FinanceEnv): Promise<Response> {
    const origin = request.headers.get('origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    const cors: Record<string, string> = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'authorization', 'cache-control': 'no-store' } });
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') return json({ status: 'ok' }, 200, cors);
    if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, cors);
    if (!env.ARCA_FINANCE_TOKEN || env.ARCA_FINANCE_TOKEN.length < 32 || !env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET || !env.PERSONAL_ITEMS_JSON)
      return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, cors);
    const authorization = request.headers.get('authorization') ?? '';
    if (authorization.length > 512 || !authorization.startsWith('Bearer ') || !await matchesToken(authorization.slice(7), env.ARCA_FINANCE_TOKEN))
      return json({ error: 'UNAUTHORIZED' }, 401, cors);
    if (path !== '/v1/snapshot') return json({ error: 'NOT_FOUND' }, 404, cors);
    try {
      let raw: unknown;
      try { raw = JSON.parse(env.PERSONAL_ITEMS_JSON); } catch { return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, cors); }
      const items = PersonalItemsSchema.safeParse(raw);
      if (!items.success) return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, cors);
      const snapshot = await loadPersonalSnapshot({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET, items: items.data });
      return json(snapshot, 200, cors);
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'PROVIDER_UNAVAILABLE';
      return json({ error: code }, code === 'PROVIDER_RATE_LIMIT' ? 429 : 502, cors);
    }
  },
};
