'use client';

import { PackageOpen, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useRef, useState, useTransition } from 'react';
import { Card } from '@/components/card/Card';
import { EmblemIcon } from '@/components/collection/Emblem';
import { PackReserve } from '@/components/pack/PackReserve';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { Emblem } from '@/lib/collection-theme';
import { achievementTitle } from '@/lib/game/achievement-title';
import { openPackAction, type OpenPackResult, type ReserveView } from './actions';
import styles from './PackOpener.module.css';

type Opened = Extract<OpenPackResult, { ok: true }>;

// The reveal: the pack goes, then the cards turn over one after another, all
// within 3 seconds; a plain fade when the system asks for less motion.
const REVEAL_MS = 2_700;
const REDUCED_REVEAL_MS = 400;

export function PackOpener({
  collection,
  collectionName,
  emblem,
  collectionHref,
  initialReserve,
}: {
  collection: string;
  collectionName: string;
  emblem: Emblem;
  collectionHref: string;
  initialReserve: ReserveView;
}) {
  const t = useTranslations('Open');
  const tGame = useTranslations('Game');
  const tAchievement = useTranslations('Achievements');
  const tRarity = useTranslations('Rarity');
  // Kept until a pack has opened: a retry sends the same key
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [reserve, setReserve] = useState(initialReserve);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<Extract<OpenPackResult, { ok: false }>['error'] | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (opened) heading.current?.focus();
  }, [opened]);

  const open = () => {
    setError(null);
    startTransition(async () => {
      const result = await openPackAction({ collection, key });
      if (result.reserve) setReserve(result.reserve);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // A second answer for the same key (double click) is the same pack: keep the first,
      // which carries the achievements
      if (shown.current === result.openingId) return;
      shown.current = result.openingId;
      setKey(crypto.randomUUID());
      setOpened(result);
      setRevealing(true);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setRevealing(false), reduced ? REDUCED_REVEAL_MS : REVEAL_MS);
    });
  };

  const skip = () => {
    window.clearTimeout(timer.current);
    setRevealing(false);
  };

  const newCards = opened?.cards.filter((card) => card.isNew).length ?? 0;

  return (
    <div className={styles.opener}>
      <PackReserve {...reserve} shopHref={null} />

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="large"
          onClick={open}
          disabled={pending || reserve.available < 1}
          icon={<PackageOpen aria-hidden />}
        >
          {pending ? t('opening') : opened ? t('openAnother') : t('open')}
        </Button>
        {opened && <ButtonLink href={collectionHref}>{t('seeCollection')}</ButtonLink>}
      </div>

      {error && (
        <Notice tone={error === 'server' ? 'danger' : 'info'}>
          <p>{tGame(`errors.${error}`)}</p>
        </Notice>
      )}

      {opened && (
        <section className={styles.result} data-revealing={revealing || undefined} aria-labelledby="pack-result">
          <div className={styles.resultHeader}>
            <h2 id="pack-result" ref={heading} tabIndex={-1}>
              {t('resultHeading', { collection: collectionName })}
            </h2>
            {revealing && (
              <Button variant="ghost" onClick={skip}>
                {t('skip')}
              </Button>
            )}
          </div>
          <p role="status" className={styles.summary}>
            {t('summary', { count: opened.cards.length, new: newCards })}
          </p>

          <div className={styles.stage}>
            {revealing && (
              <span className={styles.pack} aria-hidden="true">
                <span className={styles.packEmblem}>
                  <EmblemIcon emblem={emblem} />
                </span>
                <span className={styles.packKicker}>{t('packKicker')}</span>
                <span className={styles.packName}>{collectionName}</span>
              </span>
            )}
            <ul className={styles.cards}>
              {opened.cards.map(({ position, isNew, card }, index) => (
                <li
                  key={`${opened.openingId}-${position}`}
                  className={styles.reveal}
                  style={{ '--index': index } as CSSProperties}
                >
                  <Card
                    card={card.data}
                    collection={{ name: collectionName, emblem }}
                    isNew={isNew}
                    copies={card.copies}
                    href={card.href ?? undefined}
                    sizes="(max-width: 520px) calc(50vw - 20px), 200px"
                  />
                </li>
              ))}
            </ul>
          </div>

          {opened.achievements.length > 0 && (
            <Notice tone="success">
              <ul className={styles.unlocked}>
                {opened.achievements.map((achievement) => (
                  <li key={achievement.code}>
                    <Trophy aria-hidden />
                    <span>
                      {t('unlocked', {
                        title: achievementTitle(tAchievement, tRarity, achievement),
                        coins: achievement.rewardCoins,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
        </section>
      )}
    </div>
  );
}
