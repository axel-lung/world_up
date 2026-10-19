import type { ReactNode } from 'react';
import styles from './Tag.module.css';

/**
 * line: card facts (Classé MH, UNESCO). new: "Nouveau". count: "×2".
 * shiny: "Brillante". accent: subscriber or reserve state. subtle: "nom provisoire".
 * success / warning / danger: statuses. draft: "Prix fictif" in mock-ups.
 */
type Variant = 'line' | 'new' | 'count' | 'shiny' | 'accent' | 'subtle' | 'success' | 'warning' | 'danger' | 'draft';

const NOCTURNE_CLASS: Partial<Record<Variant, string>> = {
  shiny: 'tag-outline',
  accent: 'tag-accent',
};

export function Tag({
  variant = 'line',
  icon,
  className,
  children,
}: {
  variant?: Variant;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const classes = ['tag', NOCTURNE_CLASS[variant], styles.tag, styles[variant], className];
  return (
    <span className={classes.filter(Boolean).join(' ')}>
      {icon}
      {children}
    </span>
  );
}
