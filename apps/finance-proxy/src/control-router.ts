import { z } from 'zod';
import { calculateControlSummary, projectControlMonths, ControlCommandSchema, ControlIncomeSchema, ControlExpenseSchema, ControlPaymentSchema, ControlPurchaseSchema } from '@arca/domain';
import { PersonalItemsSchema } from './provider';
import { applyBankControlImport, loadControlBankImport, type BankControlImport } from './control-bank';
import { commitControlCommand, ControlError, CONTROL_OWNER, issueControlToken, readControlState, readDiscordConnection } from './control-store';
import { controlToday, type DiscordConfig } from './control-discord';
import { configureDiscord, discordReady } from './control-configuration';

export type ControlEnv = DiscordConfig & { PLUGGY_CLIENT_ID: string; PLUGGY_CLIENT_SECRET: string; PERSONAL_ITEMS_JSON: string; PLUGGY_WEBHOOK_TOKEN?: string };
export const privateJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' } });
export async function boundedJson(request: Request, limit = 2 * 1024 * 1024): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) throw new ControlError('JSON_REQUIRED');
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw new ControlError('BODY_TOO_LARGE', 413);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > limit) { await reader.cancel(); throw new ControlError('BODY_TOO_LARGE', 413); } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ControlError('INVALID_JSON'); }
  } finally { reader.releaseLock(); }
}
async function cachedBank(db: D1Database): Promise<BankControlImport | null> {
  const row = await db.prepare('SELECT payload_json FROM control_bank_cache WHERE id = 1').first<{ payload_json: string }>();
  return row ? JSON.parse(row.payload_json) as BankControlImport : null;
}
async function unreviewedBank(db: D1Database, bank: BankControlImport): Promise<BankControlImport> {
  const decisions = await db.prepare('SELECT id FROM control_bank_decisions').all<{ id: string }>();
  const ignored = new Set(decisions.results.map(row => row.id));
  return { ...bank, transactions: bank.transactions.filter(row => !ignored.has(row.id)) };
}
export async function refreshControlBankCache(env: ControlEnv): Promise<BankControlImport> {
  if (!env.DB) throw new ControlError('CONTROL_NOT_CONFIGURED', 503);
  const previous = await cachedBank(env.DB);
  const bank = await loadControlBankImport({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET, items: PersonalItemsSchema.parse(JSON.parse(env.PERSONAL_ITEMS_JSON)) }, fetch, previous ? { previous } : {});
  await env.DB.prepare('INSERT INTO control_bank_cache(id,payload_json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at')
    .bind(JSON.stringify(bank), bank.syncedAt).run();
  return bank;
}
const links = z.record(z.string().min(1).max(200)).refine(value => Object.keys(value).length <= 200);
export async function handleControl(request: Request, env: ControlEnv): Promise<Response> {
  if (!env.DB) return privateJson({ error: 'CONTROL_NOT_CONFIGURED' }, 503);
  const path = new URL(request.url).pathname.slice('/v1/control/'.length);
  try {
    if (request.method === 'GET' && path === 'state') {
      const connection = await readDiscordConnection(env.DB);
      return privateJson({ state: await readControlState(env.DB), status: { discordConfigured: await discordReady(env), discordLinked: Boolean(connection), deliveryError: connection?.delivery_error ?? null } });
    }
    if (request.method === 'GET' && path === 'summary') {
      const state = await readControlState(env.DB); const today = controlToday(state);
      return privateJson({ today, summary: calculateControlSummary(state, today), projection: projectControlMonths(state, today.slice(0, 7), 6) });
    }
    if (request.method === 'GET' && path === 'banks/review') {
      const bank = await cachedBank(env.DB);
      if (!bank) return privateJson({ bank: null, pendingLinks: [], pendingTransactions: [], warnings: [] });
      const review = applyBankControlImport(await readControlState(env.DB), await unreviewedBank(env.DB, bank));
      return privateJson({ bank, pendingLinks: review.pendingLinks, pendingTransactions: review.pendingTransactions, warnings: review.warnings });
    }
    if (request.method !== 'POST') return privateJson({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (path === 'commands') {
      const body = z.object({ command: ControlCommandSchema }).strict().parse(await boundedJson(request));
      return privateJson({ state: await commitControlCommand(env.DB, body.command) });
    }
    if (path === 'banks/refresh') {
      await boundedJson(request, 1024);
      const bank = await refreshControlBankCache(env);
      return privateJson({ updatedAt: bank.syncedAt, warnings: bank.warnings });
    }
    if (path === 'banks/apply') {
      const body = z.object({ baseRevision: z.number().int().nonnegative(), accountLinks: links.default({}), cardLinks: links.default({}), purchaseLinks: links.default({}) }).strict().parse(await boundedJson(request));
      const state = await readControlState(env.DB);
      if (body.baseRevision !== state.revision) throw new ControlError('REVISION_CONFLICT', 409);
      const bank = await cachedBank(env.DB); if (!bank) throw new ControlError('BANK_REVIEW_REQUIRED');
      const review = applyBankControlImport(state, await unreviewedBank(env.DB, bank), { accountLinks: body.accountLinks, cardLinks: body.cardLinks, confirmations: { purchaseLinks: body.purchaseLinks } });
      const next = await commitControlCommand(env.DB, { id: crypto.randomUUID(), baseRevision: state.revision, createdAt: new Date().toISOString(), type: 'REPLACE_REVIEWED', state: review.state, confirmed: true });
      return privateJson({ state: next, pendingLinks: review.pendingLinks, pendingTransactions: review.pendingTransactions, warnings: review.warnings });
    }
    if (path === 'banks/transaction') {
      const body = z.object({ transactionId: z.string().max(200), collection: z.enum(['incomes','expenses','payments','purchases','IGNORE']), entityId: z.string().max(200).optional(), billId: z.string().max(200).optional(), accountId: z.string().max(200).optional(), baseRevision: z.number().int().nonnegative() }).strict().parse(await boundedJson(request, 4096));
      const state = await readControlState(env.DB);
      const previous = await env.DB.prepare('SELECT id FROM control_bank_decisions WHERE id = ?').bind(body.transactionId).first();
      if (previous) return privateJson({ state });
      if (state.revision !== body.baseRevision) throw new ControlError('REVISION_CONFLICT', 409);
      const bank = await cachedBank(env.DB); const transaction = bank?.transactions.find(row => row.id === body.transactionId);
      if (!transaction) throw new ControlError('TRANSACTION_NOT_FOUND');
      if (body.collection === 'IGNORE') {
        await env.DB.prepare('INSERT OR IGNORE INTO control_bank_decisions(id,decision_json,created_at) VALUES(?,?,?)').bind(body.transactionId, JSON.stringify(body), new Date().toISOString()).run();
        return privateJson({ state });
      }
      if (transaction.status !== 'POSTED') throw new ControlError('TRANSACTION_NOT_SETTLED');
      if (['OWN_TRANSFER','CARD_REFUND','CARD_CREDIT'].includes(transaction.kind)) throw new ControlError('MANUAL_RECONCILIATION_REQUIRED');
      const exists = [...state.incomes, ...state.expenses, ...state.payments, ...state.purchases].find(row => row.source === 'BANK' && row.externalId === transaction.id);
      if (exists) return privateJson({ state });
      const accountId = body.accountId ?? state.accounts.find(row => row.externalId === transaction.accountId)?.id ?? null;
      if (body.collection !== 'purchases' && (!accountId || !state.accounts.some(row => row.id === accountId && !row.cancelled))) throw new ControlError('ACCOUNT_LINK_REQUIRED');
      const existing = body.entityId ? state[body.collection].find(row => row.id === body.entityId && !row.cancelled) : undefined;
      if (body.entityId && !existing) throw new ControlError('RECORD_NOT_FOUND');
      if (existing?.source === 'BANK' && existing.externalId !== transaction.id) throw new ControlError('RECORD_ALREADY_LINKED', 409);
      const common = { ...(existing ?? {}), id: existing?.id ?? transaction.id, source: 'BANK', externalId: transaction.id, amountCents: transaction.amountCents, accountId, affectsCash: false };
      let entity: Record<string, unknown>;
      if (body.collection === 'payments') {
        if (transaction.kind !== 'CARD_PAYMENT' && transaction.kind !== 'CASH_OUT') throw new ControlError('PAYMENT_REVIEW_REQUIRED');
        entity = ControlPaymentSchema.parse({ ...common, billId: body.billId, paidDate: transaction.date, paidAt: null, confirmed: true });
      } else if (body.collection === 'purchases') {
        if (transaction.kind !== 'CARD_PURCHASE' || !body.billId) throw new ControlError('PURCHASE_REVIEW_REQUIRED');
        const bill = state.bills.find(row => row.id === body.billId && !row.cancelled); if (!bill) throw new ControlError('BILL_LINK_REQUIRED');
        const sourceCard = state.cards.find(row => row.externalId === transaction.accountId && row.source === 'BANK');
        if (!sourceCard || sourceCard.id !== bill.cardId) throw new ControlError('BILL_CARD_MISMATCH');
        const { accountId: _account, affectsCash: _cash, ...purchaseBase } = common;
        entity = ControlPurchaseSchema.parse({ ...purchaseBase, cardId: bill.cardId, billId: bill.id, name: transaction.description.slice(0, 160), purchaseDate: transaction.date, dueDate: bill.dueDate,
          installmentNumber: transaction.installmentNumber ?? 1, totalInstallments: transaction.totalInstallments ?? 1, verification: 'CONFIRMED' });
      } else {
        if (transaction.accountKind !== 'BANK' || transaction.kind === 'CARD_PAYMENT' || (body.collection === 'incomes' ? transaction.direction !== 'CREDIT' : transaction.direction !== 'DEBIT')) throw new ControlError('MOVEMENT_REVIEW_REQUIRED');
        entity = (body.collection === 'incomes' ? ControlIncomeSchema : ControlExpenseSchema).parse({ ...common, name: 'name' in (existing ?? {}) ? (existing as { name: string }).name : transaction.description.slice(0, 160), dueDate: 'dueDate' in (existing ?? {}) ? (existing as { dueDate: string }).dueDate : transaction.date,
          status: 'SETTLED', settledDate: transaction.date, settledAt: null, verification: 'CONFIRMED' });
      }
      const next = await commitControlCommand(env.DB, { id: crypto.randomUUID(), baseRevision: state.revision, createdAt: new Date().toISOString(), type: 'UPSERT', collection: body.collection, entity });
      await env.DB.prepare('INSERT OR IGNORE INTO control_bank_decisions(id,decision_json,created_at) VALUES(?,?,?)').bind(transaction.id, JSON.stringify(body), new Date().toISOString()).run();
      return privateJson({ state: next });
    }
    if (path === 'discord/pair') {
      await boundedJson(request, 1024);
      if (!await discordReady(env)) return privateJson({ error: 'DISCORD_NOT_CONFIGURED' }, 503);
      const token = await issueControlToken(env.DB, 'PAIR', { owner: CONTROL_OWNER });
      return privateJson({ ...token, installUrl: `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APPLICATION_ID}&scope=bot%20applications.commands&permissions=0` });
    }
    if (path === 'discord/setup') {
      await boundedJson(request, 1024);
      await configureDiscord(env);
      return privateJson({ configured: true, interactionsUrl: `${new URL(request.url).origin}/discord/interactions` });
    }
    if (path === 'discord/unlink') {
      await boundedJson(request, 1024);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM discord_connection WHERE owner = ?').bind(CONTROL_OWNER),
        env.DB.prepare("DELETE FROM control_tokens WHERE purpose IN ('PAIR','CONFIRM')"),
      ]);
      return privateJson({ unlinked: true });
    }
    return privateJson({ error: 'NOT_FOUND' }, 404);
  } catch (error) {
    if (error instanceof ControlError) return privateJson({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return privateJson({ error: 'CONTROL_DATA_INVALID' }, 400);
    return privateJson({ error: 'CONTROL_UNAVAILABLE' }, 503);
  }
}
