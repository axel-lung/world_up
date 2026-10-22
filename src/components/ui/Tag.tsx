import type { ReactNode } from 'react';
import styles from './Tag.module.css';

/**
 * line: card facts (Classé MH, Inscrit MH). sage: UNESCO. new: the tilted
 * "Nouveau !" sticker. count: "×2". shiny: "Brillante". accent: subscriber or
 * reserve state. subtle: neutral notes. success / warning / danger: statuses.
 * draft: "Prix fictif" in mock-ups.
 */
type Variant = 'line' | 'sage' | 'new' | 'count' | 'shiny' | 'accent' | 'subtle' | 'success' | 'warning' | 'danger' | 'draft';

const ORGANIC_CLASS: Partial<Record<Variant, string>> = {
  sage: 'tag-accent-2',
  accent: 'tag-accent',
  subtle: 'tag-neutral',
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
  const classes = ['tag', ORGANIC_CLASS[variant], styles.tag, styles[variant], className];
  return (
    <span className={classes.filter(Boolean).join(' ')}>
      {icon}
      {children}
    </span>
  );
}
