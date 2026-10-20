import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import styles from './Notice.module.css';

const ICONS = { info: InfoIcon, success: CheckCircleIcon, danger: WarningCircleIcon };

/**
 * A message above or below a form. Errors are announced as soon as they
 * appear; other tones politely.
 */
export function Notice({ tone = 'info', children }: { tone?: keyof typeof ICONS; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div className={styles.notice} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden className={styles.icon} />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
