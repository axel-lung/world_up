import { eq } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { pushSubscriptions, users } from '@/db/schema';
import { expect, logIn, newPlayer, signUpAndVerify, test } from './helpers';

// The page believes it runs in the Android app: Capacitor finds a native
// bridge (androidBridge) and the headers of the plugins the prompt uses, App
// and PushNotifications, whose calls this stand-in answers. The phone's
// permission and the app's build live in localStorage, so that the test can
// change them.
function fakeApp() {
  const listeners: Record<string, (data: unknown) => void> = {};
  const promised = ['checkPermissions', 'requestPermissions', 'register', 'unregister', 'removeListener', 'removeAllListeners'];
  Object.assign(window, {
    androidBridge: { postMessage() {} },
    Capacitor: {
      PluginHeaders: [
        { name: 'App', methods: [{ name: 'getInfo', rtype: 'promise' }] },
        { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
        {
          name: 'PushNotifications',
          methods: [...promised.map((name) => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }],
        },
      ],
      nativeCallback(_plugin: string, _method: string, options: { eventName: string }, callback: (data: unknown) => void) {
        listeners[options.eventName] = callback;
        return options.eventName;
      },
      async nativePromise(plugin: string, method: string) {
        if (plugin === 'App') return { build: localStorage.getItem('e2e-build') ?? '7', version: '1.0', id: 'fr.alng.worldup', name: 'World Up' };
        if (plugin !== 'PushNotifications') return {};
        if (method === 'checkPermissions') return { receive: localStorage.getItem('e2e-permission') ?? 'prompt' };
        if (method === 'requestPermissions') {
          localStorage.setItem('e2e-permission', 'granted');
          return { receive: 'granted' };
        }
        // Firebase gives the phone its token
        if (method === 'register') setTimeout(() => listeners.registration?.({ value: `e2e-app-token-${Date.now()}` }), 20);
        return {};
      },
    },
  });
}

async function devices(email: string) {
  return db
    .select({ kind: pushSubscriptions.kind })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(eq(users.email, email));
}

test('the app asks to turn notifications on after each sign-in and each update', async ({ page }) => {
  test.skip(!process.env.FCM_SERVICE_ACCOUNT, "The app's notifications are off: FCM_SERVICE_ACCOUNT is empty");
  const player = newPlayer();
  // Signed in by the confirmation link
  await signUpAndVerify(page, player);
  await page.addInitScript(fakeApp);
  const prompt = page.getByRole('dialog', { name: 'Activer les notifications ?' });

  // Never on /activity, whose switch does the same
  await page.goto('/activity');
  await expect(page.getByRole('region', { name: 'Sur cet appareil' })).toContainText("même quand l'app est fermée");
  await page.waitForTimeout(1000);
  await expect(prompt).toBeHidden();

  // Elsewhere, once
  await page.goto('/rules');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Plus tard' }).click();
  await expect(prompt).toBeHidden();
  await page.goto('/leaderboard');
  await page.waitForTimeout(1000);
  await expect(prompt).toBeHidden();

  // After an update of the app, again: turned on this time
  await page.evaluate(() => localStorage.setItem('e2e-build', '8'));
  await page.reload();
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Activer' }).click();
  await expect(prompt).toBeHidden();
  await expect.poll(async () => (await devices(player.email)).map((device) => device.kind)).toEqual(['app']);

  // Signing out turns them off on the phone; signing in again asks again
  await page.goto('/account');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL('/');
  expect(await devices(player.email)).toEqual([]);
  await logIn(page, player.email, player.password);
  await expect(prompt).toBeVisible();

  await db.delete(users).where(eq(users.email, player.email));
});
