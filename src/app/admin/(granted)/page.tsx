import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { catalogStats, HIDDEN_REASONS, listAudit } from '@/lib/catalog/admin';
import { AuditTable } from './AuditTable';
import styles from '../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.dashboard');
  return { title: t('title') };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [t, format, stats, recent] = await Promise.all([
    getTranslations('Admin.dashboard'),
    getFormatter(),
    catalogStats(),
    listAudit({ limit: 10 }),
  ]);
  const tiles = [
    { label: t('visible'), value: stats.visible, href: '/admin/cards?status=visible' },
    { label: t('hidden'), value: stats.hidden, href: '/admin/cards?status=hidden' },
    { label: t('toReview'), value: stats.review, href: '/admin/cards?status=review', hint: t('toReviewHint') },
  ];

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
      </header>
      {stats.visible + stats.hidden === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <>
          <div className={styles.stats}>
            {tiles.map((tile) => (
              <Link key={tile.href} href={tile.href} className={styles.stat}>
                <span className={styles.statValue}>{format.number(tile.value)}</span>
                <span>{tile.label}</span>
                {tile.hint && <span className={styles.muted}>{tile.hint}</span>}
              </Link>
            ))}
          </div>
          <section className={styles.section} aria-labelledby="reasons-heading">
            <h2 id="reasons-heading">{t('reasonsTitle')}</h2>
            <dl className={styles.facts}>
              {HIDDEN_REASONS.map((reason) => (
                <div key={reason}>
                  <dt>{t(`reasons.${reason}`)}</dt>
                  <dd>{format.number(stats.byReason[reason] ?? 0)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
      <section className={styles.section} aria-labelledby="recent-heading">
        <div className={styles.header}>
          <h2 id="recent-heading">{t('recent')}</h2>
          <Link href="/admin/audit">{t('seeAll')}</Link>
        </div>
        <AuditTable rows={recent} />
      </section>
    </main>
  );
}
