import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { accounts, consents, users } from '@/db/schema';
import { createTestPlayer } from '@/lib/game/testing';
import { TERMS_VERSION } from './account-rules';
import { getAuth } from './auth';

// Google sign-in through Better Auth's HTTP handler, with Google's token
// endpoint simulated: its answer carries the ID token of the account the
// player picked.

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const HOME = '/c/heritage';
const emails: string[] = [];
const players: string[] = [];

beforeAll(() => {
  // Read when the auth instance is built, on its first use below
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (emails.length > 0) await db.delete(users).where(inArray(users.email, emails));
  if (players.length > 0) await db.delete(users).where(inArray(users.id, players));
});

const tag = () => randomUUID().slice(0, 8);

function newEmail() {
  const email = `google-${tag()}@example.test`;
  emails.push(email);
  return email;
}

/** The sign-in or signup form leaving for Google. */
function leaveForGoogle(body: Record<string, unknown> = {}) {
  return getAuth().handler(
    new Request(`${APP_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_URL },
      body: JSON.stringify({ provider: 'google', callbackURL: HOME, errorCallbackURL: '/login', ...body }),
    }),
  );
}

function idToken(claims: Record<string, unknown>) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: 'https://accounts.google.com', aud: 'test-client', iat: now, exp: now + 3600, ...claims })}.signature`;
}

/** Google sends the player back, signed in as `account`, to the callback. */
async function comeBack(leaving: Response, account: { sub: string; email: string }) {
  const { url } = (await leaving.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const cookie = leaving.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const target = input instanceof Request ? input.url : String(input);
    if (!target.startsWith('https://oauth2.googleapis.com/token')) throw new Error(`Unexpected request to ${target}`);
    return Response.json({
      access_token: 'access-token',
      id_token: idToken({ email_verified: true, name: 'Prénom Nom', picture: 'https://example.test/photo.jpg', ...account }),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email',
    });
  });
  try {
    return await getAuth().handler(
      new Request(`${APP_URL}/api/auth/callback/google?code=code&state=${encodeURIComponent(state)}`, {
        headers: { Cookie: cookie },
      }),
    );
  } finally {
    fetchSpy.mockRestore();
  }
}

const signup = (overrides: Record<string, unknown> = {}) => ({
  requestSignUp: true,
  additionalData: { name: `g-${tag()}`, birthDate: '1990-05-17', acceptTerms: true, ...overrides },
});

async function errorCode(response: Response) {
  return ((await response.json()) as { code?: string }).code;
}

describe('signing up with Google', () => {
  it('checks the pseudo, the birth date and the terms before leaving for Google', async () => {
    const id = await createTestPlayer();
    players.push(id);
    const [taken] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
    expect(await errorCode(await leaveForGoogle(signup({ name: taken.name.toUpperCase() })))).toBe('PSEUDO_TAKEN');
    expect(await errorCode(await leaveForGoogle(signup({ birthDate: '2015-01-01' })))).toBe('UNDERAGE');
    expect(await errorCode(await leaveForGoogle(signup({ acceptTerms: false })))).toBe('TERMS_NOT_ACCEPTED');
  });

  it("creates the account with the pseudo and birth date, never Google's name, photo or tokens", async () => {
    const email = newEmail();
    const request = signup();
    const leaving = await leaveForGoogle(request);
    expect(leaving.status).toBe(200);
    const authorization = new URL(((await leaving.clone().json()) as { url: string }).url);
    expect(authorization.searchParams.get('scope')).toBe('openid email');
    expect(authorization.searchParams.get('prompt')).toBe('select_account');

    const back = await comeBack(leaving, { sub: `sub-${tag()}`, email });
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe(HOME);

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user).toMatchObject({
      name: request.additionalData.name,
      birthDate: '1990-05-17',
      emailVerified: true,
      image: null,
    });
    expect(await db.select({ version: consents.version }).from(consents).where(eq(consents.userId, user.id))).toEqual([
      { version: TERMS_VERSION },
    ]);
    const [account] = await db.select().from(accounts).where(eq(accounts.userId, user.id));
    expect(account).toMatchObject({ providerId: 'google', accessToken: null, refreshToken: null, idToken: null });
  });

  it('creates no account from a sign-in alone', async () => {
    const email = newEmail();
    const back = await comeBack(await leaveForGoogle(), { sub: `sub-${tag()}`, email });
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toContain('error=signup_disabled');
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });
});

describe('signing in with Google', () => {
  it('links Google to the confirmed account of the same address, which keeps its pseudo', async () => {
    const id = await createTestPlayer();
    players.push(id);
    const [before] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id));
    const sub = `sub-${tag()}`;

    const back = await comeBack(await leaveForGoogle(), { sub, email: before.email });
    expect(back.headers.get('location')).toBe(HOME);
    const [after] = await db.select({ name: users.name, image: users.image }).from(users).where(eq(users.id, id));
    expect(after).toEqual({ name: before.name, image: null });
    const linked = await db.select({ provider: accounts.providerId, accountId: accounts.accountId }).from(accounts).where(eq(accounts.userId, id));
    expect(linked).toEqual([{ provider: 'google', accountId: sub }]);
  });
});
