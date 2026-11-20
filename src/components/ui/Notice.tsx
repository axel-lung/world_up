import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Notice.module.css';

const ICONS = { info: Info, success: CircleCheck, danger: CircleAlert };

/**
 * A message above or below a form. Errors are announced as soon as they
 * appear; other tones politely. `toast`: on a phone, the outcome of an action
 * floats over the bottom of the screen for a moment instead (a resale, a trade).
 */
export function Notice({
  tone = 'info',
  toast = false,
  children,
}: {
  tone?: keyof typeof ICONS;
  toast?: boolean;
  children: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={styles.notice} data-tone={tone} data-toast={toast || undefined} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden className={styles.icon} />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
