import Decimal from 'decimal.js';
import { PersonalItemsSchema, ProviderError } from './provider';
import type { z } from 'zod';
import { controlObservationDate, ControlStateSchema, type ControlState } from '@arca/domain';

type Row = Record<string, unknown>;
type PersonalItem = z.infer<typeof PersonalItemsSchema>[number];
export interface BankControlCredentials { clientId: string; clientSecret: string; items: PersonalItem[] }
interface BankEntity { id: string; externalId: string; connectionId: string }
export interface BankControlAccount extends BankEntity {
  institution: PersonalItem['institution']; name: string; balanceCents: number | null; observedAt: string;
}
export interface BankControlCard extends BankEntity {
  institution: PersonalItem['institution']; name: string; limitCents: number | null;
  availableLimitCents: number | null; usedLimitCents: number | null;
  /** Account balance has institution-dependent semantics; never use it as a bill or cash. */
  reportedBalanceCents: number | null; dueDate: string | null; closingDate: string | null;
}
export interface BankControlTransaction extends BankEntity {
  accountId: string; externalAccountId: string; providerId: string | null;
  accountKind: 'BANK' | 'CREDIT'; description: string; amountCents: number;
  date: string; status: 'PENDING' | 'POSTED'; direction: 'CREDIT' | 'DEBIT';
  kind: 'CASH_IN' | 'CASH_OUT' | 'OWN_TRANSFER' | 'INVESTMENT_TRANSFER' | 'CARD_PAYMENT' | 'CARD_PURCHASE' | 'CARD_REFUND' | 'CARD_CREDIT';
  operationType: string | null; billId: string | null;
  installmentNumber: number | null; totalInstallments: number | null; totalPurchaseCents: number | null;
  /** Historical movements annotate a dated balance; importing them must not replay cash. */
  affectsBalance: false;
}
export interface BankControlBill extends BankEntity {
  cardId: string; dueDate: string; closingDate: string | null; totalCents: number; minimumPaymentCents: number | null;
  /** Provider payments belong to the reporting cycle and may pay the PREVIOUS bill. */
  reportedPayments: { id: string; externalId: string; date: string; amountCents: number; valueType: string | null }[];
  financeCharges: { id: string; amountCents: number; type: string | null }[];
}
export interface BankControlImport {
  version: 1; syncedAt: string;
  connections: { id: string; institution: PersonalItem['institution']; status: 'UPDATED' | 'UPDATING' | 'LOGIN_REQUIRED' | 'ERROR'; updatedAt: string | null; accountsComplete: boolean; transactionsComplete: boolean; billsComplete: boolean }[];
  accounts: BankControlAccount[]; cards: BankControlCard[]; transactions: BankControlTransaction[]; bills: BankControlBill[];
  warnings: string[];
}

const row = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max = 200): string | null => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const date = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const result = value.slice(0, 10);
  const parsed = new Date(`${result}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : null;
};
function cents(value: unknown, signed = false): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  try {
    const amount = new Decimal(value);
    if (!amount.isFinite() || (!signed && amount.isNegative())) return null;
    const result = amount.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    return Number.isSafeInteger(result) ? result : null;
  } catch { return null; }
}
const id = (item: string, kind: string, external: string): string => `pluggy:${encodeURIComponent(item)}:${kind}:${encodeURIComponent(external)}`;
const label = (item: PersonalItem) => item.institution === 'NUBANK' ? 'Nubank' : 'Mercado Pago';
const unique = <T extends { id: string }>(values: T[]): T[] => [...new Map(values.map(value => [value.id, value])).values()];

async function readJson(response: Response): Promise<Row> {
  if (!response.body) throw new ProviderError('PROVIDER_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new ProviderError('PROVIDER_LIMIT'); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProviderError('PROVIDER_RESPONSE');
    return parsed as Row;
  } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError('PROVIDER_RESPONSE'); }
  finally { reader.releaseLock(); }
}

/** Read only configured, already-authorized MeuPluggy connections. Partial refreshes keep prior records atomically per connection. */
export async function loadControlBankImport(
  credentials: BankControlCredentials,
  requestFetch: typeof fetch = fetch,
  options: { now?: Date; previous?: BankControlImport } = {},
): Promise<BankControlImport> {
  const configuredItems = PersonalItemsSchema.parse(credentials.items);
  const syncedAt = (options.now ?? new Date()).toISOString();
  const result: BankControlImport = { version: 1, syncedAt, connections: [], accounts: [], cards: [], transactions: [], bills: [], warnings: [] };
  const deadline = Date.now() + 45000; let requests = 0;
  async function call(path: string, key?: string, body?: unknown): Promise<Row> {
    if (++requests > 45 || Date.now() >= deadline) throw new ProviderError('PROVIDER_LIMIT');
    let response: Response;
    try {
      response = await requestFetch(`https://api.pluggy.ai${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
        headers: { accept: 'application/json', ...(key ? { 'X-API-KEY': key } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - Date.now()))),
      });
    } catch { throw new ProviderError('PROVIDER_UNAVAILABLE'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(response.status === 401 ? 'PROVIDER_AUTH' : response.status === 403 ? 'PROVIDER_PERMISSION' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE');
    }
    return readJson(response);
  }
  const auth = await call('/auth', undefined, { clientId: credentials.clientId, clientSecret: credentials.clientSecret });
  const key = text(auth.apiKey, 4096);
  if (!key) throw new ProviderError('PROVIDER_AUTH');
  async function pages(path: string): Promise<Row[]> {
    const all: Row[] = [];
    for (let page = 1; page <= 4; page++) {
      const response = await call(`${path}&page=${page}&pageSize=100`, key!);
      if (!Array.isArray(response.results)) throw new ProviderError('PROVIDER_RESPONSE');
      const totalPages = response.totalPages;
      if (typeof totalPages !== 'number' || !Number.isSafeInteger(totalPages) || totalPages < 0) throw new ProviderError('PROVIDER_RESPONSE');
      all.push(...response.results.map(row));
      if (page >= totalPages) return all;
    }
    throw new ProviderError('PROVIDER_LIMIT');
  }
  async function transactions(accountId: string): Promise<Row[]> {
    const all: Row[] = []; const visited = new Set<string>();
    let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
    for (let page = 0; page < 8; page++) {
      if (visited.has(path)) throw new ProviderError('PROVIDER_RESPONSE');
      visited.add(path);
      const response = await call(path, key!);
      if (!Array.isArray(response.results) || !(response.next === null || typeof response.next === 'string')) throw new ProviderError('PROVIDER_RESPONSE');
      all.push(...response.results.map(row));
      if (response.next === null) return all;
      // Only accept a cursor query for this exact account, never a supplied remote URL or altered scope.
      if (!response.next.startsWith('?') || response.next.length > 6000) throw new ProviderError('PROVIDER_RESPONSE');
      const next = new URLSearchParams(response.next);
      if (next.get('accountId') !== accountId || next.getAll('accountId').length !== 1 || next.getAll('after').length !== 1 || !next.get('after') || [...next.keys()].some(field => !['accountId', 'after'].includes(field))) throw new ProviderError('PROVIDER_RESPONSE');
      path = `/v2/transactions?${next.toString()}`;
    }
    throw new ProviderError('PROVIDER_LIMIT');
  }
  for (const configured of configuredItems) {
    const connection: BankControlImport['connections'][number] = { ...configured, status: 'ERROR', updatedAt: null, accountsComplete: false, transactionsComplete: false, billsComplete: false };
    result.connections.push(connection);
    const staged: Pick<BankControlImport, 'accounts' | 'cards' | 'transactions' | 'bills'> = { accounts: [], cards: [], transactions: [], bills: [] };
    const foreignCardBills = new Set<string>();
    let hasBankConversion = false;
    try {
      const item = await call(`/items/${encodeURIComponent(configured.id)}`, key);
      if (item.id !== configured.id || row(item.connector).name !== 'MeuPluggy') throw new ProviderError('PROVIDER_WRONG_CONNECTOR');
      connection.updatedAt = timestamp(item.lastUpdatedAt ?? item.updatedAt);
      connection.status = item.status === 'UPDATED' ? 'UPDATED' : ['UPDATING', 'LOGIN_IN_PROGRESS', 'WAITING_USER_INPUT'].includes(String(item.status)) ? 'UPDATING' : ['LOGIN_ERROR', 'OUTDATED'].includes(String(item.status)) ? 'LOGIN_REQUIRED' : 'ERROR';
      if (connection.status !== 'UPDATED') throw new ProviderError('PROVIDER_STALE');
      const accounts = await pages(`/accounts?itemId=${encodeURIComponent(configured.id)}`);
      if (accounts.length > 12) throw new ProviderError('PROVIDER_LIMIT');
      for (const account of accounts) {
        const externalId = text(account.id);
        if (!externalId || account.itemId !== configured.id || !['BANK', 'CREDIT'].includes(String(account.type)) || account.currencyCode !== 'BRL') throw new ProviderError('PROVIDER_RESPONSE');
        const kind = account.type as 'BANK' | 'CREDIT';
        const accountId = id(configured.id, kind === 'BANK' ? 'account' : 'card', externalId);
        const balanceCents = cents(account.balance, true);
        if (kind === 'BANK') staged.accounts.push({ id: accountId, externalId, connectionId: configured.id, institution: configured.institution, name: `${label(configured)} — Conta`, balanceCents, observedAt: connection.updatedAt ?? syncedAt });
        else {
          const credit = row(account.creditData);
          const limitCents = cents(credit.creditLimit), availableLimitCents = cents(credit.availableCreditLimit);
          const usedLimitCents = credit.isLimitFlexible !== true && limitCents !== null && availableLimitCents !== null && limitCents >= availableLimitCents ? limitCents - availableLimitCents : null;
          staged.cards.push({ id: accountId, externalId, connectionId: configured.id, institution: configured.institution, name: `${label(configured)} — Cartão`, limitCents, availableLimitCents, usedLimitCents, reportedBalanceCents: balanceCents, dueDate: date(credit.balanceDueDate), closingDate: date(credit.balanceCloseDate) });
        }
        for (const movement of await transactions(externalId)) {
          const externalMovementId = text(movement.id), providerId = text(movement.providerId);
          const rawDate = date(movement.date), postedAt = movement.status === 'POSTED' && typeof movement.date === 'string' && movement.date.includes('T') ? timestamp(movement.date) : null;
          const movementDate = postedAt ? controlObservationDate(postedAt, 'America/Sao_Paulo') : rawDate;
          let amountCents = cents(movement.amount, true);
          if (!externalMovementId || movement.accountId !== externalId || !movementDate || amountCents === null || !['PENDING', 'POSTED'].includes(String(movement.status)) || !['CREDIT', 'DEBIT'].includes(String(movement.type))) throw new ProviderError('PROVIDER_RESPONSE');
          const operationType = text(movement.operationType, 100), metadata = row(movement.creditCardMetadata);
          if (movement.currencyCode !== 'BRL') {
            const foreignBill = text(metadata.billId);
            if (kind !== 'CREDIT' || !/^[A-Z]{3}$/.test(String(movement.currencyCode))) throw new ProviderError('PROVIDER_RESPONSE');
            const converted = cents(movement.amountInAccountCurrency, true);
            if (converted !== null && (amountCents < 0) === (converted < 0) && (amountCents === 0 || converted !== 0)) {
              // Account currency is validated as BRL above; this is the bank's amount, not an estimated exchange rate.
              amountCents = converted;
              hasBankConversion = true;
            } else {
              if (movement.status !== 'POSTED' || !foreignBill) throw new ProviderError('PROVIDER_RESPONSE');
              // A known BRL invoice can cover the foreign item when no usable conversion was supplied.
              foreignCardBills.add(id(configured.id, `bill:${externalId}`, foreignBill));
              continue;
            }
          }
          const payment = row(movement.paymentData), payer = text(row(row(payment.payer).documentNumber).value), receiver = text(row(row(payment.receiver).documentNumber).value);
          const ownTransfer = payer !== null && receiver !== null && payer.replace(/\D/g, '') !== '' && payer.replace(/\D/g, '') === receiver.replace(/\D/g, '');
          const cardPayment = kind === 'CREDIT'
            ? amountCents < 0 && movement.type === 'CREDIT' && ['PAGAMENTO', 'PAGAMENTO_FATURA'].includes(operationType ?? '')
            : operationType === 'PAGAMENTO_FATURA';
          const transactionKind: BankControlTransaction['kind'] = cardPayment ? 'CARD_PAYMENT' : kind === 'CREDIT' ? amountCents >= 0 ? 'CARD_PURCHASE' : operationType === 'ESTORNO' ? 'CARD_REFUND' : 'CARD_CREDIT' : ownTransfer ? 'OWN_TRANSFER' : ['RESGATE_APLIC_FINANCEIRA', 'APLICACAO_FINANCEIRA'].includes(operationType ?? '') ? 'INVESTMENT_TRANSFER' : movement.type === 'CREDIT' ? 'CASH_IN' : 'CASH_OUT';
          const rawBillId = text(metadata.billId);
          staged.transactions.push({ id: id(configured.id, `transaction:${externalId}`, providerId ?? externalMovementId), externalId: externalMovementId, connectionId: configured.id, accountId, externalAccountId: externalId, providerId, accountKind: kind, description: text(movement.description, 240) ?? 'Movimentação bancária', amountCents: Math.abs(amountCents), date: movementDate, status: movement.status as 'PENDING' | 'POSTED', direction: movement.type as 'CREDIT' | 'DEBIT', kind: transactionKind, operationType, billId: rawBillId ? id(configured.id, `bill:${externalId}`, rawBillId) : null, installmentNumber: integer(metadata.installmentNumber), totalInstallments: integer(metadata.totalInstallments), totalPurchaseCents: cents(metadata.totalAmount), affectsBalance: false });
        }
        if (kind === 'CREDIT') for (const bill of await pages(`/bills?accountId=${encodeURIComponent(externalId)}`)) {
          const billExternalId = text(bill.id), dueDate = date(bill.dueDate), totalCents = cents(bill.totalAmount);
          if (!billExternalId || !dueDate || totalCents === null || bill.totalAmountCurrencyCode !== 'BRL' || !Array.isArray(bill.payments) || !Array.isArray(bill.financeCharges)) throw new ProviderError('PROVIDER_RESPONSE');
          const billId = id(configured.id, `bill:${externalId}`, billExternalId);
          const reportedPayments: BankControlBill['reportedPayments'] = bill.payments.map(value => {
            const payment = row(value), paymentId = text(payment.id), paymentDate = date(payment.paymentDate), paid = cents(payment.amount);
            if (!paymentId || !paymentDate || paid === null || payment.currencyCode !== 'BRL') throw new ProviderError('PROVIDER_RESPONSE');
            return { id: id(configured.id, `payment:${externalId}`, paymentId), externalId: paymentId, date: paymentDate, amountCents: paid, valueType: text(payment.valueType, 100) };
          });
          const financeCharges: BankControlBill['financeCharges'] = bill.financeCharges.map(value => {
            const charge = row(value), chargeId = text(charge.id), chargeCents = cents(charge.amount);
            if (!chargeId || chargeCents === null || charge.currencyCode !== 'BRL') throw new ProviderError('PROVIDER_RESPONSE');
            return { id: id(configured.id, `charge:${externalId}`, chargeId), amountCents: chargeCents, type: text(charge.type, 100) };
          });
          staged.bills.push({ id: billId, externalId: billExternalId, connectionId: configured.id, cardId: accountId, dueDate, closingDate: date(bill.billClosingDate), totalCents, minimumPaymentCents: cents(bill.minimumPaymentAmount), reportedPayments: unique(reportedPayments), financeCharges: unique(financeCharges) });
        }
      }
      if ([...foreignCardBills].some(billId => !staged.bills.some(bill => bill.id === billId))) throw new ProviderError('PROVIDER_RESPONSE');
      if (foreignCardBills.size) result.warnings.push(`${label(configured)}: há compras em outra moeda já incluídas em faturas em reais. Os itens estrangeiros não foram convertidos nem importados; confira a composição no banco.`);
      if (hasBankConversion) result.warnings.push(`${label(configured)}: compras em outra moeda usam o valor em reais informado pelo banco. Lançamentos pendentes ainda podem mudar até o fechamento da fatura.`);
      connection.accountsComplete = connection.transactionsComplete = connection.billsComplete = true;
      for (const collection of ['accounts', 'cards', 'transactions', 'bills'] as const) (result[collection] as BankEntity[]).push(...unique<BankEntity>(staged[collection]));
      if (!staged.cards.length) result.warnings.push(`${label(configured)}: nenhum cartão foi disponibilizado pela conexão. Cadastre as faturas manualmente.`);
      if (staged.accounts.some(account => account.balanceCents === null)) result.warnings.push(`${label(configured)}: há saldo não informado; confira no banco antes de planejar um aporte.`);
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'PROVIDER_AUTH') throw error;
      if (connection.status === 'UPDATED') connection.status = error instanceof ProviderError && error.code === 'PROVIDER_PERMISSION' ? 'LOGIN_REQUIRED' : 'ERROR';
      for (const collection of ['accounts', 'cards', 'transactions', 'bills'] as const) (result[collection] as BankEntity[]).push(...(options.previous?.[collection] ?? []).filter(entity => entity.connectionId === configured.id));
      result.warnings.push(`${label(configured)}: a consulta ficou incompleta. Os últimos dados foram preservados; confirme os compromissos antes de investir.`);
    }
  }
  return result;
}

export interface BankControlReview {
  accountLinks?: Record<string, string | 'new'>;
  cardLinks?: Record<string, string | 'new'>;
  confirmations?: { purchaseLinks?: Record<string, string | 'new'> };
}
export interface BankControlApplication {
  state: ControlState;
  pendingTransactions: BankControlTransaction[];
  pendingLinks: { sourceId: string; kind: 'ACCOUNT' | 'CARD'; name: string; candidateIds: string[] }[];
  warnings: string[];
}

/** Pure preview for a subsequent REPLACE_REVIEWED command; it never advances revision or performs writes. */
export function applyBankControlImport(input: ControlState, bank: BankControlImport, review: BankControlReview = {}): BankControlApplication {
  const state = ControlStateSchema.parse(input);
  const warnings = [...bank.warnings];
  const pendingLinks: BankControlApplication['pendingLinks'] = [];
  const pendingTransactions: BankControlTransaction[] = [];
  const cardIds = new Map<string, string>(), billIds = new Map<string, string>();
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: state.settings.timezone }).format(new Date(bank.syncedAt)).slice(0, 7);
  const complete = new Set(bank.connections.filter(connection => connection.status === 'UPDATED' && connection.accountsComplete && connection.transactionsComplete && connection.billsComplete).map(connection => connection.id));
  let incompleteCash = bank.connections.some(connection => !complete.has(connection.id));
  let incompleteObligations = incompleteCash;
  // Capture the manual candidates before adding imported records, so one unresolved item cannot change another's default.
  const manualAccounts = state.accounts.filter(account => account.source !== 'BANK' && !account.cancelled);
  const manualCards = state.cards.filter(card => card.source !== 'BANK' && !card.cancelled);
  for (const account of bank.accounts.filter(value => complete.has(value.connectionId))) {
    const linked = state.accounts.find(value => value.source === 'BANK' && value.externalId === account.id);
    const choice = review.accountLinks?.[account.id];
    const chosen = choice && choice !== 'new' ? state.accounts.find(value => value.id === choice && !value.cancelled) : undefined;
    const resolved = linked ?? chosen;
    if (resolved?.cancelled || (choice && choice !== 'new' && !chosen && !linked) || (resolved?.source === 'BANK' && resolved.externalId !== account.id)) {
      warnings.push(`${account.name}: vínculo indisponível ou já utilizado. Revise a conta.`); incompleteCash = true; continue;
    }
    if (!resolved && choice !== 'new' && manualAccounts.length) {
      pendingLinks.push({ sourceId: account.id, kind: 'ACCOUNT', name: account.name, candidateIds: manualAccounts.map(value => value.id) }); incompleteCash = true; continue;
    }
    const accountId = resolved?.id ?? account.id;
    if (resolved) Object.assign(resolved, { source: 'BANK', externalId: account.id });
    else state.accounts.push({ id: accountId, name: account.name, source: 'BANK', externalId: account.id, cancelled: false });
    if (account.balanceCents === null) { incompleteCash = true; continue; }
    const anchorId = `${account.id}:balance:${Date.parse(account.observedAt)}`;
    const anchor = { id: anchorId, source: 'BANK' as const, externalId: anchorId, cancelled: false, accountId, balanceCents: account.balanceCents, observedAt: account.observedAt, confirmed: true };
    const existing = state.balanceObservations.findIndex(value => value.source === 'BANK' && value.externalId === anchorId);
    if (existing >= 0) state.balanceObservations[existing] = anchor;
    else state.balanceObservations.push(anchor);
  }
  for (const card of bank.cards.filter(value => complete.has(value.connectionId))) {
    const linked = state.cards.find(value => value.source === 'BANK' && value.externalId === card.id);
    const choice = review.cardLinks?.[card.id];
    const chosen = choice && choice !== 'new' ? state.cards.find(value => value.id === choice && !value.cancelled) : undefined;
    const resolved = linked ?? chosen;
    if (resolved?.cancelled || (choice && choice !== 'new' && !chosen && !linked) || (resolved?.source === 'BANK' && resolved.externalId !== card.id)) {
      warnings.push(`${card.name}: vínculo indisponível ou já utilizado. Revise o cartão.`); incompleteObligations = true; continue;
    }
    if (!resolved && choice !== 'new' && manualCards.length) {
      pendingLinks.push({ sourceId: card.id, kind: 'CARD', name: card.name, candidateIds: manualCards.map(value => value.id) }); incompleteObligations = true; continue;
    }
    const cardId = resolved?.id ?? card.id;
    const values = { source: 'BANK' as const, externalId: card.id, limitCents: card.limitCents, usedLimitCents: card.usedLimitCents, dueDay: card.dueDate ? Number(card.dueDate.slice(8, 10)) : resolved?.dueDay ?? null };
    if (resolved) Object.assign(resolved, values);
    else state.cards.push({ id: cardId, name: card.name, cancelled: false, ...values });
    cardIds.set(card.id, cardId);
  }
  for (const bill of bank.bills.filter(value => complete.has(value.connectionId))) {
    const cardId = cardIds.get(bill.cardId);
    if (!cardId) { incompleteObligations = true; continue; }
    const month = bill.dueDate.slice(0, 7);
    const strong = state.bills.find(value => value.source === 'BANK' && value.externalId === bill.id);
    const candidates = state.bills.filter(value => value.cardId === cardId && value.month === month && !value.cancelled);
    if (!strong && candidates.length > 1) {
      warnings.push('Mais de uma fatura foi cadastrada para o mesmo cartão e mês. Revise antes de vincular.'); incompleteObligations = true; continue;
    }
    const existing = strong ?? candidates[0];
    if (!existing && month < currentMonth) {
      warnings.push('Faturas históricas sem cadastro prévio permanecem na consulta. Elas não foram criadas como novas dívidas.');
      continue;
    }
    if (existing?.cancelled) { incompleteObligations = true; continue; }
    if (existing?.source === 'BANK' && existing.externalId !== bill.id) {
      warnings.push('O banco informou outra fatura para o mesmo cartão e mês. Confira os ciclos antes de substituir.'); incompleteObligations = true; continue;
    }
    // Keeping the local ID also keeps every manual payment and expense linked to this same bill.
    const billId = existing?.id ?? bill.id;
    const values = { source: 'BANK' as const, externalId: bill.id, cardId, month, totalCents: bill.totalCents, dueDate: bill.dueDate, verification: 'CONFIRMED' as const, paymentStatusKnown: existing?.paymentStatusKnown ?? false };
    if (existing) Object.assign(existing, values);
    else state.bills.push({ id: billId, cancelled: false, includesRecurring: true, ...values });
    billIds.set(bill.id, billId);
    if (bill.reportedPayments.length) warnings.push('Há pagamentos informados pelo banco para conciliar. Eles não foram aplicados automaticamente à fatura deste ciclo.');
  }
  for (const movement of bank.transactions.filter(value => complete.has(value.connectionId))) {
    const alreadyReviewed = [...state.incomes, ...state.expenses, ...state.payments].some(value => value.source === 'BANK' && value.externalId === movement.id);
    if (alreadyReviewed) continue;
    const cardId = cardIds.get(movement.accountId), billId = movement.billId ? billIds.get(movement.billId) : undefined;
    const bill = billId ? state.bills.find(value => value.id === billId && !value.cancelled) : undefined;
    const existing = state.purchases.find(value => value.source === 'BANK' && value.externalId === movement.id);
    if (movement.kind !== 'CARD_PURCHASE' || !cardId || !bill || bill.cardId !== cardId || existing?.cancelled) {
      pendingTransactions.push(movement);
      if (movement.status === 'PENDING' || movement.accountKind === 'CREDIT') incompleteObligations = true;
      continue;
    }
    const choice = review.confirmations?.purchaseLinks?.[movement.id];
    const chosen = choice && choice !== 'new' ? state.purchases.find(value => value.id === choice && value.cardId === cardId && value.billId === bill.id && !value.cancelled) : undefined;
    const manual = state.purchases.filter(value => value.source !== 'BANK' && value.cardId === cardId && value.billId === bill.id && !value.cancelled);
    if ((!existing && !chosen && choice !== 'new' && manual.length) || (choice && choice !== 'new' && !chosen && !existing) || (chosen?.source === 'BANK' && chosen.externalId !== movement.id)) {
      pendingTransactions.push(movement); incompleteObligations = true; continue;
    }
    const purchase = existing ?? chosen;
    const installmentNumber = movement.installmentNumber ?? 1, totalInstallments = movement.totalInstallments ?? 1;
    if (installmentNumber > totalInstallments || totalInstallments > 600) { pendingTransactions.push(movement); incompleteObligations = true; continue; }
    const values = { source: 'BANK' as const, externalId: movement.id, cardId, billId: bill.id, name: movement.description.slice(0, 160), amountCents: movement.amountCents, purchaseDate: movement.date, dueDate: bill.dueDate, installmentNumber, totalInstallments, verification: 'CONFIRMED' as const };
    if (purchase) Object.assign(purchase, values);
    else state.purchases.push({ id: movement.id, cancelled: false, categoryId: null, groupId: null, ...values });
  }
  if (incompleteCash) state.settings.cashConfirmed = false;
  else state.settings.cashConfirmed = state.accounts.some(account => !account.cancelled) && state.accounts.filter(account => !account.cancelled).every(account => state.balanceObservations.some(balance => balance.accountId === account.id && balance.confirmed && !balance.cancelled));
  if (incompleteObligations || pendingLinks.length) state.settings.obligationsReviewed = false;
  if (pendingTransactions.length) warnings.push('Movimentações aguardam conciliação; receitas e pagamentos não foram recriados a partir do histórico bancário.');
  return { state: ControlStateSchema.parse(state), pendingTransactions, pendingLinks, warnings: [...new Set(warnings)] };
}

/** Refresh facts for established links; history is not a new cash flow or debt. */
export function applyKnownBankControlImport(input: ControlState, bank: BankControlImport): BankControlApplication {
  const linkedAccounts = new Set(input.accounts.filter(row => row.source === 'BANK' && !row.cancelled).map(row => row.externalId));
  const linkedCards = new Set(input.cards.filter(row => row.source === 'BANK' && !row.cancelled).map(row => row.externalId));
  if (!linkedAccounts.size && !linkedCards.size) return { state: ControlStateSchema.parse(input), pendingLinks: [], pendingTransactions: [], warnings: [...bank.warnings] };
  const summaryOnly = {
    ...bank,
    accounts: bank.accounts.filter(row => linkedAccounts.has(row.id)),
    cards: bank.cards.filter(row => linkedCards.has(row.id)),
    bills: bank.bills.filter(row => linkedCards.has(row.cardId)),
    transactions: [],
  };
  return applyBankControlImport(input, summaryOnly);
}
