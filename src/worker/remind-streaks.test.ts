import { describe, expect, it } from 'vitest';
import { parisHour } from './remind-streaks';

describe('parisHour', () => {
  it('reads the hour on a clock in Paris, winter and summer time', () => {
    expect(parisHour(new Date('2026-11-22T19:00:00Z'))).toBe(20);
    expect(parisHour(new Date('2026-11-22T23:30:00Z'))).toBe(0);
    expect(parisHour(new Date('2026-07-14T18:00:00Z'))).toBe(20);
  });
});
