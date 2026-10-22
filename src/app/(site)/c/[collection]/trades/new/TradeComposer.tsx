'use client';

import { ArrowLeftRight, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { displayName } from '@/components/card/card-format';
import { RarityDot } from '@/components/rarity/Rarity';
import { Button } from '@/components/ui/Button';
import { RARITIES, type Rarity } from '@/lib/rarity';
import styles from './TradeComposer.module.css';

export interface ComposerCard {
  id: number;
  name: string;
  rarity: Rarity;
  region: string | null;
  available: number;
  quantity: number;
  viewerOwns: boolean;
}

type Selection = Record<number, number>;

// Rows listed at once: past that, the player narrows the search
const SHOWN = 30;

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const count = (selection: Selection) => Object.values(selection).reduce((sum, copies) => sum + copies, 0);

const isDuplicate = (card: ComposerCard) => card.quantity > 1;
const isMissing = (card: ComposerCard) => !card.viewerOwns;

/** One side of the offer: the cards chosen, then a filtered list to pick from. */
function Side({
  side,
  title,
  cards,
  selection,
  onChange,
  max,
  toggleLabel,
  toggle,
}: {
  side: 'give' | 'want';
  title: string;
  cards: ComposerCard[];
  selection: Selection;
  onChange: (selection: Selection) => void;
  max: number;
  toggleLabel: string;
  /** The checkbox's filter: duplicates on the player's side, cards they lack on the friend's. */
  toggle: (card: ComposerCard) => boolean;
}) {
  const t = useTranslations('Trades.compose');
  const tRarity = useTranslations('Rarity');
  const id = useId();
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<Rarity | ''>('');
  const [only, setOnly] = useState(side === 'want');
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const chosen = count(selection);

  const matches = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return cards.filter(
      (card) =>
        (!rarity || card.rarity === rarity) &&
        (!only || toggle(card)) &&
        words.every((word) => fold(`${card.name} ${card.region ?? ''}`).includes(word)),
    );
  }, [cards, query, rarity, only, toggle]);

  const change = (cardId: number, delta: number) => {
    const next = { ...selection, [cardId]: (selection[cardId] ?? 0) + delta };
    if (next[cardId] <= 0) delete next[cardId];
    onChange(next);
  };

  return (
    <section className={styles.side} aria-labelledby={`${id}-title`}>
      <div className={styles.sideHeader}>
        <h2 id={`${id}-title`}>{title}</h2>
        <span className={styles.muted} aria-live="polite">
          {t('selected', { count: chosen, max })}
        </span>
      </div>

      {chosen > 0 && (
        <ul className={styles.chosen}>
          {Object.entries(selection).map(([cardId, copies]) => {
            const card = byId.get(Number(cardId));
            if (!card) return null;
            const name = displayName(card.name);
            return (
              <li key={cardId} className={styles.chip}>
                <RarityDot rarity={card.rarity} />
                <span>{name}</span>
                {copies > 1 && <span className={styles.muted}>×{copies}</span>}
                <button type="button" className={styles.chipButton} aria-label={t('remove', { name })} onClick={() => change(card.id, -1)}>
                  <Minus aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.filters}>
        <div className="field">
          <label htmlFor={`${id}-search`}>{t('search')}</label>
          <input
            id={`${id}-search`}
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-rarity`}>{t('rarity')}</label>
          <select id={`${id}-rarity`} className="input" value={rarity} onChange={(event) => setRarity(event.target.value as Rarity | '')}>
            <option value="">{t('allRarities')}</option>
            {RARITIES.map((value) => (
              <option key={value} value={value}>
                {tRarity(value)}
              </option>
            ))}
          </select>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={only} onChange={(event) => setOnly(event.target.checked)} />
          {toggleLabel}
        </label>
      </div>

      {cards.length === 0 ? (
        <p className={styles.muted}>{t('none')}</p>
      ) : matches.length === 0 ? (
        <p className={styles.muted}>{t('noMatch')}</p>
      ) : (
        <ul className={styles.list}>
          {matches.slice(0, SHOWN).map((card) => {
            const name = displayName(card.name);
            const picked = selection[card.id] ?? 0;
            return (
              <li key={card.id} className={styles.row} data-picked={picked > 0 || undefined}>
                <RarityDot rarity={card.rarity} />
                <span className={styles.name}>
                  <span>
                    {name} <span className="sr-only">({tRarity(card.rarity)})</span>
                  </span>
                  <span className={styles.muted}>
                    {[card.region, t('copies', { count: card.available })].filter(Boolean).join(' · ')}
                    {side === 'give' && card.quantity === 1 && ` · ${t('lastCopy')}`}
                  </span>
                </span>
                <Button
                  iconOnly
                  variant={picked ? 'sage' : 'secondary'}
                  icon={<Plus aria-hidden />}
                  aria-label={t('add', { name })}
                  disabled={picked >= card.available || chosen >= max}
                  onClick={() => change(card.id, 1)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > SHOWN && <p className={styles.muted}>{t('more', { count: matches.length - SHOWN })}</p>}
    </section>
  );
}

/**
 * The offer's composer: the player's cards on one side, the friend's on the
 * other. The form sends "<card ID>x<copies>" entries; the server checks
 * everything again.
 */
export function TradeComposer({
  action,
  collection,
  pseudo,
  tradeKey,
  mine,
  theirs,
  max,
  initialGive,
  initialWant,
}: {
  action: (form: FormData) => Promise<void>;
  collection: string;
  pseudo: string;
  tradeKey: string;
  mine: ComposerCard[];
  theirs: ComposerCard[];
  max: number;
  initialGive: Selection;
  initialWant: Selection;
}) {
  const t = useTranslations('Trades');
  const [give, setGive] = useState(initialGive);
  const [want, setWant] = useState(initialWant);
  const entries = (selection: Selection) => Object.entries(selection).map(([cardId, copies]) => `${cardId}x${copies}`);

  return (
    <form action={action} className={styles.composer}>
      <input type="hidden" name="collection" value={collection} />
      <input type="hidden" name="with" value={pseudo} />
      <input type="hidden" name="key" value={tradeKey} />
      {entries(give).map((entry) => (
        <input key={`give-${entry}`} type="hidden" name="give" value={entry} />
      ))}
      {entries(want).map((entry) => (
        <input key={`want-${entry}`} type="hidden" name="want" value={entry} />
      ))}

      <div className={styles.sides}>
        <Side
          side="give"
          title={t('youGive')}
          cards={mine}
          selection={give}
          onChange={setGive}
          max={max}
          toggleLabel={t('compose.onlyDuplicates')}
          toggle={isDuplicate}
        />
        <Side
          side="want"
          title={t('youGet')}
          cards={theirs}
          selection={want}
          onChange={setWant}
          max={max}
          toggleLabel={t('compose.onlyMissing')}
          toggle={isMissing}
        />
      </div>

      {/* Stays at the bottom of the screen while the lists scroll by */}
      <div className={styles.submit}>
        <span className={styles.summary}>{t('compose.summary', { give: count(give), want: count(want) })}</span>
        <Button
          type="submit"
          variant="primary"
          size="large"
          icon={<ArrowLeftRight aria-hidden />}
          disabled={count(give) === 0 || count(want) === 0}
        >
          {t('compose.send')}
        </Button>
      </div>
    </form>
  );
}
