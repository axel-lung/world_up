'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { displayName } from '@/components/card/card-format';
import { Button } from '@/components/ui/Button';
import type { GameErrorCode } from '@/lib/game/game-error';
import { setWishAction } from '@/lib/game/wishlist-actions';
import styles from './WishButton.module.css';

// How long a refusal stays on screen
const ERROR_MS = 4000;

/**
 * The wishlist's heart: puts a card the player lacks on their wishlist, or
 * takes it off. It turns at once, then the server draws the page again; a
 * refusal (a full list, a card obtained meanwhile) puts the heart back and
 * floats a message over the bottom of the screen.
 *
 * - tile: a round sticker over a card of a grid or a row of a list, its slot
 *   placed by the card (Card's and CardRow's `action`);
 * - button: a button with its words, on a card's page;
 * - dock: an action of the phone's card page dock, styled by `className`.
 */
export function WishButton({
  collection,
  cardId,
  name,
  wished,
  variant = 'tile',
  className,
}: {
  collection: string;
  cardId: number;
  /** The card's name, as stored. */
  name: string;
  wished: boolean;
  variant?: 'tile' | 'button' | 'dock';
  className?: string;
}) {
  const t = useTranslations('Wishlist.button');
  const tGame = useTranslations('Game');
  const [shown, setShown] = useOptimistic(wished);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<GameErrorCode | 'server' | null>(null);
  const [said, setSaid] = useState('');

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const toggle = () => {
    const next = !shown;
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setWishAction({ collection, cardId, wished: next });
      if (result.ok) {
        setSaid(next ? t('added') : t('removed'));
      } else {
        setError(result.error);
      }
    });
  };

  const label = displayName(name);
  const heart = <Heart aria-hidden className={styles.heart} />;
  const control =
    variant === 'button' ? (
      <Button icon={heart} onClick={toggle} data-wished={shown || undefined} className={styles.button}>
        {shown ? t('remove') : t('add')}
      </Button>
    ) : variant === 'dock' ? (
      <button type="button" className={`${className ?? ''} ${styles.dock}`} aria-pressed={shown} onClick={toggle}>
        {heart}
        {t('dock')}
      </button>
    ) : (
      <button type="button" className={styles.tile} aria-pressed={shown} aria-label={t('tile', { name: label })} onClick={toggle}>
        <span className={styles.sticker}>{heart}</span>
      </button>
    );

  return (
    <>
      {control}
      <span className="sr-only" role="status">
        {said}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error === 'server' ? t('failed') : tGame(`errors.${error}`)}
        </span>
      )}
    </>
  );
}
