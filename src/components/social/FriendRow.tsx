import type { ReactNode } from 'react';
import styles from './FriendRow.module.css';

/**
 * A player in a list of friends or requests: an initial in an inked sticker,
 * the pseudo, a line about the link (since when, sent on), then the actions.
 */
export function FriendRow({ pseudo, meta, children }: { pseudo: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <li className={styles.row}>
      <span className={styles.avatar} aria-hidden="true">
        {pseudo.charAt(0).toLocaleUpperCase('fr')}
      </span>
      <span className={styles.who}>
        <span className={styles.pseudo}>{pseudo}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {children && <span className={styles.actions}>{children}</span>}
    </li>
  );
}

export function FriendList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}
