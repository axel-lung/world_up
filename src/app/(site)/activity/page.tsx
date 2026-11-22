import { BellOff, BellRing } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PushSwitch } from '@/components/social/PushSwitch';
import push from '@/components/social/PushSwitch.module.css';
import { Button } from '@/components/ui/Button';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { getActiveCollection } from '@/lib/game/rules';
import { streakReminderOn } from '@/lib/game/streaks';
import { notificationHref, notificationValues } from '@/lib/notifications/describe';
import { listNotifications } from '@/lib/notifications/notifications';
import { appPushEnabled, pushPublicKey } from '@/lib/notifications/push';
import { requireSession } from '@/lib/session';
import { markReadFormAction, streakReminderAction } from './actions';
import { ActivityList } from './ActivityList';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Activity');
  return { title: t('title') };
}

/** The player's notifications: friend requests, trades, auctions; and push on this device. */
export default async function ActivityPage() {
  const { user } = await requireSession('/activity');
  const publicKey = pushPublicKey();
  const app = appPushEnabled();
  const [t, tNotification, format, items, collection] = await Promise.all([
    getTranslations('Activity'),
    getTranslations('Notifications'),
    getFormatter(),
    listNotifications(user.id),
    getActiveCollection(DEFAULT_COLLECTION_SLUG),
  ]);
  // Null before the player's first visit to the collection: no streak yet
  const reminder = collection ? await streakReminderOn(user.id, collection.id) : null;
  const fallback = { formerPlayer: tNotification('formerPlayer'), aCard: tNotification('aCard') };
  const entries = items.map((item) => ({
    id: item.id,
    text: tNotification(item.kind, notificationValues(item, fallback)),
    href: notificationHref(item),
    date: format.dateTime(item.createdAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }),
    unread: item.readAt === null,
  }));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>
      {(publicKey || app) && <PushSwitch publicKey={publicKey} app={app} />}
      {reminder !== null && (
        <section className={push.panel} aria-labelledby="reminder-title">
          <div className={push.text}>
            <h2 id="reminder-title">{t('reminder.title')}</h2>
            <p>{t(reminder ? 'reminder.on' : 'reminder.off')}</p>
          </div>
          <form action={streakReminderAction}>
            <input type="hidden" name="on" value={reminder ? 'off' : 'on'} />
            <Button
              type="submit"
              variant={reminder ? 'ghost' : 'primary'}
              icon={reminder ? <BellOff aria-hidden /> : <BellRing aria-hidden />}
            >
              {t(reminder ? 'reminder.turnOff' : 'reminder.turnOn')}
            </Button>
          </form>
        </section>
      )}
      {entries.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <>
          <ActivityList entries={entries} label={t('list')} unreadLabel={t('unread')} />
          {entries.some((entry) => entry.unread) && (
            <form action={markReadFormAction}>
              <input type="hidden" name="upTo" value={entries[0].id} />
              <Button type="submit" variant="ghost">
                {t('markRead')}
              </Button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
