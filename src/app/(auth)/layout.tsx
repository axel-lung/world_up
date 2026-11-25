import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from './layout.module.css';

// Signup, login and password pages (App Vitrail - Connexion.dc.html): a way
// back to the welcome page and the logo on top, then the form, on the stone
// on a phone and on a block of stone from 720 px.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('Auth');
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Link href="/" className={styles.back} aria-label={t('home')}>
          <ChevronLeft aria-hidden />
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element -- a WebP already sized, like the cards */}
        <img src="/logo/world-up-96.webp" width={96} height={96} alt="" className={styles.logo} />
      </div>
      <div className={styles.panel}>{children}</div>
    </main>
  );
}
