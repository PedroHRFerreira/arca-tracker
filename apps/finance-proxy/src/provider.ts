import { FinanceSnapshotSchema, type FinanceSnapshot } from '@arca/domain';
import Decimal from 'decimal.js';
import { z } from 'zod';

export const PersonalItemsSchema = z.array(z.object({
  id: z.string().uuid(), institution: z.enum(['NUBANK', 'MERCADO_PAGO']),
}).strict()).min(1).max(5).refine(items => new Set(items.map(item => item.id)).size === items.length);
type PersonalItem = z.infer<typeof PersonalItemsSchema>[number];
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max = 160): string | null => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
function amount(value: unknown, signed = false): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite() || (!signed && decimal.lt(0))) return null;
    const result = decimal.toFixed();
    return (signed ? /^-?\d{1,18}(?:\.\d{1,12})?$/ : /^\d{1,18}(?:\.\d{1,12})?$/).test(result) ? result : null;
  } catch { return null; }
}
const timestamp = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const currency = (value: unknown): string | null => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
const institutionName = (item: PersonalItem) => item.institution === 'NUBANK' ? 'Nubank' : 'Mercado Pago';

export class ProviderError extends Error {
  constructor(public code: string) { super(code); }
}

/** Bound decompressed response size before parsing. No provider bodies or secrets enter logs/errors. */
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new ProviderError('PROVIDER_RESPONSE');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new ProviderError('PROVIDER_LIMIT'); }
      parts.push(part.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(result));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('PROVIDER_RESPONSE');
  } finally { reader.releaseLock(); }
}

export async function loadPersonalSnapshot(
  credentials: { clientId: string; clientSecret: string; items: PersonalItem[] },
  requestFetch: typeof fetch = fetch,
): Promise<FinanceSnapshot> {
  let requests = 0;
  const deadline = Date.now() + 45000;
  const warnings = new Set<string>();
  async function call(path: string, key?: string, body?: unknown): Promise<Row> {
    if (++requests > 40 || Date.now() >= deadline) throw new ProviderError('PROVIDER_LIMIT');
    let response: Response;
    try {
      response = await requestFetch(`https://api.pluggy.ai${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { accept: 'application/json', ...(key ? { 'X-API-KEY': key } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - Date.now()))), redirect: 'manual',
      });
    } catch { throw new ProviderError('PROVIDER_UNAVAILABLE'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(response.status === 401 ? 'PROVIDER_AUTH' : response.status === 403 ? 'PROVIDER_PERMISSION' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE');
    }
    return record(await readJson(response));
  }
  const authentication = await call('/auth', undefined, { clientId: credentials.clientId, clientSecret: credentials.clientSecret });
  const authenticatedKey = text(authentication.apiKey, 4096);
  if (!authenticatedKey) throw new ProviderError('PROVIDER_AUTH');
  const apiKey: string = authenticatedKey;
  async function list(path: string, label: string): Promise<Row[]> {
    const all: Row[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await call(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`, apiKey);
      if (!Array.isArray(response.results)) throw new ProviderError('PROVIDER_RESPONSE');
      all.push(...response.results.map(record));
      const pages = Number(response.totalPages ?? 1);
      if (!Number.isFinite(pages) || pages < 0) throw new ProviderError('PROVIDER_RESPONSE');
      if (page >= pages) return all;
      if (page === 3) throw new ProviderError('PROVIDER_LIMIT');
    }
    return all;
  }
  const snapshot: FinanceSnapshot = { version: 1, syncedAt: new Date().toISOString(), connections: [], accounts: [], investments: [], trades: [], warnings: [] };
  let queriedTrades = 0;
  for (const configured of credentials.items) {
    const name = institutionName(configured);
    const connection: FinanceSnapshot['connections'][number] = { ...configured, name, status: 'ERROR', updatedAt: null };
    snapshot.connections.push(connection);
    try {
      const item = await call(`/items/${encodeURIComponent(configured.id)}`, apiKey);
      // A personal app may consume only the already-authorized MeuPluggy proxy, never direct bank connectors.
      if (record(item.connector).name !== 'MeuPluggy') throw new ProviderError('PROVIDER_WRONG_CONNECTOR');
      if (item.id !== configured.id) throw new ProviderError('PROVIDER_RESPONSE');
      connection.updatedAt = timestamp(item.lastUpdatedAt ?? item.updatedAt);
      connection.status = item.status === 'UPDATED' ? 'UPDATED' : ['UPDATING', 'LOGIN_IN_PROGRESS', 'WAITING_USER_INPUT'].includes(String(item.status)) ? 'UPDATING' : item.status === 'LOGIN_ERROR' || item.status === 'OUTDATED' ? 'LOGIN_REQUIRED' : 'ERROR';
      if (connection.status !== 'UPDATED') {
        warnings.add(`${name}: a conexão precisa de atualização ou autorização no Meu Pluggy. Os últimos dados do aparelho foram preservados.`);
        continue;
      }
      const accounts = await list(`/accounts?itemId=${encodeURIComponent(configured.id)}`, name);
      for (const account of accounts) {
        const accountId = text(account.id, 200), code = currency(account.currencyCode), balance = amount(account.balance, true);
        if (!accountId || !code || balance === null || !['BANK', 'CREDIT'].includes(String(account.type))) {
          connection.status = 'ERROR';
          warnings.add(`${name}: uma conta sem moeda, tipo ou saldo confirmado não foi incluída.`); continue;
        }
        if (account.itemId !== configured.id) throw new ProviderError('PROVIDER_RESPONSE');
        snapshot.accounts.push({ id: accountId, connectionId: configured.id, name: account.type === 'CREDIT' ? 'Cartão de crédito' : 'Conta bancária', kind: account.type as 'BANK' | 'CREDIT', balance, currency: code });
      }
      let investments: Row[];
      try { investments = await list(`/investments?itemId=${encodeURIComponent(configured.id)}`, name); }
      catch (error) {
        connection.status = 'ERROR';
        warnings.add(`${name}: os investimentos não puderam ser consultados agora. Confira a autorização e tente novamente.`);
        if (error instanceof ProviderError && error.code === 'PROVIDER_AUTH') throw error;
        continue;
      }
      for (const investment of investments) {
        if (investment.status === 'TOTAL_WITHDRAWAL') { warnings.add(`${name}: aplicações totalmente resgatadas não compõem as posições atuais. Para operações antigas, use o extrato.`); continue; }
        if (investment.status === 'PENDING') { warnings.add(`${name}: uma aplicação pendente não foi tratada como concluída.`); continue; }
        if (investment.status !== 'ACTIVE') { connection.status = 'ERROR'; warnings.add(`${name}: uma aplicação sem situação confirmada não foi incluída.`); continue; }
        const investmentId = text(investment.id, 200), code = currency(investment.currencyCode), investmentName = text(investment.name);
        if (!investmentId || !code || !investmentName) { connection.status = 'ERROR'; warnings.add(`${name}: um investimento com dados incompletos foi separado para revisão no banco.`); continue; }
        if (investment.itemId !== configured.id) throw new ProviderError('PROVIDER_RESPONSE');
        const type = investment.type === 'ETF' ? 'ETF' : investment.type === 'EQUITY' && investment.subtype === 'REAL_ESTATE_FUND' ? 'FII' : investment.type === 'EQUITY' && ['STOCK', 'BDR'].includes(String(investment.subtype)) ? 'EQUITY' : investment.type === 'FIXED_INCOME' ? 'FIXED_INCOME' : investment.type === 'MUTUAL_FUND' ? 'FUND' : 'OTHER';
        const symbolText = text(investment.code, 32)?.toUpperCase() ?? null;
        const position: FinanceSnapshot['investments'][number] = {
          id: investmentId, connectionId: configured.id, symbol: symbolText && /^[A-Z]{4}\d{1,2}$/.test(symbolText) ? symbolText : null,
          name: investmentName, type, quantity: amount(investment.quantity), unitPrice: amount(investment.value), value: amount(investment.balance), currency: code,
          updatedAt: timestamp(investment.date),
        };
        snapshot.investments.push(position);
        if (!['EQUITY', 'ETF', 'FII'].includes(type)) continue;
        if (++queriedTrades > 12) { connection.status = 'ERROR'; warnings.add('Há mais investimentos para consultar. Importe o extrato para conferir todo o histórico.'); continue; }
        try {
          const trades = await list(`/investments/${encodeURIComponent(investmentId)}/transactions`, name);
          for (const trade of trades) {
            if (!['BUY', 'SELL'].includes(String(trade.type)) || ['PENDING', 'CANCELLED', 'REJECTED'].includes(String(trade.status))) continue;
            const tradeId = text(trade.id, 200), quantity = amount(trade.quantity), unitPrice = amount(trade.value);
            const rawDate = text(trade.date, 40), date = rawDate?.slice(0, 10);
            if (!tradeId || !quantity || !unitPrice || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !new Decimal(quantity).gt(0) || !new Decimal(unitPrice).gt(0)) {
              connection.status = 'ERROR';
              warnings.add(`${investmentName}: operação incompleta disponível apenas para revisão pelo extrato.`); continue;
            }
            // {} or absent/null expense components mean unknown, not a free transaction.
            const expenses = record(trade.expenses);
            const components = ['serviceTax', 'brokerageFee', 'incomeTax', 'tradingAssetsNoticeFee', 'maintenanceFee', 'settlementFee', 'clearingFee', 'stockExchangeFee', 'custodyFee', 'operatingFee', 'other'];
            const values = components.map(component => expenses[component]);
            // Provisions are not charged fees; unexpected nonzero IOF needs manual review.
            const hasUnknownTax = ['iof', 'iofProvision'].some(field => expenses[field] != null && amount(expenses[field]) !== '0');
            const fees = !hasUnknownTax && values.every(value => amount(value) !== null)
              ? values.reduce<Decimal>((sum, value) => sum.plus(amount(value)!), new Decimal(0)).toFixed() : null;
            snapshot.trades.push({ id: tradeId, investmentId, connectionId: configured.id, type: trade.type as 'BUY' | 'SELL', tradeDate: date, quantity, unitPrice, fees });
          }
        } catch { connection.status = 'ERROR'; warnings.add(`${investmentName}: histórico de operações indisponível nesta consulta.`); }
      }
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'PROVIDER_AUTH') throw error;
      connection.status = error instanceof ProviderError && error.code === 'PROVIDER_PERMISSION' ? 'LOGIN_REQUIRED' : 'ERROR';
      warnings.add(`${name}: não foi possível consultar a conexão. Confira o vínculo no Meu Pluggy e tente novamente.`);
    }
  }
  snapshot.warnings = [...warnings].slice(0, 200);
  const parsed = FinanceSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new ProviderError('PROVIDER_RESPONSE');
  return parsed.data;
}
