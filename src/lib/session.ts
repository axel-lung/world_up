import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getAuth } from './auth';
import { hasAcceptedTerms } from './consents';

/**
 * The signed-in player's session, checked against the database; null if none,
 * or if the player is banned (a ban deletes their sessions: this covers one
 * opened at the same moment).
 */
export const getSession = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.bannedAt ? null : session;
});

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * For pages reserved to signed-in players: sends visitors to /login, then back,
 * and players who have not accepted the current terms of use to /accept-terms.
 * The account page passes `terms: false`, so that a player who refuses them can
 * still export the data and delete the account.
 */
export async function requireSession(returnTo: string, { terms = true }: { terms?: boolean } = {}): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (terms && !(await hasAcceptedTerms(session.user.id))) {
    redirect(`/accept-terms?next=${encodeURIComponent(returnTo)}`);
  }
  return session;
}
