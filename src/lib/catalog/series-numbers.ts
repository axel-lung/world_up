import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '@/db';

/**
 * Numbers the visible cards of each series of a collection 1..n by position
 * ("004/1452" on the card), clears the number of hidden cards, and stores each
 * series' visible card count. Run after anything that adds cards to a series
 * or shows or hides a card.
 */
export async function renumberSeries(executor: Database | Transaction, collectionId: number): Promise<void> {
  await executor.execute(sql`
    UPDATE card_series AS cs SET number = numbered.n
    FROM (
      SELECT cs2.card_id, cs2.series_id,
        CASE WHEN c.hidden_reason IS NULL
          THEN row_number() OVER (PARTITION BY cs2.series_id, c.hidden_reason IS NULL ORDER BY cs2.position)
        END AS n
      FROM card_series AS cs2
      JOIN cards AS c ON c.id = cs2.card_id
      WHERE c.collection_id = ${collectionId}
    ) AS numbered
    WHERE cs.card_id = numbered.card_id AND cs.series_id = numbered.series_id
      AND cs.number IS DISTINCT FROM numbered.n`);
  await executor.execute(sql`
    UPDATE series AS s SET card_count = (
      SELECT count(*) FROM card_series AS cs
      JOIN cards AS c ON c.id = cs.card_id
      WHERE cs.series_id = s.id AND c.hidden_reason IS NULL
    )
    WHERE s.collection_id = ${collectionId}`);
}
