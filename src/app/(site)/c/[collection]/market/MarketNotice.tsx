import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Notice } from '@/components/ui/Notice';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const MARKET_ERRORS = [
  'auctionsClosed',
  'auctionUnavailable',
  'auctionPrice',
  'auctionDuration',
  'tooManyAuctions',
  'auctionOver',
  'auctionHasBids',
  'ownAuction',
  'bidTooLow',
  'bidTooHigh',
  'bidOverCoins',
] as const;

// What the last auction form did, from the address its action returned to
const outcomeSchema = z.object({
  done: z.enum(['created', 'cancelled', 'leading', 'raised', 'outbid', 'bought']).nullable().catch(null),
  error: z.enum(MARKET_ERRORS).nullable().catch(null),
});

export async function MarketNotice({ params }: { params: SearchParams }) {
  const outcome = outcomeSchema.parse({ done: one(params.done) ?? null, error: one(params.error) ?? null });
  const [t, tGame] = await Promise.all([getTranslations('Market'), getTranslations('Game')]);
  if (outcome.error) {
    return (
      <Notice tone="danger">
        <p>{tGame(`errors.${outcome.error}`)}</p>
      </Notice>
    );
  }
  if (!outcome.done) return null;
  // Outbid at once: the bid went through, but someone else stays ahead
  return (
    <Notice tone={outcome.done === 'outbid' ? 'info' : 'success'}>
      <p>{t(`done.${outcome.done}`)}</p>
    </Notice>
  );
}
