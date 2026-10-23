import { db } from '@/db';
import { settleEndedAuctions } from '@/lib/game/auctions';
import { expireTrades } from '@/lib/game/trades';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

/**
 * Every minute: the auctions over are settled and their players told, the
 * trade offers past their expiry are marked and their proposers told.
 */
export function createMarketJob(): JobDefinition {
  return {
    name: queues.marketSettle.name,
    handler: async () => {
      const now = new Date();
      const auctions = await settleEndedAuctions(db, now);
      const expiredTrades = await expireTrades(db, now);
      if (expiredTrades > 0 || auctions.sold + auctions.unsold + auctions.cancelled > 0) {
        console.log('Market:', JSON.stringify({ auctions, expiredTrades }));
      }
    },
  };
}
