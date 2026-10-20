import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { AdminNav } from './AdminNav';
import styles from '../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: { default: t('title'), template: `%s · ${t('title')}` }, robots: { index: false, follow: false } };
}

// Every page and server action checks the admin session itself too: a layout
// is not rendered again on navigation between its pages.
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin();
  return (
    <div className={styles.page}>
      <AdminNav />
      {children}
    </div>
  );
}
