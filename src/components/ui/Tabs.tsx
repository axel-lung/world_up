'use client';

import { type KeyboardEvent, useRef } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Formatted count shown after the label, e.g. "1 284". */
  count?: string;
}

/** A tab row (e.g. collection filters). Arrow keys move between tabs. */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onValueChange(items[next].value);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.tablist}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.count && <span className={styles.count}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
