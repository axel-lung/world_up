import { and, desc, eq, gt, isNull, like, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, coinLedger, userCards } from '@/db/schema';
import { GameError } from './game-error';
import { getResaleValues } from './rules';

// Virtual currency. coin_ledger is append-only and the balance is the sum of a
// player's entries. Coins are earned only by reselling duplicates and from
// achievements: nothing buys them, and they never leave the game.

type Executor = Database | Transaction;

export async function coinBalance(executor: Executor, userId: string): Promise<number> {
  const [{ balance }] = await executor
    .select({ balance: sql<number>`coalesce(sum(${coinLedger.amount}), 0)::int` })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId));
  return balance;
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
 * Writes one ledger entry, under the player's wallet lock so that two
 * concurrent entries can't both pass the balance check. Returns false when the
 * entry (same reason and reference) is already there.
 */
export async function addCoins(tx: Transaction, entry: LedgerEntry): Promise<boolean> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coins:${entry.userId}`}, 0))`);
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

/**
 * Resells duplicates for coins: one copy of `cardId`, or every copy beyond the
 * first of every card when `cardId` is omitted. The player always keeps one
 * copy. A request sent twice with the same key credits once.
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
    if (duplicates.length === 0) throw new GameError('noDuplicate');

    const values = await getResaleValues(tx, collectionId);
    let copies = 0;
    let coins = 0;
    for (const duplicate of duplicates) {
      const sold = cardId === undefined ? duplicate.quantity - 1 : 1;
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
export async function duplicatesValue(userId: string, collectionId: number): Promise<{ copies: number; coins: number }> {
  const values = await getResaleValues(db, collectionId);
  const rows = await db
    .select({ rarity: cards.rarity, copies: sql<number>`sum(${userCards.quantity} - 1)::int` })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(
      and(
        eq(userCards.userId, userId),
        eq(userCards.collectionId, collectionId),
        gt(userCards.quantity, 1),
        isNull(cards.hiddenReason),
      ),
    )
    .groupBy(cards.rarity);
  return {
    copies: rows.reduce((sum, row) => sum + row.copies, 0),
    coins: rows.reduce((sum, row) => sum + row.copies * values[row.rarity], 0),
  };
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
