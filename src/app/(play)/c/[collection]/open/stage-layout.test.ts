import { describe, expect, it } from 'vitest';
import type { Rarity } from '@/lib/rarity';
import { CARD, gridSlots, revealOrder, SCENE, stackPlace, trayPlace, traySlots } from './stage-layout';

const inScene = (slot: { left: number; top: number; width: number; height: number }) =>
  slot.left >= 0 && slot.top >= 0 && slot.left + slot.width <= SCENE.width && slot.top + slot.height <= SCENE.height;

describe('gridSlots', () => {
  it('lays a five-card pack out as in the mock-up: three cards, then two centered', () => {
    const slots = gridSlots(5);
    expect(new Set(slots.slice(0, 3).map((slot) => slot.top)).size).toBe(1);
    expect(slots[3].top).toBe(slots[4].top);
    expect(slots[3].top).toBeGreaterThan(slots[0].top);
    // The second row sits between the first row's cards
    expect(slots[3].left).toBeGreaterThan(slots[0].left);
    expect(slots[4].left + slots[4].width).toBeLessThan(slots[2].left + slots[2].width);
    expect(slots[0].width).toBeCloseTo(CARD.width * 0.48);
  });

  it('keeps any pack size the rules allow inside the scene, without overlaps', () => {
    for (let count = 1; count <= 20; count++) {
      const slots = gridSlots(count);
      expect(slots).toHaveLength(count);
      expect(slots.every(inScene)).toBe(true);
      for (let i = 1; i < count; i++) {
        const [a, b] = [slots[i - 1], slots[i]];
        const apart = a.top !== b.top || b.left >= a.left + a.width;
        expect(apart).toBe(true);
      }
    }
  });
});

describe('traySlots', () => {
  it('fits a slot for each card under the stack', () => {
    for (let count = 1; count <= 20; count++) {
      const slots = traySlots(count);
      expect(slots).toHaveLength(count);
      expect(slots.every(inScene)).toBe(true);
    }
    expect(traySlots(5)[0].width).toBe(60);
  });

  it('shrinks a card down to its slot', () => {
    const slot = traySlots(5)[2];
    expect(trayPlace(2, 5)).toMatchObject({ x: 0, scale: slot.width / CARD.width });
  });
});

describe('stackPlace', () => {
  it('keeps the top card in place and tucks the next ones behind, four at most', () => {
    expect(stackPlace(0, 3)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0 });
    expect(stackPlace(1, 1).y).toBeLessThan(0);
    expect(stackPlace(12, 12)).toMatchObject({ x: stackPlace(4, 0).x, y: stackPlace(4, 0).y });
  });
});

describe('revealOrder', () => {
  const card = (position: number, rarity: Rarity) => ({ position, card: { data: { rarity } } });

  it('keeps the rarest cards for the end, in the server order otherwise', () => {
    const drawn = [card(1, 'rare'), card(2, 'common'), card(3, 'legendary'), card(4, 'common'), card(5, 'uncommon')];
    expect(revealOrder(drawn).map((c) => c.position)).toEqual([2, 4, 5, 1, 3]);
  });
});
