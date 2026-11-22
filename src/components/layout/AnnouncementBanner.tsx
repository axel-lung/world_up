'use client';

import { Megaphone, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { announcementCookie } from '@/lib/announcement-shared';
import type { Announcement } from '@/lib/announcements';
import styles from './AnnouncementBanner.module.css';

/**
 * The announcement over the site's pages (SiteAnnouncement): its message and
 * link, in the info or the important tone. Closing it keeps it away on this
 * device (a cookie with its ID, read by the server, so it never flashes back).
 * `preview`, in the back-office, has no close button.
 */
export function AnnouncementBanner({
  announcement,
  preview = false,
}: {
  announcement: Pick<Announcement, 'id' | 'message' | 'linkUrl' | 'linkLabel' | 'tone'>;
  preview?: boolean;
}) {
  const t = useTranslations('Announcement');
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const { id, message, linkUrl, linkLabel, tone } = announcement;
  const label = linkLabel || t('more');

  const close = () => {
    document.cookie = announcementCookie(id, window.location.protocol === 'https:');
    setClosed(true);
  };

  return (
    <aside className={styles.banner} data-tone={tone} aria-label={t('label')}>
      <span className={styles.icon} aria-hidden="true">
        {tone === 'important' ? <TriangleAlert /> : <Megaphone />}
      </span>
      <p className={styles.text}>
        {message}
        {linkUrl && (
          <>
            {' '}
            {linkUrl.startsWith('/') ? (
              <Link href={linkUrl} className={styles.link}>
                {label}
              </Link>
            ) : (
              <a href={linkUrl} className={styles.link} rel="noopener">
                {label}
              </a>
            )}
          </>
        )}
      </p>
      {!preview && (
        <button type="button" className={styles.close} onClick={close} aria-label={t('close')}>
          <X aria-hidden />
        </button>
      )}
    </aside>
  );
}
