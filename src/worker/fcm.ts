import { createSign } from 'node:crypto';
import { z } from 'zod';
import type { PushMessage } from './send-push';

// Firebase Cloud Messaging's HTTP v1 API, for the app's notifications. The
// worker signs in as the Firebase project's service account: a JWT signed with
// its key buys an access token for an hour, then each message is one POST.

const serviceAccount = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

export type ServiceAccount = z.infer<typeof serviceAccount>;

/** FCM_SERVICE_ACCOUNT: the service account's JSON key file, in base64 (android/README.md). */
export function parseServiceAccount(base64: string): ServiceAccount {
  return serviceAccount.parse(JSON.parse(Buffer.from(base64, 'base64').toString('utf8')));
}

/** Posts the message to the app's token; resolves with Firebase's HTTP status. */
export type AppPushSend = (token: string, message: PushMessage) => Promise<number>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// Taken again a minute before it expires
const TOKEN_MARGIN_MS = 60_000;

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** The signed JWT the token endpoint exchanges for an access token (RFC 7523). */
export function signedAssertion(account: ServiceAccount, now: number): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

/**
 * Sends through Firebase as `account`, keeping its access token until it
 * nearly expires. `timeoutMs` bounds each request; `ttlSeconds` is how long
 * Firebase keeps a message for a phone that is offline.
 */
export function fcmSender(
  account: ServiceAccount,
  { timeoutMs, ttlSeconds }: { timeoutMs: number; ttlSeconds: number },
  fetchImpl: typeof fetch = fetch,
  clock: () => number = Date.now,
): AppPushSend {
  let access: Promise<{ token: string; expiresAt: number }> | null = null;

  async function signIn() {
    const now = clock();
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedAssertion(account, now),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Firebase sign-in answered ${response.status}`);
    const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
    return { token: access_token, expiresAt: now + expires_in * 1000 };
  }

  // One sign-in for the pushes sent at once; a failed one is tried again next time
  async function accessToken(): Promise<string> {
    const pending = access;
    const current = await pending?.catch(() => null);
    if (current && current.expiresAt - TOKEN_MARGIN_MS > clock()) return current.token;
    // Another push may have started a new sign-in meanwhile
    if (access === pending) access = signIn();
    return (await access!).token;
  }

  async function post(token: string, message: PushMessage) {
    return fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          // Read by the app when the player touches it (app-push-device.ts)
          data: { url: message.url },
          android: { ttl: `${ttlSeconds}s`, notification: { tag: message.tag } },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  return async (token, message) => {
    let response = await post(token, message);
    // The access token was revoked or expired early: sign in again, once
    if (response.status === 401) {
      access = null;
      response = await post(token, message);
    }
    return response.status;
  };
}
