import { describe, expect, it } from 'vitest';
import { calculateControlSummary, createControlState } from '@arca/domain';
import { localObservationMinute, observationTimestamp } from '../src/financeObservation';

describe('balance observation time from minute-based form', () => {
  const earlier = new Date('2026-11-07T12:34:05');
  const now = new Date('2026-11-07T12:34:45');
  it('uses the latest confirmed balance when two observations share a minute', () => {
    const state = createControlState(now.toISOString());
    state.accounts = [{ id: 'account', name: 'Conta exemplo', source: 'MANUAL', externalId: null, cancelled: false }];
    state.balanceObservations = [150000, 0].map((balanceCents, index) => ({ id: String(index), accountId: 'account', balanceCents, confirmed: true, source: 'MANUAL', externalId: null, cancelled: false,
      observedAt: index === 0 ? earlier.toISOString() : observationTimestamp(localObservationMinute(now.toISOString()), undefined, now) }));
    expect(calculateControlSummary(state, '2026-11-07').bankBalanceCents).toBe(0);
  });
  it('preserves seconds when correcting an existing observation without changing its time', () => {
    expect(observationTimestamp(localObservationMinute(earlier.toISOString()), earlier.toISOString(), now)).toBe(earlier.toISOString());
  });
  it('keeps an explicitly entered historical minute', () => {
    const old = new Date('2026-11-06T09:30:00');
    expect(observationTimestamp('2026-11-06T09:30', undefined, now)).toBe(old.toISOString());
  });
  it.each(['2026-02-30T10:00', '2026-11-08T10:00', '2026-11-07T12:35', 'invalid'])('refuses an invalid or future observation: %s', value => {
    expect(() => observationTimestamp(value, undefined, now)).toThrow('data');
  });
});
