import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner';
import { Button } from '@/components/ui/Button';
import { requireAdmin } from '@/lib/admin';
import { type Announcement, listAnnouncements } from '@/lib/announcements';
import { listAudit } from '@/lib/catalog/admin';
import { toParisDateTime } from '@/lib/paris-time';
import { AuditTable } from '../AuditTable';
import { endAnnouncementAction } from './actions';
import { AnnouncementForm } from './AnnouncementForm';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.announcements');
  return { title: t('title') };
}

/**
 * The banner over the site's pages: a new announcement, the current and
 * upcoming ones (withdrawn with one button) and the past ones.
 */
export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const now = new Date();
  const [t, format, list, history] = await Promise.all([
    getTranslations('Admin.announcements'),
    getFormatter(),
    listAnnouncements(),
    listAudit({ targetType: 'announcement', limit: 20 }),
  ]);
  const state = (row: Announcement) =>
    row.endsAt && row.endsAt <= now ? 'over' : row.startsAt > now ? 'upcoming' : 'live';
  // The banner shows the latest one already started
  const shown = list.find((row) => state(row) === 'live') ?? null;
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>

      <section className={styles.section} aria-labelledby="current-heading">
        <h2 id="current-heading">{t('currentHeading')}</h2>
        {shown ? <AnnouncementBanner announcement={shown} preview /> : <p className={styles.muted}>{t('noneShown')}</p>}
      </section>

      <section className={styles.section} aria-labelledby="new-heading">
        <h2 id="new-heading">{t('newHeading')}</h2>
        <p className={styles.muted}>{t('newIntro')}</p>
        <AnnouncementForm now={toParisDateTime(now)} />
      </section>

      <section className={styles.section} aria-labelledby="list-heading">
        <h2 id="list-heading">{t('listHeading')}</h2>
        {list.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('state')}</th>
                  <th scope="col">{t('message')}</th>
                  <th scope="col">{t('dates')}</th>
                  <th scope="col">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <td>{t(`states.${state(row)}`)}</td>
                    <td>
                      {row.tone === 'important' && <strong>{t('tones.important')} · </strong>}
                      {row.message}
                      {row.linkUrl && (
                        <>
                          {' · '}
                          <a href={row.linkUrl}>{row.linkLabel ?? row.linkUrl}</a>
                        </>
                      )}
                    </td>
                    <td>
                      {row.endsAt
                        ? t('fromTo', { from: date(row.startsAt), to: date(row.endsAt) })
                        : t('fromOn', { from: date(row.startsAt) })}
                    </td>
                    <td>
                      {state(row) !== 'over' && (
                        <form action={endAnnouncementAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <Button type="submit" variant="danger">
                            {t('end')}
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading">{t('historyHeading')}</h2>
        <AuditTable rows={history} showTarget={false} />
      </section>
    </main>
  );
}
