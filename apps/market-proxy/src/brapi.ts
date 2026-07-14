import type { ArcaClass } from '@arca/domain';
import type { Env, Quote } from './contracts';

interface BrapiQuoteResponse {
  results?: Array<{
    symbol?: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketVolume?: number;
    regularMarketTime?: string;
    currency?: string;
  }>;
}

interface BrapiListResponse {
  stocks?: Array<{
    stock?: string;
    name?: string;
    close?: number;
    volume?: number;
    type?: string;
    sector?: string;
  }>;
}

export async function fetchQuote(symbol: string, env: Env): Promise<Quote> {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9^.-]{2,16}$/.test(normalized)) throw new Error('INVALID_SYMBOL');
  const response = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(normalized)}`, {
    headers: { Authorization: `Bearer ${env.BRAPI_TOKEN}` },
  });
  if (!response.ok) throw new Error(`BRAPI_${response.status}`);
  const payload = await response.json<BrapiQuoteResponse>();
  const item = payload.results?.[0];
  if (!item?.symbol || item.regularMarketPrice == null) throw new Error('BRAPI_INVALID_PAYLOAD');
  return {
    symbol: item.symbol,
    name: item.longName ?? item.shortName ?? item.symbol,
    price: String(item.regularMarketPrice),
    changePercent: item.regularMarketChangePercent == null ? null : String(item.regularMarketChangePercent),
    volume: item.regularMarketVolume == null ? null : String(item.regularMarketVolume),
    currency: 'BRL',
    capturedAt: item.regularMarketTime ?? new Date().toISOString(),
    source: 'BRAPI',
  };
}

function matchesClass(item: NonNullable<BrapiListResponse['stocks']>[number], arcaClass: ArcaClass): boolean {
  const type = item.type?.toLowerCase() ?? '';
  if (arcaClass === 'REAL_ESTATE') return type.includes('fund') || type.includes('fii');
  if (arcaClass === 'INTERNATIONAL') return type.includes('bdr') || type.includes('etf');
  return arcaClass === 'BRAZIL_STOCKS' && !type.includes('fund') && !type.includes('bdr') && !type.includes('etf');
}

export async function screenByLiquidity(arcaClass: ArcaClass, env: Env) {
  const cacheKey = 'brapi:liquidity-universe:100';
  let stocks = await env.MARKET_CACHE.get(cacheKey, 'json') as BrapiListResponse['stocks'] | null;
  if (!stocks) {
    const response = await fetch('https://brapi.dev/api/quote/list?sortBy=volume&sortOrder=desc&limit=100', {
      headers: { Authorization: `Bearer ${env.BRAPI_TOKEN}` },
    });
    if (!response.ok) throw new Error(`BRAPI_${response.status}`);
    const payload = await response.json<BrapiListResponse>();
    stocks = payload.stocks ?? [];
    await env.MARKET_CACHE.put(cacheKey, JSON.stringify(stocks), { expirationTtl: 1_800 });
  }
  const capturedAt = new Date().toISOString();
  const items = stocks
    .filter((candidate) => candidate.stock && matchesClass(candidate, arcaClass))
    .slice(0, 10)
    .map((item) => ({
      arcaClass,
      symbol: item.stock!,
      name: item.name ?? item.stock!,
      criterion: 'Ranking por volume negociado disponível',
      score: String(item.volume ?? 0),
      source: 'brapi.dev',
      capturedAt,
    }));
  if (!items.length) throw new Error('NO_SCREENING_CANDIDATE');
  return items;
}
