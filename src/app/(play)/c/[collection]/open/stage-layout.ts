import { RARITY_PIPS, type Rarity } from '@/lib/rarity';

/**
 * Where the opening scene puts the pack and the cards, in the units of the
 * mock-up's 390 px wide phone screen (design: Ouverture paquet.dc.html). The
 * stylesheet turns one unit into --scene-unit, so the scene fits any screen.
 * A pack holds cardsPerPack cards (a database rule, 1 to 20): the stack, the
 * tray and the final grid are laid out for that count.
 */
export const SCENE = { width: 390, height: 650 };
// Every card rests centered here; a place is an offset from it
export const CENTER = { x: 195, y: 304 };
// The Card component's proportions (80 / 131)
export const CARD = { width: 220, height: (220 * 131) / 80 };

export interface Place {
  x: number;
  y: number;
  scale: number;
  rotate: number;
}

const REST: Place = { x: 0, y: 0, scale: 1, rotate: 0 };
const TILTS = [-3, 2.5, -1.5, 3, -2];
// Deeper cards hide behind the fourth one
const VISIBLE_DEPTH = 4;

/** Before the pack opens: below the resting place, smaller (and transparent). */
export const HIDDEN: Place = { x: 0, y: 110, scale: 0.78, rotate: 0 };

/** A face-down card `depth` cards below the top of the stack (0: the top one). */
export function stackPlace(depth: number, index: number): Place {
  if (depth === 0) return REST;
  const d = Math.min(depth, VISIBLE_DEPTH);
  return { x: d * 5, y: -d * 8, scale: 1 - d * 0.03, rotate: TILTS[index % TILTS.length] };
}

/** The top card once turned over: lifted a little. */
export const LIFTED: Place = { x: 0, y: -6, scale: 1.06, rotate: 0 };

export interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TRAY = { top: 540, width: 340, maxSlot: 60 };

/** The tray's slots under the stack, where each card goes once seen. */
export function traySlots(count: number): Slot[] {
  const gap = count > 5 ? 6 : 10;
  const width = Math.min(TRAY.maxSlot, (TRAY.width - (count - 1) * gap) / count);
  const height = (width * CARD.height) / CARD.width;
  const left = CENTER.x - (count * width + (count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) => ({ left: left + i * (width + gap), top: TRAY.top, width, height }));
}

function centeredOn(slot: Slot): Place {
  return {
    x: slot.left + slot.width / 2 - CENTER.x,
    y: slot.top + slot.height / 2 - CENTER.y,
    scale: slot.width / CARD.width,
    rotate: 0,
  };
}

/** A card put away in its tray slot. */
export function trayPlace(index: number, count: number): Place {
  return centeredOn(traySlots(count)[index]);
}

const GRID = { top: 90, bottom: 640, width: 370, gap: 10, maxScale: 0.48 };

/** The final grid: three cards a row when they fit (the mock-up's 3 + 2), more for a larger pack. */
export function gridSlots(count: number): Slot[] {
  let best = { columns: 1, scale: 0 };
  for (let columns = Math.min(count, 3); columns <= Math.min(count, 6); columns++) {
    const rows = Math.ceil(count / columns);
    const scale = Math.min(
      GRID.maxScale,
      (GRID.width - (columns - 1) * GRID.gap) / (columns * CARD.width),
      (GRID.bottom - GRID.top - (rows - 1) * GRID.gap) / (rows * CARD.height),
    );
    if (scale > best.scale) best = { columns, scale };
  }
  const width = CARD.width * best.scale;
  const height = CARD.height * best.scale;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / best.columns);
    // The last row is centered when it isn't full
    const inRow = Math.min(best.columns, count - row * best.columns);
    const column = i % best.columns;
    const rowLeft = CENTER.x - (inRow * width + (inRow - 1) * GRID.gap) / 2;
    return { left: rowLeft + column * (width + GRID.gap), top: GRID.top + row * (height + GRID.gap), width, height };
  });
}

/** A card in the final grid. */
export function gridPlace(index: number, count: number): Place {
  return centeredOn(gridSlots(count)[index]);
}

/**
 * The reveal order: the rarest cards last, so the pack builds up to its best
 * card. Cards of the same rarity keep the server's order.
 */
export function revealOrder<T extends { position: number; card: { data: { rarity: Rarity } } }>(cards: T[]): T[] {
  return [...cards].sort(
    (a, b) => RARITY_PIPS[a.card.data.rarity] - RARITY_PIPS[b.card.data.rarity] || a.position - b.position,
  );
}
