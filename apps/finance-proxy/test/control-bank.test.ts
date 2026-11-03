import { describe, expect, it, vi } from 'vitest';
import { applyBankControlImport, loadControlBankImport } from '../src/control-bank';
import { createControlState, ControlStateSchema } from '@arca/domain';

const itemId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const credentials = { clientId: 'synthetic-client', clientSecret: 'synthetic-secret', items: [{ id: itemId, institution: 'NUBANK' as const }] };
const now = new Date('2026-11-03T15:00:00Z');
const bank = { id: 'bank-account', itemId, type: 'BANK', currencyCode: 'BRL', balance: 40.71, number: 'private-number', owner: 'private-owner' };
const card = { id: 'credit-account', itemId, type: 'CREDIT', currencyCode: 'BRL', balance: 125, creditData: { creditLimit: 1000, availableCreditLimit: 600, balanceDueDate: '2026-11-10', balanceCloseDate: '2026-11-02' } };
const movement = (accountId: string, overrides: Record<string, unknown> = {}) => ({ id: 'movement-1', accountId, currencyCode: 'BRL', amount: 12.31, date: '2026-11-02T12:00:00Z', status: 'POSTED', type: 'DEBIT', description: 'Compra de teste', ...overrides });
const bill = { id: 'bill-1', dueDate: '2026-11-10T00:00:00Z', totalAmount: 125, totalAmountCurrencyCode: 'BRL', payments: [{ id: 'payment-1', paymentDate: '2026-10-10T00:00:00Z', currencyCode: 'BRL', amount: 75, valueType: 'FULL_PAYMENT' }], financeCharges: [] };
type Overrides = { accounts?: unknown[]; movements?: Record<string, unknown[]>; bills?: unknown[]; status?: string; alter?: (url: URL) => Response | undefined };
function provider(overrides: Overrides = {}) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api.pluggy.ai'); expect(init?.redirect).toBe('manual');
    const altered = overrides.alter?.(url); if (altered) return altered;
    if (url.pathname === '/auth') { expect(init?.method).toBe('POST'); return Response.json({ apiKey: 'synthetic-key' }); }
    expect(init?.method).toBe('GET');
    if (url.pathname === `/items/${itemId}` || url.pathname === `/items/${secondId}`) return Response.json({ id: url.pathname.split('/').pop(), connector: { name: 'MeuPluggy' }, status: overrides.status ?? 'UPDATED', lastUpdatedAt: '2026-11-03T12:00:00Z' });
    if (url.pathname === '/accounts') return Response.json({ results: overrides.accounts ?? [bank, card], totalPages: 1 });
    if (url.pathname === '/v2/transactions') return Response.json({ results: overrides.movements?.[url.searchParams.get('accountId')!] ?? [], next: null });
    if (url.pathname === '/bills') return Response.json({ results: overrides.bills ?? [bill], totalPages: 1 });
    throw new Error('Unexpected provider endpoint');
  });
}

describe('private control bank adapter', () => {
  it('preserves BRL bills and balances when a posted foreign purchase is already included in an identified BRL bill', async () => {
    const result = await loadControlBankImport(credentials, provider({ movements: { 'credit-account': [movement('credit-account', { currencyCode: 'USD', creditCardMetadata: { billId: 'bill-1' } })] } }), { now });
    expect(result.connections[0]?.status).toBe('UPDATED');
    expect(result.accounts).toHaveLength(1); expect(result.cards).toHaveLength(1); expect(result.bills).toHaveLength(1);
    expect(result.transactions).toEqual([]); expect(result.warnings.join(' ')).toContain('outra moeda');
  });
  it('blocks a foreign purchase when its actual BRL bill is unavailable', async () => {
    const result = await loadControlBankImport(credentials, provider({ bills: [], movements: { 'credit-account': [movement('credit-account', { currencyCode: 'USD', creditCardMetadata: { billId: 'unknown-bill' } })] } }), { now });
    expect(result.connections[0]?.status).toBe('ERROR'); expect(result.accounts).toEqual([]);
  });
  it('keeps dated cash anchors and card limits separate, and removes private identities', async () => {
    const result = await loadControlBankImport(credentials, provider(), { now });
    expect(result.accounts[0]).toMatchObject({ balanceCents: 4071, observedAt: '2026-11-03T12:00:00.000Z' });
    expect(result.cards[0]).toMatchObject({ limitCents: 100000, usedLimitCents: 40000, availableLimitCents: 60000, reportedBalanceCents: 12500, dueDate: '2026-11-10' });
    expect(result.connections[0]).toMatchObject({ accountsComplete: true, transactionsComplete: true, billsComplete: true });
    expect(JSON.stringify(result)).not.toMatch(/private-number|private-owner|synthetic-key|synthetic-secret/);
    expect(result.accounts).toHaveLength(1);
  });
  it('never replays historical cash, treats card posting as a purchase and payment as settlement evidence only', async () => {
    const result = await loadControlBankImport(credentials, provider({ movements: {
      'bank-account': [movement('bank-account', { id: 'salary', amount: 300, type: 'CREDIT' })],
      'credit-account': [movement('credit-account', { id: 'purchase', creditCardMetadata: { installmentNumber: 2, totalInstallments: 4, billId: 'bill-1' } }), movement('credit-account', { id: 'payment', amount: -75, type: 'CREDIT', operationType: 'PAGAMENTO_FATURA' }), movement('credit-account', { id: 'refund', amount: -20, type: 'CREDIT', operationType: 'ESTORNO' })],
    } }), { now });
    expect(result.transactions.map(value => [value.kind, value.affectsBalance])).toEqual([['CASH_IN', false], ['CARD_PURCHASE', false], ['CARD_PAYMENT', false], ['CARD_REFUND', false]]);
    expect(result.transactions[1]).toMatchObject({ amountCents: 1231, installmentNumber: 2, totalInstallments: 4, totalPurchaseCents: null, status: 'POSTED' });
    expect(result.bills[0]).not.toHaveProperty('paidCents');
    expect(result.bills[0]?.reportedPayments[0]).toMatchObject({ amountCents: 7500, date: '2026-10-10' });
  });
  it('does not invent missing limits, a current bill, or a card unavailable at Mercado Pago', async () => {
    const result = await loadControlBankImport({ ...credentials, items: [{ id: itemId, institution: 'MERCADO_PAGO' }] }, provider({ accounts: [{ ...bank, balance: null }] }), { now });
    expect(result.accounts[0]?.balanceCents).toBeNull(); expect(result.cards).toEqual([]); expect(result.bills).toEqual([]);
    expect(result.warnings.join(' ')).toContain('nenhum cartão');
    const unknownCard = await loadControlBankImport(credentials, provider({ accounts: [{ ...card, creditData: {} }], bills: [] }), { now });
    expect(unknownCard.cards[0]).toMatchObject({ limitCents: null, usedLimitCents: null, availableLimitCents: null });
    expect(unknownCard.bills).toEqual([]);
  });
  it('uses cursor pagination and provider IDs for stable idempotency across recreated IDs', async () => {
    const fetcher = provider({ accounts: [bank], alter: url => {
      if (url.pathname !== '/v2/transactions') return;
      return url.searchParams.has('after')
        ? Response.json({ results: [movement('bank-account', { id: 'recreated-id', providerId: 'stable-bank-id' })], next: null })
        : Response.json({ results: [movement('bank-account', { id: 'old-id', providerId: 'stable-bank-id' })], next: '?accountId=bank-account&after=next%2Bcursor' });
    } });
    const result = await loadControlBankImport(credentials, fetcher, { now });
    expect(result.transactions).toHaveLength(1); expect(result.transactions[0]?.externalId).toBe('recreated-id');
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/v2/transactions'))).toHaveLength(2);
  });
  it.each(['?accountId=another-account&after=cursor', 'https://attacker.invalid?after=cursor', '?accountId=bank-account&after=x&ids=other', '?accountId=bank-account&after=x&accountId=bank-account'])('rejects changed cursor scope and preserves prior observations: %s', async next => {
    const previous = await loadControlBankImport(credentials, provider(), { now });
    const result = await loadControlBankImport(credentials, provider({ alter: url => url.pathname === '/v2/transactions' ? Response.json({ results: [], next }) : undefined }), { now, previous });
    expect(result.connections[0]?.status).toBe('ERROR'); expect(result.connections[0]?.accountsComplete).toBe(false);
    expect(result.accounts).toEqual(previous.accounts); expect(result.cards).toEqual(previous.cards); expect(result.bills).toEqual(previous.bills);
  });
  it('rejects missing cursor completeness, repeated cursors and bounded incomplete history', async () => {
    for (const response of [{ results: [] }, { results: [], next: '?accountId=bank-account&after=same' }]) {
      const result = await loadControlBankImport(credentials, provider({ alter: url => url.pathname === '/v2/transactions' ? Response.json(response) : undefined }), { now });
      expect(result.connections[0]?.status).toBe('ERROR'); expect(result.accounts).toEqual([]);
    }
  });
  it('does not turn transfer participants into public identifiers or income', async () => {
    const result = await loadControlBankImport(credentials, provider({ accounts: [bank], movements: { 'bank-account': [movement('bank-account', { type: 'CREDIT', paymentData: { payer: { documentNumber: { value: '111.222.333-44' } }, receiver: { documentNumber: { value: '11122233344' } } } })] } }), { now });
    expect(result.transactions[0]?.kind).toBe('OWN_TRANSFER');
    expect(JSON.stringify(result)).not.toContain('11122233344');
  });
  it('retains previous connection data on unavailable permissions without erasing manual coverage', async () => {
    const previous = await loadControlBankImport(credentials, provider(), { now });
    const result = await loadControlBankImport(credentials, provider({ alter: url => url.pathname === '/bills' ? new Response('private provider diagnostic', { status: 403 }) : undefined }), { previous, now });
    expect(result.connections[0]?.status).toBe('LOGIN_REQUIRED'); expect(result.bills).toEqual(previous.bills);
    expect(JSON.stringify(result)).not.toContain('private provider diagnostic');
  });
  it('does not follow a different connector or unconfigured item', async () => {
    const fetcher = provider({ alter: url => url.pathname.startsWith('/items/') ? Response.json({ id: itemId, connector: { name: 'Direct bank' }, status: 'UPDATED' }) : undefined });
    const result = await loadControlBankImport(credentials, fetcher, { now });
    expect(result.connections[0]?.status).toBe('ERROR'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retains pending scheduled transactions without claiming they were paid', async () => {
    const result = await loadControlBankImport(credentials, provider({ accounts: [bank], movements: { 'bank-account': [movement('bank-account', { status: 'PENDING', date: '2026-12-10T00:00:00Z' })] } }), { now });
    expect(result.transactions[0]).toMatchObject({ status: 'PENDING', date: '2026-12-10', affectsBalance: false });
  });
  it('rejects incomplete or foreign money instead of silently omitting commitments', async () => {
    const result = await loadControlBankImport(credentials, provider({ movements: { 'bank-account': [movement('bank-account', { currencyCode: 'USD' })] } }), { now });
    expect(result.connections[0]?.status).toBe('ERROR'); expect(result.accounts).toEqual([]);
  });
});

describe('bank import review and reconciliation', () => {
  it('creates dated anchors without recreating salary or cash transactions, and stays idempotent', async () => {
    const bankImport = await loadControlBankImport(credentials, provider({ movements: { 'bank-account': [movement('bank-account', { amount: 300, type: 'CREDIT' })] } }), { now });
    const initial = createControlState(now.toISOString());
    const applied = applyBankControlImport(initial, bankImport);
    expect(applied.state.accounts).toHaveLength(1); expect(applied.state.balanceObservations).toHaveLength(1);
    expect(applied.state.balanceObservations[0]).toMatchObject({ balanceCents: 4071, confirmed: true });
    expect(applied.state.incomes).toEqual([]); expect(applied.state.expenses).toEqual([]); expect(applied.state.payments).toEqual([]);
    expect(applied.pendingTransactions).toHaveLength(1);
    expect(applied.state.settings.cashConfirmed).toBe(true);
    expect(applied.state.revision).toBe(initial.revision);
    expect(applyBankControlImport(applied.state, bankImport).state).toEqual(applied.state);
    expect(initial.accounts).toEqual([]);
  });
  it('requires explicit linking when manual accounts and cards exist, preventing duplicated personal setup', async () => {
    const initial = ControlStateSchema.parse({ ...createControlState(now.toISOString()), settings: { reviewed: true, cashConfirmed: true, obligationsReviewed: true }, accounts: [{ id: 'manual-bank', name: 'Minha conta' }], cards: [{ id: 'manual-card', name: 'Meu cartão' }] });
    const bankImport = await loadControlBankImport(credentials, provider(), { now });
    const preview = applyBankControlImport(initial, bankImport);
    expect(preview.pendingLinks).toHaveLength(2); expect(preview.state.accounts).toHaveLength(1); expect(preview.state.cards).toHaveLength(1);
    expect(preview.state.settings).toMatchObject({ reviewed: false, cashConfirmed: false, obligationsReviewed: false });
    const resolved = applyBankControlImport(initial, bankImport, { accountLinks: { [bankImport.accounts[0]!.id]: 'manual-bank' }, cardLinks: { [bankImport.cards[0]!.id]: 'manual-card' } });
    expect(resolved.pendingLinks).toEqual([]); expect(resolved.state.accounts[0]?.id).toBe('manual-bank'); expect(resolved.state.cards[0]?.id).toBe('manual-card');
    expect(resolved.state.accounts).toHaveLength(1); expect(resolved.state.cards).toHaveLength(1);
    expect(resolved.state.balanceObservations[0]?.accountId).toBe('manual-bank');
    expect(resolved.state.bills[0]?.cardId).toBe('manual-card');
  });
  it('can explicitly keep a newly imported account separate from manual coverage', async () => {
    const initial = ControlStateSchema.parse({ ...createControlState(now.toISOString()), accounts: [{ id: 'manual', name: 'Outra conta' }] });
    const bankImport = await loadControlBankImport(credentials, provider({ accounts: [bank] }), { now });
    const applied = applyBankControlImport(initial, bankImport, { accountLinks: { [bankImport.accounts[0]!.id]: 'new' } });
    expect(applied.pendingLinks).toEqual([]); expect(applied.state.accounts).toHaveLength(2);
    expect(applied.state.settings.cashConfirmed).toBe(false);
  });
  it('reuses the manual bill and preserves manual payments and confirmations instead of inferring settlement', async () => {
    const initial = ControlStateSchema.parse({ ...createControlState(now.toISOString()), cards: [{ id: 'local-card', name: 'Cartão' }], bills: [{ id: 'local-bill', cardId: 'local-card', month: '2026-11', totalCents: 10000, dueDate: '2026-11-11', verification: 'CONFIRMED' }], payments: [{ id: 'manual-payment', billId: 'local-bill', amountCents: 4000, paidDate: '2026-11-03', confirmed: true }] });
    const bankImport = await loadControlBankImport(credentials, provider(), { now });
    const applied = applyBankControlImport(initial, bankImport, { cardLinks: { [bankImport.cards[0]!.id]: 'local-card' } });
    expect(applied.state.bills).toHaveLength(1); expect(applied.state.bills[0]).toMatchObject({ id: 'local-bill', totalCents: 12500, verification: 'CONFIRMED', dueDate: '2026-11-10' });
    expect(applied.state.payments).toEqual(initial.payments);
    expect(applied.warnings.join(' ')).toContain('não foram aplicados automaticamente');
  });
  it('imports only purchases with a strong bill reference; posting never creates a payment', async () => {
    const bankImport = await loadControlBankImport(credentials, provider({ movements: { 'credit-account': [movement('credit-account', { id: 'known', creditCardMetadata: { billId: 'bill-1', installmentNumber: 2, totalInstallments: 3 } }), movement('credit-account', { id: 'unknown' }), movement('credit-account', { id: 'payment', amount: -75, operationType: 'PAGAMENTO_FATURA', type: 'CREDIT' })] } }), { now });
    const applied = applyBankControlBankTest(bankImport);
    expect(applied.state.purchases).toHaveLength(1);
    expect(applied.state.purchases[0]).toMatchObject({ amountCents: 1231, installmentNumber: 2, totalInstallments: 3, verification: 'CONFIRMED' });
    expect(applied.pendingTransactions).toHaveLength(2); expect(applied.state.payments).toHaveLength(0);
    expect(applied.state.settings.obligationsReviewed).toBe(false);
    expect(applyBankControlImport(applied.state, bankImport).state.purchases).toHaveLength(1);
  });
  it('requires purchase review when manually registered purchases could duplicate bank records', async () => {
    const bankImport = await loadControlBankImport(credentials, provider({ movements: { 'credit-account': [movement('credit-account', { creditCardMetadata: { billId: 'bill-1' } })] } }), { now });
    const first = applyBankControlBankTest({ ...bankImport, transactions: [] });
    const initial = ControlStateSchema.parse({ ...first.state, purchases: [{ id: 'manual-purchase', cardId: first.state.cards[0]!.id, billId: first.state.bills[0]!.id, name: 'Compra registrada', amountCents: 1231, purchaseDate: '2026-11-02', dueDate: '2026-11-10' }] });
    const pending = applyBankControlImport(initial, bankImport);
    expect(pending.state.purchases).toHaveLength(1); expect(pending.pendingTransactions).toHaveLength(1);
    const reviewed = applyBankControlImport(initial, bankImport, { confirmations: { purchaseLinks: { [bankImport.transactions[0]!.id]: 'manual-purchase' } } });
    expect(reviewed.state.purchases).toHaveLength(1); expect(reviewed.state.purchases[0]?.source).toBe('BANK'); expect(reviewed.pendingTransactions).toEqual([]);
  });
  it('preserves all existing data and disables safe capacity flags on failed or unknown balance coverage', async () => {
    const bankImport = await loadControlBankImport(credentials, provider(), { now });
    const previous = applyBankControlBankTest(bankImport).state;
    previous.settings.reviewed = previous.settings.cashConfirmed = previous.settings.obligationsReviewed = true;
    const failed = applyBankControlImport(previous, { ...bankImport, connections: bankImport.connections.map(value => ({ ...value, status: 'ERROR' })) });
    expect(failed.state.balanceObservations).toEqual(previous.balanceObservations); expect(failed.state.bills).toEqual(previous.bills);
    expect(failed.state.settings).toMatchObject({ reviewed: false, cashConfirmed: false, obligationsReviewed: false });
    const missing = applyBankControlImport(previous, { ...bankImport, accounts: bankImport.accounts.map(value => ({ ...value, balanceCents: null })) });
    expect(missing.state.settings.cashConfirmed).toBe(false);
  });
  it('does not overwrite two distinct bank cycles sharing the same month', async () => {
    const bankImport = await loadControlBankImport(credentials, provider({ bills: [bill, { ...bill, id: 'bill-2', dueDate: '2026-11-22', totalAmount: 50 }] }), { now });
    const applied = applyBankControlBankTest(bankImport);
    expect(applied.state.bills).toHaveLength(1); expect(applied.state.bills[0]?.totalCents).toBe(12500);
    expect(applied.state.settings.obligationsReviewed).toBe(false);
    expect(applied.warnings.join(' ')).toContain('outra fatura');
  });
});

function applyBankControlBankTest(bankImport: Awaited<ReturnType<typeof loadControlBankImport>>) {
  return applyBankControlImport(createControlState(now.toISOString()), bankImport);
}
