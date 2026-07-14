import type { SnapshotValue } from './types';

export type HistoryPeriod = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

function bucket(date: Date, period: HistoryPeriod): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (period === 'MONTHLY') return `${year}-${String(month).padStart(2, '0')}`;
  const start = Date.UTC(year, 0, 1);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  if (period === 'WEEKLY') return `${year}-W${Math.floor(day / 7)}`;
  return `${year}-F${Math.floor(day / 15)}`;
}

export function aggregateSnapshots(items: SnapshotValue[], period: HistoryPeriod): SnapshotValue[] {
  const result = new Map<string, SnapshotValue>();
  const sorted = [...items].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  for (const item of sorted) result.set(bucket(new Date(item.capturedAt), period), item);
  return [...result.values()];
}
