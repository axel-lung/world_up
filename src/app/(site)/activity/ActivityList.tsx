'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Tag } from '@/components/ui/Tag';
import { markReadAction } from './actions';
import styles from './page.module.css';

export interface ActivityEntry {
  id: number;
  text: string;
  href: string;
  date: string;
  unread: boolean;
}

/**
 * The notifications, newest first. Once shown they are marked as read and the
 * header's bell refreshed; the ones that were new keep their tag for this visit.
 */
export function ActivityList({ entries, label, unreadLabel }: { entries: ActivityEntry[]; label: string; unreadLabel: string }) {
  const router = useRouter();
  const [fresh] = useState(() => new Set(entries.filter((entry) => entry.unread).map((entry) => entry.id)));
  const newest = entries[0]?.id;
  const hasUnread = entries.some((entry) => entry.unread);

  useEffect(() => {
    if (!hasUnread || newest === undefined) return;
    void markReadAction(newest).then(() => router.refresh());
  }, [hasUnread, newest, router]);

  return (
    <ul className={styles.list} aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.entry} data-new={fresh.has(entry.id) || undefined}>
          <Link href={entry.href} className={styles.text}>
            {entry.text}
          </Link>
          <span className={styles.meta}>
            {fresh.has(entry.id) && <Tag variant="accent">{unreadLabel}</Tag>}
            <time>{entry.date}</time>
          </span>
        </li>
      ))}
    </ul>
  );
}
