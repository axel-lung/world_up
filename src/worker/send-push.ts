import { eq } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import type { JobResult } from 'pg-boss';
import webpush, { WebPushError } from 'web-push';
import messages from '../../messages/fr.json';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { requireEnv } from '@/lib/env';
import type { PushJob } from '@/lib/job-queue';
import { notificationHref, notificationValues, type NotificationView } from '@/lib/notifications/describe';
import { pushableNotification } from '@/lib/notifications/notifications';
import { isPushService } from '@/lib/notifications/push';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

/** What public/sw.js shows. */
export interface PushMessage {
  title: string;
  body: string;
  /** The page a click opens. */
  url: string;
  /** One per notification: a push sent again replaces the first on the device. */
  tag: string;
}

export function renderPush(notification: NotificationView & { id: number }): PushMessage {
  const t = createTranslator({ locale: 'fr', messages, namespace: 'Notifications' });
  const topic = notification.kind.slice(0, notification.kind.indexOf('_')) as 'friend' | 'trade' | 'auction';
  return {
    title: t(`pushTitle.${topic}`),
    body: t(notification.kind, notificationValues(notification, { formerPlayer: t('formerPlayer'), aCard: t('aCard') })),
    url: notificationHref(notification),
    tag: `notification-${notification.id}`,
  };
}

interface Device {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Posts the encrypted message to the device's push service; resolves with its HTTP status. */
export type PushSend = (device: Device, payload: string) => Promise<number>;

export type PushOutcome = 'sent' | 'skipped' | 'gone' | 'refused';

/**
 * Pushes one notification to one device. Nothing goes out once the
 * notification is read or deleted, its player banned, or the device signed
 * out or taken by another account. A device the push service no longer knows
 * is forgotten; a busy or failing service is tried again (pg-boss retries).
 */
export async function deliverPush({ notificationId, subscriptionId }: PushJob, send: PushSend): Promise<PushOutcome> {
  const [device] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
  const notification = device && (await pushableNotification(notificationId));
  if (!device || !notification || notification.userId !== device.userId || !isPushService(device.endpoint)) {
    return 'skipped';
  }
  const status = await send(
    { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    JSON.stringify(renderPush(notification)),
  );
  // Logged in place of the address, which identifies the device
  const service = new URL(device.endpoint).hostname;
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
    return 'gone';
  }
  if (status === 429 || status >= 500) throw new Error(`Push service ${service} answered ${status}`);
  // A refusal that sending again won't change (bad key, payload too large...)
  console.error(`Push to ${service} refused: ${status}`);
  return 'refused';
}

// A push waits 10 s at most, within the queue's 30 s expiry.
const TIMEOUT_MS = 10_000;
// How long the push service keeps a message for a device that is offline.
const TTL_SECONDS = 86_400;

function webPushSend(): PushSend {
  return async (device, payload) => {
    try {
      const { statusCode } = await webpush.sendNotification(device, payload, { TTL: TTL_SECONDS, timeout: TIMEOUT_MS });
      return statusCode;
    } catch (error) {
      if (error instanceof WebPushError) return error.statusCode;
      throw error;
    }
  };
}

/**
 * Web Push, once VAPID_PUBLIC_KEY is set: VAPID_PRIVATE_KEY and VAPID_SUBJECT
 * are then required. Without the keys no device can turn notifications on, and
 * a push left from before is dropped.
 */
export function createPushJob(): JobDefinition {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  // Checks the keys and the subject at startup
  if (publicKey) webpush.setVapidDetails(requireEnv('VAPID_SUBJECT'), publicKey, requireEnv('VAPID_PRIVATE_KEY'));
  const send = publicKey ? webPushSend() : null;

  return {
    name: queues.push.name,
    // An event can notify several devices: up to 20 pushes at once, each
    // settled apart, so that a failure retries its own device only.
    options: { batchSize: 20, burstWhenBatchFull: true, perJobResults: true },
    handler: async (jobs: { id: string; data: PushJob }[]): Promise<JobResult[]> => {
      const outcomes = await Promise.allSettled(jobs.map((job) => (send ? deliverPush(job.data, send) : 'skipped')));
      return jobs.map((job, index) => {
        const outcome = outcomes[index];
        if (outcome.status === 'fulfilled') return { id: job.id, status: 'completed', output: { outcome: outcome.value } };
        // No device address in the reason: the service's name and its answer, or a network error
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        console.error(`Push not sent, tried again: ${reason}`);
        return { id: job.id, status: 'failed', output: { error: reason } };
      });
    },
  };
}
