import { calculateControlSummary, projectControlMonths, controlMovementsForMonth, ControlDateSchema, ControlIncomeSchema, ControlExpenseSchema, ControlPaymentSchema, type ControlCommand, type ControlState } from '@arca/domain';
import { commitControlCommand, consumeControlToken, CONTROL_OWNER, issueControlToken, readControlState, readDiscordConnection } from './control-store';

export type DiscordConfig = { DB?: D1Database; DISCORD_PUBLIC_KEY?: string; DISCORD_BOT_TOKEN?: string; DISCORD_APPLICATION_ID?: string };
export function discordConfigured(env: DiscordConfig): boolean {
  return Boolean(env.DB && /^[a-f0-9]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '') && /^\d{15,22}$/.test(env.DISCORD_APPLICATION_ID ?? '') && env.DISCORD_BOT_TOKEN);
}
type Option = { name: string; value?: string | number | boolean; options?: Option[] };
type Interaction = { type: number; id: string; token?: string; channel_id?: string; context?: number; guild_id?: string; user?: { id: string }; member?: { user: { id: string } }; data?: { name?: string; custom_id?: string; options?: Option[] } };
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const safe = (value: string) => value.replaceAll('@', '＠').replaceAll('`', '′').replaceAll('*', '∗').replaceAll('_', '＿');
function reply(content: string, components?: unknown[]) {
  return Response.json({ type: 4, data: { content: content.slice(0, 1950), allowed_mentions: { parse: [] }, ...(components ? { components } : {}) } });
}
function options(rows: Option[] = []): Record<string, string> {
  return Object.fromEntries(rows.flatMap(row => row.options ? Object.entries(options(row.options)) : [[row.name, String(row.value ?? '')]]));
}
export function controlToday(state: ControlState, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: state.settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export async function verifyDiscordRequest(request: Request, raw: string, publicKey: string): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  if (!/^[a-f0-9]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(publicKey)) return false;
  const bytes = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], part => Number.parseInt(part, 16));
  try {
    const key = await crypto.subtle.importKey('raw', bytes(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, bytes(signature), new TextEncoder().encode(timestamp + raw));
  } catch { return false; }
}
export function discordReadAnswer(name: string, state: ControlState, today: string, month?: string): string {
  const summary = calculateControlSummary(state, today);
  const pending = summary.gaps.length ? `\nPendências: ${summary.gaps.join(' ')}` : '';
  const fresh = `\nBase atualizada: ${state.updatedAt}.`;
  if (name === 'saldo') return `Saldo em contas: ${money(summary.bankBalanceCents)}.\nPode gastar até o próximo salário (${summary.nextSalaryDate ?? 'data a informar'}): ${summary.spendUntilSalaryCents === null ? 'aguardando revisão' : money(summary.spendUntilSalaryCents)}.\nAporte possível hoje: ${summary.investmentCapacityCents === null ? 'aguardando revisão' : money(summary.investmentCapacityCents)}.${pending}${fresh}`;
  if (name === 'faturas') {
    const bills = summary.obligations.filter(row => row.kind === 'BILL' || row.kind === 'FORECAST' || row.kind === 'PURCHASE');
    return `Compromissos de cartão identificados: ${money(summary.unpaidBillsCents)}.\nLimite utilizado (informativo): ${money(summary.usedLimitCents)}.\n${bills.slice(0, 12).map(row => `${row.dueDate} · ${safe(row.name)}: ${money(row.amountCents)}${row.estimated ? ' (previsto)' : ''}`).join('\n') || 'Sem faturas cadastradas.'}${pending}${fresh}`;
  }
  if (name === 'reserva' || name === 'metas') {
    const capacity = summary.investmentCapacityCents;
    const months = capacity !== null && capacity > 0 ? Math.ceil(summary.reserveRemainingCents / Math.min(capacity, summary.desiredContributionCents || capacity)) : null;
    return `Reserva registrada: ${money(summary.reserveCents)}.\nMeta: ${money(summary.reserveTargetCents)} (${state.settings.reserveMonths} meses).\nFaltam ${money(summary.reserveRemainingCents)}.\n${months === null ? 'Prazo depende de revisar o orçamento e confirmar aportes.' : `Cenário sem rendimento: ${months} meses mantendo a capacidade atual. Não é garantia.`}${pending}${fresh}`;
  }
  if (name === 'investimentos') return `Patrimônio investido registrado: ${money(summary.investedCents)}; desse valor, reserva: ${money(summary.reserveCents)}.\nAporte desejado: ${money(summary.desiredContributionCents)}. Ativo: ${money(summary.activeContributionCents)}.\n${summary.investmentCapacityCents === null ? 'Revise as pendências antes de aportar.' : `Capacidade hoje: ${money(summary.investmentCapacityCents)}.`}\nCarteira sincronizada: ${state.portfolio?.updatedAt ?? 'ainda não sincronizada pelo aplicativo'}.${pending}`;
  if (name === 'projecao' || name === 'relatorio') {
    const rows = projectControlMonths(state, month ?? today.slice(0, 7), 6);
    return `Projeção sem rendimento e sem antecipar recebimentos:\n${rows.map(row => `${row.month}: receitas ${money(row.incomeCents)}, saídas ${money(row.expenseCents + row.billsCents)}, diferença ${money(row.remainingCents)}${row.pendingReview ? ' · conferir' : ''}`).join('\n')}\nA margem de ${money(state.settings.bufferCents)} ainda deve ser preservada.${pending}${fresh}`;
  }
  if (name === 'gastos') {
    const row = projectControlMonths(state, month ?? today.slice(0, 7), 1)[0]!;
    return `${row.month}: despesas fora dos cartões ${money(row.expenseCents)}; cartões ${money(row.billsCents)}; receitas previstas ${money(row.incomeCents)}; recebidas ${money(row.receivedCents)}.\nApós margem: ${money(row.afterBufferCents)}. Valores previstos não são saldo disponível.${pending}${fresh}`;
  }
  if (name === 'alertas') return `Alertas no aplicativo: ${state.settings.alerts.bills ? 'vencimentos ativos' : 'vencimentos desativados'}. Discord: ${state.settings.alerts.discord ? 'ativo' : 'desativado'}.\nConfigure os controles separadamente em Finanças → Ajustes.`;
  return 'Use /saldo, /gastos, /faturas, /reserva, /investimentos, /projecao, /relatorio, /metas ou /registrar. Alterações sempre passam por confirmação.';
}

function parseCents(value: string): number {
  const cleaned = value.replace(/^R\$\s*/, '').trim();
  if (!/^\d{1,10}([,.]\d{1,2})?$/.test(cleaned)) throw new Error('Informe o valor como 125,50, sem separador de milhares.');
  const [whole, decimals = ''] = cleaned.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}
export async function handleDiscord(request: Request, env: DiscordConfig, ctx?: Pick<ExecutionContext, 'waitUntil'>): Promise<Response> {
  if (!discordConfigured(env) || !env.DB) return new Response('Not configured', { status: 404 });
  if (!request.body || Number(request.headers.get('content-length') ?? 0) > 65536) return new Response('Invalid body', { status: 413 });
  const reader = request.body.getReader(); const decoder = new TextDecoder(); let raw = ''; let size = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 65536) { await reader.cancel(); return new Response('Invalid body', { status: 413 }); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  if (!await verifyDiscordRequest(request, raw, env.DISCORD_PUBLIC_KEY!)) return new Response('Invalid signature', { status: 401 });
  let input: Interaction;
  try { input = JSON.parse(raw) as Interaction; } catch { return new Response('Invalid request', { status: 400 }); }
  if (input.type === 1) return Response.json({ type: 1 });
  if (ctx && typeof input.token === 'string' && /^[A-Za-z0-9._-]{1,256}$/.test(input.token)) {
    const token = input.token;
    ctx.waitUntil((async () => {
      const result = await handleDiscord(new Request(request.url, { method: 'POST', headers: request.headers, body: raw }), env);
      const response = await result.json() as { type: number; data?: unknown };
      if (response.type !== 4) return;
      await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${token}/messages/@original`, {
        method: 'PATCH', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(response.data), signal: AbortSignal.timeout(12000),
      });
    })());
    return Response.json({ type: 5 });
  }
  // BOT_DM only. No guild, group DM, or private-channel installation can expose finance data.
  if (input.guild_id || input.context !== 1 || !input.user?.id || !input.channel_id) return reply('Abra uma conversa privada com o bot para usar o ARCA.');
  const userId = input.user.id;
  const opts = options(input.data?.options);
  if (input.type === 2 && input.data?.name === 'conectar') {
    const pairing = await consumeControlToken<{ owner: string }>(env.DB, opts.codigo ?? '', 'PAIR');
    if (!pairing || pairing.owner !== CONTROL_OWNER) return reply('Código inválido, usado ou expirado. Gere outro no aplicativo.');
    await env.DB.prepare('INSERT INTO discord_connection(owner,user_id,channel_id,linked_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET user_id=excluded.user_id,channel_id=excluded.channel_id,linked_at=excluded.linked_at,delivery_error=NULL')
      .bind(CONTROL_OWNER, userId, input.channel_id, new Date().toISOString()).run();
    return reply('Seu Discord foi vinculado. Use /saldo para consultar. Alertas só serão enviados se você ativá-los no aplicativo.');
  }
  const connection = await readDiscordConnection(env.DB);
  if (!connection || connection.user_id !== userId || connection.channel_id !== input.channel_id) return reply('Este Discord não está vinculado ao seu ARCA. Gere um código no aplicativo e use /conectar.');
  try {
    if (input.type === 3) {
      const customId = input.data?.custom_id ?? '';
      if (customId === 'arca:cancel') return reply('Registro cancelado. Nenhuma alteração foi feita.');
      if (customId.startsWith('arca:read:')) return reply(discordReadAnswer(customId.slice(10), await readControlState(env.DB), controlToday(await readControlState(env.DB))));
      if (!customId.startsWith('arca:confirm:')) return reply('Ação não reconhecida.');
      const confirmation = await consumeControlToken<{ userId: string; command: ControlCommand }>(env.DB, customId.slice(13), 'CONFIRM');
      if (!confirmation || confirmation.userId !== userId) return reply('Confirmação expirada ou já utilizada. Consulte os dados antes de tentar novamente.');
      await commitControlCommand(env.DB, confirmation.command);
      return reply('Registro confirmado e salvo na sua base privada.');
    }
    const state = await readControlState(env.DB);
    const today = controlToday(state);
    const name = input.data?.name ?? '';
    if (name !== 'registrar' && name !== 'pagar') {
      if (opts.mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(opts.mes)) return reply('Informe o mês no formato AAAA-MM.');
      return reply(discordReadAnswer(name, state, today, opts.mes), [{ type: 1, components: [
        { type: 2, style: 2, label: 'Quanto posso gastar?', custom_id: 'arca:read:saldo' },
        { type: 2, style: 2, label: 'Minha reserva', custom_id: 'arca:read:reserva' },
      ] }]);
    }
    const amountCents = parseCents(opts.valor ?? '');
    if (amountCents <= 0) return reply('Informe um valor maior que zero.');
    const date = opts.data || today;
    if (!ControlDateSchema.safeParse(date).success || date > today) return reply('Informe a data efetiva no formato AAAA-MM-DD. Datas futuras devem ser cadastradas como previsão no aplicativo.');
    const accountId = opts.conta ?? null;
    if (!accountId || !state.accounts.some(account => account.id === accountId && !account.cancelled))
      return reply(`Informe o identificador da conta cadastrada: ${state.accounts.filter(account => !account.cancelled).map(account => `${safe(account.name)}: \`${safe(account.id)}\``).join('; ') || 'cadastre uma conta no aplicativo'}.`);
    let command: ControlCommand;
    const id = `discord:${input.id}`;
    const createdAt = new Date().toISOString();
    let description: string;
    if (name === 'pagar') {
      const bill = state.bills.find(row => row.id === opts.fatura && !row.cancelled);
      if (!bill) return reply(`Informe a fatura: ${state.bills.filter(row => !row.cancelled).slice(0, 10).map(row => `${row.month}: \`${safe(row.id)}\``).join('; ') || 'sem faturas cadastradas'}.`);
      if (opts.novo !== 'true' && state.payments.some(row => !row.cancelled && row.confirmed && row.billId === bill.id && row.accountId === accountId && row.paidDate === date && row.amountCents === amountCents))
        return reply('Já existe um pagamento com esses dados. Confira no aplicativo. Use a opção novo somente se forem dois pagamentos distintos.');
      const entity = ControlPaymentSchema.parse({ id, source: 'DISCORD', externalId: input.id, billId: bill.id, amountCents, paidDate: date, paidAt: date === today ? createdAt : null, accountId, confirmed: true });
      command = { id, baseRevision: state.revision, createdAt, type: 'UPSERT', collection: 'payments', entity };
      description = `Pagamento de fatura: ${money(amountCents)}, em ${date}. A compra não será contabilizada novamente.`;
    } else {
      const income = opts.tipo === 'receita';
      if (!income && opts.tipo !== 'despesa') return reply('Escolha receita ou despesa.');
      const collection = income ? 'incomes' : 'expenses';
      const occurrences = controlMovementsForMonth(state, date.slice(0, 7))[collection];
      const existing = opts.lancamento ? [...state[collection], ...occurrences].find(row => row.id === opts.lancamento && !row.cancelled && row.status === 'EXPECTED') : undefined;
      if (opts.lancamento && !existing) return reply('A previsão não foi encontrada ou já foi confirmada. Confira o lançamento no aplicativo.');
      const candidates = occurrences.filter(row => row.amountCents === amountCents && row.dueDate === date && !row.cancelled);
      if (!existing && opts.novo !== 'true' && candidates.length) return reply(`Há lançamentos com esse valor e data. Para confirmar uma previsão, informe lancamento: ${candidates.slice(0, 5).map(row => `\`${safe(row.id)}\``).join(', ')}. Use novo apenas para outro lançamento distinto.`);
      const entity = (income ? ControlIncomeSchema : ControlExpenseSchema).parse({ ...(existing ?? {}), id: existing?.id ?? id, name: existing?.name ?? opts.descricao, amountCents, dueDate: existing?.dueDate ?? date, settledDate: date, settledAt: date === today ? createdAt : null,
        ...(income ? { kind: opts.natureza ?? existing?.kind ?? 'EXTRA' } : {}), accountId, source: 'DISCORD', externalId: input.id, status: 'SETTLED', verification: 'CONFIRMED' });
      command = { id, baseRevision: state.revision, createdAt, type: 'UPSERT', collection: income ? 'incomes' : 'expenses', entity };
      description = `${income ? 'Receita recebida' : 'Despesa paga'}: ${safe(entity.name)}, ${money(amountCents)}, em ${date}.`;
    }
    const token = await issueControlToken(env.DB, 'CONFIRM', { userId, command }, 10);
    return reply(`${description}\nConfira a conta, o valor e a data. Confirme somente se o lançamento ainda não estiver registrado no aplicativo ou no banco.`, [{ type: 1, components: [
      { type: 2, style: 3, label: 'Confirmar registro', custom_id: `arca:confirm:${token.token}` },
      { type: 2, style: 2, label: 'Cancelar', custom_id: 'arca:cancel' },
    ] }]);
  } catch (error) {
    return reply(error instanceof Error && error.message === 'REVISION_CONFLICT'
      ? 'Os dados mudaram desde a prévia. Consulte a base e faça uma nova confirmação.'
      : 'Não foi possível concluir. Confira os campos e consulte o aplicativo antes de tentar novamente.');
  }
}

/** Global application commands are available only in the bot DM context. */
export const discordCommands = [
  ...['saldo', 'gastos', 'faturas', 'investimentos', 'reserva', 'projecao', 'relatorio', 'metas', 'alertas'].map(name => ({ name, description: `Consultar ${name} no seu ARCA`, contexts: [1], options: ['gastos', 'projecao', 'relatorio'].includes(name) ? [{ type: 3, name: 'mes', description: 'Mês AAAA-MM', required: false }] : [] })),
  { name: 'conectar', description: 'Vincular este Discord ao seu ARCA', contexts: [1], options: [{ type: 3, name: 'codigo', description: 'Código temporário gerado no aplicativo', required: true }] },
  { name: 'registrar', description: 'Conferir e registrar uma receita recebida ou despesa paga', contexts: [1], options: [
    { type: 3, name: 'tipo', description: 'Tipo de lançamento', required: true, choices: [{ name: 'Receita', value: 'receita' }, { name: 'Despesa', value: 'despesa' }] },
    { type: 3, name: 'valor', description: 'Valor em reais, exemplo 125,50', required: true },
    { type: 3, name: 'descricao', description: 'Descrição', required: true }, { type: 3, name: 'conta', description: 'Identificador da conta mostrado no aplicativo', required: true },
    { type: 3, name: 'data', description: 'Data AAAA-MM-DD, padrão hoje', required: false },
    { type: 3, name: 'natureza', description: 'Para receitas: salário, 13º ou outra entrada', required: false, choices: [{ name: 'Salário', value: 'SALARY' }, { name: '13º salário', value: 'THIRTEENTH' }, { name: 'Outra receita', value: 'EXTRA' }] },
    { type: 3, name: 'lancamento', description: 'Identificador da previsão a confirmar, sem criar outra receita ou despesa', required: false },
    { type: 5, name: 'novo', description: 'Confirmar que é outro lançamento mesmo com valor e data iguais', required: false },
  ] },
  { name: 'pagar', description: 'Conferir e confirmar pagamento de uma fatura', contexts: [1], options: [
    { type: 3, name: 'fatura', description: 'Identificador da fatura mostrado no aplicativo', required: true },
    { type: 3, name: 'valor', description: 'Valor efetivamente pago, exemplo 125,50', required: true },
    { type: 3, name: 'conta', description: 'Identificador da conta que fez o pagamento', required: true },
    { type: 3, name: 'data', description: 'Data AAAA-MM-DD, padrão hoje', required: false },
    { type: 5, name: 'novo', description: 'Confirmar que é outro pagamento mesmo com valor e data iguais', required: false },
  ] },
];
