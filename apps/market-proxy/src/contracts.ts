import { ArcaClassSchema } from '@arca/domain';
import { z } from 'zod';

export const QuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.string(),
  changePercent: z.string().nullable(),
  volume: z.string().nullable(),
  currency: z.literal('BRL'),
  capturedAt: z.string(),
  source: z.literal('BRAPI'),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const ScreeningItemSchema = z.object({
  arcaClass: ArcaClassSchema,
  symbol: z.string(),
  name: z.string(),
  criterion: z.string(),
  score: z.string(),
  source: z.string(),
  capturedAt: z.string(),
});

export interface Env {
  BRAPI_TOKEN: string;
  ARCA_PROXY_TOKEN: string;
  TREASURY_CSV_URL: string;
  MARKET_CACHE: KVNamespace;
}
