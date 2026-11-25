'use client';

import { Bandage, Check, Flame, Gift, Snowflake } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { Button } from '@/components/ui/Button';
import { playEffect } from '@/lib/effects';
import type { GameErrorCode } from '@/lib/game/game-error';
import type { StreakView } from '@/lib/game/streak';
import { repairStreakAction } from '@/lib/game/streak-actions';
import styles from './StreakScreen.module.css';
import { dayState, noon } from './week';

// The history entry the open screen adds, so that Back closes it
const MARK = 'worldupStreak';

// A day string ("2026-11-16") as an instant inside that day, wherever the browser is

/**
 * The daily streak over the whole screen (MobileB.dc.html, "B · Série"): the
 * flame, the days in a row, this week from Monday to Sunday and the next
 * milestone. After the opening that counted today (`view.counted`), the number
 * rolls on from the day before. On the day the streak broke, it offers the
 * repair (given `collection`), after which the number rolls on to the
 * repaired streak. A native modal <dialog>: the focus stays inside and goes
 * back where it was; Continue, Escape and Back (opening adds a history entry,
 * for the phone's button) close it.
 */
export function StreakScreen({
  view: given,
  open,
  onClose,
  collection,
}: {
  view: StreakView;
  open: boolean;
  onClose: () => void;
  /** The collection's slug, for the repair; without it, none is offered. */
  collection?: string;
}) {
  const t = useTranslations('Streak');
  const tGame = useTranslations('Game');
  const format = useFormatter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const isMarked = useCallback(() => window.history.state?.[MARK] === id, [id]);
  // The streak once repaired here, until the page gives a newer one
  const [repaired, setRepaired] = useState<{ from: StreakView; view: StreakView } | null>(null);
  const [repairError, setRepairError] = useState<GameErrorCode | 'server' | null>(null);
  const [repairing, startRepair] = useTransition();
  const isRepaired = repaired?.from === given;
  const view = isRepaired ? repaired.view : given;

  const repair = () => {
    if (!collection || repairing) return;
    setRepairError(null);
    startRepair(async () => {
      const result = await repairStreakAction({ collection });
      if (!result.ok) {
        setRepairError(result.error);
        return;
      }
      setRepaired({ from: given, view: result.streak });
      playEffect('streak');
    });
  };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      if (given.counted && given.before !== given.days) playEffect('streak');
      window.history.pushState({ ...window.history.state, [MARK]: id }, '');
    }
    if (!open && element.open) element.close();
  }, [open, id, given]);

  // Back, from the phone's button, the browser's or Continue
  useEffect(() => {
    const onPopState = () => {
      if (!isMarked()) dialog.current?.close();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMarked]);

  const close = () => {
    if (isMarked()) window.history.back();
    else dialog.current?.close();
  };
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // Escape: closed the same way as by the button
    event.preventDefault();
    close();
  };

  const celebrate = view.counted && view.before !== view.days;
  const today = view.week.find((day) => day.today)?.day ?? '';
  const offer = collection ? view.repair : null;
  const lead = view.days === 0 ? (offer ? 'broken' : 'start') : view.playedToday ? 'tomorrow' : 'today';

  return (
    <dialog
      ref={dialog}
      data-repaired={isRepaired || undefined}
      className={styles.screen}
      aria-labelledby={`${id}-title`}
      data-celebrate={celebrate || undefined}
      onCancel={onCancel}
      onClose={onClose}
    >
      <span className={styles.disc} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.medal} aria-hidden="true">
          <span className={styles.rays} />
          <span className={styles.badge} />
          {[0, 90, 180, 270].map((turn) => (
            <span key={turn} className={styles.leaf} style={{ '--turn': `${turn}deg` } as CSSProperties} data-turn={turn}>
              <span />
            </span>
          ))}
          <span className={styles.core}>
            <Flame />
          </span>
          {['top', 'bottom', 'left', 'right'].map((side) => (
            <span key={side} className={styles.diamond} data-side={side} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((ember) => (
            <span key={ember} className={styles.ember} data-ember={ember} />
          ))}
        </div>

        {/* A new key once repaired: the number rolls on again */}
        <div className={styles.heading} key={isRepaired ? 'repaired' : 'given'}>
          <h2 id={`${id}-title`} className={styles.title}>
            <span className={styles.count}>
              {celebrate && (
                <span className={styles.before} aria-hidden="true">
                  {format.number(view.before)}
                </span>
              )}
              <span className={styles.days}>{format.number(view.days)}</span>
            </span>{' '}
            <span className={styles.unit}>{t('unit', { days: view.days })}</span>
          </h2>
          <p className={styles.lead}>{t('lead', { state: lead, next: view.days + 1 })}</p>
        </div>

        <div className={styles.card}>
          <ol className={styles.week} aria-label={t('week')}>
            {view.week.map((day) => {
              const state = dayState(day, today);
              return (
                <li key={day.day} data-state={state}>
                  <span className={styles.dayLabel} aria-hidden="true">
                    {format.dateTime(noon(day.day), { weekday: 'narrow', timeZone: 'Europe/Paris' })}
                  </span>
                  <span className={styles.dayMark} aria-hidden="true">
                    {state === 'played' && <Check />}
                    {state === 'graced' && <Snowflake />}
                    {state === 'frozen' && <Bandage />}
                    {state === 'today' && (
                      <span className={styles.flame}>
                        <Flame />
                      </span>
                    )}
                  </span>
                  <span className="sr-only">
                    {t('day', { day: format.dateTime(noon(day.day), { weekday: 'long', timeZone: 'Europe/Paris' }), state })}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className={styles.grace}>{t(view.graceUsed ? 'graceUsed' : 'graceLeft')}</p>
          {offer && (
            <div className={styles.repair}>
              <span className={styles.repairIcon} aria-hidden="true">
                <Bandage />
              </span>
              <div className={styles.repairText}>
                <p className={styles.repairTitle}>{t('repair.title', { days: offer.days })}</p>
                <p>{t('repair.body')}</p>
                <Button
                  variant="primary"
                  block
                  onClick={repair}
                  disabled={!offer.affordable || repairing}
                  aria-describedby={offer.affordable ? undefined : `${id}-short`}
                >
                  {t('repair.button', { coins: offer.coins })}
                </Button>
                {!offer.affordable && (
                  <p id={`${id}-short`} className={styles.repairNote}>
                    {t('repair.notEnough', { coins: offer.coins })}
                  </p>
                )}
                {repairError && (
                  <p className={styles.repairNote} role="alert">
                    {repairError === 'server' ? t('repair.failed') : tGame(`errors.${repairError}`)}
                  </p>
                )}
              </div>
            </div>
          )}
          {view.bonusPacks > 0 && (
            <p className={styles.reward} data-won>
              <span className={styles.gift} aria-hidden="true">
                <Gift />
              </span>
              <span className={styles.rewardText}>{t('bonus', { packs: view.bonusPacks })}</span>
            </p>
          )}
          {view.next && (
            <div className={styles.reward}>
              <span className={styles.gift} aria-hidden="true">
                <Gift />
              </span>
              <span className={styles.rewardText}>
                <span>{t('next', { left: view.next.days - view.days, packs: view.next.packs })}</span>
                <span className={styles.bar} aria-hidden="true">
                  <span style={{ width: `${Math.round(view.next.progress * 100)}%` }} />
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      <div className={styles.foot}>
        {/* The dialog's one action: showModal() puts the focus on it */}
        <Button variant="sticker" size="large" block onClick={close} autoFocus>
          {t('continue')}
        </Button>
      </div>
    </dialog>
  );
}
