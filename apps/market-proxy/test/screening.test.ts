import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVESTMENT_CATALOG, ScreeningMetadataSchema } from '@arca/domain';
import { matchesClass, screenByLiquidity } from '../src/brapi';
import { ScreeningItemSchema, type Env } from '../src/contracts';

afterEach(() => vi.unstubAllGlobals());

describe('verified screening exposure', () => {
  it('distinguishes Brazilian and global ETFs by underlying exposure', () => {
    expect(matchesClass({ stock: 'BOVA11', type: 'etf' }, 'BRAZIL_STOCKS')).toBe(true);
    expect(matchesClass({ stock: 'BOVA11', type: 'etf' }, 'INTERNATIONAL')).toBe(false);
    expect(matchesClass({ stock: 'WRLD11', type: 'etf' }, 'INTERNATIONAL')).toBe(true);
    expect(matchesClass({ stock: 'WRLD11', type: 'etf' }, 'BRAZIL_STOCKS')).toBe(false);
  });

  it('does not infer international or real estate exposure from a generic fund label', () => {
    expect(matchesClass({ stock: 'UNKNOWN11', type: 'etf' }, 'INTERNATIONAL')).toBe(false);
    expect(matchesClass({ stock: 'UNKNOWN11', type: 'fund' }, 'REAL_ESTATE')).toBe(false);
    expect(matchesClass({ stock: 'HGLG11', type: 'fund' }, 'REAL_ESTATE')).toBe(true);
    expect(matchesClass({ stock: 'HGLG11', type: 'fund' }, 'INTERNATIONAL')).toBe(false);
  });

  it('keeps educational metadata separate from live quotes', () => {
    for (const entry of INVESTMENT_CATALOG) {
      expect(ScreeningMetadataSchema.safeParse(entry).success).toBe(true);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty('price');
      expect(entry).not.toHaveProperty('capturedAt');
    }
  });

  it('ranks only verified entries and retains source and catalog dates', async () => {
    const get = vi.fn().mockResolvedValue([
      { stock: 'BOVA11', type: 'etf', volume: 50 },
      { stock: 'PETR4', type: 'stock', volume: 100 },
      { stock: 'UNKNOWN11', type: 'etf', volume: 200 },
    ]);
    const env = { MARKET_CACHE: { get } } as unknown as Env;
    const items = await screenByLiquidity('BRAZIL_STOCKS', env);
    expect(items.map((item) => item.symbol)).toEqual(['PETR4', 'BOVA11']);
    expect(items[1]?.exposure).toBe('BRAZIL');
    expect(items[1]?.source).toBe('brapi.dev');
    expect(items[1]?.asOf).toBe('2026-11-02');
    expect(items[1]?.capturedAt).toBeTruthy();
    expect(ScreeningItemSchema.safeParse(items[1]).success).toBe(true);
  });

  it('reports unavailable screening instead of inventing a candidate', async () => {
    const env = { MARKET_CACHE: { get: vi.fn().mockResolvedValue([]) } } as unknown as Env;
    await expect(screenByLiquidity('INTERNATIONAL', env)).rejects.toThrow('NO_SCREENING_CANDIDATE');
  });

  it('keeps legacy screening responses compatible', () => {
    expect(ScreeningItemSchema.safeParse({
      arcaClass: 'BRAZIL_STOCKS', symbol: 'PETR4', name: 'Petrobras',
      criterion: 'Volume', score: '100', source: 'brapi.dev', capturedAt: '2026-11-02T12:00:00Z',
    }).success).toBe(true);
  });
});
