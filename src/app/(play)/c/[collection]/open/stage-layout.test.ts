import { describe, expect, it } from 'vitest';
import type { Rarity } from '@/lib/rarity';
import { AWAY, CARD, CENTER, doneLayout, PACK, revealOrder, SCENE, sparks, stackPlace } from './stage-layout';

const inScene = (slot: { left: number; top: number; width: number; height: number }) =>
  slot.left >= 0 && slot.top >= 0 && slot.left + slot.width <= SCENE.width && slot.top + slot.height <= SCENE.height;

describe('the scene', () => {
  it('holds the pack and the stack', () => {
    expect(inScene(PACK)).toBe(true);
    expect(inScene({ left: CENTER.x - CARD.width / 2, top: CENTER.y - CARD.height / 2, width: CARD.width, height: CARD.height })).toBe(true);
  });
});

describe('doneLayout', () => {
  it('lays a five-card pack out as in the mock-up: three cards 100 wide, then two centered', () => {
    const { slots, headingBottom, hintTop } = doneLayout(5);
    expect(new Set(slots.slice(0, 3).map((slot) => slot.top)).size).toBe(1);
    expect(slots[3].top).toBe(slots[4].top);
    expect(slots[3].top).toBeGreaterThan(slots[0].top);
    // The second row sits between the first row's cards
    expect(slots[3].left).toBeGreaterThan(slots[0].left);
    expect(slots[4].left + slots[4].width).toBeLessThan(slots[2].left + slots[2].width);
    expect(slots[0].width).toBe(100);
    expect(headingBottom).toBeLessThan(slots[0].top);
    expect(hintTop).toBeGreaterThan(slots[4].top + slots[4].height);
  });

  it('keeps any pack size the rules allow inside the scene, without overlaps', () => {
    for (let count = 1; count <= 20; count++) {
      const { slots, headingBottom, hintTop } = doneLayout(count);
      expect(slots).toHaveLength(count);
      expect(slots.every(inScene)).toBe(true);
      expect(headingBottom).toBeGreaterThan(40);
      expect(hintTop).toBeLessThan(SCENE.height - 20);
      for (let i = 1; i < count; i++) {
        const [a, b] = [slots[i - 1], slots[i]];
        const apart = a.top !== b.top || b.left >= a.left + a.width;
        expect(apart).toBe(true);
      }
    }
  });

  it('puts four cards two by two', () => {
    const { slots } = doneLayout(4);
    expect(slots[1].top).toBe(slots[0].top);
    expect(slots[2].top).toBeGreaterThan(slots[1].top);
  });
});

describe('stackPlace', () => {
  it('keeps the top card in place and fans the next ones out, three at most', () => {
    expect(stackPlace(0)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0 });
    expect(stackPlace(1)).toEqual({ x: 7, y: 9, scale: 0.96, rotate: 3 });
    expect(stackPlace(12)).toEqual(stackPlace(3));
    expect(AWAY.x).toBeLessThan(-CENTER.x);
  });
});

describe('sparks', () => {
  it('throws the same sparks all around, every time', () => {
    const thrown = sparks(12, 7, 190);
    expect(thrown).toEqual(sparks(12, 7, 190));
    expect(thrown.map((spark) => spark.shape).slice(0, 3)).toEqual(['leaf', 'diamond', 'dot']);
    expect(thrown.every((spark) => spark.distance >= 190 * 0.55 && spark.distance <= 190 * 1.1)).toBe(true);
    expect(thrown[6].angle).toBeGreaterThan(thrown[0].angle + 150);
  });
});

describe('revealOrder', () => {
  const card = (position: number, rarity: Rarity) => ({ position, card: { data: { rarity } } });

  it('keeps the rarest cards for the end, in the server order otherwise', () => {
    const drawn = [card(1, 'rare'), card(2, 'common'), card(3, 'legendary'), card(4, 'common'), card(5, 'uncommon')];
    expect(revealOrder(drawn).map((c) => c.position)).toEqual([2, 4, 5, 1, 3]);
  });
});
