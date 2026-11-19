import { db } from '@/db';
import { notifyFullReserves } from '@/lib/game/packs';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

/** Every minute: the players whose free pack reserve has filled up are told. */
export function createPacksFullJob(): JobDefinition {
  return {
    name: queues.packsFull.name,
    handler: async () => {
      const told = await notifyFullReserves(db, new Date());
      if (told > 0) console.log('Full reserves:', told);
    },
  };
}
