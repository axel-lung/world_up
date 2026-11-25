import type { ComponentProps, ReactNode } from 'react';
import styles from './StoneArch.module.css';

/**
 * A wall of stone blocks under a round arch, leaded in ink, with a rose window
 * at its top (Claude Design, design/vitrail/): the vitrail's stage for what
 * matters most on a page, the reserve of packs or the card itself. The rose is
 * decorative. `rose="large"` and `"none"` change it; `align="center"` centers
 * the content.
 */
export function StoneArch({
  rose = 'small',
  align = 'start',
  as: Tag = 'div',
  className,
  children,
  ...props
}: {
  rose?: 'small' | 'large' | 'none';
  align?: 'start' | 'center';
  as?: 'div' | 'section';
  children: ReactNode;
} & ComponentProps<'div'>) {
  return (
    <Tag
      className={[styles.arch, className].filter(Boolean).join(' ')}
      data-rose={rose}
      data-align={align}
      {...props}
    >
      {rose !== 'none' && <span className={styles.rose} aria-hidden="true" />}
      {children}
    </Tag>
  );
}
