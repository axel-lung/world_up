import { Bell } from 'lucide-react';
import Link from 'next/link';
import styles from './NotificationBell.module.css';

/**
 * The header's link to /activity, with the unread notifications as a sticker.
 * `label` names it with the count ("Activité, 3 non lues"): the sticker itself
 * is not read out.
 */
export function NotificationBell({ unread, label, href = '/activity' }: { unread: number; label: string; href?: string }) {
  return (
    <Link href={href} className={styles.bell} aria-label={label}>
      <Bell aria-hidden />
      {unread > 0 && (
        <span className={styles.count} aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
