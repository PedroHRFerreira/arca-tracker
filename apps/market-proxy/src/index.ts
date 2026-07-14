import { ArcaClassSchema } from '@arca/domain';
import { fetchQuote, screenByLiquidity } from './brapi';
import type { Env } from './contracts';
import { refreshTreasury } from './treasury';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...jsonHeaders, ...headers } });
}

function authorized(request: Request, env: Env): boolean {
  const value = request.headers.get('authorization');
  return value === `Bearer ${env.ARCA_PROXY_TOKEN}`;
}

async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, env: Env): Promise<T> {
  const existing = await env.MARKET_CACHE.get(key, 'json') as T | null;
  if (existing) return existing;
  const loaded = await loader();
  await env.MARKET_CACHE.put(key, JSON.stringify(loaded), { expirationTtl: ttlSeconds });
  return loaded;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ status: 'ok', timestamp: new Date().toISOString() });
  if (!authorized(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const quoteMatch = url.pathname.match(/^\/v1\/quotes\/([^/]+)$/);
  if (quoteMatch?.[1]) {
    const symbol = decodeURIComponent(quoteMatch[1]).toUpperCase();
    return json(await cached(`quote:${symbol}`, 1_800, () => fetchQuote(symbol, env), env));
  }

  if (url.pathname === '/v1/treasury') {
    const bonds = await env.MARKET_CACHE.get('treasury:latest', 'json');
    return bonds ? json(bonds) : json(await refreshTreasury(env));
  }

  const screeningMatch = url.pathname.match(/^\/v1\/screening\/([^/]+)$/);
  if (screeningMatch?.[1]) {
    const arcaClass = ArcaClassSchema.parse(screeningMatch[1]);
    if (arcaClass === 'CASH_FIXED_INCOME') {
      const bonds = await env.MARKET_CACHE.get('treasury:latest', 'json') as Array<{ name: string; maturityDate: string }> | null;
      const available = bonds ?? (await refreshTreasury(env));
      const capturedAt = new Date().toISOString();
      const items = available.slice(0, 10).map((bond) => ({
        arcaClass,
        symbol: `SELIC-${bond.maturityDate}`,
        name: bond.name,
        criterion: 'Tesouro Selic ordenado pelo vencimento mais próximo',
        score: bond.maturityDate,
        source: 'Tesouro Transparente',
        capturedAt,
      }));
      if (!items.length) throw new Error('NO_SCREENING_CANDIDATE');
      return json({ arcaClass, items });
    }
    const items = await cached(
      `screening:${arcaClass}:top10`,
      1_800,
      () => screenByLiquidity(arcaClass, env),
      env,
    );
    return json({ arcaClass, items });
  }

  return json({ error: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const status = message === 'INVALID_SYMBOL' ? 400 : message.startsWith('BRAPI_429') ? 429 : 502;
      return json({ error: message }, status);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshTreasury(env));
  },
};
