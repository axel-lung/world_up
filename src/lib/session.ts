import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getAuth } from './auth';

/** The signed-in player's session, checked against the database; null if none. */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** For pages reserved to signed-in players: sends visitors to /login, then back. */
export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}
