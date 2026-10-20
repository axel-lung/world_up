import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { listAudit } from '@/lib/catalog/admin';
import { AuditTable } from '../AuditTable';
import styles from '../../admin.module.css';

const PAGE = 100;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.audit');
  return { title: t('title') };
}

export default async function AdminAuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  await requireAdmin();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [t, rows] = await Promise.all([
    getTranslations('Admin.audit'),
    // One row more than shown tells whether an older page exists
    listAudit({ limit: PAGE + 1, offset: (page - 1) * PAGE }),
  ]);

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>
      <AuditTable rows={rows.slice(0, PAGE)} />
      <nav className={styles.pagination} aria-label={t('title')}>
        {page > 1 && <Link href={`/admin/audit?page=${page - 1}`}>{t('previous')}</Link>}
        {rows.length > PAGE && <Link href={`/admin/audit?page=${page + 1}`}>{t('next')}</Link>}
      </nav>
    </main>
  );
}
