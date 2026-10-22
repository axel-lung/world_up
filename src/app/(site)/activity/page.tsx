import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { notificationHref, notificationValues } from '@/lib/notifications/describe';
import { listNotifications } from '@/lib/notifications/notifications';
import { requireSession } from '@/lib/session';
import { markReadFormAction } from './actions';
import { ActivityList } from './ActivityList';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Activity');
  return { title: t('title') };
}

/** The player's notifications: friend requests, trades, auctions. */
export default async function ActivityPage() {
  const { user } = await requireSession('/activity');
  const [t, tNotification, format, items] = await Promise.all([
    getTranslations('Activity'),
    getTranslations('Notifications'),
    getFormatter(),
    listNotifications(user.id),
  ]);
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
