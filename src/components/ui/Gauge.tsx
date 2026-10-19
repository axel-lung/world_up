import type { ReactNode } from 'react';
import styles from './Gauge.module.css';

/**
 * A progress bar with its label: collection or series progress, or the
 * monthly spending cap (warning near the cap, danger once reached). The bar
 * is decorative; the label, value and caption carry the information as text.
 */
export function Gauge({
  label,
  value,
  valueText,
  caption,
  captionIcon,
  tone = 'accent',
}: {
  label: ReactNode;
  /** Between 0 and 1. */
  value: number;
  /** Shown next to the label, e.g. "1 284 / 26 755 · 4,8 %". */
  valueText?: ReactNode;
  /** Shown under the bar, e.g. "12,98 € sur 30 €". */
  caption?: ReactNode;
  captionIcon?: ReactNode;
  tone?: 'accent' | 'warning' | 'danger';
}) {
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={styles.gauge} data-tone={tone}>
      <div className={styles.header}>
        <span>{label}</span>
        {valueText && <span className={styles.value}>{valueText}</span>}
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${percent}%` }} />
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
