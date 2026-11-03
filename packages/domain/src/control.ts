import { z } from 'zod';

export const ControlDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Data inválida.');
const timestamp = z.string().datetime({ offset: true });
const id = z.string().trim().min(1).max(200);
const label = z.string().trim().min(1).max(160);
export const ControlCentsSchema = z.number().int().nonnegative().max(1_000_000_000_000);
const signedCents = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
const base = {
  id, source: z.enum(['MANUAL', 'BANK', 'DISCORD', 'IMPORT']).default('MANUAL'),
  externalId: id.nullable().default(null), cancelled: z.boolean().default(false),
};
const movement = {
  ...base, name: label, amountCents: ControlCentsSchema, dueDate: ControlDateSchema,
  settledDate: ControlDateSchema.nullable().default(null), settledAt: timestamp.nullable().default(null),
  status: z.enum(['EXPECTED', 'SETTLED', 'CANCELLED']).default('EXPECTED'),
  verification: z.enum(['ESTIMATED', 'CONFIRMED']).default('ESTIMATED'),
  accountId: id.nullable().default(null), categoryId: id.nullable().default(null),
  recurrence: z.enum(['NONE', 'MONTHLY']).default('NONE'),
  recurrenceEnd: ControlDateSchema.nullable().default(null),
  parentId: id.nullable().default(null),
  affectsCash: z.boolean().default(true),
};
export const ControlIncomeSchema = z.object({ ...movement, kind: z.enum(['SALARY', 'THIRTEENTH', 'EXTRA', 'TRANSFER']).default('EXTRA') }).strict();
export const ControlExpenseSchema = z.object({ ...movement,
  kind: z.enum(['EXPENSE', 'TRANSFER', 'INVESTMENT']).default('EXPENSE'),
  paymentMethod: z.enum(['CASH', 'CARD']).default('CASH'),
  billId: id.nullable().default(null), essential: z.boolean().default(false),
}).strict();
export const ControlAccountSchema = z.object({ ...base, name: label }).strict();
export const ControlBalanceSchema = z.object({ ...base, accountId: id, balanceCents: signedCents,
  observedAt: timestamp, confirmed: z.boolean().default(false),
}).strict();
export const ControlCardSchema = z.object({ ...base, name: label,
  limitCents: ControlCentsSchema.nullable().default(null), usedLimitCents: ControlCentsSchema.nullable().default(null),
  dueDay: z.number().int().min(1).max(31).nullable().default(null),
}).strict();
export const ControlBillSchema = z.object({ ...base, cardId: id, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  totalCents: ControlCentsSchema, dueDate: ControlDateSchema,
  verification: z.enum(['ESTIMATED', 'CONFIRMED']).default('ESTIMATED'),
  includesRecurring: z.boolean().default(true),
  paymentStatusKnown: z.boolean().default(true),
}).strict();
export const ControlPurchaseSchema = z.object({ ...base, cardId: id, billId: id.nullable().default(null),
  name: label, amountCents: ControlCentsSchema, purchaseDate: ControlDateSchema, dueDate: ControlDateSchema,
  categoryId: id.nullable().default(null), installmentNumber: z.number().int().min(1).max(600).default(1),
  totalInstallments: z.number().int().min(1).max(600).default(1),
  groupId: id.nullable().default(null), verification: z.enum(['ESTIMATED', 'CONFIRMED']).default('ESTIMATED'),
}).strict().refine(row => row.installmentNumber <= row.totalInstallments, 'Parcela inválida.');
export const ControlPaymentSchema = z.object({ ...base, billId: id, amountCents: ControlCentsSchema,
  paidDate: ControlDateSchema, paidAt: timestamp.nullable().default(null), accountId: id.nullable().default(null),
  confirmed: z.boolean().default(false), affectsCash: z.boolean().default(true),
}).strict();
export const ControlForecastSchema = z.object({ ...base, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  totalCents: ControlCentsSchema, compositionReviewed: z.boolean().default(false),
  includesRecurring: z.boolean().default(true), cardIds: z.array(id).max(100).default([]),
}).strict();
export const ControlCategorySchema = z.object({ ...base, name: label,
  budgetCents: ControlCentsSchema.nullable().default(null), essential: z.boolean().default(false),
}).strict();
export const ControlSettingsSchema = z.object({
  timezone: z.string().min(1).max(80).default('America/Sao_Paulo'),
  salaryAmountCents: ControlCentsSchema.default(0),
  salaryMode: z.enum(['BUSINESS_DAY', 'FIXED_DAY', 'MANUAL']).default('BUSINESS_DAY'),
  salaryBusinessDay: z.number().int().min(1).max(5).default(5),
  salaryFixedDay: z.number().int().min(1).max(31).default(5),
  nextSalaryOverride: ControlDateSchema.nullable().default(null),
  holidays: z.array(ControlDateSchema).max(1000).default([]),
  bufferCents: ControlCentsSchema.default(20000), desiredContributionCents: ControlCentsSchema.default(25000),
  activeContributionCents: ControlCentsSchema.default(0), reserveMonths: z.number().int().min(1).max(60).default(3),
  essentialExpensesCents: ControlCentsSchema.default(0),
  reviewed: z.boolean().default(false), cashConfirmed: z.boolean().default(false), obligationsReviewed: z.boolean().default(false),
  alerts: z.object({ bills: z.boolean().default(false), budget: z.boolean().default(false),
    reserve: z.boolean().default(false), contribution: z.boolean().default(false), discord: z.boolean().default(false),
    hour: z.number().int().min(0).max(23).default(9),
  }).strict().default({}),
}).strict();
export const ControlPortfolioSchema = z.object({
  updatedAt: timestamp, investedCents: ControlCentsSchema, reserveCents: ControlCentsSchema,
  contributionCents: ControlCentsSchema.default(0), goalName: z.string().max(160).nullable().default(null),
}).strict().refine(row => row.reserveCents <= row.investedCents, 'A reserva integra o patrimônio investido.');

export const controlCollectionSchemas = {
  accounts: ControlAccountSchema, balanceObservations: ControlBalanceSchema,
  incomes: ControlIncomeSchema, expenses: ControlExpenseSchema, cards: ControlCardSchema,
  bills: ControlBillSchema, purchases: ControlPurchaseSchema, payments: ControlPaymentSchema,
  forecasts: ControlForecastSchema, categories: ControlCategorySchema,
};
export type ControlCollection = keyof typeof controlCollectionSchemas;
export const ControlStateSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), updatedAt: timestamp,
  settings: ControlSettingsSchema,
  accounts: z.array(ControlAccountSchema).max(100), balanceObservations: z.array(ControlBalanceSchema).max(20000),
  incomes: z.array(ControlIncomeSchema).max(20000), expenses: z.array(ControlExpenseSchema).max(20000),
  cards: z.array(ControlCardSchema).max(100), bills: z.array(ControlBillSchema).max(10000),
  purchases: z.array(ControlPurchaseSchema).max(20000), payments: z.array(ControlPaymentSchema).max(20000),
  forecasts: z.array(ControlForecastSchema).max(1200), categories: z.array(ControlCategorySchema).max(200),
  portfolio: ControlPortfolioSchema.nullable(), appliedCommandIds: z.array(id).max(100000),
}).strict().superRefine((state, ctx) => {
  for (const collection of Object.keys(controlCollectionSchemas) as ControlCollection[]) {
    const ids = new Set<string>();
    const externalIds = new Set<string>();
    state[collection].forEach((row, index) => {
      const external = row.externalId === null ? null : `${row.source}:${row.externalId}`;
      if (ids.has(row.id) || (external && externalIds.has(external)))
        ctx.addIssue({ code: 'custom', path: [collection, index], message: 'Registro duplicado.' });
      ids.add(row.id); if (external) externalIds.add(external);
    });
  }
  const accountIds = new Set(state.accounts.map(row => row.id));
  const cardIds = new Set(state.cards.map(row => row.id));
  const billIds = new Set(state.bills.map(row => row.id));
  const categoryIds = new Set(state.categories.map(row => row.id));
  const check = (known: Set<string>, value: string | null, path: (string | number)[]) => {
    if (value !== null && !known.has(value)) ctx.addIssue({ code: 'custom', path, message: 'Referência desconhecida.' });
  };
  state.balanceObservations.forEach((row, i) => check(accountIds, row.accountId, ['balanceObservations', i, 'accountId']));
  for (const collection of ['incomes', 'expenses'] as const) state[collection].forEach((row, i) => {
    check(accountIds, row.accountId, [collection, i, 'accountId']);
    check(categoryIds, row.categoryId, [collection, i, 'categoryId']);
  });
  state.expenses.forEach((row, i) => check(billIds, row.billId, ['expenses', i, 'billId']));
  state.bills.forEach((row, i) => check(cardIds, row.cardId, ['bills', i, 'cardId']));
  state.purchases.forEach((row, i) => {
    check(cardIds, row.cardId, ['purchases', i, 'cardId']);
    check(billIds, row.billId, ['purchases', i, 'billId']);
    check(categoryIds, row.categoryId, ['purchases', i, 'categoryId']);
    if (row.billId && state.bills.find(bill => bill.id === row.billId)?.cardId !== row.cardId)
      ctx.addIssue({ code: 'custom', path: ['purchases', i, 'billId'], message: 'Fatura de outro cartão.' });
  });
  state.payments.forEach((row, i) => {
    check(billIds, row.billId, ['payments', i, 'billId']);
    check(accountIds, row.accountId, ['payments', i, 'accountId']);
  });
  state.forecasts.forEach((row, i) => row.cardIds.forEach(cardId => check(cardIds, cardId, ['forecasts', i, 'cardIds'])));
  // Overlapping envelopes would count the same unknown bills twice.
  state.forecasts.forEach((row, i) => {
    if (row.cancelled) return;
    if (state.forecasts.slice(0, i).some(other => !other.cancelled && other.month === row.month &&
      (!row.cardIds.length || !other.cardIds.length || row.cardIds.some(card => other.cardIds.includes(card)))))
      ctx.addIssue({ code: 'custom', path: ['forecasts', i], message: 'Previsões sobrepostas para os mesmos cartões.' });
  });
});
export type ControlState = z.infer<typeof ControlStateSchema>;
export type ControlSettings = z.infer<typeof ControlSettingsSchema>;
export type ControlIncome = z.infer<typeof ControlIncomeSchema>;
export type ControlExpense = z.infer<typeof ControlExpenseSchema>;
export type ControlBill = z.infer<typeof ControlBillSchema>;
export type ControlPayment = z.infer<typeof ControlPaymentSchema>;
export type ControlPurchase = z.infer<typeof ControlPurchaseSchema>;

const commandBase = { id, baseRevision: z.number().int().nonnegative(), createdAt: timestamp };
const collection = z.enum(['accounts', 'balanceObservations', 'incomes', 'expenses', 'cards', 'bills', 'purchases', 'payments', 'forecasts', 'categories']);
export const ControlCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...commandBase, type: z.literal('UPSERT'), collection, entity: z.record(z.unknown()) }).strict(),
  z.object({ ...commandBase, type: z.literal('CANCEL'), collection, entityId: id }).strict(),
  z.object({ ...commandBase, type: z.literal('SET_SETTINGS'), settings: ControlSettingsSchema.partial() }).strict(),
  z.object({ ...commandBase, type: z.literal('SET_PORTFOLIO'), portfolio: ControlPortfolioSchema }).strict(),
  z.object({ ...commandBase, type: z.literal('REPLACE_REVIEWED'), state: ControlStateSchema, confirmed: z.literal(true) }).strict(),
]);
export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export class ControlConflictError extends Error {
  constructor() { super('Os dados mudaram. Atualize e revise antes de confirmar.'); this.name = 'ControlConflictError'; }
}
export function createControlState(now = new Date().toISOString()): ControlState {
  return ControlStateSchema.parse({ version: 1, revision: 0, updatedAt: now, settings: {},
    accounts: [], balanceObservations: [], incomes: [], expenses: [], cards: [], bills: [],
    purchases: [], payments: [], forecasts: [], categories: [], portfolio: null, appliedCommandIds: [],
  });
}

/** Pure reducer; transport persists the result atomically with a revision compare-and-swap. */
export function applyControlCommand(input: ControlState, inputCommand: ControlCommand): ControlState {
  const state = ControlStateSchema.parse(input);
  const command = ControlCommandSchema.parse(inputCommand);
  if (state.appliedCommandIds.includes(command.id)) return state;
  if (state.revision !== command.baseRevision) throw new ControlConflictError();
  let next = { ...state };
  if (command.type === 'UPSERT' || command.type === 'CANCEL') {
    const rows = [...state[command.collection]];
    const entity = command.type === 'UPSERT' ? controlCollectionSchemas[command.collection].parse(command.entity) : null;
    const rowId = entity?.id ?? (command.type === 'CANCEL' ? command.entityId : '');
    const index = rows.findIndex(row => row.id === rowId);
    if (command.type === 'CANCEL') {
      if (index < 0) throw new Error('Registro não encontrado.');
      rows[index] = { ...rows[index]!, cancelled: true };
    } else {
      if (index >= 0) rows[index] = entity!; else rows.push(entity!);
    }
    next = { ...next, [command.collection]: rows };
  } else if (command.type === 'SET_SETTINGS') {
    next.settings = ControlSettingsSchema.parse({ ...state.settings, ...command.settings });
  } else if (command.type === 'SET_PORTFOLIO') {
    next.portfolio = command.portfolio;
  } else {
    next = { ...command.state, appliedCommandIds: state.appliedCommandIds };
  }
  return ControlStateSchema.parse({ ...next, revision: state.revision + 1, updatedAt: command.createdAt,
    appliedCommandIds: [...state.appliedCommandIds, command.id] });
}
