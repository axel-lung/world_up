import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from './layout.module.css';

// Signup, login and password pages: one narrow panel in the middle of the page.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('Auth');
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        {t('home')}
      </Link>
      <div className={styles.panel}>{children}</div>
    </main>
  );
}
