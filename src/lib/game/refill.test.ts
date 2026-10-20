import { describe, expect, it } from 'vitest';
import { refill, takePack } from './refill';

const rules = { refillMinutes: 10, maxReserve: 10 };
const start = new Date('2026-10-20T12:00:00Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe('refill', () => {
  it('keeps a full reserve full, with no timer', () => {
    expect(refill({ packs: 10, lastRefill: start }, rules, at(500))).toEqual({
      packs: 10,
      lastRefill: start,
      nextPackAt: null,
    });
  });

  it('adds one pack per whole interval and moves the last refill by as many', () => {
    expect(refill({ packs: 3, lastRefill: start }, rules, at(25))).toEqual({
      packs: 5,
      lastRefill: at(20),
      nextPackAt: at(30),
    });
  });

  it('never goes over the reserve', () => {
    expect(refill({ packs: 8, lastRefill: start }, rules, at(600))).toMatchObject({ packs: 10, nextPackAt: null });
  });

  it('takes nothing away when the clock goes back', () => {
    expect(refill({ packs: 4, lastRefill: start }, rules, at(-30))).toEqual({
      packs: 4,
      lastRefill: start,
      nextPackAt: at(10),
    });
  });
});

describe('a new account', () => {
  it('has a pack back 10 minutes after an opening, and never more than 10', () => {
    // 10 packs on the first visit
    let stored = { packs: 10, lastRefill: start };
    stored = takePack(refill(stored, rules, at(3)), rules, at(3));
    expect(stored).toEqual({ packs: 9, lastRefill: at(3) });

    expect(refill(stored, rules, at(12.99))).toMatchObject({ packs: 9, nextPackAt: at(13) });
    expect(refill(stored, rules, at(13))).toMatchObject({ packs: 10, nextPackAt: null });
    expect(refill(stored, rules, at(24 * 60))).toMatchObject({ packs: 10 });
  });

  it('keeps the running timer when a pack is taken from a reserve that is not full', () => {
    let stored = { packs: 10, lastRefill: start };
    stored = takePack(refill(stored, rules, at(0)), rules, at(0));
    stored = takePack(refill(stored, rules, at(4)), rules, at(4));
    expect(stored).toEqual({ packs: 8, lastRefill: start });
    expect(refill(stored, rules, at(10))).toMatchObject({ packs: 9, nextPackAt: at(20) });
  });
});
