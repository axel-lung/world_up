'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from '../admin.module.css';

const LINKS = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/cards', key: 'cards' },
  { href: '/admin/reports', key: 'reports' },
  { href: '/admin/market', key: 'market' },
  { href: '/admin/rules', key: 'rules' },
  { href: '/admin/audit', key: 'audit' },
] as const;

export function AdminNav() {
  const t = useTranslations('Admin.nav');
  const pathname = usePathname();
  const current = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));
  return (
    <nav className={styles.nav} aria-label={t('label')}>
      <span className={styles.navTitle}>{t('label')}</span>
      {LINKS.map(({ href, key }) => (
        <Link key={href} href={href} aria-current={current(href) ? 'page' : undefined}>
          {t(key)}
        </Link>
      ))}
      <Link href="/">{t('site')}</Link>
    </nav>
  );
}
