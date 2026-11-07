import { ZodError, type ZodIssue } from 'zod';

function issueMessage(issue: ZodIssue): string {
  const field = issue.path.at(-1);
  if (issue.code === 'custom') {
    if (issue.message === 'Parcela inválida.') return 'O número desta parcela não pode ser maior que a quantidade total de parcelas.';
    if (issue.message === 'Previsões sobrepostas para os mesmos cartões.') return 'Já existe uma previsão para esses cartões neste mês. Revise a previsão existente em Cartões.';
    return issue.message;
  }
  if (field === 'name') return issue.code === 'too_big' ? 'Use até 160 caracteres no nome ou na descrição.' : 'Preencha o nome ou a descrição do registro.';
  if (field === 'month') return 'Informe o mês da fatura no formato ano-mês. Exemplo: 2026-11.';
  if (field === 'dueDay') return 'O dia de vencimento deve ser um número de 1 a 31.';
  if (field === 'installmentNumber' || field === 'totalInstallments') return 'Informe o número da parcela e a quantidade total entre 1 e 600.';
  if (typeof field === 'string' && field.endsWith('Cents')) return 'Informe um valor válido em reais, dentro do limite de R$ 10 bilhões.';
  return 'Revise os campos preenchidos antes de continuar.';
}

export function financeErrorMessage(cause: unknown, fallback = 'Não foi possível salvar. Tente novamente.'): string {
  if (cause instanceof ZodError) return [...new Set(cause.issues.map(issueMessage))].join(' ');
  return cause instanceof Error ? cause.message : fallback;
}
