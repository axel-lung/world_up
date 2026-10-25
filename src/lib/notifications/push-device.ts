import { deletePushDeviceAction, isPushDeviceAction, savePushDeviceAction } from './push-actions';

// The browser's side of Web Push, for the /activity switch and signing out.
// public/sw.js receives the pushes and shows them.

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The VAPID public key, from its base64url form. */
function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current || current.byteLength !== key.length) return false;
  return new Uint8Array(current).every((byte, index) => byte === key[index]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Whether this device notifies the signed-in player, or why it can't. */
export async function pushState(publicKey: string): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const subscription = await currentSubscription();
  if (!subscription || !sameKey(subscription, decodeKey(publicKey))) return 'off';
  return (await isPushDeviceAction(subscription.endpoint)) ? 'on' : 'off';
}

/** Asks the permission, subscribes the browser and registers the device. Called on a click. */
export async function turnPushOn(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  const registration = await navigator.serviceWorker.ready;
  const key = decodeKey(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, key)) {
    // Subscribed with keys that have changed since
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  if (!(await savePushDeviceAction(subscription.toJSON()))) throw new Error('Push subscription refused');
  return 'on';
}

/** Forgets the device on the server, then unsubscribes the browser. */
export async function turnPushOff(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await deletePushDeviceAction(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}

/**
 * Turns notifications off as the player signs out, so that the device stops
 * showing their notifications. Never throws: signing out goes on.
 */
export async function forgetPushDevice(): Promise<void> {
  try {
    if (supported()) await turnPushOff();
  } catch {
    // The device is forgotten once its push service no longer knows it
  }
}
