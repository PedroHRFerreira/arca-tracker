import { localDateString } from '@arca/domain';

export function localObservationMinute(iso: string): string {
  const date = new Date(iso);
  return `${localDateString(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function observationTimestamp(value: string, original?: unknown, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Informe a data e a hora no formato 2026-11-03T09:30.');
  const observed = new Date(value);
  if (!Number.isFinite(observed.getTime()) || localObservationMinute(observed.toISOString()) !== value || observed > now) {
    throw new Error('O saldo precisa de uma data e hora válidas, sem estar no futuro.');
  }
  // Editing an existing observation preserves its place in the cash timeline.
  if (typeof original === 'string' && localObservationMinute(original) === value && new Date(original) <= now) return original;
  // The form displays minutes, but a new current balance must supersede an
  // earlier bank observation from the same minute, including its seconds.
  return value === localObservationMinute(now.toISOString()) ? now.toISOString() : observed.toISOString();
}
