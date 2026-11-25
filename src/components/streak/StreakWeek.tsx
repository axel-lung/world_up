import { Bandage, Check, Dot, Flame, PackageOpen, ShieldCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { StreakView } from '@/lib/game/streak';
import { dayState, noon } from './week';
import styles from './StreakWeek.module.css';

/**
 * The streak on the packs page (App Vitrail - Paquets.dc.html): a panel of
 * moss glass with the days in a row, the days left to the next bonus, this
 * week from Monday to Sunday as lozenges, and what to do today. The streak's
 * screen (StreakScreen) tells the rest.
 */
export function StreakWeek({ view }: { view: StreakView }) {
  const t = useTranslations('Streak');
  const tPacks = useTranslations('Packs');
  const format = useFormatter();
  const today = view.week.find((day) => day.today)?.day ?? '';
  const lead = view.days === 0 ? (view.repair ? 'broken' : 'start') : view.playedToday ? 'tomorrow' : 'today';

  return (
    <section className={styles.panel} aria-labelledby="streak-heading">
      <div className={styles.head}>
        <h2 id="streak-heading" className={styles.title}>
          <Flame aria-hidden />
          {tPacks('streakTitle', { days: view.days })}
        </h2>
        {view.next && <span className={styles.bonus}>{tPacks('streakBonus', { left: view.next.days - view.days })}</span>}
      </div>
      <ol className={styles.week} aria-label={t('week')}>
        {view.week.map((day) => {
          const state = dayState(day, today);
          return (
            <li key={day.day} data-state={state}>
              <span className={styles.mark} aria-hidden="true">
                {(state === 'played' || state === 'today') && <Check />}
                {state === 'graced' && <ShieldCheck />}
                {state === 'frozen' && <Bandage />}
                {state === 'pending' && <PackageOpen />}
                {state === 'future' && <Dot />}
              </span>
              <span className={styles.label} aria-hidden="true">
                {day.today
                  ? tPacks('today')
                  : format.dateTime(noon(day.day), { weekday: 'narrow', timeZone: 'Europe/Paris' })}
              </span>
              <span className="sr-only">
                {t('day', { day: format.dateTime(noon(day.day), { weekday: 'long', timeZone: 'Europe/Paris' }), state })}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.lead}>{t('lead', { state: lead, next: view.days + 1 })}</p>
    </section>
  );
}
