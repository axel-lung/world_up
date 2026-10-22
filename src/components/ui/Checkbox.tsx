import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Checkbox.module.css';

/**
 * A native checkbox drawn in the accent color, with its label on the right.
 * The whole row is clickable and at least 44 px high.
 */
export function Checkbox({
  children,
  className,
  ...props
}: { children: ReactNode } & Omit<ComponentProps<'input'>, 'type' | 'children'>) {
  return (
    <label className={[styles.row, className].filter(Boolean).join(' ')}>
      <input type="checkbox" className={styles.input} {...props} />
      <span className={styles.box} aria-hidden="true">
        <Check className={styles.tick} />
      </span>
      <span>{children}</span>
    </label>
  );
}
