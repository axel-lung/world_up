import { ChevronDown, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './MoreInfo.module.css';

/**
 * An explanation folded under a question ("Comment marchent les enchères ?"),
 * so that a page opens on what it is for. A native <details>: no JavaScript,
 * and the browser's find-in-page opens it.
 */
export function MoreInfo({ summary, children, className }: { summary: string; children: ReactNode; className?: string }) {
  return (
    <details className={[styles.more, className].filter(Boolean).join(' ')}>
      <summary>
        <Info aria-hidden className={styles.info} />
        <span>{summary}</span>
        <ChevronDown aria-hidden className={styles.chevron} />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
