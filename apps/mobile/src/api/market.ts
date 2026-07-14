import * as SecureStore from "expo-secure-store";
import { z } from "zod";

const QuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.string(),
  changePercent: z.string().nullable(),
  capturedAt: z.string(),
  source: z.literal("BRAPI"),
});
const ScreeningSuggestionSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  criterion: z.string(),
  source: z.string(),
  capturedAt: z.string(),
});
const ScreeningResponseSchema = z.object({
  items: z.array(ScreeningSuggestionSchema).max(10),
});
const baseUrl = process.env.EXPO_PUBLIC_MARKET_PROXY_URL;

export async function setProxyToken(token: string) {
  await SecureStore.setItemAsync("arca_proxy_token", token);
}

export async function getProxyToken() {
  return (
    (await SecureStore.getItemAsync("arca_proxy_token")) ??
    process.env.EXPO_PUBLIC_ARCA_PROXY_TOKEN ??
    null
  );
}

async function request(path: string) {
  if (!baseUrl) throw new Error("PROXY_NOT_CONFIGURED");
  const token = await getProxyToken();
  if (!token) throw new Error("PROXY_TOKEN_MISSING");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`PROXY_${response.status}`);
  return response.json();
}

export async function fetchMarketQuote(symbol: string) {
  return QuoteSchema.parse(
    await request(`/v1/quotes/${encodeURIComponent(symbol)}`),
  );
}

export async function fetchScreening(arcaClass: string) {
  return ScreeningResponseSchema.parse(
    await request(`/v1/screening/${encodeURIComponent(arcaClass)}`),
  ).items;
}
