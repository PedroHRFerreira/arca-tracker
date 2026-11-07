import { describe, expect, it } from 'vitest';
import { ControlAccountSchema, ControlCardSchema, ControlForecastSchema, ControlPurchaseSchema, ControlStateSchema, createControlState } from '@arca/domain';
import { financeErrorMessage } from '../src/financeValidation';

describe('financial form validation messages', () => {
  it('explains an empty name without exposing the validator message', () => {
    const result = ControlAccountSchema.safeParse({ id: 'account', name: ' ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(financeErrorMessage(result.error)).toBe('Preencha o nome ou a descrição do registro.');
  });
  it('identifies an invalid card due day and forecast month', () => {
    const day = ControlCardSchema.safeParse({ id: 'card', name: 'Exemplo', dueDay: 32 });
    const month = ControlForecastSchema.safeParse({ id: 'forecast', month: '2026-13', totalCents: 100 });
    expect(day.success).toBe(false); expect(month.success).toBe(false);
    if (!day.success) expect(financeErrorMessage(day.error)).toContain('1 a 31');
    if (!month.success) expect(financeErrorMessage(month.error)).toContain('ano-mês');
  });
  it('explains the relationship between installment number and total', () => {
    const result = ControlPurchaseSchema.safeParse({ id: 'purchase', cardId: 'card', name: 'Exemplo', amountCents: 100, purchaseDate: '2026-11-01', dueDate: '2026-11-10', installmentNumber: 3, totalInstallments: 2 });
    expect(result.success).toBe(false);
    if (!result.success) expect(financeErrorMessage(result.error)).toBe('O número desta parcela não pode ser maior que a quantidade total de parcelas.');
  });
  it('explains an overlapping forecast rejected during save without raw JSON', () => {
    const state = createControlState();
    const result = ControlStateSchema.safeParse({ ...state, forecasts: [1, 2].map(id => ({ id: String(id), month: '2026-11', totalCents: 100 })) });
    expect(result.success).toBe(false);
    if (!result.success) expect(financeErrorMessage(result.error)).toBe('Já existe uma previsão para esses cartões neste mês. Revise a previsão existente em Cartões.');
  });
  it('preserves actionable existing errors and provides a fallback for unknown failures', () => {
    expect(financeErrorMessage(new Error('Escolha a conta.'))).toBe('Escolha a conta.');
    expect(financeErrorMessage(null)).toBe('Não foi possível salvar. Tente novamente.');
  });
});
