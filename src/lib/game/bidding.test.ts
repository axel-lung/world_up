import { describe, expect, it } from 'vitest';
import { type BiddingState, bidStep, minimumBid, resolveBid } from './bidding';
import { GameError } from './game-error';

const rules = { bidIncrementPercent: 5, auctionExtensionMinutes: 5, maxPrice: 1000 };
const start = new Date('2026-10-23T12:00:00Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const end = at(24 * 60);

const fresh: BiddingState = {
  sellerId: 'seller',
  startPrice: 100,
  buyoutPrice: null,
  currentPrice: 100,
  leaderId: null,
  leaderMax: null,
  bidCount: 0,
  endsAt: end,
};

/** The auction led by `leaderId` with this maximum, at this price. */
const led = (leaderId: string, leaderMax: number, currentPrice: number, more: Partial<BiddingState> = {}): BiddingState => ({
  ...fresh,
  leaderId,
  leaderMax,
  currentPrice,
  bidCount: 1,
  ...more,
});

const bid = (state: BiddingState, bidderId: string, maxAmount: number, now = at(60)) =>
  resolveBid(state, { bidderId, maxAmount, now }, rules);

const refusal = (run: () => unknown) => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof GameError ? error.code : error;
  }
};

describe('bidStep', () => {
  it('is the percentage of the price, rounded up, one coin at least', () => {
    expect(bidStep(100, 5)).toBe(5);
    expect(bidStep(101, 5)).toBe(6);
    expect(bidStep(3, 5)).toBe(1);
    expect(bidStep(0, 5)).toBe(1);
  });
});

describe('a bid', () => {
  it('makes the first bidder the leader at the starting price, whatever their maximum', () => {
    const { state, outcome } = bid(fresh, 'anna', 300);
    expect(outcome).toEqual({ result: 'leading', previousLeader: null });
    expect(state).toMatchObject({ leaderId: 'anna', leaderMax: 300, currentPrice: 100, bidCount: 1, endsAt: end });
  });

  it('must reach the starting price first, then the price plus one step', () => {
    expect(refusal(() => bid(fresh, 'anna', 99))).toBe('bidTooLow');
    expect(minimumBid(led('anna', 300, 100), 'bruno', rules)).toBe(105);
    expect(refusal(() => bid(led('anna', 300, 100), 'bruno', 104))).toBe('bidTooLow');
    expect(refusal(() => bid(fresh, 'anna', 0))).toBe('bidTooLow');
    expect(refusal(() => bid(fresh, 'anna', 150.5))).toBe('bidTooLow');
  });

  it('lets the leader raise their maximum without moving the price', () => {
    const { state, outcome } = bid(led('anna', 300, 120), 'anna', 400);
    expect(outcome).toEqual({ result: 'raised' });
    expect(state).toMatchObject({ leaderId: 'anna', leaderMax: 400, currentPrice: 120, bidCount: 2 });
    expect(minimumBid(led('anna', 300, 120), 'anna', rules)).toBe(301);
    expect(refusal(() => bid(led('anna', 300, 120), 'anna', 300))).toBe('bidTooLow');
  });

  it('above the leader’s maximum, takes the lead at that maximum plus one step', () => {
    const { state, outcome } = bid(led('anna', 300, 100), 'bruno', 500);
    expect(outcome).toEqual({ result: 'leading', previousLeader: 'anna' });
    expect(state).toMatchObject({ leaderId: 'bruno', leaderMax: 500, currentPrice: 315 });
  });

  it('just above the leader’s maximum, takes the lead at its own maximum', () => {
    const { state } = bid(led('anna', 300, 100), 'bruno', 310);
    expect(state).toMatchObject({ leaderId: 'bruno', leaderMax: 310, currentPrice: 310 });
  });

  it('below the leader’s maximum, raises the price to that bid plus one step', () => {
    const { state, outcome } = bid(led('anna', 300, 100), 'bruno', 200);
    expect(outcome).toEqual({ result: 'outbid' });
    expect(state).toMatchObject({ leaderId: 'anna', leaderMax: 300, currentPrice: 210, bidCount: 2 });
  });

  it('never raises the price past the leader’s maximum', () => {
    expect(bid(led('anna', 300, 100), 'bruno', 290).state.currentPrice).toBe(300);
  });

  it('at a tie, leaves the earlier bid ahead, at its maximum', () => {
    const { state, outcome } = bid(led('anna', 300, 100), 'bruno', 300);
    expect(outcome).toEqual({ result: 'outbid' });
    expect(state).toMatchObject({ leaderId: 'anna', currentPrice: 300 });
  });

  it('can’t go above the rarity’s ceiling', () => {
    expect(refusal(() => bid(fresh, 'anna', 1001))).toBe('bidTooHigh');
    expect(bid(fresh, 'anna', 1000).outcome.result).toBe('leading');
  });

  it('at or above the buyout price, buys the card at that price and ends the auction', () => {
    const withBuyout = led('anna', 300, 100, { buyoutPrice: 400 });
    const { state, outcome } = bid(withBuyout, 'bruno', 900, at(90));
    expect(outcome).toEqual({ result: 'bought', previousLeader: 'anna' });
    expect(state).toMatchObject({ leaderId: 'bruno', leaderMax: 400, currentPrice: 400, endsAt: at(90) });
    // Even the leader buys it by raising to the buyout price
    expect(bid(withBuyout, 'anna', 400).outcome).toEqual({ result: 'bought', previousLeader: null });
  });

  it('can always buy, even when the next step would overshoot the buyout price', () => {
    const almost = led('anna', 395, 395, { buyoutPrice: 400 });
    expect(minimumBid(almost, 'bruno', rules)).toBe(400);
    expect(bid(almost, 'bruno', 400).outcome.result).toBe('bought');
  });

  it('in the last minutes, pushes the end back', () => {
    const late = led('anna', 300, 100, { endsAt: at(10) });
    expect(bid(late, 'bruno', 200, at(7)).state.endsAt).toEqual(at(12));
    // Earlier, the end stays
    expect(bid(late, 'bruno', 200, at(4)).state.endsAt).toEqual(at(10));
  });

  it('is refused once the auction is over, and on one’s own auction', () => {
    expect(refusal(() => bid(fresh, 'anna', 200, end))).toBe('auctionOver');
    expect(refusal(() => bid(fresh, 'seller', 200))).toBe('ownAuction');
  });
});
