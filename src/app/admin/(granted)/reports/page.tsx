import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { displayName } from '@/components/card/card-format';
import { Button } from '@/components/ui/Button';
import { requireAdmin } from '@/lib/admin';
import { listReports } from '@/lib/catalog/reports';
import { closeReportAction } from './actions';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.reports');
  return { title: t('title') };
}

type Report = Awaited<ReturnType<typeof listReports>>[number];

export default async function AdminReportsPage() {
  await requireAdmin();
  const [t, format, open, closed] = await Promise.all([
    getTranslations('Admin.reports'),
    getFormatter(),
    listReports({ open: true, limit: 200 }),
    listReports({ open: false, limit: 50 }),
  ]);

  const table = (rows: Report[], actions: boolean) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('when')}</th>
            <th scope="col">{t('card')}</th>
            <th scope="col">{t('type')}</th>
            <th scope="col">{t('message')}</th>
            <th scope="col">{t('by')}</th>
            <th scope="col">{actions ? t('actions') : t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((report) => (
            <tr key={report.id}>
              <td>{format.dateTime(report.createdAt, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })}</td>
              <td>
                <Link href={`/admin/cards/${report.cardId}`}>{displayName(report.cardName)}</Link>
              </td>
              <td>{t(`types.${report.type}`)}</td>
              <td>{report.message}</td>
              <td>{report.player ?? t('deletedPlayer')}</td>
              <td>
                {actions ? (
                  <form action={closeReportAction} className={styles.filters}>
                    <input type="hidden" name="reportId" value={report.id} />
                    <Button type="submit" name="status" value="resolved">
                      {t('resolve')}
                    </Button>
                    <Button type="submit" name="status" value="dismissed" variant="ghost">
                      {t('dismiss')}
                    </Button>
                  </form>
                ) : (
                  t(`statuses.${report.status}`)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
      </header>
      <section className={styles.section} aria-labelledby="open-heading">
        <h2 id="open-heading">{t('open')}</h2>
        {open.length > 0 ? table(open, true) : <p className={styles.muted}>{t('empty')}</p>}
      </section>
      <section className={styles.section} aria-labelledby="closed-heading">
        <h2 id="closed-heading">{t('closed')}</h2>
        {closed.length > 0 ? table(closed, false) : <p className={styles.muted}>{t('emptyClosed')}</p>}
      </section>
    </main>
  );
}
