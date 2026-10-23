import { GameError } from './game-error';

// What a bid does to an auction, without the database: ascending auction with
// automatic bidding (eBay's "maximum bid"). Each bidder enters the most they
// would pay; the server bids for them, by the smallest step needed. The leader
// pays the second highest maximum plus one step, never their own maximum, so
// entering one's true value is safe. A bid close to the end extends the
// auction, which takes the edge off last-second bidding. A maximum at or above
// the buyout price buys the card at that price at once.

export interface BiddingState {
  sellerId: string | null;
  startPrice: number;
  buyoutPrice: number | null;
  currentPrice: number;
  leaderId: string | null;
  leaderMax: number | null;
  bidCount: number;
  endsAt: Date;
}

export interface BiddingRules {
  bidIncrementPercent: number;
  auctionExtensionMinutes: number;
  /** The rarity's ceiling: no maximum above it. */
  maxPrice: number;
}

export type BidOutcome =
  /** The bidder leads; `previousLeader` was ahead until now. */
  | { result: 'leading'; previousLeader: string | null }
  /** The leader raised their maximum: the price stays. */
  | { result: 'raised' }
  /** The leader's maximum is at least as high: they stay ahead, at a higher price. */
  | { result: 'outbid' }
  /** At or above the buyout price: the card is the bidder's, at that price. */
  | { result: 'bought'; previousLeader: string | null };

/** The step over a price: `percent` of it, rounded up, one coin at least. */
export function bidStep(price: number, percent: number): number {
  return Math.max(1, Math.ceil((price * percent) / 100));
}

/** The lowest maximum this bidder may enter. */
export function minimumBid(state: BiddingState, bidderId: string, rules: Pick<BiddingRules, 'bidIncrementPercent'>): number {
  let minimum: number;
  if (!state.leaderId) minimum = state.startPrice;
  else if (state.leaderId === bidderId) minimum = state.leaderMax! + 1;
  else minimum = state.currentPrice + bidStep(state.currentPrice, rules.bidIncrementPercent);
  // Near the buyout price, the next step may overshoot it: buying stays possible
  return state.buyoutPrice === null ? minimum : Math.min(minimum, state.buyoutPrice);
}

/**
 * The auction after a bid of `maxAmount` coins at most, and what it did.
 * Refuses a bid on a finished auction, on one's own, below the minimum or
 * above the rarity's ceiling. The coins are the caller's to check: a bid
 * needs as many available coins as it may cost (the buyout price for a buyout).
 */
export function resolveBid(
  state: BiddingState,
  bid: { bidderId: string; maxAmount: number; now: Date },
  rules: BiddingRules,
): { state: BiddingState; outcome: BidOutcome } {
  const { bidderId, maxAmount, now } = bid;
  if (now >= state.endsAt) throw new GameError('auctionOver');
  if (bidderId === state.sellerId) throw new GameError('ownAuction');
  if (!Number.isInteger(maxAmount) || maxAmount < 1) throw new GameError('bidTooLow');
  const bidCount = state.bidCount + 1;
  const previousLeader = state.leaderId === bidderId ? null : state.leaderId;

  if (state.buyoutPrice !== null && maxAmount >= state.buyoutPrice) {
    const price = state.buyoutPrice;
    return {
      state: { ...state, currentPrice: price, leaderId: bidderId, leaderMax: price, bidCount, endsAt: now },
      outcome: { result: 'bought', previousLeader },
    };
  }
  if (maxAmount > rules.maxPrice) throw new GameError('bidTooHigh');
  if (maxAmount < minimumBid(state, bidderId, rules)) throw new GameError('bidTooLow');

  const extension = rules.auctionExtensionMinutes * 60_000;
  const endsAt = state.endsAt.getTime() - now.getTime() < extension ? new Date(now.getTime() + extension) : state.endsAt;
  const step = (price: number) => bidStep(price, rules.bidIncrementPercent);

  if (!state.leaderId) {
    return {
      state: { ...state, currentPrice: state.startPrice, leaderId: bidderId, leaderMax: maxAmount, bidCount, endsAt },
      outcome: { result: 'leading', previousLeader: null },
    };
  }
  if (state.leaderId === bidderId) {
    return { state: { ...state, leaderMax: maxAmount, bidCount, endsAt }, outcome: { result: 'raised' } };
  }
  const leaderMax = state.leaderMax!;
  if (maxAmount > leaderMax) {
    return {
      state: {
        ...state,
        currentPrice: Math.min(maxAmount, leaderMax + step(leaderMax)),
        leaderId: bidderId,
        leaderMax: maxAmount,
        bidCount,
        endsAt,
      },
      outcome: { result: 'leading', previousLeader },
    };
  }
  // At equal maximums, the earlier bid wins
  return {
    state: { ...state, currentPrice: Math.min(leaderMax, maxAmount + step(maxAmount)), bidCount, endsAt },
    outcome: { result: 'outbid' },
  };
}
