import { describe, expect, it } from 'vitest';
import { parseLatestTreasuryCsv } from '../src/treasury';

describe('Tesouro Transparente adapter', () => {
  it('orders maturities by calendar rather than Brazilian date text', () => {
    const header = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha';
    const rows = ['01/01/2030', '15/12/2028', '01/03/2029'].map(date => `Tesouro Selic;${date};13/07/2026;0,12;0,13;12346,67;12341,12`);
    expect(parseLatestTreasuryCsv([header, ...rows].join('\n')).map(bond => bond.maturityDate)).toEqual(['15/12/2028', '01/03/2029', '01/01/2030']);
  });
  it('keeps only latest Tesouro Selic rows', () => {
    const csv = [
      'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha',
      'Tesouro Selic;01/03/2029;12/07/2026;0,10;0,11;12345,67;12340,12',
      'Tesouro Selic;01/03/2029;13/07/2026;0,12;0,13;12346,67;12341,12',
      'Tesouro IPCA+;15/05/2035;13/07/2026;6,00;6,10;3000,00;2990,00',
    ].join('\n');
    expect(parseLatestTreasuryCsv(csv)).toEqual([{
      name: 'Tesouro Selic', maturityDate: '01/03/2029', buyRate: '0.12', sellRate: '0.13',
      buyPrice: '12346.67', sellPrice: '12341.12', capturedAt: '13/07/2026',
    }]);
  });
});
