'use client';

import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { type DepartmentShape, FRANCE } from '@/lib/map/departments';
import { progressStep } from '@/lib/map/geo';
import styles from './FranceMap.module.css';

export interface Progress {
  owned: number;
  total: number;
}

const STEPS = [0, 1, 2, 3, 4, 5] as const;

// Short names for the insets' captions
const shortName = (name: string) => name.replace(/^La /, '');

/**
 * Metropolitan France by department, each filled by the share of its
 * monuments the player owns (Claude Design, "Carte - Monuments", 1a). A
 * department is a button: touching it opens its sheet, which `chosen` rings
 * in ink above the others.
 */
export function FranceMap({ progress, chosen, onChoose }: {
  progress: ReadonlyMap<string, Progress>;
  chosen: string | null;
  onChoose: (code: string) => void;
}) {
  const t = useTranslations('Map');
  const { width, height, departments } = FRANCE.metro;
  const ring = chosen ? departments.find((d) => d.code === chosen) : null;

  return (
    <svg
      className={styles.france}
      viewBox={`-4 -4 ${width + 8} ${height + 8}`}
      role="group"
      aria-label={t('franceLabel')}
    >
      {departments.map((department) => (
        <DepartmentPath key={department.code} department={department} progress={progress.get(department.code)} onChoose={onChoose} />
      ))}
      {ring && <path d={ring.d} className={styles.ring} />}
    </svg>
  );
}

function DepartmentPath({ department, progress, onChoose }: {
  department: DepartmentShape;
  progress: Progress | undefined;
  onChoose: (code: string) => void;
}) {
  const t = useTranslations('Map');
  const owned = progress?.owned ?? 0;
  const total = progress?.total ?? 0;
  const label = t('departmentAria', { name: department.name, owned, total });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChoose(department.code);
    }
  };
  return (
    <path
      d={department.d}
      className={styles.department}
      data-step={progressStep(owned, total)}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onChoose(department.code)}
      onKeyDown={onKeyDown}
    >
      <title>{label}</title>
    </path>
  );
}

/** The five overseas departments, each in its own frame. */
export function OverseasInsets({ progress, chosen, onChoose }: {
  progress: ReadonlyMap<string, Progress>;
  chosen: string | null;
  onChoose: (code: string) => void;
}) {
  const t = useTranslations('Map');
  return (
    <ul className={styles.insets} aria-label={t('overseas')}>
      {FRANCE.overseas.map((inset) => {
        const owned = progress.get(inset.code)?.owned ?? 0;
        const total = progress.get(inset.code)?.total ?? 0;
        return (
          <li key={inset.code}>
            <button
              type="button"
              className={styles.inset}
              aria-label={t('departmentAria', { name: inset.name, owned, total })}
              aria-pressed={chosen === inset.code}
              onClick={() => onChoose(inset.code)}
            >
              <svg viewBox={`-3 -3 ${inset.width + 6} ${inset.height + 6}`} aria-hidden="true">
                <path d={inset.d} className={styles.insetShape} data-step={progressStep(owned, total)} />
              </svg>
              <span className={styles.insetName}>{shortName(inset.name)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The six steps of the fill, from none to complete. */
export function ProgressLegend() {
  const t = useTranslations('Map');
  return (
    <div className={styles.legend}>
      <span className={styles.legendTitle}>{t('legendTitle')}</span>
      <ul>
        {STEPS.map((step) => (
          <li key={step}>
            <span className={styles.swatch} data-step={step} aria-hidden="true" />
            {t(`legend.${step}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
