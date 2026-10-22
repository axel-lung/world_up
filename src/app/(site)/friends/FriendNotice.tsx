import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Notice } from '@/components/ui/Notice';
import { MAX_FRIENDS } from '@/lib/social/friends';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// What the last friends form did, from the address its action returned to
const outcomeSchema = z.object({
  done: z.enum(['requested', 'accepted', 'declined', 'cancelled', 'removed']).nullable().catch(null),
  pseudo: z.string().max(64).catch(''),
  error: z
    .enum([
      'unknownPlayer',
      'self',
      'alreadyFriends',
      'alreadyRequested',
      'tooManyFriends',
      'theirFriendsFull',
      'tooManyRequests',
      'tooFast',
      'noRequest',
    ])
    .nullable()
    .catch(null),
});

/** The outcome of a friends form (friends page, leaderboard), or nothing. */
export async function FriendNotice({ params }: { params: SearchParams }) {
  const outcome = outcomeSchema.parse({
    done: one(params.done) ?? null,
    pseudo: one(params.pseudo) ?? '',
    error: one(params.error) ?? null,
  });
  const t = await getTranslations('Friends');
  if (outcome.error) {
    return (
      <Notice tone="danger">
        <p>{t(`errors.${outcome.error}`, { max: MAX_FRIENDS })}</p>
      </Notice>
    );
  }
  if (!outcome.done) return null;
  return (
    <Notice tone="success">
      <p>{t(`done.${outcome.done}`, { pseudo: outcome.pseudo })}</p>
    </Notice>
  );
}
