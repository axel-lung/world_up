import { and, asc, desc, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { type Database, db, type Transaction } from '@/db';
import { pushSubscriptions } from '@/db/schema';

// Web Push: a device where the player turns notifications on gives the address
// its browser's push service assigned it and the keys that encrypt the
// messages; the worker sends each notification there (src/worker/send-push.ts).
// On once the VAPID keys are set. A device belongs to one account: the last to
// turn it on, until it signs out there.

type Executor = Database | Transaction;

/** Devices kept per player: turning on an eleventh forgets the oldest. */
export const MAX_PUSH_DEVICES = 10;

/** The VAPID public key the browsers subscribe with; null while Web Push is off. */
export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
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

/** Turns notifications on for the player on this device, taking it from another account if need be. */
export async function savePushSubscription(userId: string, input: PushSubscriptionInput, now: Date): Promise<void> {
  const device = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, createdAt: now };
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSubscriptions)
      .values({ endpoint: input.endpoint, ...device })
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

/** The player's devices, for notify(). */
export async function pushDeviceIds(executor: Executor, userId: string): Promise<number[]> {
  const rows = await executor
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows.map((row) => row.id);
}

/** The player's devices, for the account export. */
export async function playerPushDevices(userId: string) {
  return db
    .select({ endpoint: pushSubscriptions.endpoint, since: pushSubscriptions.createdAt })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
}
