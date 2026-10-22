import type { ReactNode } from 'react';
import styles from './Gauge.module.css';

/**
 * A progress bar with its label: collection or series progress (terracotta,
 * sage for the UNESCO series), or the monthly spending cap (sage, warning near
 * the cap, danger once reached). The bar is decorative; the label, value and
 * caption carry the information as text.
 */
export function Gauge({
  label,
  value,
  valueText,
  caption,
  captionIcon,
  tone = 'accent',
  size = 'medium',
}: {
  label: ReactNode;
  /** Between 0 and 1. */
  value: number;
  /** Shown next to the label, e.g. "1 284 / 26 755 · 4,8 %". */
  valueText?: ReactNode;
  /** Shown under the bar, e.g. "12,98 € sur 30 €". */
  caption?: ReactNode;
  captionIcon?: ReactNode;
  tone?: 'accent' | 'sage' | 'warning' | 'danger';
  /** small: a thinner bar, for gauges side by side. */
  size?: 'medium' | 'small';
}) {
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={styles.gauge} data-tone={tone} data-size={size}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {valueText && <span className={styles.value}>{valueText}</span>}
      </div>
      <div className={styles.track} aria-hidden="true">
        {/* A started gauge always shows a dot of progress */}
        <div className={styles.fill} data-started={percent > 0 || undefined} style={{ width: `${percent}%` }} />
      </div>
      {caption && (
        <span className={styles.caption}>
          {captionIcon}
          <span>{caption}</span>
        </span>
      )}
    </div>
  );
}
