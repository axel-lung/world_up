import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fcmSender, parseServiceAccount, type ServiceAccount, signedAssertion } from './fcm';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account: ServiceAccount = {
  project_id: 'world-up',
  client_email: 'push@world-up.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const message = { title: 'Amis', body: 'Margot vous demande en ami.', url: '/friends', tag: 'notification-42' };
const options = { timeoutMs: 10_000, ttlSeconds: 86_400 };

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Google's two endpoints: the token one gives `tokens` in turn, Firebase answers `statuses` in turn. */
function google({ tokens = ['access-1', 'access-2'], statuses = [200] } = {}) {
  const signIns: URLSearchParams[] = [];
  const posts: { url: string; authorization: string; body: unknown }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      signIns.push(new URLSearchParams(String(init?.body)));
      return Response.json({ access_token: tokens[signIns.length - 1], expires_in: 3600, token_type: 'Bearer' });
    }
    posts.push({ url, authorization: new Headers(init?.headers).get('Authorization') ?? '', body: JSON.parse(String(init?.body)) });
    return new Response('{}', { status: statuses[Math.min(posts.length, statuses.length) - 1] });
  }) as typeof fetch;
  return { fetchImpl, signIns, posts };
}

describe('parseServiceAccount', () => {
  it("reads the JSON key file in base64, and refuses one that isn't a service account", () => {
    const file = Buffer.from(JSON.stringify({ type: 'service_account', ...account })).toString('base64');
    expect(parseServiceAccount(file)).toEqual(account);
    expect(() => parseServiceAccount(Buffer.from('{"type":"other"}').toString('base64'))).toThrow();
  });
});

describe('signedAssertion', () => {
  it('asks for an hour of Firebase Messaging as the service account, signed with its key', () => {
    const now = Date.UTC(2026, 10, 12, 12);
    const [header, claims, signature] = signedAssertion(account, now).split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    const valid = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(valid).toBe(true);
  });
});

describe('fcmSender', () => {
  it('posts the notification to the token, with its page and its tag', async () => {
    const { fetchImpl, signIns, posts } = google();
    const send = fcmSender(account, options, fetchImpl);
    expect(await send('phone-token', message)).toBe(200);
    expect(signIns[0].get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(posts).toEqual([
      {
        url: 'https://fcm.googleapis.com/v1/projects/world-up/messages:send',
        authorization: 'Bearer access-1',
        body: {
          message: {
            token: 'phone-token',
            notification: { title: 'Amis', body: 'Margot vous demande en ami.' },
            data: { url: '/friends' },
            android: { ttl: '86400s', notification: { tag: 'notification-42' } },
          },
        },
      },
    ]);
  });

  it('signs in once for the pushes sent together, and again when the token nears its end', async () => {
    let now = Date.UTC(2026, 10, 12, 12);
    const { fetchImpl, signIns, posts } = google();
    const send = fcmSender(account, options, fetchImpl, () => now);
    await Promise.all([send('a', message), send('b', message), send('c', message)]);
    expect(signIns).toHaveLength(1);
    now += 58 * 60_000;
    await send('d', message);
    expect(signIns).toHaveLength(1);
    now += 60_000;
    await send('e', message);
    expect(signIns).toHaveLength(2);
    expect(posts.map((post) => post.authorization)).toEqual([
      ...Array(4).fill('Bearer access-1'),
      'Bearer access-2',
    ]);
  });

  it('signs in again once when Firebase no longer takes the token', async () => {
    const { fetchImpl, signIns, posts } = google({ statuses: [401, 200] });
    const send = fcmSender(account, options, fetchImpl);
    expect(await send('phone-token', message)).toBe(200);
    expect(signIns).toHaveLength(2);
    expect(posts.map((post) => post.authorization)).toEqual(['Bearer access-1', 'Bearer access-2']);
  });

  it("gives Firebase's answer, which deliverPush acts on", async () => {
    const { fetchImpl } = google({ statuses: [404] });
    expect(await fcmSender(account, options, fetchImpl)('gone-token', message)).toBe(404);
  });
});
