// World Up's service worker, registered when a player turns notifications on
// (/activity). It shows the Web Push messages the worker sends
// (src/worker/send-push.ts) and opens their page on a click. No cache, no
// offline mode: the game needs the server.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // A push must show a notification: a message that can't be read shows the activity
  let message = null;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    // Shown as below
  }
  const { title = 'World Up', body = '', url = '/activity', tag } = message ?? {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      lang: 'fr',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/activity', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      // A tab of the site already open goes to the page, otherwise a new one opens it
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) {
        try {
          await open.focus();
          await open.navigate(target.href);
          return;
        } catch {
          // A tab this worker doesn't control can't be sent elsewhere
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
