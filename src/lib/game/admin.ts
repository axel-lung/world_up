import { eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '@/db';
import { auditLog, gameRules, rarityOdds, resaleValues } from '@/db/schema';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { type OddsSet, validOdds } from './draw';
import { type GameRules, getGameRules, getResaleValues, visibleCardsByRarity } from './rules';

// The back-office's changes to the game rules: one transaction each, with its
// audit_log row. Odds are never updated: a change is a new dated set.

export class RulesError extends Error {
  constructor(readonly code: 'oddsSum' | 'oddsNoCards' | 'oddsInPast' | 'unchanged') {
    super(code);
  }
}

function audit(tx: Transaction, adminId: string, action: string, collectionId: number, details: Record<string, unknown>) {
  return tx.insert(auditLog).values({ adminId, action, targetType: 'collection', targetId: String(collectionId), details });
}

export async function updateGameRules(
  database: Database,
  adminId: string,
  collectionId: number,
  rules: GameRules,
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${gameRules} WHERE ${gameRules.collectionId} = ${collectionId} FOR UPDATE`);
    const before = await getGameRules(tx, collectionId);
    if (Object.entries(rules).every(([key, value]) => before[key as keyof GameRules] === value)) {
      throw new RulesError('unchanged');
    }
    await tx
      .update(gameRules)
      .set({ ...rules, updatedAt: sql`now()` })
      .where(eq(gameRules.collectionId, collectionId));
    await audit(tx, adminId, 'rules.update', collectionId, { from: before, to: rules });
  });
}

export async function updateResaleValues(
  database: Database,
  adminId: string,
  collectionId: number,
  values: Record<Rarity, number>,
): Promise<void> {
  await database.transaction(async (tx) => {
    const before = await getResaleValues(tx, collectionId);
    if (RARITIES.every((rarity) => before[rarity] === values[rarity])) throw new RulesError('unchanged');
    await tx
      .insert(resaleValues)
      .values(RARITIES.map((rarity) => ({ collectionId, rarity, coins: values[rarity] })))
      .onConflictDoUpdate({
        target: [resaleValues.collectionId, resaleValues.rarity],
        set: { coins: sql.raw('excluded."coins"') },
      });
    await audit(tx, adminId, 'resale.update', collectionId, { from: before, to: values });
  });
}

/**
 * Publishes a new set of odds, valid from `validFrom` (now or later: a draw
 * already made always keeps the odds it was made with). Every rarity with a
 * chance to come out needs visible cards.
 */
export async function publishOdds(
  database: Database,
  adminId: string,
  collectionId: number,
  odds: OddsSet,
  validFrom: Date,
  now: Date,
): Promise<void> {
  if (!validOdds(odds)) throw new RulesError('oddsSum');
  // A minute's grace for the time the form took to send
  if (validFrom.getTime() < now.getTime() - 60_000) throw new RulesError('oddsInPast');
  const visible = await visibleCardsByRarity(collectionId);
  if (RARITIES.some((rarity) => odds[rarity] > 0 && visible[rarity] === 0)) throw new RulesError('oddsNoCards');
  const from = validFrom < now ? now : validFrom;
  await database.transaction(async (tx) => {
    await tx.insert(rarityOdds).values(RARITIES.map((rarity) => ({ collectionId, rarity, perMillion: odds[rarity], validFrom: from })));
    await audit(tx, adminId, 'odds.publish', collectionId, { validFrom: from.toISOString(), odds });
  });
}
