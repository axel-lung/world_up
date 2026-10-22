import Link from 'next/link';
import type { ReactNode } from 'react';
import { RarityDot } from '@/components/rarity/Rarity';
import type { Rarity } from '@/lib/rarity';
import styles from './TradeSummary.module.css';

export interface TradeChip {
  name: string;
  rarity: Rarity;
  /** Read out after the name: the dot alone is decorative. */
  rarityLabel: string;
  quantity: number;
  href?: string;
}

/** The cards of one side, as inked chips: rarity dot, name, ×copies. */
export function TradeChips({ cards, label }: { cards: TradeChip[]; label: string }) {
  return (
    <ul className={styles.chips} aria-label={label}>
      {cards.map((card) => (
        <li key={card.name} className={styles.chip}>
          <RarityDot rarity={card.rarity} />
          {card.href ? <Link href={card.href}>{card.name}</Link> : <span>{card.name}</span>}
          <span className="sr-only">({card.rarityLabel})</span>
          {card.quantity > 1 && <span className={styles.count}>×{card.quantity}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A trade offer at a glance: who and when, its state, then what the player
 * gives and what they get. `children` holds the link or the actions.
 */
export function TradeSummary({
  title,
  state,
  meta,
  gives,
  gets,
  labels,
  children,
}: {
  title: ReactNode;
  state: ReactNode;
  meta?: ReactNode;
  gives: TradeChip[];
  gets: TradeChip[];
  labels: { youGive: string; youGet: string };
  children?: ReactNode;
}) {
  return (
    <article className={styles.summary}>
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {state}
      </header>
      {meta && <p className={styles.meta}>{meta}</p>}
      <div className={styles.sides}>
        <div className={styles.side}>
          <span className={styles.sideLabel}>{labels.youGive}</span>
          <TradeChips cards={gives} label={labels.youGive} />
        </div>
        <span className={styles.arrow} aria-hidden="true">
          ⇄
        </span>
        <div className={styles.side}>
          <span className={styles.sideLabel}>{labels.youGet}</span>
          <TradeChips cards={gets} label={labels.youGet} />
        </div>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </article>
  );
}
