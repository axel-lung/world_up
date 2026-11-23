'use client';

import {
  ArrowUpRight,
  CalendarCheck,
  Clock,
  Crosshair,
  EyeOff,
  Footprints,
  Hand,
  Layers,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MapPinOff,
  RotateCw,
  Route,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trophy,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Card } from '@/components/card/Card';
import { visitDay } from '@/components/card/card-format';
import { EmblemIcon } from '@/components/collection/Emblem';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { Emblem } from '@/lib/collection-theme';
import { playEffect } from '@/lib/effects';
import { achievementTitle } from '@/lib/game/achievement-title';
import { visitAction, type VisitResult } from '@/lib/game/visit-actions';
import type { VisitRefusal } from '@/lib/game/visits';
import { roundedDistance } from '@/lib/map/geo';
import { isNativeApp } from '@/lib/native-app';
import { directionsUrl } from './directions';
import styles from './VisitFlow.module.css';

// "Je suis ici" (Claude Design, "Carte - Je suis ici" and "Carte - Refus Je
// suis ici"): why the position, the search with its accuracy, then the
// server's answer, a refusal or the card unlocked.

// The history entry the open flow adds, so that Back closes it
const MARK = 'worldupVisit';
// Remembered on this device once "Continuer" was touched: the next visits go straight to the search
const INTRO_KEY = 'worldup-visit-intro';
// Without a position precise enough by then, the search gives up
const SEARCH_MS = 20_000;

export interface VisitTarget {
  /** The card's ID. */
  id: number;
  /** As the card shows it. */
  name: string;
  lat: number;
  lon: number;
  /** The card's page, once the player owns it. */
  cardHref: string | null;
}

type Refusal =
  | VisitRefusal
  | { reason: 'denied' }
  | { reason: 'unavailable'; required: number }
  | { reason: 'error' }
  | { reason: 'gone' };

type Unlocked = Extract<VisitResult, { ok: true }>['visit'];

type Step =
  | { kind: 'why' }
  | { kind: 'search'; accuracy: number | null; sending: boolean }
  /** `at`: when the answer came, for the waits it names. */
  | { kind: 'refused'; refusal: Refusal; at: number }
  | { kind: 'done'; visit: Unlocked };

function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberIntro() {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Private browsing: the reason is shown again next time
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The accuracy bar: ± 1 km at its left end, ± 5 m at its right, on a log scale
const barAt = (metres: number) => Math.max(0, Math.min(100, 100 - (Math.log(Math.max(metres, 5) / 5) / Math.log(200)) * 100));

/**
 * The flow behind "Je suis ici", on one native modal <dialog>: a bottom sheet
 * for the reason (first time on this device), the search and the refusals,
 * the whole screen for the card unlocked. The position is asked when the
 * player touches "Je suis ici" or "Continuer", sent once to the server, which
 * checks it and forgets it. Back, Escape and the close buttons close it.
 * Mounted for one visit: the map renders it while `target` is set.
 */
export function VisitFlow({
  collection,
  target,
  required,
  onClose,
  onVisited,
}: {
  collection: { slug: string; name: string; emblem: Emblem };
  target: VisitTarget;
  /** The accuracy the server demands, in metres. */
  required: number;
  onClose: () => void;
  /** The card is unlocked: the map draws its pin again. */
  onVisited: (cardId: number) => void;
}) {
  const t = useTranslations('Visit');
  const tMap = useTranslations('Map');
  const tAchievement = useTranslations('Achievements');
  const tRarity = useTranslations('Rarity');
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const watch = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  // Bumped by each search and by closing: a late position or answer is dropped
  const run = useRef(0);
  const best = useRef<GeolocationCoordinates | null>(null);
  // Until a search ends or the player acts, the opening starts one by itself
  const autoStart = useRef(true);
  // The first step: the reason, or straight to the search once it was read on this device
  const seen = useSyncExternalStore(
    () => () => undefined,
    introSeen,
    () => false,
  );
  const [step, setStep] = useState<Step | null>(null);
  const view: Step = step ?? (seen ? { kind: 'search', accuracy: null, sending: false } : { kind: 'why' });

  const isMarked = useCallback(() => window.history.state?.[MARK] === id, [id]);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    if (timer.current !== null) window.clearTimeout(timer.current);
    watch.current = null;
    timer.current = null;
  }, []);

  const refuse = useCallback((refusal: Refusal) => {
    autoStart.current = false;
    setStep({ kind: 'refused', refusal, at: Date.now() });
  }, []);

  const send = useCallback(
    (coords: GeolocationCoordinates, mine: number) => {
      autoStart.current = false;
      setStep({ kind: 'search', accuracy: coords.accuracy, sending: true });
      visitAction({
        collection: collection.slug,
        cardId: target.id,
        lat: coords.latitude,
        lon: coords.longitude,
        accuracy: coords.accuracy,
      })
        .then((result) => {
          if (run.current !== mine) return;
          if (result.ok) {
            setStep({ kind: 'done', visit: result.visit });
            onVisited(target.id);
            // When the stamp comes down
            window.setTimeout(() => playEffect('stamp'), reducedMotion() ? 0 : 1900);
          } else if ('refusal' in result) {
            refuse(result.refusal);
          } else {
            refuse({ reason: result.error === 'gone' ? 'gone' : 'error' });
          }
        })
        .catch(() => {
          if (run.current === mine) refuse({ reason: 'error' });
        });
    },
    [collection.slug, target.id, onVisited, refuse],
  );

  /** Watches the device's position until one is precise enough, or the time runs out. */
  const watchPosition = useCallback(() => {
    stop();
    const mine = ++run.current;
    best.current = null;
    timer.current = window.setTimeout(() => {
      if (run.current !== mine) return;
      stop();
      refuse(
        best.current
          ? { reason: 'imprecise', accuracy: Math.round(best.current.accuracy), required }
          : { reason: 'unavailable', required },
      );
    }, SEARCH_MS);
    if (!('geolocation' in navigator)) return;
    watch.current = navigator.geolocation.watchPosition(
      (found) => {
        if (run.current !== mine) return;
        const coords = found.coords;
        if (!best.current || coords.accuracy < best.current.accuracy) best.current = coords;
        if (coords.accuracy <= required) {
          stop();
          send(coords, mine);
        } else {
          setStep({ kind: 'search', accuracy: best.current.accuracy, sending: false });
        }
      },
      (error) => {
        if (run.current !== mine) return;
        if (error.code === error.PERMISSION_DENIED) {
          stop();
          refuse({ reason: 'denied' });
        }
        // Not found yet: the watch goes on until the time runs out
      },
      // A fresh position, never one the device kept from earlier
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }, [required, refuse, send, stop]);

  const search = () => {
    setStep({ kind: 'search', accuracy: null, sending: false });
    watchPosition();
  };

  // Opened on mounting. The search starts at once when the reason was already
  // read, and again after a remount (React's development checks) stopped it.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) {
      element.showModal();
      window.history.pushState({ ...window.history.state, [MARK]: id }, '');
    }
    if (autoStart.current && timer.current === null && introSeen()) watchPosition();
  }, [id, watchPosition]);

  // Back, from the phone's button, the browser's or a close button
  useEffect(() => {
    const onPopState = () => {
      if (!isMarked()) dialog.current?.close();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMarked]);

  // Unmounted: no position nor answer is awaited any more
  useEffect(
    () => () => {
      run.current++;
      stop();
    },
    [stop],
  );

  const close = () => {
    if (isMarked()) window.history.back();
    else dialog.current?.close();
  };
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // Escape: closed the same way as by the buttons
    event.preventDefault();
    close();
  };
  const onClosed = () => {
    run.current++;
    stop();
    onClose();
  };
  // A tap on the shade around a sheet closes it; the card unlocked fills the screen
  const onShade = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current && view.kind !== 'done') close();
  };

  const distance = (metres: number) => {
    const { value, unit } = roundedDistance(metres);
    return unit === 'm' ? tMap('metres', { value }) : tMap('kilometres', { value });
  };
  const titleId = `${id}-title`;

  let content: ReactNode;
  switch (view.kind) {
    case 'why':
      content = (
        <>
          <div className={styles.whyArt} aria-hidden="true">
            <span className={styles.whyDisc} />
            <span className={styles.whyPin}>
              <MapPin />
            </span>
            <span className={styles.whyShield}>
              <ShieldCheck />
            </span>
          </div>
          <h2 id={titleId} className={styles.title}>
            {t('why.title')}
          </h2>
          <p className={styles.lead}>{t('why.text')}</p>
          <ul className={styles.points}>
            <li>
              <Hand aria-hidden />
              <span>{t('why.onTap')}</span>
            </li>
            <li>
              <CalendarCheck aria-hidden />
              <span>{t('why.kept')}</span>
            </li>
            <li>
              <EyeOff aria-hidden />
              <span>{t('why.friends')}</span>
            </li>
          </ul>
          <div className={styles.actions}>
            <Button
              variant="sticker"
              size="large"
              block
              onClick={() => {
                rememberIntro();
                search();
              }}
            >
              {t('why.continue')}
            </Button>
            <span className={styles.hint}>{t('why.permission')}</span>
            <Button variant="ghost" block onClick={close}>
              {t('why.later')}
            </Button>
          </div>
        </>
      );
      break;

    case 'search': {
      const known = view.accuracy !== null;
      const good = known && view.accuracy! <= required;
      content = (
        <>
          <div className={styles.radar} aria-hidden="true">
            <span className={styles.ring} />
            <span className={styles.ring} data-late />
            <span
              className={styles.spread}
              style={{ inset: `${known ? Math.round(Math.min(56, 20 + view.accuracy! / 4)) : 56}px` }}
            />
            <span className={styles.locate}>
              <LocateFixed />
            </span>
          </div>
          <h2 id={titleId} className={`${styles.title} ${styles.centered}`}>
            {t('search.title')}
          </h2>
          <div className={styles.panel}>
            <div className={styles.precision}>
              <span className={styles.precisionLabel}>{t('search.precision')}</span>
              <span className={styles.precisionValue}>
                {known ? t('search.accuracy', { metres: Math.round(view.accuracy!) }) : t('search.none')}
              </span>
            </div>
            <div
              className={styles.bar}
              role="meter"
              aria-label={t('search.barLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={known ? Math.round(barAt(view.accuracy!)) : 0}
              aria-valuetext={known ? t('search.accuracy', { metres: Math.round(view.accuracy!) }) : t('search.none')}
            >
              <span className={styles.fill} data-good={good || undefined} style={{ width: `${known ? Math.max(4, barAt(view.accuracy!)) : 0}%` }} />
              <span className={styles.mark} style={{ left: `${barAt(required)}%` }} />
            </div>
            <div className={styles.scale} aria-hidden="true">
              <span>{t('search.far')}</span>
              <span className={styles.scaleMark} style={{ left: `${barAt(required)}%` }}>
                {t('search.accuracy', { metres: required })}
              </span>
              <span>{t('search.near')}</span>
            </div>
            <p role="status" className={styles.status}>
              {!known ? t('search.waiting') : good || view.sending ? t('search.good') : t('search.notYet')}
            </p>
          </div>
          <Button block onClick={close}>
            {t('search.cancel')}
          </Button>
        </>
      );
      break;
    }

    case 'refused':
      content = (
        <RefusalPanel
          refusal={view.refusal}
          at={view.at}
          target={target}
          titleId={titleId}
          distance={distance}
          onRetry={search}
          onClose={close}
        />
      );
      break;

    case 'done': {
      const { visit } = view;
      content = (
        <>
          <span className={styles.rays} aria-hidden="true">
            <span />
          </span>
          <header className={styles.doneHead}>
            <button type="button" className={styles.round} aria-label={t('done.close')} onClick={close}>
              <X aria-hidden />
            </button>
            <span className={styles.kicker}>{t('label')}</span>
          </header>
          <p role="status" className="sr-only">
            {t('done.status', { name: target.name, date: visitDay(visit.visitedAt) })}
          </p>
          <div className={styles.doneBody}>
            <div className={styles.flip}>
              <div className={styles.flipInner}>
                <div className={styles.cardBack} aria-hidden="true">
                  <span>
                    <EmblemIcon emblem={collection.emblem} />
                  </span>
                </div>
                <div className={styles.cardFront}>
                  {/* The grid's size: a large card wants 300 px, more than a phone leaves with the texts */}
                  <Card
                    card={visit.card.data}
                    collection={collection}
                    copies={visit.card.copies}
                    visitedAt={visit.card.visitedAt}
                    sizes="248px"
                    priority
                  />
                </div>
              </div>
              <span className={styles.spark} data-spark="1" aria-hidden="true">
                <Sparkles />
              </span>
              <span className={styles.spark} data-spark="2" aria-hidden="true">
                <Sparkles />
              </span>
            </div>
            <div className={styles.doneText}>
              <h2 id={titleId} className={styles.doneTitle}>
                {t('done.title')}
              </h2>
              <p>{visit.isNew ? t('done.new') : t('done.more', { copies: visit.copies })}</p>
              <ul className={styles.chips}>
                <li data-tone="sage">
                  <Stamp aria-hidden />
                  {t('done.visits', { count: visit.visits })}
                </li>
                <li>
                  <CalendarCheck aria-hidden />
                  {t('done.left', { count: visit.leftToday })}
                </li>
                {visit.achievements.map((achievement) => (
                  <li key={achievement.code} data-tone="accent">
                    <Trophy aria-hidden />
                    {t('done.achievement', { title: achievementTitle(tAchievement, tRarity, achievement) })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className={styles.doneActions}>
            {visit.card.href && (
              <ButtonLink
                href={visit.card.href}
                replace
                variant="sticker"
                size="large"
                block
                icon={<Layers aria-hidden />}
                onClick={() => dialog.current?.close()}
              >
                {t('done.seeCard')}
              </ButtonLink>
            )}
            <Button block icon={<MapIcon aria-hidden />} onClick={close}>
              {t('done.backToMap')}
            </Button>
          </div>
        </>
      );
      break;
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.flow}
      data-step={view.kind}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onClose={onClosed}
      onClick={onShade}
    >
      <div className={styles.sheet}>
        {view.kind !== 'done' && <span className={styles.handle} aria-hidden="true" />}
        {content}
      </div>
    </dialog>
  );
}

/** What a hour-and-minutes wait reads: "6 h 12" or "12 min". */
function useWait() {
  const t = useTranslations('Visit');
  return (until: Date, from: number) => {
    const minutes = Math.max(1, Math.ceil((until.getTime() - from) / 60_000));
    const hours = Math.floor(minutes / 60);
    return hours > 0
      ? t('waitHours', { hours, minutes: String(minutes % 60).padStart(2, '0') })
      : t('waitMinutes', { minutes });
  };
}

/**
 * A refusal (Claude Design, "Carte - Refus Je suis ici"): a sticker that
 * sets the tone, what happened as the title, what the player can do, then
 * the main action. None counts as a visit.
 */
function RefusalPanel({
  refusal,
  at,
  target,
  titleId,
  distance,
  onRetry,
  onClose,
}: {
  refusal: Refusal;
  at: number;
  target: VisitTarget;
  titleId: string;
  distance: (metres: number) => string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Visit.refusal');
  const tVisit = useTranslations('Visit');
  const wait = useWait();
  const retry = (
    <Button variant="sticker" size="large" block icon={<RotateCw aria-hidden />} onClick={onRetry}>
      {t('retry')}
    </Button>
  );
  const later = (
    <Button variant="ghost" block onClick={onClose}>
      {t('later')}
    </Button>
  );
  const understood = (
    <Button variant="sticker" size="large" block onClick={onClose}>
      {t('understood')}
    </Button>
  );
  const tips = [t('imprecise.step1'), t('imprecise.step2'), t('imprecise.step3')];

  let tone: 'accent' | 'warning' | 'sage' | 'neutral' | 'danger';
  let icon: ReactNode;
  let kicker: string;
  let title: string;
  let body: string;
  let steps: string[] = [];
  let meter: { radius: number } | null = null;
  let actions: ReactNode;

  switch (refusal.reason) {
    case 'tooFar':
      tone = 'accent';
      icon = <Footprints />;
      kicker = t('tooFar.kicker', { name: target.name, distance: distance(refusal.distance) });
      title = t('tooFar.title', { remaining: distance(refusal.distance - refusal.radius) });
      body = t('tooFar.body', { radius: distance(refusal.radius) });
      meter = { radius: refusal.radius };
      actions = (
        <>
          <ButtonLink
            href={directionsUrl([target.lat, target.lon], target.name)}
            target="_blank"
            rel="noopener"
            prefetch={false}
            variant="sticker"
            size="large"
            block
            icon={<Route aria-hidden />}
          >
            {t('directions')}
            <ArrowUpRight aria-hidden className={styles.external} />
          </ButtonLink>
          <Button block icon={<RotateCw aria-hidden />} onClick={onRetry}>
            {t('retry')}
          </Button>
        </>
      );
      break;
    case 'imprecise':
      tone = 'warning';
      icon = <Crosshair />;
      kicker = t('imprecise.kicker');
      title = t('imprecise.title', { accuracy: distance(refusal.accuracy) });
      body = t('imprecise.body', { required: refusal.required });
      steps = tips;
      actions = (
        <>
          {retry}
          {later}
        </>
      );
      break;
    case 'unavailable':
      tone = 'warning';
      icon = <Crosshair />;
      kicker = t('unavailable.kicker');
      title = t('unavailable.title');
      body = t('imprecise.body', { required: refusal.required });
      steps = tips;
      actions = (
        <>
          {retry}
          {later}
        </>
      );
      break;
    case 'alreadyVisited':
      tone = 'sage';
      icon = <Stamp />;
      kicker = target.name;
      title = t('alreadyVisited.title', { date: visitDay(refusal.visitedAt) });
      body = t('alreadyVisited.body');
      actions = (
        <>
          {target.cardHref && (
            <ButtonLink href={target.cardHref} replace variant="sticker" size="large" block icon={<Layers aria-hidden />}>
              {tVisit('done.seeCard')}
            </ButtonLink>
          )}
          <Button variant="ghost" block onClick={onClose}>
            {t('close')}
          </Button>
        </>
      );
      break;
    case 'dailyLimit':
      tone = 'neutral';
      icon = <Clock />;
      kicker = t('dailyLimit.kicker', { limit: refusal.limit });
      title = t('dailyLimit.title');
      body = t('dailyLimit.body', { limit: refusal.limit, wait: wait(refusal.retryAt, at) });
      actions = understood;
      break;
    case 'tooSoon':
      tone = 'neutral';
      icon = <Clock />;
      kicker = t('tooSoon.kicker');
      title = t('tooSoon.title', { wait: wait(refusal.retryAt, at) });
      body = t('tooSoon.body');
      actions = understood;
      break;
    case 'denied':
      tone = 'danger';
      icon = <MapPinOff />;
      kicker = t('denied.kicker');
      title = t('denied.title');
      body = t('denied.body');
      steps = isNativeApp()
        ? [t('denied.app1'), t('denied.app2'), t('denied.app3'), t('denied.app4')]
        : [t('denied.web1'), t('denied.web2'), t('denied.web3')];
      actions = (
        <>
          {retry}
          {later}
        </>
      );
      break;
    case 'gone':
      tone = 'neutral';
      icon = <TriangleAlert />;
      kicker = t('kicker');
      title = t('gone.title');
      body = t('gone.body');
      actions = (
        <Button variant="sticker" size="large" block onClick={onClose}>
          {t('close')}
        </Button>
      );
      break;
    case 'error':
      tone = 'neutral';
      icon = <TriangleAlert />;
      kicker = t('kicker');
      title = t('error.title');
      body = t('error.body');
      actions = (
        <>
          {retry}
          {later}
        </>
      );
      break;
  }

  return (
    <>
      <div className={styles.refusalHead}>
        <span className={styles.refusalIcon} data-tone={tone} aria-hidden="true">
          {icon}
        </span>
        <button type="button" className={styles.round} aria-label={t('close')} onClick={onClose}>
          <X aria-hidden />
        </button>
      </div>
      <div className={styles.refusalTitles}>
        <span className={styles.kicker}>{kicker}</span>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </div>
      <p className={styles.lead}>{body}</p>
      {meter && (
        <div className={styles.meter} aria-hidden="true">
          <div className={styles.meterTrack}>
            <span className={styles.meterLine} />
            <span className={styles.meterZone} />
            <span className={styles.meterYou} />
            <span className={styles.meterMonument}>
              <MapPin />
            </span>
          </div>
          <div className={styles.meterLabels}>
            <span>{t('tooFar.you')}</span>
            <span className={styles.meterZoneLabel}>{t('tooFar.zone', { radius: distance(meter.radius) })}</span>
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <ol className={styles.steps}>
          {steps.map((text, index) => (
            <li key={text}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.actions}>{actions}</div>
    </>
  );
}
