import type { Env } from './contracts';

export interface TreasuryBond {
  name: string;
  maturityDate: string;
  buyRate: string | null;
  sellRate: string | null;
  buyPrice: string | null;
  sellPrice: string | null;
  capturedAt: string;
}

function splitCsvLine(line: string): string[] {
  const delimiter = line.includes(';') ? ';' : ',';
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/\./g, '').replace(',', '.');
}

export function parseLatestTreasuryCsv(csv: string): TreasuryBond[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines.shift() ?? '').map((value) => value.toLowerCase());
  const index = (patterns: string[]) => header.findIndex((column) => patterns.some((pattern) => column.includes(pattern)));
  const indexes = {
    type: index(['tipo titulo', 'tipo_titulo']),
    maturity: index(['data vencimento', 'data_vencimento']),
    date: index(['data base', 'data_base']),
    buyRate: index(['taxa compra', 'taxa_compra']),
    sellRate: index(['taxa venda', 'taxa_venda']),
    buyPrice: index(['pu compra', 'pu_compra']),
    sellPrice: index(['pu venda', 'pu_venda']),
  };
  if (Object.values(indexes).some((value) => value < 0)) throw new Error('TREASURY_CSV_SCHEMA_CHANGED');
  const parsed = lines.map(splitCsvLine);
  const dateKey = (value: string) => { const [day, month, year] = value.split('/'); return year && month && day ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : value; };
  const latestDate = parsed.reduce((latest, row) => {
    const date = row[indexes.date] ?? '';
    return dateKey(date) > dateKey(latest) ? date : latest;
  }, '');

  return parsed
    .filter((row) => row[indexes.date] === latestDate && (row[indexes.type] ?? '').toLowerCase().includes('selic'))
    .map((row) => ({
      name: row[indexes.type] ?? 'Tesouro Selic',
      maturityDate: row[indexes.maturity] ?? '',
      buyRate: normalize(row[indexes.buyRate]),
      sellRate: normalize(row[indexes.sellRate]),
      buyPrice: normalize(row[indexes.buyPrice]),
      sellPrice: normalize(row[indexes.sellPrice]),
      capturedAt: latestDate,
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
}

export async function refreshTreasury(env: Env): Promise<TreasuryBond[]> {
  const response = await fetch(env.TREASURY_CSV_URL);
  if (!response.ok) throw new Error(`TREASURY_${response.status}`);
  const bonds = parseLatestTreasuryCsv(await response.text());
  if (!bonds.length) throw new Error('TREASURY_EMPTY');
  await env.MARKET_CACHE.put('treasury:latest', JSON.stringify(bonds));
  return bonds;
}
