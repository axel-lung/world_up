'use client';

import type { ReactNode } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Organic's segmented control (.seg) on native radio buttons, e.g. grid or list view. */
export function SegmentedControl<T extends string>({
  name,
  options,
  value,
  onValueChange,
  ariaLabel,
}: {
  name: string;
  options: SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className={`seg ${styles.seg}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <label key={option.value} className={`seg-opt ${styles.option}`}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onValueChange(option.value)}
          />
          {option.icon}
          {option.label}
        </label>
      ))}
    </div>
  );
}
