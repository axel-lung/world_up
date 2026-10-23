import { and, desc, eq, gt, isNull, like, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, coinLedger, userCards } from '@/db/schema';
import { GameError } from './game-error';
import { heldCoins, reservedCopies } from './holds';
import { getResaleValues } from './rules';

// Virtual currency. coin_ledger is append-only and the balance is the sum of a
// player's entries. Coins are earned only by reselling duplicates and from
// achievements, and change hands only at auctions: nothing buys them, and they
// never leave the game.

type Executor = Database | Transaction;

export async function coinBalance(executor: Executor, userId: string): Promise<number> {
  const [{ balance }] = await executor
    .select({ balance: sql<number>`coalesce(sum(${coinLedger.amount}), 0)::int` })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId));
  return balance;
}

/** The balance, less the coins held by the player's leading bids: what they can still bid. */
export async function availableCoins(executor: Executor, userId: string): Promise<number> {
  return (await coinBalance(executor, userId)) - (await heldCoins(executor, userId));
}

export interface LedgerEntry {
  userId: string;
  collectionId: number;
  amount: number;
  reason: (typeof coinLedger.$inferInsert)['reason'];
  reference: string;
  details?: Record<string, unknown>;
  now: Date;
}

/**
 * Takes the players' wallet locks, sorted (the lock order of
 * src/lib/game/holds.ts), until the end of the transaction. Taking one again
 * in the same transaction doesn't wait.
 */
export async function lockWallets(tx: Transaction, userIds: string[]): Promise<void> {
  for (const userId of [...new Set(userIds)].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coins:${userId}`}, 0))`);
  }
}

/**
 * Writes one ledger entry, under the player's wallet lock so that two
 * concurrent entries can't both pass the balance check. Returns false when the
 * entry (same reason and reference) is already there.
 */
export async function addCoins(tx: Transaction, entry: LedgerEntry): Promise<boolean> {
  await lockWallets(tx, [entry.userId]);
  if (entry.amount < 0 && (await coinBalance(tx, entry.userId)) + entry.amount < 0) {
    throw new GameError('notEnoughCoins');
  }
  const inserted = await tx
    .insert(coinLedger)
    .values({
      userId: entry.userId,
      collectionId: entry.collectionId,
      amount: entry.amount,
      reason: entry.reason,
      reference: entry.reference,
      details: entry.details ?? {},
      createdAt: entry.now,
    })
    .onConflictDoNothing()
    .returning({ id: coinLedger.id });
  return inserted.length > 0;
}

export interface Resale {
  copies: number;
  coins: number;
  /** The same request (idempotency key) had already been processed. */
  repeated: boolean;
}

/** Copies of a card the player may resell: one is always kept, and the reserved ones too. */
const resellable = (quantity: number, reserved: number) => quantity - Math.max(1, reserved);

/**
 * Resells duplicates for coins: one copy of `cardId`, or every copy beyond the
 * first of every card when `cardId` is omitted. The player always keeps one
 * copy, and never sells a copy promised in a trade or an auction. A request
 * sent twice with the same key credits once.
 */
export async function resellDuplicates(
  database: Database,
  input: { userId: string; collectionId: number; idempotencyKey: string; now: Date; cardId?: number },
): Promise<Resale> {
  const { userId, collectionId, idempotencyKey, now, cardId } = input;
  return database.transaction(async (tx) => {
    // Locks the duplicates first: a concurrent request with the same key waits
    // here, then finds the ledger entries below
    const duplicates = await tx
      .select({ cardId: userCards.cardId, quantity: userCards.quantity, rarity: cards.rarity })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(
        and(
          eq(userCards.userId, userId),
          eq(userCards.collectionId, collectionId),
          gt(userCards.quantity, 1),
          isNull(cards.hiddenReason),
          cardId === undefined ? undefined : eq(userCards.cardId, cardId),
        ),
      )
      .orderBy(userCards.cardId)
      .for('update', { of: userCards });

    const previous = await tx
      .select({ amount: coinLedger.amount, details: coinLedger.details })
      .from(coinLedger)
      .where(
        and(
          eq(coinLedger.userId, userId),
          eq(coinLedger.reason, 'resale'),
          like(coinLedger.reference, `${idempotencyKey}:%`),
        ),
      );
    if (previous.length > 0) {
      return {
        copies: previous.reduce((sum, entry) => sum + Number((entry.details as { copies?: number }).copies ?? 0), 0),
        coins: previous.reduce((sum, entry) => sum + entry.amount, 0),
        repeated: true,
      };
    }
    // Read under the locks above: an offer or an auction takes the same ones
    const reserved = await reservedCopies(tx, userId, now, duplicates.map((duplicate) => duplicate.cardId));
    const sellable = duplicates
      .map((duplicate) => ({ ...duplicate, extra: resellable(duplicate.quantity, reserved.get(duplicate.cardId) ?? 0) }))
      .filter((duplicate) => duplicate.extra > 0);
    if (sellable.length === 0) throw new GameError('noDuplicate');

    const values = await getResaleValues(tx, collectionId);
    let copies = 0;
    let coins = 0;
    for (const duplicate of sellable) {
      const sold = cardId === undefined ? duplicate.extra : 1;
      const amount = sold * values[duplicate.rarity];
      await tx
        .update(userCards)
        .set({ quantity: sql`${userCards.quantity} - ${sold}` })
        .where(and(eq(userCards.userId, userId), eq(userCards.cardId, duplicate.cardId)));
      await addCoins(tx, {
        userId,
        collectionId,
        amount,
        reason: 'resale',
        reference: `${idempotencyKey}:${duplicate.cardId}`,
        details: { cardId: duplicate.cardId, rarity: duplicate.rarity, copies: sold },
        now,
      });
      copies += sold;
      coins += amount;
    }
    return { copies, coins, repeated: false };
  });
}

/** What reselling every duplicate would bring: shown before the player confirms. */
export async function duplicatesValue(
  userId: string,
  collectionId: number,
  now: Date,
): Promise<{ copies: number; coins: number }> {
  const [values, rows, reserved] = await Promise.all([
    getResaleValues(db, collectionId),
    db
      .select({ cardId: userCards.cardId, rarity: cards.rarity, quantity: userCards.quantity })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(
        and(
          eq(userCards.userId, userId),
          eq(userCards.collectionId, collectionId),
          gt(userCards.quantity, 1),
          isNull(cards.hiddenReason),
        ),
      ),
    reservedCopies(db, userId, now),
  ]);
  let copies = 0;
  let coins = 0;
  for (const row of rows) {
    const extra = Math.max(0, resellable(row.quantity, reserved.get(row.cardId) ?? 0));
    copies += extra;
    coins += extra * values[row.rarity];
  }
  return { copies, coins };
}

/** The player's ledger, newest first, for the account export. */
export async function playerLedger(userId: string) {
  return db
    .select({
      amount: coinLedger.amount,
      reason: coinLedger.reason,
      details: coinLedger.details,
      createdAt: coinLedger.createdAt,
    })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
    .orderBy(desc(coinLedger.createdAt), desc(coinLedger.id));
}
