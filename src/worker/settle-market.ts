import { db } from '@/db';
import { expireTrades } from '@/lib/game/trades';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

/** Every minute: the trade offers past their expiry are marked, and their proposers told. */
export function createMarketJob(): JobDefinition {
  return {
    name: queues.marketSettle.name,
    handler: async () => {
      const expired = await expireTrades(db, new Date());
      if (expired > 0) console.log('Market:', JSON.stringify({ expiredTrades: expired }));
    },
  };
}
