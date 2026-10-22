'use client';

import { FastForward, Layers, PackageOpen, Scissors, Trophy, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { EmblemIcon } from '@/components/collection/Emblem';
import { formatCountdown, useCountdown } from '@/components/pack/useCountdown';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { Emblem } from '@/lib/collection-theme';
import { achievementTitle } from '@/lib/game/achievement-title';
import { RARITY_PIPS } from '@/lib/rarity';
import { openPackAction, type OpenPackResult, type ReserveView } from './actions';
import styles from './PackOpener.module.css';
import {
  CARD,
  CENTER,
  gridPlace,
  HIDDEN,
  LIFTED,
  type Place,
  revealOrder,
  SCENE,
  type Slot,
  stackPlace,
  trayPlace,
  traySlots,
} from './stage-layout';

type Opened = Extract<OpenPackResult, { ok: true }>;
// pack: waiting for a click. shake, tear, rise: the opening, which plays by
// itself in 1.25 s. stack: the player turns the cards over one by one, or
// reveals them all. done: the cards side by side.
type Phase = 'pack' | 'shake' | 'tear' | 'rise' | 'stack' | 'done';

const SHAKE_MS = 420;
const TEAR_MS = 340;
const RISE_MS = 490;
const DONE_MS = 380;
// Before a rare card or better turns over, it trembles: longer the rarer it is (by rarity pips)
const SUSPENSE_MS: Partial<Record<number, number>> = { 3: 220, 4: 380, 5: 520, 6: 750 };

// The Card reads best at its grid size: it is laid out this wide, then scaled
// to the scene, text included, as the mock-up does
const CARD_LAYOUT_WIDTH = 160;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function placeStyle(place: Place, z: number, delay = 0): CSSProperties {
  return { '--x': place.x, '--y': place.y, '--s': place.scale, '--r': place.rotate, '--z': z, '--delay': `${delay}s` } as CSSProperties;
}

function slotStyle(slot: Slot): CSSProperties {
  return { '--left': slot.left, '--top': slot.top, '--width': slot.width, '--height': slot.height } as CSSProperties;
}

const SCENE_STYLE = {
  '--scene-width': SCENE.width,
  '--scene-height': SCENE.height,
  '--card-left': CENTER.x - CARD.width / 2,
  '--card-top': CENTER.y - CARD.height / 2,
  '--card-width': CARD.width,
} as CSSProperties;

/** The confetti thrown by an ultra rare (14 pieces) or a legendary (22). */
function confetti(pips: number) {
  const count = pips >= 6 ? 22 : 14;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.2;
    const distance = 170 + (i % 3) * 45;
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, bar: i % 3 === 0, tone: i % 4 };
  });
}

export function PackOpener({
  collection,
  collectionName,
  emblem,
  cardsPerPack,
  homeHref,
  collectionHref,
  initialReserve,
}: {
  collection: string;
  collectionName: string;
  emblem: Emblem;
  cardsPerPack: number;
  homeHref: string;
  collectionHref: string;
  initialReserve: ReserveView;
}) {
  const t = useTranslations('Open');
  const tNav = useTranslations('Nav');
  const tGame = useTranslations('Game');
  const tAchievement = useTranslations('Achievements');
  const tRarity = useTranslations('Rarity');
  // Kept until a pack has opened: a retry sends the same key
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [reserve, setReserve] = useState(initialReserve);
  const [phase, setPhase] = useState<Phase>('pack');
  const [opened, setOpened] = useState<Opened | null>(null);
  // The top card of the stack, whether it is face up, and whether it is trembling
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [suspense, setSuspense] = useState(false);
  const [error, setError] = useState<Extract<OpenPackResult, { ok: false }>['error'] | null>(null);
  const timers = useRef<number[]>([]);
  const shownOpening = useRef<number | null>(null);
  const focusOpen = useRef(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [cardScale, setCardScale] = useState(1);
  const remaining = useCountdown(reserve.nextPackAt, reserve.serverNow);
  // The server decides: once the timer is up, a pack has come
  const canOpen = reserve.available > 0 || (reserve.nextPackAt !== null && remaining === 0);

  const later = (run: () => void, ms: number) => {
    timers.current.push(window.setTimeout(run, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setCardScale((element.offsetWidth / SCENE.width) * (CARD.width / CARD_LAYOUT_WIDTH)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The focus follows the action: the card to turn over, then the summary,
  // and the pack's button again after a failed opening
  useEffect(() => {
    if (phase === 'stack') cardButton.current?.focus();
    if (phase === 'done') doneHeading.current?.focus();
    if (phase === 'pack' && focusOpen.current) {
      focusOpen.current = false;
      openButton.current?.focus();
    }
  }, [phase]);

  // From the closed pack, or straight from the end of the previous one
  const open = async () => {
    if ((phase !== 'pack' && phase !== 'done') || !canOpen) return;
    const reduced = reducedMotion();
    clearTimers();
    setError(null);
    setOpened(null);
    setIndex(0);
    setRevealed(false);
    setPhase('shake');
    const shaken = new Promise((resolve) => later(() => resolve(null), reduced ? 0 : SHAKE_MS));
    const result = await openPackAction({ collection, key });
    if (result.reserve) setReserve(result.reserve);
    if (!result.ok) {
      clearTimers();
      setError(result.error);
      focusOpen.current = true;
      setPhase('pack');
      return;
    }
    // A second answer for the same key (double click) is the same pack
    if (shownOpening.current === result.openingId) return;
    shownOpening.current = result.openingId;
    setKey(crypto.randomUUID());
    await shaken;
    setOpened({ ...result, cards: revealOrder(result.cards) });
    setIndex(0);
    setRevealed(false);
    if (reduced) {
      setPhase('stack');
      return;
    }
    setPhase('tear');
    later(() => setPhase('rise'), TEAR_MS);
    later(() => setPhase('stack'), TEAR_MS + RISE_MS);
  };

  const tap = () => {
    if (phase !== 'stack' || suspense || !opened || index >= opened.cards.length) return;
    if (!revealed) {
      const wait = reducedMotion() ? 0 : (SUSPENSE_MS[RARITY_PIPS[opened.cards[index].card.data.rarity]] ?? 0);
      if (!wait) {
        setRevealed(true);
        return;
      }
      setSuspense(true);
      later(() => {
        setSuspense(false);
        setRevealed(true);
      }, wait);
      return;
    }
    const next = index + 1;
    setIndex(next);
    setRevealed(false);
    if (next >= opened.cards.length) later(() => setPhase('done'), reducedMotion() ? 0 : DONE_MS);
  };

  const revealAll = () => {
    if (!opened) return;
    clearTimers();
    setSuspense(false);
    setRevealed(false);
    setIndex(opened.cards.length);
    setPhase('done');
  };

  const count = opened?.cards.length ?? cardsPerPack;
  const top = phase === 'stack' ? opened?.cards[index] : undefined;
  // The card just turned over, which sets off the effects of its rarity
  const shown = top && revealed ? top : undefined;
  const shownRarity = shown?.card.data.rarity;
  const pips = shownRarity ? RARITY_PIPS[shownRarity] : 0;
  const level = pips >= 6 ? 'legendary' : pips >= 5 ? 'high' : 'rare';
  const current = phase === 'stack' ? Math.min(index + 1, count) : phase === 'done' ? count : 0;
  const newCards = opened?.cards.filter((entry) => entry.isNew).length ?? 0;
  const packOn = phase === 'pack' || phase === 'shake' || phase === 'tear' || phase === 'rise';
  const nextPackIn = t('nextPackIn', { time: formatCountdown(remaining) });

  return (
    <main className={styles.stage} data-theme="dark" data-phase={phase}>
      <header className={styles.bar}>
        <ButtonLink href={homeHref} iconOnly aria-label={t('close')} icon={<X aria-hidden />} className={styles.close} />
        <h1 className={styles.title}>{t('stageTitle', { collection: collectionName })}</h1>
        <span className={styles.counter}>
          <span aria-hidden="true">
            {current}/{count}
          </span>
          {phase === 'stack' && <span className="sr-only">{t('counter', { current, count })}</span>}
        </span>
      </header>

      <div className={styles.sceneArea}>
        <div ref={scene} className={styles.scene} style={{ ...SCENE_STYLE, '--card-scale': cardScale } as CSSProperties}>
          {phase === 'stack' && top && !suspense && (
            <p className={styles.hint} aria-hidden="true">
              {revealed ? t('nextHint') : t('turnHint')}
            </p>
          )}

          {phase === 'done' && opened && (
            <div className={styles.done}>
              <h2 id="pack-done" ref={doneHeading} tabIndex={-1}>
                {t('doneHeading')}
              </h2>
              <p>{t('doneSummary', { new: newCards, duplicates: opened.cards.length - newCards })}</p>
            </div>
          )}

          {shownRarity && pips >= 3 && (
            <div key={`burst-${index}`} className={styles.burst} data-rarity={shownRarity} data-level={level} aria-hidden="true">
              <span className={styles.rays} />
              <span className={styles.halo} />
            </div>
          )}

          {(phase === 'rise' || phase === 'stack') && (
            <div className={styles.tray} aria-hidden="true">
              {traySlots(count).map((slot, i) => (
                <span key={i} style={slotStyle(slot)} />
              ))}
            </div>
          )}

          {opened && (
            <ul className={styles.cards} aria-labelledby={phase === 'done' ? 'pack-done' : undefined}>
              {opened.cards.map((entry, i) => {
                const done = phase === 'done';
                const isTop = phase === 'stack' && i === index;
                const faceUp = done || i < index || (isTop && revealed);
                let style: CSSProperties;
                if (phase === 'tear') style = placeStyle(HIDDEN, 20 - i);
                else if (done) style = placeStyle(gridPlace(i, count), 30 + i, i * 0.05);
                else if (i < index) style = placeStyle(trayPlace(i, count), 30 + i);
                else {
                  const depth = i - index;
                  const place = isTop && revealed ? LIFTED : stackPlace(depth, i);
                  style = placeStyle(place, 20 - depth, phase === 'rise' ? (count - 1 - i) * 0.05 : 0);
                }
                return (
                  <li
                    key={`${opened.openingId}-${entry.position}`}
                    className={styles.slot}
                    style={style}
                    data-hidden={phase === 'tear' || undefined}
                    data-face={faceUp ? 'up' : 'down'}
                    data-top={isTop || undefined}
                    // The cards below the top one, or put away, are out of reach
                    // until the end. The top one takes clicks (an inert element
                    // takes none) and hides only its face while turned down.
                    inert={!(done || isTop) || undefined}
                    onClick={isTop ? tap : undefined}
                  >
                    <div className={styles.tilt} data-suspense={(isTop && suspense && (RARITY_PIPS[entry.card.data.rarity] >= 6 ? 'strong' : 'soft')) || undefined}>
                      <div className={styles.flip}>
                        <div className={styles.front} inert={!faceUp || undefined}>
                          <div className={styles.cardScaler}>
                            <Card
                              card={entry.card.data}
                              collection={{ name: collectionName, emblem }}
                              isNew={entry.isNew}
                              copies={entry.card.copies}
                              href={done ? (entry.card.href ?? undefined) : undefined}
                              sizes="260px"
                              priority
                            />
                          </div>
                        </div>
                        <div className={styles.back} aria-hidden="true">
                          <span className={styles.backFrame} />
                          <span className={styles.backEmblem}>
                            <EmblemIcon emblem={emblem} />
                          </span>
                          <span className={styles.backName}>{collectionName}</span>
                          {isTop && suspense && (
                            <span
                              className={styles.glow}
                              data-rarity={entry.card.data.rarity}
                              data-level={RARITY_PIPS[entry.card.data.rarity] >= 6 ? 'legendary' : undefined}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pointer clicks reach the card underneath (its credit button included);
              this button is for the keyboard and screen readers */}
          {top && (
            <button
              ref={cardButton}
              type="button"
              className={styles.cardButton}
              onClick={tap}
              aria-label={revealed ? t('nextCard') : t('turnCard')}
              aria-disabled={suspense || undefined}
            />
          )}

          {shownRarity && pips >= 5 && (
            <div key={`confetti-${index}`} className={styles.confetti} data-rarity={shownRarity} aria-hidden="true">
              {confetti(pips).map((piece, i) => (
                <span
                  key={i}
                  data-bar={piece.bar || undefined}
                  data-tone={piece.tone}
                  style={{ '--dx': piece.dx, '--dy': piece.dy } as CSSProperties}
                />
              ))}
            </div>
          )}

          {shownRarity && pips >= 3 && (
            <div className={styles.banner} aria-hidden="true">
              <span key={`banner-${index}`} data-rarity={shownRarity} data-level={level}>
                {t('rarityBanner', { rarity: tRarity(shownRarity) })}
              </span>
            </div>
          )}

          {packOn && (
            // The button below opens it too, for the keyboard
            <div className={styles.pack} data-empty={!canOpen || undefined} onClick={open} aria-hidden="true">
              <span className={styles.packGlow} />
              <div className={styles.strip}>
                <Scissors />
                {t('tearHere')}
              </div>
              <div className={styles.packBody}>
                <span className={styles.packEmblem}>
                  <EmblemIcon emblem={emblem} />
                </span>
                <span className={styles.packName}>{collectionName}</span>
                <span className={styles.packCount}>{t('cardsInPack', { count: cardsPerPack })}</span>
                <span className={styles.packBand}>{tNav('brand')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {shownRarity && pips >= 6 && <div key={`flash-${index}`} className={styles.flash} aria-hidden="true" />}

      <div className={styles.controls}>
        {error && (
          <Notice tone={error === 'server' ? 'danger' : 'info'}>
            <p>{tGame(`errors.${error}`)}</p>
          </Notice>
        )}

        {(phase === 'pack' || phase === 'shake') && (
          <>
            <Button
              ref={openButton}
              variant="primary"
              size="large"
              block
              onClick={open}
              disabled={!canOpen}
              icon={<PackageOpen aria-hidden />}
            >
              {t('open')}
            </Button>
            <p className={styles.reserve}>{canOpen ? t('packsLeft', { count: Math.max(1, reserve.available) }) : nextPackIn}</p>
            <p className={styles.reserve}>
              <Link href="/odds">{t('odds')}</Link>
            </p>
          </>
        )}

        {(phase === 'tear' || phase === 'rise' || phase === 'stack') && (
          <Button variant="ghost" onClick={revealAll} icon={<FastForward aria-hidden />} className={styles.revealAll}>
            {t('revealAll')}
          </Button>
        )}

        {phase === 'done' && opened && (
          <>
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
            <Button variant="primary" size="large" block onClick={open} disabled={!canOpen} icon={<PackageOpen aria-hidden />}>
              {canOpen ? t('openNext', { count: Math.max(1, reserve.available) }) : t('noPack')}
            </Button>
            {!canOpen && <p className={styles.reserve}>{nextPackIn}</p>}
            <ButtonLink href={collectionHref} block icon={<Layers aria-hidden />}>
              {t('seeCollection')}
            </ButtonLink>
          </>
        )}
      </div>

      {/* Each card is read out as it turns over */}
      <p className="sr-only" aria-live="polite">
        {shown
          ? t('revealed', {
              rarity: tRarity(shown.card.data.rarity),
              name: displayName(shown.card.data.name),
              isNew: shown.isNew ? 'yes' : 'no',
            })
          : ''}
      </p>
    </main>
  );
}
