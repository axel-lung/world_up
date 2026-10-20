'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteHeader.module.css';

export interface NavItem {
  href: string;
  label: string;
  /** Also current on the pages below href (the collection's series, say). */
  prefix?: boolean;
}

/** The header's links, the current page marked for sight and screen readers. */
export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={styles.nav}>
      <ul>
        {items.map((item) => {
          const current = pathname === item.href || (item.prefix && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? 'page' : undefined} className={styles.navLink}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
