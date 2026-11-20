'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import styles from './TabBar.module.css';

export interface TabBarItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Other addresses this tab stands for, with the pages below them (the series for the collection, say). */
  also?: string[];
  /** Below href too. */
  prefix?: boolean;
  /** The raised tab in the middle: the packs. */
  primary?: boolean;
  /** A count on the icon (`value`), and the words a screen reader says for it. */
  badge?: { value: string; label: string };
}

const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

function isCurrent(item: TabBarItem, pathname: string): boolean {
  return (
    pathname === item.href ||
    Boolean(item.prefix && under(pathname, item.href)) ||
    Boolean(item.also?.some((path) => under(pathname, path)))
  );
}

/** A tab's icon and name; the tab lights up as soon as it is touched, before its page arrives. */
function TabFace({ item }: { item: TabBarItem }) {
  const { pending } = useLinkStatus();
  return (
    <span className={styles.face} data-pending={pending || undefined}>
      <span className={styles.icon}>
        {item.icon}
        {item.badge && (
          <span className={styles.badge} aria-hidden="true">
            {item.badge.value}
          </span>
        )}
      </span>
      <span className={styles.label}>{item.label}</span>
      {item.badge && <span className="sr-only">, {item.badge.label}</span>}
    </span>
  );
}

/**
 * The game's navigation on a phone: five tabs within the thumb's reach, the
 * packs raised in the middle. Fixed to the bottom of the screen under
 * 720 px only; wider screens keep the header's links. `inline` lays it out in
 * the page instead, for the /design showcase, with `currentPath` as the page.
 */
export function TabBar({
  items,
  label,
  inline = false,
  currentPath,
}: {
  items: TabBarItem[];
  label: string;
  inline?: boolean;
  currentPath?: string;
}) {
  const pathname = usePathname();
  const path = currentPath ?? pathname;
  return (
    <>
      {/* Keeps the end of the page clear of the bar */}
      {!inline && <div className={styles.spacer} aria-hidden="true" />}
      <nav aria-label={label} className={`${styles.tabBar} ${inline ? '' : styles.fixed}`}>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.tab}
                data-primary={item.primary || undefined}
                aria-current={isCurrent(item, path) ? 'page' : undefined}
              >
                <TabFace item={item} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
