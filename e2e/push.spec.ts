import { eq } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { pushSubscriptions, users } from '@/db/schema';
import { expect, newPlayer, signUpAndVerify, test } from './helpers';

// Playwright's headless Chromium has neither notifications nor a push service:
// the page gets a stand-in for both, the permission granted and a PushManager
// that hands out subscriptions on the real service's address. The worker's
// side is covered by src/worker/send-push.db.test.ts.
function fakePushManager(keys: { p256dh: string; auth: string }) {
  const STORE = 'e2e-push-subscription';
  Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
  Notification.requestPermission = async () => 'granted';
  interface Stored {
    endpoint: string;
    key: string;
  }
  const subscription = (stored: Stored | null) =>
    stored && {
      endpoint: stored.endpoint,
      options: { applicationServerKey: Uint8Array.from(atob(stored.key), (char) => char.charCodeAt(0)).buffer },
      toJSON: () => ({ endpoint: stored.endpoint, expirationTime: null, keys }),
      unsubscribe: async () => {
        localStorage.removeItem(STORE);
        return true;
      },
    };
  PushManager.prototype.getSubscription = async () => subscription(JSON.parse(localStorage.getItem(STORE) ?? 'null')) as never;
  PushManager.prototype.subscribe = async (options?: PushSubscriptionOptionsInit) => {
    const key = new Uint8Array(options!.applicationServerKey as ArrayBuffer);
    const stored = { endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${crypto.randomUUID()}`, key: btoa(String.fromCharCode(...key)) };
    localStorage.setItem(STORE, JSON.stringify(stored));
    return subscription(stored) as never;
  };
}

async function devices(email: string) {
  return db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(eq(users.email, email));
}

test('turns notifications on for this device, and off when the player signs out', async ({ page }) => {
  test.skip(!process.env.VAPID_PUBLIC_KEY, 'Web Push is off: VAPID_PUBLIC_KEY is empty');
  await page.addInitScript(fakePushManager, {
    p256dh: Buffer.alloc(65, 4).toString('base64url'),
    auth: Buffer.alloc(16, 7).toString('base64url'),
  });
  const player = newPlayer();
  await signUpAndVerify(page, player);

  await page.goto('/activity');
  const panel = page.getByRole('region', { name: 'Sur cet appareil' });
  await panel.getByRole('button', { name: 'Activer les notifications' }).click();
  await expect(panel).toContainText('Vos notifications arrivent sur cet appareil.');
  await expect.poll(async () => (await devices(player.email)).length).toBe(1);
  // The service worker that shows them is installed
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL)).toMatch(/\/sw\.js$/);

  await page.reload();
  await expect(panel.getByRole('button', { name: 'Désactiver' })).toBeVisible();

  await page.goto('/account');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL('/');
  expect(await devices(player.email)).toEqual([]);
  await db.delete(users).where(eq(users.email, player.email));
});

test('serves the service worker uncached', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-cache');
  expect(response.headers()['content-type']).toMatch(/javascript/);
});
