import { describe, expect, it } from 'vitest';
import { fromParisDateTime, toParisDateTime } from './paris-time';

describe('fromParisDateTime', () => {
  it('reads the time in Paris, summer and winter', () => {
    expect(fromParisDateTime('2026-07-14T10:00')?.toISOString()).toBe('2026-07-14T08:00:00.000Z');
    expect(fromParisDateTime('2026-12-25T10:00')?.toISOString()).toBe('2026-12-25T09:00:00.000Z');
  });

  it('handles the night clocks go back', () => {
    expect(fromParisDateTime('2026-10-25T01:30')?.toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(fromParisDateTime('2026-10-25T04:00')?.toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('refuses anything else', () => {
    expect(fromParisDateTime('2026-10-25')).toBeNull();
    expect(fromParisDateTime('demain')).toBeNull();
  });
});

describe('toParisDateTime', () => {
  it('gives back the field value', () => {
    expect(toParisDateTime(new Date('2026-07-14T08:00:00Z'))).toBe('2026-07-14T10:00');
    expect(toParisDateTime(new Date('2026-12-25T09:00:00Z'))).toBe('2026-12-25T10:00');
  });
});
