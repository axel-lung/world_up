import type { PushState } from './push-device';
import { deletePushDeviceAction, isPushDeviceAction, saveAppPushDeviceAction } from './push-actions';

// The app's side of the notifications, for the /activity switch, signing out
// and NativeApp: the app's WebView has no Web Push, so Firebase Cloud
// Messaging gives the phone a token, which the server keeps as the device's
// address, and the notifications come through Firebase (src/worker/fcm.ts).
// The phone keeps its token, so as to forget it on the server later.

const TOKEN_KEY = 'worldup.pushToken';

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // The server still has the device; a 404 from Firebase forgets it some day
  }
}

// The plugin's module, imported on use. Never a promise of the plugin itself: a
// Capacitor plugin is a proxy, and awaiting it calls a native then() that
// doesn't exist.
const pushModule = () => import('@capacitor/push-notifications');

/** Registers the phone with Firebase, which gives its token (the same as before, unless it changed). */
async function register(): Promise<string> {
  const { PushNotifications: notifications } = await pushModule();
  return new Promise((resolve, reject) => {
    const listeners = Promise.all([
      notifications.addListener('registration', ({ value }) => settle(() => resolve(value))),
      notifications.addListener('registrationError', ({ error }) => settle(() => reject(new Error(error)))),
    ]);
    function settle(then: () => void) {
      void listeners.then((handles) => handles.forEach((handle) => void handle.remove()));
      then();
    }
    notifications.register().catch((error: unknown) => settle(() => reject(error)));
  });
}

/** Whether the app notifies the signed-in player on this phone, or why it can't. */
export async function appPushState(): Promise<PushState> {
  const { PushNotifications } = await pushModule();
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === 'denied') return 'denied';
  if (receive !== 'granted') return 'off';
  const token = storedToken();
  return token && (await isPushDeviceAction(token)) ? 'on' : 'off';
}

/** Asks the permission, registers the phone and the device. Called on a click. */
export async function turnAppPushOn(): Promise<PushState> {
  const { PushNotifications } = await pushModule();
  let { receive } = await PushNotifications.checkPermissions();
  if (receive !== 'granted' && receive !== 'denied') ({ receive } = await PushNotifications.requestPermissions());
  if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'off';
  const token = await register();
  if (!(await saveAppPushDeviceAction(token))) throw new Error('Push device refused');
  storeToken(token);
  return 'on';
}

/** Forgets the device on the server, then the phone's token, which Firebase deletes. */
export async function turnAppPushOff(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  try {
    await deletePushDeviceAction(token);
  } finally {
    storeToken(null);
    await (await pushModule()).PushNotifications.unregister();
  }
}

/**
 * Once per launch of the app: Firebase may have given the phone a new token
 * since, which replaces the old one on the server.
 */
export async function refreshAppPushToken(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  const { PushNotifications } = await pushModule();
  if ((await PushNotifications.checkPermissions()).receive !== 'granted') return;
  const current = await register();
  if (current === token) return;
  if (await saveAppPushDeviceAction(current)) {
    await deletePushDeviceAction(token);
    storeToken(current);
  }
}

/**
 * Opens the page of a notification the player touched, which Firebase gives
 * with the message (src/worker/fcm.ts), even one that started the app.
 * Returns what stops listening.
 */
export async function openTouchedNotifications(): Promise<() => void> {
  const { PushNotifications } = await pushModule();
  const handle = await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url: unknown = notification.data?.url;
    // A page of the site, never another address
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.assign(url);
  });
  return () => void handle.remove();
}
