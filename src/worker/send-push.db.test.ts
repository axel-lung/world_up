import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Database, db, type Transaction } from '@/db';
import { notifications, pushSubscriptions, users } from '@/db/schema';
import { createTestPlayer, deleteTestData } from '@/lib/game/testing';
import { type PushJob, stopJobQueue } from '@/lib/job-queue';
import { notify } from '@/lib/notifications/notifications';
import { MAX_PUSH_DEVICES, savePushSubscription } from '@/lib/notifications/push';
import { deliverPush, type PushMessage, type PushSend } from './send-push';

const now = new Date('2026-10-25T12:00:00Z');
const players: string[] = [];

beforeEach(() => {
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public-key');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await stopJobQueue();
  await deleteTestData([], players);
});

async function newPlayer() {
  const id = await createTestPlayer();
  players.push(id);
  return id;
}

const keys = { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };

/** Turns notifications on for the player on a new device; returns its subscription's ID. */
async function newDevice(userId: string, endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) {
  await savePushSubscription(userId, { endpoint, keys }, now);
  const [{ id }] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return id;
}

const friendRequest = (userId: string, from: string) => notify(db, { userId, kind: 'friend_request', data: { userId: from }, now });

/** The devices queued for a notification, as the executor sees them. */
async function queued(notificationId: number, executor: Database | Transaction = db) {
  const { rows } = await executor.execute<{ data: PushJob }>(
    sql`SELECT data FROM pgboss.job WHERE name = 'send-push' AND (data->>'notificationId')::int = ${notificationId}`,
  );
  return rows.map((row) => row.data.subscriptionId).sort((a, b) => a - b);
}

describe('notify', () => {
  it('queues a push for each device of the player, and only theirs', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const devices = [await newDevice(a), await newDevice(a)];
    await newDevice(b);
    const id = await friendRequest(a, b);
    expect(await queued(id)).toEqual(devices);
  });

  it('queues nothing when the event rolls back', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const device = await newDevice(a);
    let id = 0;
    await expect(
      db.transaction(async (tx) => {
        id = await notify(tx, { userId: a, kind: 'friend_request', data: { userId: b }, now });
        // Written in the transaction, unseen outside it
        expect(await queued(id, tx)).toEqual([device]);
        expect(await queued(id)).toEqual([]);
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect(id).toBeGreaterThan(0);
    expect(await queued(id)).toEqual([]);
  });

  it('queues nothing for a player without devices, or while Web Push is off', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    expect(await queued(await friendRequest(a, b))).toEqual([]);
    await newDevice(a);
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    expect(await queued(await friendRequest(a, b))).toEqual([]);
  });
});

describe('savePushSubscription', () => {
  it('gives a device to the last account that turns notifications on there', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    const id = await newDevice(a, endpoint);
    expect(await newDevice(b, endpoint)).toBe(id);
    const [device] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    expect(device.userId).toBe(b);
  });

  it('forgets the oldest device beyond the limit', async () => {
    const a = await newPlayer();
    const first = await newDevice(a);
    for (let i = 0; i < MAX_PUSH_DEVICES; i++) await newDevice(a);
    const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, a));
    expect(rows).toHaveLength(MAX_PUSH_DEVICES);
    expect(rows.map((row) => row.id)).not.toContain(first);
  });
});

describe('deliverPush', () => {
  /** A push service that answers `status`, and the messages it was given. */
  function service(status: number) {
    const sent: PushMessage[] = [];
    const send: PushSend = async (device, payload) => {
      expect(device.keys).toEqual(keys);
      sent.push(JSON.parse(payload));
      return status;
    };
    return { send, sent };
  }

  async function setup() {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const subscriptionId = await newDevice(a);
    const notificationId = await friendRequest(a, b);
    const [{ name }] = await db.select({ name: users.name }).from(users).where(eq(users.id, b));
    return { a, b, job: { notificationId, subscriptionId }, pseudo: name };
  }

  const deviceExists = async (id: number) =>
    (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id))).length === 1;

  it('sends the notification, rendered in French', async () => {
    const { job, pseudo } = await setup();
    const { send, sent } = service(201);
    expect(await deliverPush(job, send)).toBe('sent');
    expect(sent).toEqual([
      { title: 'Amis', body: `${pseudo} vous demande en ami.`, url: '/friends', tag: `notification-${job.notificationId}` },
    ]);
  });

  it('forgets a device its push service no longer knows', async () => {
    const { job } = await setup();
    expect(await deliverPush(job, service(410).send)).toBe('gone');
    expect(await deviceExists(job.subscriptionId)).toBe(false);
  });

  it('fails for a retry when the push service is busy or down, and gives up on a refusal', async () => {
    const { job } = await setup();
    await expect(deliverPush(job, service(429).send)).rejects.toThrow('answered 429');
    await expect(deliverPush(job, service(503).send)).rejects.toThrow('answered 503');
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    expect(await deliverPush(job, service(400).send)).toBe('refused');
    expect(await deviceExists(job.subscriptionId)).toBe(true);
  });

  it('sends nothing once the notification is read, or its player banned', async () => {
    const read = await setup();
    await db.update(notifications).set({ readAt: now }).where(eq(notifications.id, read.job.notificationId));
    const banned = await setup();
    await db.update(users).set({ bannedAt: now }).where(eq(users.id, banned.a));
    const { send, sent } = service(201);
    expect(await deliverPush(read.job, send)).toBe('skipped');
    expect(await deliverPush(banned.job, send)).toBe('skipped');
    expect(sent).toEqual([]);
  });

  it('sends nothing to a device signed out, or taken by another account since', async () => {
    const { b, job } = await setup();
    const [{ endpoint }] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, job.subscriptionId));
    await newDevice(b, endpoint);
    const { send, sent } = service(201);
    expect(await deliverPush(job, send)).toBe('skipped');
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, job.subscriptionId));
    expect(await deliverPush(job, send)).toBe('skipped');
    expect(sent).toEqual([]);
  });
});
