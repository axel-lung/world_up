'use client';

import { Layers, Package, PackageOpen, Scissors, Trophy, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { EmblemIcon } from '@/components/collection/Emblem';
import { formatCountdown, useCountdown, useRefreshWhenDue } from '@/components/pack/useCountdown';
import { StreakScreen } from '@/components/streak/StreakScreen';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { Emblem } from '@/lib/collection-theme';
import { achievementTitle } from '@/lib/game/achievement-title';
import type { StreakView } from '@/lib/game/streak';
import { RARITY_PIPS } from '@/lib/rarity';
import { openPackAction, type OpenPackResult, type ReserveView } from './actions';
import { CardZoom } from './CardZoom';
import styles from './PackOpener.module.css';
import {
  AWAY,
  CARD,
  CENTER,
  donePlace,
  doneLayout,
  type Place,
  revealOrder,
  SCENE,
  type Spark,
  sparks,
  stackPlace,
  VISIBLE_DEPTH,
} from './stage-layout';

type Opened = Extract<OpenPackResult, { ok: true }>;
// pack: waiting for a touch. charge: the pack shakes harder and harder while
// the server opens it (1 s at least). burst: a flash, and the pack torn open.
// reveal: the player turns the cards over one by one, or reveals them all.
// done: the cards side by side.
type Phase = 'pack' | 'charge' | 'burst' | 'reveal' | 'done';

// The opening plays by itself for 2.1 s, then the cards deal in (0.7 s): under the spec's 3 s
const CHARGE_MS = 1000;
const BURST_MS = 1100;
// The burst's sparks still fly over the stack as it deals in
const BURST_FX_MS = 1600;
// A legendary trembles harder, then turns over with a flash
const BUILD_MS = 750;
// The streak screen comes once the cards of the day's first pack are laid out
const STREAK_DELAY_MS = 900;

// The Card reads best at its grid size: it is laid out this wide, then scaled
// to the scene, text included, as the mock-up does
const CARD_LAYOUT_WIDTH = 160;

const BURST_SPARKS = sparks(26, 3, 300);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function placeStyle(place: Place, z: number): CSSProperties {
  return { '--x': place.x, '--y': place.y, '--s': place.scale, '--r': place.rotate, '--z': z } as CSSProperties;
}

const SCENE_STYLE = {
  '--scene-width': SCENE.width,
  '--scene-height': SCENE.height,
  '--card-left': CENTER.x - CARD.width / 2,
  '--card-top': CENTER.y - CARD.height / 2,
  '--card-width': CARD.width,
} as CSSProperties;

/** Sparks flying off from the middle of their parent, each along its own angle. */
function SparkBurst({ list, className }: { list: Spark[]; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {list.map((spark, i) => (
        <span
          key={i}
          style={{ '--angle': `${spark.angle}deg`, '--distance': spark.distance } as CSSProperties}
        >
          <span
            data-shape={spark.shape}
            data-tone={spark.tone}
            style={
              {
                '--size': spark.size,
                '--duration': `${spark.duration}s`,
                '--delay': `${spark.delay}ms`,
              } as CSSProperties
            }
          />
        </span>
      ))}
    </span>
  );
}

export function PackOpener({
  collection,
  collectionName,
  emblem,
  cardsPerPack,
  closeHref,
  collectionHref,
  initialReserve,
}: {
  collection: string;
  collectionName: string;
  emblem: Emblem;
  cardsPerPack: number;
  /** Where the close button leads: the packs page. */
  closeHref: string;
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
  // The page sent again (once the timer is up, or after an opening) brings a
  // newer reserve, which replaces the one shown unless an opening's is newer
  const [pageReserveAt, setPageReserveAt] = useState(initialReserve.serverNow);
  if (pageReserveAt !== initialReserve.serverNow) {
    setPageReserveAt(initialReserve.serverNow);
    if (Date.parse(initialReserve.serverNow) > Date.parse(reserve.serverNow)) setReserve(initialReserve);
  }
  const [phase, setPhase] = useState<Phase>('pack');
  const [opened, setOpened] = useState<Opened | null>(null);
  // The top card of the stack, whether it is face up, and whether a legendary is about to turn over
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [building, setBuilding] = useState(false);
  // Counts the legendaries turned over: each one flashes the stage
  const [flashes, setFlashes] = useState(0);
  const [burstFx, setBurstFx] = useState(false);
  const [error, setError] = useState<Extract<OpenPackResult, { ok: false }>['error'] | null>(null);
  // At the end, the card shown large (CardZoom)
  const [zoom, setZoom] = useState<number | null>(null);
  // The day's first pack moved the streak on: its screen comes at the end of that pack (or the next one)
  const [streak, setStreak] = useState<{ view: StreakView; open: boolean; shown: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const shownOpening = useRef<number | null>(null);
  const focusOpen = useRef(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const stage = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [cardScale, setCardScale] = useState(1);
  const remaining = useCountdown(reserve.nextPackAt, reserve.serverNow);
  useRefreshWhenDue(reserve.nextPackAt, remaining);
  // The server decides: once the timer is up, a pack has come (the page sent
  // again then gives the reserve's new count)
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
    if (phase === 'reveal') cardButton.current?.focus();
    if (phase === 'done') doneHeading.current?.focus();
    if (phase === 'pack' && focusOpen.current) {
      focusOpen.current = false;
      openButton.current?.focus();
    }
  }, [phase]);

  // The streak screen, once the cards are laid out
  useEffect(() => {
    if (phase !== 'done' || !streak || streak.shown) return;
    const timer = window.setTimeout(
      () => setStreak((current) => current && { ...current, open: true, shown: true }),
      reducedMotion() ? 0 : STREAK_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, streak]);

  const finish = () => {
    clearTimers();
    setBurstFx(false);
    setBuilding(false);
    setRevealed(false);
    setPhase('done');
  };

  // From the closed pack, or straight from the end of the previous one
  const open = async () => {
    if ((phase !== 'pack' && phase !== 'done') || !canOpen) return;
    const reduced = reducedMotion();
    clearTimers();
    setError(null);
    setZoom(null);
    setOpened(null);
    setIndex(0);
    setRevealed(false);
    setBuilding(false);
    setBurstFx(false);
    setPhase('charge');
    const charged = new Promise((resolve) => later(() => resolve(null), reduced ? 0 : CHARGE_MS));
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
    if (result.streak.counted) setStreak({ view: result.streak, open: false, shown: false });
    await charged;
    setOpened({ ...result, cards: revealOrder(result.cards) });
    if (reduced) {
      setPhase('reveal');
      return;
    }
    setPhase('burst');
    setBurstFx(true);
    later(() => setPhase('reveal'), BURST_MS);
    later(() => setBurstFx(false), BURST_FX_MS);
  };

  const tap = () => {
    if (phase !== 'reveal' || building || !opened || index >= opened.cards.length) return;
    if (!revealed) {
      const legendary = RARITY_PIPS[opened.cards[index].card.data.rarity] >= 6;
      if (!legendary || reducedMotion()) {
        setRevealed(true);
        return;
      }
      setBuilding(true);
      later(() => {
        setBuilding(false);
        setRevealed(true);
        setFlashes((count) => count + 1);
        stage.current?.animate(
          [
            { transform: 'none' },
            { transform: 'translate(-8px, 4px)', offset: 0.15 },
            { transform: 'translate(7px, -5px)', offset: 0.3 },
            { transform: 'translate(-5px, 3px)', offset: 0.45 },
            { transform: 'translate(4px, -2px)', offset: 0.6 },
            { transform: 'translate(-2px, 1px)', offset: 0.8 },
            { transform: 'none' },
          ],
          { duration: 550, easing: 'ease-out' },
        );
      }, BUILD_MS);
      return;
    }
    if (index + 1 >= opened.cards.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setRevealed(false);
  };

  const count = opened?.cards.length ?? cardsPerPack;
  const top = phase === 'reveal' ? opened?.cards[index] : undefined;
  const topPips = top ? RARITY_PIPS[top.card.data.rarity] : 0;
  // A legendary face down on top: it glows and trembles before it is touched
  const anticipating = Boolean(top && !revealed && topPips >= 6);
  const isLast = index === count - 1;
  const newCards = opened?.cards.filter((entry) => entry.isNew).length ?? 0;
  const packOn = phase === 'pack' || phase === 'charge' || phase === 'burst';
  const nextPackIn = t('nextPackIn', { time: formatCountdown(remaining) });
  const done = doneLayout(count);
  const shown = top && revealed ? top : undefined;

  const status = !top
    ? ''
    : !revealed
      ? t('counter', { current: index + 1, count })
      : top.isNew
        ? t('newCard')
        : t('duplicate', { copies: top.card.copies });
  const hint = !top
    ? ''
    : !revealed
      ? anticipating
        ? building
          ? '…'
          : t('legendaryHint')
        : t('turnHint')
      : isLast
        ? t('lastHint')
        : t('nextHint');

  return (
    <>
      <main ref={stage} className={styles.stage} data-theme="dark" data-phase={phase}>
        <header className={styles.bar}>
          <ButtonLink href={closeHref} iconOnly aria-label={t('close')} icon={<X aria-hidden />} className={styles.close} />
          <h1 className={styles.title}>{t('stageTitle', { collection: collectionName })}</h1>
          <span className={styles.packs}>
            <Package aria-hidden />
            <span aria-hidden="true">{reserve.available}</span>
            <span className="sr-only">{t('packsLeft', { count: reserve.available })}</span>
          </span>
        </header>

        <div className={styles.sceneArea}>
          <div ref={scene} className={styles.scene} style={{ ...SCENE_STYLE, '--card-scale': cardScale } as CSSProperties}>
            {packOn && (
              <div className={styles.packArea} aria-hidden="true">
                <span className={styles.halo} />
                {phase !== 'pack' && (
                  <span className={styles.packRays}>
                    <span />
                  </span>
                )}
                {phase !== 'burst' && (
                  <span className={styles.orbit}>
                    {['n', 'e', 's', 'w', 'ne', 'sw'].map((point) => (
                      <span key={point} data-point={point} />
                    ))}
                  </span>
                )}
                {/* The button below opens it too, for the keyboard */}
                <div className={styles.pack} data-empty={!canOpen || undefined} onClick={open}>
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
                  {phase === 'charge' && <span className={styles.crack} />}
                </div>
              </div>
            )}

            {burstFx && (
              <div className={styles.burst} aria-hidden="true">
                <span className={styles.ring} />
                <span className={styles.ring} data-second />
                <SparkBurst list={BURST_SPARKS} className={styles.sparks} />
              </div>
            )}

            {phase === 'done' && opened && (
              <div
                className={styles.done}
                style={{ '--heading-bottom': done.headingBottom } as CSSProperties}
              >
                <h2 id="pack-done" ref={doneHeading} tabIndex={-1}>
                  {t('doneHeading')}
                </h2>
                <p>{t('doneSummary', { new: newCards, duplicates: opened.cards.length - newCards, coins: opened.coins })}</p>
              </div>
            )}

            {phase === 'done' && opened && (
              // Under the last row of cards, in the room the grid leaves
              <p className={styles.zoomHint} style={{ '--hint-top': done.hintTop } as CSSProperties}>
                {t('zoomHint')}
              </p>
            )}

            {opened && phase !== 'burst' && (
              <ul
                key={opened.openingId}
                className={styles.cards}
                aria-labelledby={phase === 'done' ? 'pack-done' : undefined}
              >
                {opened.cards.map((entry, i) => {
                  const isDone = phase === 'done';
                  const isTop = phase === 'reveal' && i === index;
                  const faceUp = isDone || i < index || (isTop && revealed);
                  const depth = i - index;
                  const rarity = entry.card.data.rarity;
                  const pips = RARITY_PIPS[rarity];
                  // The card just turned over, and the one just thrown off, keep their effects as they go
                  const effects = phase === 'reveal' && faceUp && (i === index || i === index - 1);
                  const place = isDone ? donePlace(i, count) : depth < 0 ? AWAY : stackPlace(depth);
                  return (
                    <li
                      key={`${opened.openingId}-${entry.position}`}
                      className={styles.slot}
                      style={{ ...placeStyle(place, isDone ? 30 + i : 20 - Math.abs(depth)), '--order': i } as CSSProperties}
                      data-away={(!isDone && depth < 0) || undefined}
                      data-deep={(!isDone && depth > VISIBLE_DEPTH) || undefined}
                      data-face={faceUp ? 'up' : 'down'}
                      data-top={isTop || undefined}
                      data-rarity={rarity}
                      // The cards below the top one, or thrown off, are out of reach
                      // until the end. The top one takes clicks (an inert element
                      // takes none) and hides only its face while turned down.
                      inert={!(isDone || isTop) || undefined}
                      data-zoomable={isDone || undefined}
                      // At the end, a touch shows the card large
                      onClick={isTop ? tap : isDone ? () => setZoom(i) : undefined}
                    >
                      {isTop && anticipating && <span className={styles.suspense} aria-hidden="true" />}
                      {effects && (
                        <span className={styles.effects} aria-hidden="true">
                          <span className={styles.glow} />
                          {pips >= 4 && (
                            <span className={styles.cardRays}>
                              <span />
                            </span>
                          )}
                          <SparkBurst
                            list={sparks(pips >= 6 ? 30 : pips >= 4 ? 20 : 12, i * 31 + 7, pips >= 6 ? 260 : 190)}
                            className={styles.cardSparks}
                          />
                          <span className={styles.stamp}>
                            <span>{pips >= 6 ? t('rarityBanner', { rarity: tRarity(rarity) }) : tRarity(rarity)}</span>
                          </span>
                        </span>
                      )}
                      <div className={styles.tilt} data-suspense={isTop && anticipating ? (building ? 'strong' : 'soft') : undefined}>
                        <div className={styles.flip}>
                          <div className={styles.front} inert={!faceUp || undefined}>
                            <div className={styles.cardScaler}>
                              <Card
                                card={entry.card.data}
                                collection={{ name: collectionName, emblem }}
                                isNew={entry.isNew}
                                copies={entry.card.copies}
                                sizes="260px"
                                priority
                              />
                            </div>
                          </div>
                          <div className={styles.back} aria-hidden="true">
                            <span className={styles.backFrame} />
                            <span className={styles.backDiamond} data-side="top" />
                            <span className={styles.backDiamond} data-side="bottom" />
                            <span className={styles.backEmblem}>
                              <EmblemIcon emblem={emblem} />
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Pointer touches reach the card (its credit button included); this button is for the keyboard */}
                      {isDone && (
                        <button
                          type="button"
                          className={styles.zoomButton}
                          aria-label={t('zoomCard', { name: displayName(entry.card.data.name) })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setZoom(i);
                          }}
                        />
                      )}
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
                aria-label={revealed ? (isLast ? t('lastCard') : t('nextCard')) : t('turnCard')}
                aria-disabled={building || undefined}
              />
            )}
          </div>
        </div>

        {flashes > 0 && phase === 'reveal' && <div key={flashes} className={styles.legendFlash} aria-hidden="true" />}
        {phase === 'burst' && <div className={styles.whiteout} aria-hidden="true" />}

        <div className={styles.controls}>
          {error && (
            <Notice tone={error === 'server' ? 'danger' : 'info'}>
              <p>{tGame(`errors.${error}`)}</p>
            </Notice>
          )}

          {(phase === 'pack' || phase === 'charge') && (
            <>
              <Button
                ref={openButton}
                variant="primary"
                size="large"
                block
                className={styles.main}
                onClick={open}
                disabled={!canOpen}
                aria-disabled={phase === 'charge' || undefined}
                data-busy={phase === 'charge' || undefined}
                icon={<PackageOpen aria-hidden />}
              >
                {t('open')}
              </Button>
              <p className={styles.hint}>{canOpen ? t('touchPack') : nextPackIn}</p>
            </>
          )}

          {(phase === 'burst' || phase === 'reveal') && (
            <>
              <p className={styles.status}>{status}</p>
              <div className={styles.dots} aria-hidden="true">
                {Array.from({ length: count }, (_, i) => (
                  <span key={i} data-current={(phase === 'reveal' && i === index) || undefined} data-seen={(phase === 'reveal' && i <= index) || undefined} />
                ))}
              </div>
              <p className={styles.hint} aria-hidden="true">
                {hint}
              </p>
              <button type="button" className={styles.revealAll} onClick={finish}>
                {t('revealAll')}
              </button>
            </>
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
              <Button
                variant="primary"
                size="large"
                block
                className={styles.main}
                onClick={open}
                disabled={!canOpen}
                icon={<PackageOpen aria-hidden />}
              >
                {canOpen ? t('openNext', { count: Math.max(1, reserve.available) }) : t('noPack')}
              </Button>
              {!canOpen && <p className={styles.hint}>{nextPackIn}</p>}
              <ButtonLink href={collectionHref} variant="ghost" block className={styles.outline} icon={<Layers aria-hidden />}>
                {t('seeCollection')}
              </ButtonLink>
            </>
          )}
        </div>

        {phase === 'done' && opened && (
          <CardZoom cards={opened.cards} index={zoom} onIndexChange={setZoom} collection={{ name: collectionName, emblem }} />
        )}

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

      {/* Outside the dark stage: the streak screen follows the player's theme */}
      {streak && (
        <StreakScreen
          view={streak.view}
          open={streak.open}
          onClose={() => setStreak((current) => current && { ...current, open: false })}
        />
      )}
    </>
  );
}
