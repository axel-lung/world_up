import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Notice } from '@/components/ui/Notice';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const TRADE_ERRORS = [
  'tradesClosed',
  'notFriends',
  'tradeEmpty',
  'tradeTooBig',
  'tradeUnavailable',
  'tooManyOffers',
  'tradeOver',
] as const;

// What the last trade form did, from the address its action returned to
const outcomeSchema = z.object({
  done: z.enum(['sent', 'accepted', 'declined', 'cancelled']).nullable().catch(null),
  error: z.enum(TRADE_ERRORS).nullable().catch(null),
});

export async function TradeNotice({ params, pseudo }: { params: SearchParams; pseudo?: string | null }) {
  const outcome = outcomeSchema.parse({ done: one(params.done) ?? null, error: one(params.error) ?? null });
  const [t, tGame] = await Promise.all([getTranslations('Trades'), getTranslations('Game')]);
  if (outcome.error) {
    return (
      <Notice tone="danger">
        <p>{tGame(`errors.${outcome.error}`)}</p>
      </Notice>
    );
  }
  if (!outcome.done) return null;
  return (
    <Notice tone="success">
      <p>{t(`done.${outcome.done}`, { pseudo: pseudo ?? t('formerPlayer') })}</p>
    </Notice>
  );
}
