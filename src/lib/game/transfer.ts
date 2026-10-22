import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Transaction } from '@/db';
import { userCards } from '@/db/schema';

// Cards changing hands (trades, auctions). The caller holds the locks and has
// checked that the giver can spare the copies.

export interface CardOwner {
  userId: string;
  cardId: number;
}

/**
 * Locks the user_cards rows of these players and cards, in player then card
 * order (the lock order of src/lib/game/holds.ts), and returns their copies.
 * Rows that don't exist yet (a card the player doesn't own) aren't there.
 */
export async function lockCopies(tx: Transaction, owners: CardOwner[]): Promise<Map<string, number>> {
  const copies = new Map<string, number>();
  const byPlayer = new Map<string, number[]>();
  for (const { userId, cardId } of owners) byPlayer.set(userId, [...(byPlayer.get(userId) ?? []), cardId]);
  for (const userId of [...byPlayer.keys()].sort()) {
    const rows = await tx
      .select({ cardId: userCards.cardId, quantity: userCards.quantity })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, byPlayer.get(userId)!)))
      .orderBy(userCards.cardId)
      .for('update');
    for (const row of rows) copies.set(ownerKey({ userId, cardId: row.cardId }), row.quantity);
  }
  return copies;
}

export const ownerKey = ({ userId, cardId }: CardOwner) => `${userId}:${cardId}`;

/**
 * Moves `quantity` copies of a card from one player to another. The giver's
 * row goes when its last copy does; the receiver's is created with today as
 * its first obtention, or grows.
 */
export async function moveCard(
  tx: Transaction,
  move: { from: string; to: string; cardId: number; quantity: number; collectionId: number; now: Date },
): Promise<void> {
  const { from, to, cardId, quantity, collectionId, now } = move;
  const [left] = await tx
    .update(userCards)
    .set({ quantity: sql`${userCards.quantity} - ${quantity}` })
    .where(and(eq(userCards.userId, from), eq(userCards.cardId, cardId)))
    .returning({ quantity: userCards.quantity });
  if (!left || left.quantity < 0) throw new Error(`Player ${from} lacks card ${cardId}`);
  if (left.quantity === 0) {
    await tx.delete(userCards).where(and(eq(userCards.userId, from), eq(userCards.cardId, cardId)));
  }
  await tx
    .insert(userCards)
    .values({ userId: to, collectionId, cardId, quantity, firstObtainedAt: now })
    .onConflictDoUpdate({
      target: [userCards.userId, userCards.cardId],
      set: { quantity: sql.raw('"user_cards"."quantity" + excluded."quantity"') },
    });
}
