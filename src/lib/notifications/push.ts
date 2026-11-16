import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { type Database, db, type Transaction } from '@/db';
import { pushSubscriptions } from '@/db/schema';

// Web Push: a device where the player turns notifications on gives the address
// its browser's push service assigned it and the keys that encrypt the
// messages; the worker sends each notification there (src/worker/send-push.ts).
// On once the VAPID keys are set. The Android app, whose WebView has no Web
// Push, gives instead the token Firebase Cloud Messaging assigned it, and the
// worker sends through Firebase: on once its service account is set. A device
// belongs to one account: the last to turn it on, until it signs out there.

type Executor = Database | Transaction;

type DeviceKind = (typeof pushSubscriptions.$inferSelect)['kind'];

/** Devices kept per player: turning on an eleventh forgets the oldest. */
export const MAX_PUSH_DEVICES = 10;

/** The VAPID public key the browsers subscribe with; null while Web Push is off. */
export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Whether the app's notifications are on: the worker holds Firebase's service account. */
export function appPushEnabled(): boolean {
  return Boolean(process.env.FCM_SERVICE_ACCOUNT);
}

function enabledKinds(): DeviceKind[] {
  const kinds: DeviceKind[] = [];
  if (pushPublicKey()) kinds.push('web');
  if (appPushEnabled()) kinds.push('app');
  return kinds;
}

// The worker posts to the address a browser gives: only the browsers' push
// services are accepted (Chrome and Android, Firefox, Edge, Safari).
const PUSH_SERVICES = ['fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];

export function isPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_SERVICES.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

const base64url = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .refine((value) => Buffer.from(value, 'base64url').length === bytes);

/** A browser's PushSubscription, as its toJSON() gives it. */
export const pushSubscriptionInput = z.object({
  endpoint: z.string().max(1024).refine(isPushService),
  // A P-256 public key, uncompressed, and a 16-byte secret (RFC 8291)
  keys: z.object({ p256dh: base64url(65), auth: base64url(16) }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;

/** The app's registration token, as Firebase Cloud Messaging gives it. */
export const appPushTokenInput = z.string().min(1).max(1024).regex(/^[\w:-]+$/);

/** Turns notifications on for the player on this browser, taking it from another account if need be. */
export function savePushSubscription(userId: string, input: PushSubscriptionInput, now: Date): Promise<void> {
  const keys = { p256dh: input.keys.p256dh, auth: input.keys.auth };
  return saveDevice(userId, { kind: 'web', endpoint: input.endpoint, ...keys }, now);
}

/** The same in the app, with its Firebase token. */
export function saveAppPushDevice(userId: string, token: string, now: Date): Promise<void> {
  return saveDevice(userId, { kind: 'app', endpoint: token, p256dh: null, auth: null }, now);
}

async function saveDevice(
  userId: string,
  { endpoint, ...rest }: { kind: DeviceKind; endpoint: string; p256dh: string | null; auth: string | null },
  now: Date,
): Promise<void> {
  const device = { userId, ...rest, createdAt: now };
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSubscriptions)
      .values({ endpoint, ...device })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: device });
    const kept = tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id))
      .limit(MAX_PUSH_DEVICES);
    await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), notInArray(pushSubscriptions.id, kept)));
  });
}

/** Turns notifications off on this device: the player turned them off, or signs out. */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Whether this device notifies the player (and not another account signed in there before). */
export async function isPushDevice(userId: string, endpoint: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  return row !== undefined;
}

/** The player's devices the server can notify now, for notify(). */
export async function pushDeviceIds(executor: Executor, userId: string): Promise<number[]> {
  const kinds = enabledKinds();
  if (kinds.length === 0) return [];
  const rows = await executor
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), inArray(pushSubscriptions.kind, kinds)));
  return rows.map((row) => row.id);
}

/** The player's devices, for the account export. */
export async function playerPushDevices(userId: string) {
  return db
    .select({ kind: pushSubscriptions.kind, endpoint: pushSubscriptions.endpoint, since: pushSubscriptions.createdAt })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
}
