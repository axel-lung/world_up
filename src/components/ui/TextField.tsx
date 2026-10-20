import { type ComponentProps, type ReactNode, useId } from 'react';
import styles from './TextField.module.css';

/**
 * Nocturne's .field and .input: a label above the input, then a hint and an
 * error message, both read out with the input.
 */
export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode } & ComponentProps<'input'>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input ${styles.input}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}
