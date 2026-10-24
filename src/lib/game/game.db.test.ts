import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  auctions,
  auditLog,
  cards,
  coinLedger,
  packCards,
  packOpenings,
  rarityOdds,
  tradeItems,
  trades,
  userCards,
} from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { RARITIES } from '@/lib/rarity';
import { publishOdds, RulesError, updateGameRules } from './admin';
import { addCoins, coinBalance, duplicatesValue, resellDuplicates } from './coins';
import { GameError } from './game-error';
import { reservedCopies } from './holds';
import { getReserve, OPENINGS_PER_MINUTE, openPack } from './packs';
import { currentOdds } from './rules';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection, TEST_RESALE } from './testing';

// Visible commons Q1 to Q4 and rare Q7; the hidden cards have higher IDs than
// the visible ones of their rarity, so drawing "the last card" catches a draw
// that would count them.
const CARDS = [
  testCard(1),
  testCard(2),
  testCard(3),
  testCard(4),
  testCard(5, { memorial: true, hidden_reason: 'memorial' }),
  testCard(6, { commercial: true, hidden_reason: 'commercial' }),
  testCard(7, { rarity: 'rare' }),
  testCard(8, { rarity: 'rare', twentieth_century: true, hidden_reason: 'twentieth_century' }),
];
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 500_000, uncommon: 0, common: 500_000 };

const t0 = new Date('2026-10-20T12:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

let standard: TestCollection;
let big: TestCollection;
let paying: TestCollection;
const players: string[] = [];

beforeAll(async () => {
  standard = await createTestCollection(CARDS, { odds: ODDS });
  big = await createTestCollection(CARDS, { odds: ODDS, rules: { signupPacks: 30, maxReserve: 30 } });
  paying = await createTestCollection(CARDS, { odds: ODDS, rules: { coinsPerOpening: 5 } });
});

afterAll(async () => {
  await deleteTestData([standard.id, big.id, paying.id], players);
});

async function newPlayer() {
  const id = await createTestPlayer();
  players.push(id);
  return id;
}

const open = (userId: string, now: Date, options: { collection?: TestCollection; key?: string; random?: (max: number) => number } = {}) =>
  openPack(db, {
    userId,
    collectionId: (options.collection ?? standard).id,
    idempotencyKey: options.key ?? randomUUID(),
    now,
    random: options.random,
  });

async function drawnWikidataIds(userId: string) {
  const rows = await db
    .select({ wikidataId: cards.wikidataId })
    .from(packCards)
    .innerJoin(packOpenings, eq(packOpenings.id, packCards.openingId))
    .innerJoin(cards, eq(cards.id, packCards.cardId))
    .where(eq(packOpenings.userId, userId));
  return rows.map((row) => row.wikidataId);
}

async function copies(userId: string) {
  const rows = await db
    .select({ wikidataId: cards.wikidataId, quantity: userCards.quantity })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(eq(userCards.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.wikidataId, row.quantity]));
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => (error instanceof GameError ? error.code : error),
  );

// Always the highest ticket and the last card: a common, the last visible one
const last = (max: number) => max - 1;
// Always ticket 0 and the first card: with these odds, rare Q7
const first = () => 0;

describe('the reserve', () => {
  it('gives a new player 10 packs, one more 10 minutes after an opening, and never more than 10', async () => {
    const player = await newPlayer();
    expect(await getReserve(player, standard.id, t0)).toMatchObject({ packs: 10, nextPackAt: null, maxReserve: 10 });
    await open(player, at(1));
    expect(await getReserve(player, standard.id, at(10.99))).toMatchObject({ packs: 9, nextPackAt: at(11) });
    expect(await getReserve(player, standard.id, at(11))).toMatchObject({ packs: 10, nextPackAt: null });
    expect(await getReserve(player, standard.id, at(24 * 60))).toMatchObject({ packs: 10 });
  });

  it('opens nothing once the reserve is empty', async () => {
    const player = await newPlayer();
    for (let i = 0; i < 10; i++) await open(player, at(i / 10));
    expect(await rejection(open(player, at(1)))).toBe('noPack');
    expect(await getReserve(player, standard.id, at(1))).toMatchObject({ packs: 0, nextPackAt: at(10) });
  });
});

describe('openPack', () => {
  it('opens a single pack for a double click', async () => {
    const player = await newPlayer();
    const key = randomUUID();
    const [a, b] = await Promise.all([open(player, t0, { key }), open(player, t0, { key })]);
    expect(a.openingId).toBe(b.openingId);
    expect([a.repeated, b.repeated].sort()).toEqual([false, true]);
    expect(await getReserve(player, standard.id, t0)).toMatchObject({ packs: 9 });
    expect(await drawnWikidataIds(player)).toHaveLength(5);
  });

  it('never draws a hidden card', async () => {
    const player = await newPlayer();
    await open(player, t0, { random: last });
    expect(await drawnWikidataIds(player)).toEqual(['Q4', 'Q4', 'Q4', 'Q4', 'Q4']);
    for (let i = 1; i < 10; i++) await open(player, at(i / 10));
    const drawn = await drawnWikidataIds(player);
    expect(drawn).toHaveLength(50);
    expect(drawn.filter((id) => !['Q1', 'Q2', 'Q3', 'Q4', 'Q7'].includes(id))).toEqual([]);
  });

  it('keeps duplicates and marks only the first copy as new', async () => {
    const player = await newPlayer();
    const { openingId } = await open(player, t0, { random: first });
    const rows = await db
      .select({ isNew: packCards.isNew })
      .from(packCards)
      .where(eq(packCards.openingId, openingId))
      .orderBy(packCards.position);
    expect(rows.map((row) => row.isNew)).toEqual([true, false, false, false, false]);
    expect(await copies(player)).toEqual({ Q7: 5 });
    await open(player, at(1), { random: first });
    expect(await copies(player)).toEqual({ Q7: 10 });
  });

  it(`refuses more than ${OPENINGS_PER_MINUTE} openings a minute`, async () => {
    const player = await newPlayer();
    for (let i = 0; i < OPENINGS_PER_MINUTE; i++) await open(player, t0, { collection: big });
    expect(await rejection(open(player, at(0.5), { collection: big }))).toBe('tooFast');
    await open(player, at(1.01), { collection: big });
  });
});

describe('achievements', () => {
  it('rewards each achievement once, with its coins', async () => {
    const player = await newPlayer();
    expect((await open(player, t0)).achievements.map((a) => a.code)).toEqual(['packs-1']);
    expect((await open(player, at(1))).achievements).toEqual([]);
    expect((await open(player, at(2))).achievements.map((a) => a.code)).toEqual(['packs-3']);
    expect(await coinBalance(db, player)).toBe(25);
  });
});

describe('coins per opening', () => {
  it('credits each opening once, a double click included, on top of the achievements', async () => {
    const player = await newPlayer();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      open(player, t0, { collection: paying, key }),
      open(player, t0, { collection: paying, key }),
    ]);
    expect([a.coins, b.coins].sort()).toEqual([0, 5]);
    await open(player, at(1), { collection: paying });
    const entries = await db
      .select({ amount: coinLedger.amount, reference: coinLedger.reference })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, player), eq(coinLedger.reason, 'pack_opening')));
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.reference)).toContain(String(a.openingId));
    // Two openings at 5 coins, and the first pack's achievement (5)
    expect(await coinBalance(db, player)).toBe(15);
  });
});

describe('resellDuplicates', () => {
  it('credits a duplicate resold twice by a double click once', async () => {
    const player = await newPlayer();
    const { openingId } = await open(player, t0, { random: first });
    const [q7] = await db.select({ cardId: packCards.cardId }).from(packCards).where(eq(packCards.openingId, openingId));
    const balance = await coinBalance(db, player);
    const key = randomUUID();
    const resell = () =>
      resellDuplicates(db, { userId: player, collectionId: standard.id, idempotencyKey: key, now: at(1), cardId: q7.cardId });
    const results = await Promise.all([resell(), resell()]);
    expect(results.map((r) => r.repeated).sort()).toEqual([false, true]);
    expect(results.map((r) => r.coins)).toEqual([TEST_RESALE.rare, TEST_RESALE.rare]);
    expect(await coinBalance(db, player)).toBe(balance + TEST_RESALE.rare);
    expect(await copies(player)).toEqual({ Q7: 4 });
  });

  it('sells every copy beyond the first, then has nothing left to sell', async () => {
    const player = await newPlayer();
    await open(player, t0, { random: first });
    await open(player, at(1), { random: last });
    const balance = await coinBalance(db, player);
    const resale = await resellDuplicates(db, {
      userId: player,
      collectionId: standard.id,
      idempotencyKey: randomUUID(),
      now: at(2),
    });
    expect(resale).toEqual({ copies: 8, coins: 4 * TEST_RESALE.rare + 4 * TEST_RESALE.common, repeated: false });
    expect(await copies(player)).toEqual({ Q4: 1, Q7: 1 });
    expect(await coinBalance(db, player)).toBe(balance + resale.coins);
    expect(
      await rejection(
        resellDuplicates(db, { userId: player, collectionId: standard.id, idempotencyKey: randomUUID(), now: at(3) }),
      ),
    ).toBe('noDuplicate');
  });
});

describe('reservations', () => {
  it('never resells a copy offered in an open trade or put up for auction', async () => {
    const player = await newPlayer();
    const friend = await newPlayer();
    const { openingId } = await open(player, t0, { random: first });
    const [q7] = await db.select({ cardId: packCards.cardId }).from(packCards).where(eq(packCards.openingId, openingId));
    const offer = async (expiresAt: Date, quantity: number) => {
      const [trade] = await db
        .insert(trades)
        .values({ collectionId: standard.id, proposerId: player, recipientId: friend, idempotencyKey: randomUUID(), expiresAt })
        .returning({ id: trades.id });
      await db.insert(tradeItems).values({ tradeId: trade.id, side: 'proposer', cardId: q7.cardId, quantity });
    };
    // Five copies; three offered: two can be resold
    await offer(at(60), 3);
    // An expired offer reserves nothing
    await offer(at(1), 5);
    await db.insert(auctions).values({
      collectionId: standard.id,
      sellerId: player,
      cardId: q7.cardId,
      startPrice: 10,
      currentPrice: 10,
      idempotencyKey: randomUUID(),
      endsAt: at(60),
    });
    // ...and one up for auction: one left to resell
    expect(await reservedCopies(db, player, at(2), [q7.cardId])).toEqual(new Map([[q7.cardId, 4]]));
    expect(await duplicatesValue(player, standard.id, at(2))).toEqual({ copies: 1, coins: TEST_RESALE.rare });
    const resale = await resellDuplicates(db, { userId: player, collectionId: standard.id, idempotencyKey: randomUUID(), now: at(2) });
    expect(resale).toMatchObject({ copies: 1 });
    expect(await copies(player)).toEqual({ Q7: 4 });
    expect(
      await rejection(resellDuplicates(db, { userId: player, collectionId: standard.id, idempotencyKey: randomUUID(), now: at(2) })),
    ).toBe('noDuplicate');
  });
});

describe('coins', () => {
  it('never lets the balance go negative', async () => {
    const player = await newPlayer();
    await open(player, t0);
    const balance = await coinBalance(db, player);
    const spend = (amount: number) =>
      db.transaction((tx) =>
        addCoins(tx, {
          userId: player,
          collectionId: standard.id,
          amount: -amount,
          reason: 'resale',
          reference: randomUUID(),
          now: at(1),
        }),
      );
    expect(await rejection(spend(balance + 1))).toBe('notEnoughCoins');
    expect(await coinBalance(db, player)).toBe(balance);
    await spend(balance);
    expect(await coinBalance(db, player)).toBe(0);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, player), inArray(coinLedger.reason, ['resale', 'achievement'])));
    expect(total).toBe(2);
  });
});

describe('the back-office', () => {
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (error) => (error instanceof RulesError ? error.code : error),
    );

  it('changes the pack rules and logs the change', async () => {
    const admin = await newPlayer();
    const rules = { cardsPerPack: 5, signupPacks: 10, refillMinutes: 15, maxReserve: 12, coinsPerOpening: 0 };
    await updateGameRules(db, admin, standard.id, rules);
    expect(await failure(updateGameRules(db, admin, standard.id, rules))).toBe('unchanged');
    const [entry] = await db
      .select({ action: auditLog.action, details: auditLog.details })
      .from(auditLog)
      .where(and(eq(auditLog.adminId, admin), eq(auditLog.targetId, String(standard.id))));
    expect(entry).toMatchObject({ action: 'rules.update', details: { from: { refillMinutes: 10 }, to: rules } });
    await updateGameRules(db, admin, standard.id, { ...rules, refillMinutes: 10, maxReserve: 10 });
  });

  it('publishes odds that sum to 100 %, from now on, for rarities that have cards', async () => {
    const admin = await newPlayer();
    const now = new Date();
    const publish = (odds: typeof ODDS, validFrom = now) => publishOdds(db, admin, standard.id, odds, validFrom, now);
    expect(await failure(publish({ ...ODDS, rare: 400_000 }))).toBe('oddsSum');
    expect(await failure(publish({ ...ODDS, rare: 400_000, legendary: 100_000 }))).toBe('oddsNoCards');
    expect(await failure(publish(ODDS, new Date(now.getTime() - 3_600_000)))).toBe('oddsInPast');
    await publish({ ...ODDS, rare: 300_000, common: 700_000 });
    expect((await currentOdds(db, standard.id, new Date(now.getTime() + 1)))?.odds).toMatchObject({ rare: 300_000 });
    // Still drawable afterwards: the earlier set is kept, not overwritten
    expect((await currentOdds(db, standard.id, at(0)))?.odds.rare).toBe(500_000);
  });
});

describe('currentOdds', () => {
  it('uses the latest set already in force', async () => {
    const later = at(60);
    await db
      .insert(rarityOdds)
      .values(RARITIES.map((rarity) => ({ collectionId: big.id, rarity, perMillion: rarity === 'rare' ? 1_000_000 : 0, validFrom: later })));
    expect((await currentOdds(db, big.id, at(59)))?.odds.rare).toBe(500_000);
    expect(await currentOdds(db, big.id, later)).toMatchObject({ validFrom: later, odds: { rare: 1_000_000, common: 0 } });
  });
});
