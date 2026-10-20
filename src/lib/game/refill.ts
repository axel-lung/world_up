// Free pack refill, computed on read with no scheduled job. Pure functions of
// the stored state and the server's clock, which the callers pass in.

export interface RefillRules {
  refillMinutes: number;
  maxReserve: number;
}

export interface StoredReserve {
  packs: number;
  lastRefill: Date;
}

export interface Reserve extends StoredReserve {
  /** When the next pack arrives; null while the reserve is full (the timer is paused). */
  nextPackAt: Date | null;
}

/**
 * packs = min(max reserve, stored + whole intervals elapsed since the last
 * refill), and the last refill moves forward by that many intervals. A full
 * reserve pauses the timer: see takePack.
 */
export function refill(stored: StoredReserve, rules: RefillRules, now: Date): Reserve {
  const interval = rules.refillMinutes * 60_000;
  if (stored.packs >= rules.maxReserve) return { ...stored, nextPackAt: null };
  // A clock set back never takes packs away
  const elapsed = Math.max(0, Math.floor((now.getTime() - stored.lastRefill.getTime()) / interval));
  const packs = Math.min(rules.maxReserve, stored.packs + elapsed);
  const lastRefill = new Date(stored.lastRefill.getTime() + elapsed * interval);
  const nextPackAt = packs >= rules.maxReserve ? null : new Date(lastRefill.getTime() + interval);
  return { packs, lastRefill, nextPackAt };
}

/**
 * The reserve after taking one pack (the caller checks there is one). Taken
 * from a full reserve, the timer starts now: the next pack comes one interval
 * after this opening.
 */
export function takePack(reserve: Reserve, rules: RefillRules, now: Date): StoredReserve {
  const lastRefill = reserve.packs >= rules.maxReserve ? now : reserve.lastRefill;
  return { packs: reserve.packs - 1, lastRefill };
}
