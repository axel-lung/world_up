import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';

// A player signs in with a password (Better Auth's "credential" account), with
// Google, or both. Google sign-in is on once the server's .env holds the OAuth
// client of the Google Cloud project; without it, the forms show no Google button.

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleSignInEnabled = () => googleCredentials() !== null;

/**
 * The player's ways of signing in. A player signed up with Google has no
 * password until they ask for a reset link, which creates one.
 */
export async function signInMethods(userId: string): Promise<{ password: boolean; google: boolean }> {
  const rows = await db
    .select({ provider: accounts.providerId, password: accounts.password })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return {
    password: rows.some((row) => row.provider === 'credential' && row.password !== null),
    google: rows.some((row) => row.provider === 'google'),
  };
}

/** The same, with Google's ID of the account and the dates, for the account export. */
export async function playerSignInMethods(userId: string) {
  const rows = await db
    .select({ provider: accounts.providerId, accountId: accounts.accountId, since: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return rows.map((row) =>
    row.provider === 'credential'
      ? { method: 'password', since: row.since }
      : { method: row.provider, accountId: row.accountId, since: row.since },
  );
}
