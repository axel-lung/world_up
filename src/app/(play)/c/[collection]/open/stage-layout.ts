import { RARITY_PIPS, type Rarity } from '@/lib/rarity';

/**
 * Where the opening scene puts the pack and the cards, in the units of the
 * mock-up's phone screen (MobileB.dc.html, "B · Ouverture"): the room between
 * the top bar and the buttons, 390 wide. The stylesheet turns one unit into
 * --unit, so the scene fits any screen. A pack holds cardsPerPack cards (a
 * database rule, 1 to 20): the stack and the final grid are laid out for that
 * count.
 */
export const SCENE = { width: 390, height: 612 };
// The closed pack, centered
export const PACK = { left: 83, top: 136, width: 224, height: 340 };
// Every card of the stack rests centered here; a place is an offset from it
export const CENTER = { x: 195, y: 330 };
// The Card's proportions in a grid (5 / 7), as the stage shows it
export const CARD = { width: 200, height: 280 };

export interface Place {
  x: number;
  y: number;
  scale: number;
  rotate: number;
}

const REST: Place = { x: 0, y: 0, scale: 1, rotate: 0 };
// Deeper cards hide behind the third one
export const VISIBLE_DEPTH = 3;

/** A face-down card `depth` cards below the top of the stack (0: the top one), fanned out down and right. */
export function stackPlace(depth: number): Place {
  if (depth === 0) return REST;
  const d = Math.min(depth, VISIBLE_DEPTH);
  return { x: d * 7, y: d * 9, scale: 1 - d * 0.04, rotate: d * 3 };
}

/** A card seen, thrown off to the left (and faded out) for the next one. */
export const AWAY: Place = { x: -360, y: -60, scale: 0.8, rotate: -28 };

export interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

function centeredOn(slot: Slot): Place {
  return {
    x: slot.left + slot.width / 2 - CENTER.x,
    y: slot.top + slot.height / 2 - CENTER.y,
    scale: slot.width / CARD.width,
    rotate: 0,
  };
}

// The end: the heading, the cards 100 wide at most (three a row, as in the
// mock-up), the hint under them, the whole centered in the scene
const DONE = { width: 340, maxCard: 100, gapX: 10, gapY: 14, heading: 56, headingGap: 20, hint: 34, margin: 16 };

export interface DoneLayout {
  /** Where the heading ends: it is anchored by its bottom edge, and grows upward. */
  headingBottom: number;
  slots: Slot[];
  /** Where the hint under the cards starts. */
  hintTop: number;
}

export function doneLayout(count: number): DoneLayout {
  const room = SCENE.height - 2 * DONE.margin - DONE.heading - DONE.headingGap - DONE.hint;
  let best = { columns: 1, width: 0, empty: 0, rows: 0 };
  for (let columns = 1; columns <= Math.min(count, 6); columns++) {
    const rows = Math.ceil(count / columns);
    const width = Math.min(
      DONE.maxCard,
      (DONE.width - (columns - 1) * DONE.gapX) / columns,
      ((room - (rows - 1) * DONE.gapY) / rows) * (CARD.width / CARD.height),
    );
    const empty = rows * columns - count;
    // The widest cards; between equal ones, the fullest rows (two by two rather
    // than three and one), then the fewest (three and two rather than two by
    // two and one)
    const tie = width > best.width - 0.01;
    if (width > best.width + 0.01 || (tie && (empty < best.empty || (empty === best.empty && rows < best.rows)))) {
      best = { columns, width, empty, rows };
    }
  }
  const { columns, width } = best;
  const height = (width * CARD.height) / CARD.width;
  const rows = Math.ceil(count / columns);
  const gridHeight = rows * height + (rows - 1) * DONE.gapY;
  const top = (SCENE.height - (DONE.heading + DONE.headingGap + gridHeight + DONE.hint)) / 2;
  const headingBottom = top + DONE.heading;
  const gridTop = headingBottom + DONE.headingGap;
  const slots = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    // The last row is centered when it isn't full
    const inRow = Math.min(columns, count - row * columns);
    const rowLeft = CENTER.x - (inRow * width + (inRow - 1) * DONE.gapX) / 2;
    return { left: rowLeft + (i % columns) * (width + DONE.gapX), top: gridTop + row * (height + DONE.gapY), width, height };
  });
  return { headingBottom, slots, hintTop: gridTop + gridHeight + 14 };
}

/** A card in the final grid. */
export function donePlace(index: number, count: number): Place {
  return centeredOn(doneLayout(count).slots[index]);
}

// The mock-up's pseudo-random numbers: the same sparks every time
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export interface Spark {
  /** The direction it flies off in, in degrees. */
  angle: number;
  /** How far it flies, in scene units. */
  distance: number;
  size: number;
  shape: 'leaf' | 'diamond' | 'dot';
  /** Which of the three colors of its burst (0 to 2), for a diamond. */
  tone: number;
  duration: number;
  delay: number;
}

/** Sparks thrown all around: leaves, diamonds and dots, by thirds. */
export function sparks(count: number, seed: number, distance: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const kind = i % 3;
    return {
      angle: Math.round((360 / count) * i + noise(seed + i) * 24 - 12),
      distance: Math.round(distance * (0.55 + noise(seed + i * 7) * 0.55)),
      size: kind === 2 ? 8 : 13 + Math.round(noise(seed + i * 3) * 7),
      shape: kind === 0 ? 'leaf' : kind === 1 ? 'diamond' : 'dot',
      // The mock-up's i % 3 is always 1 for a diamond: its three colors take turns here
      tone: Math.floor(i / 3) % 3,
      duration: Number((0.8 + noise(seed + i * 5) * 0.6).toFixed(2)),
      delay: Math.round(noise(seed + i * 11) * 140),
    };
  });
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
