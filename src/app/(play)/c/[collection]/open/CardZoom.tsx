'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Card, type CardCollection } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { OpenPackResult } from './actions';
import styles from './CardZoom.module.css';

type OpenedCard = Extract<OpenPackResult, { ok: true }>['cards'][number];

/**
 * A card of the opened pack, large, over the stage: the player turns it over
 * to read its back, goes to the next one (arrows, or the keyboard's), or opens
 * its page. A native modal <dialog>: the focus stays inside, Escape closes it,
 * and the focus goes back where it was. `index` null: closed.
 */
export function CardZoom({
  cards,
  index,
  onIndexChange,
  collection,
}: {
  cards: OpenedCard[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  collection: CardCollection;
}) {
  const t = useTranslations('Open');
  const dialog = useRef<HTMLDialogElement>(null);
  const entry = index === null ? null : cards[index];

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (index !== null && !element.open) element.showModal();
    if (index === null && element.open) element.close();
  }, [index]);

  const go = (step: number) => {
    if (index !== null) onIndexChange((index + step + cards.length) % cards.length);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') go(1);
    if (event.key === 'ArrowLeft') go(-1);
  };

  return (
    <dialog
      ref={dialog}
      className={styles.zoom}
      aria-label={entry ? displayName(entry.card.data.name) : undefined}
      onClose={() => onIndexChange(null)}
      onKeyDown={onKeyDown}
      // A click beside the card, on the dark ground, closes it
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      {entry && index !== null && (
        <>
          <Button
            iconOnly
            className={styles.close}
            aria-label={t('zoomClose')}
            icon={<X aria-hidden />}
            onClick={() => dialog.current?.close()}
          />
          <div className={styles.card}>
            {/* Keyed: the next card comes face up */}
            <Card
              key={entry.position}
              card={entry.card.data}
              collection={collection}
              size="large"
              flippable
              isNew={entry.isNew}
              copies={entry.card.copies}
              sizes="360px"
            />
          </div>
          <div className={styles.bar}>
            {cards.length > 1 && (
              <Button iconOnly aria-label={t('zoomPrevious')} icon={<ChevronLeft aria-hidden />} onClick={() => go(-1)} />
            )}
            <span className={styles.position}>{t('zoomPosition', { current: index + 1, count: cards.length })}</span>
            {cards.length > 1 && (
              <Button iconOnly aria-label={t('zoomNext')} icon={<ChevronRight aria-hidden />} onClick={() => go(1)} />
            )}
          </div>
          {entry.card.href && (
            <ButtonLink href={entry.card.href} variant="ghost">
              {t('cardPage')}
            </ButtonLink>
          )}
        </>
      )}
    </dialog>
  );
}
