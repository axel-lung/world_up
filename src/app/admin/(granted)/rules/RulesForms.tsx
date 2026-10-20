'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import type { GameRules } from '@/lib/game/rules';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { type RulesState, saveGameRules, saveOdds, saveResaleValues } from './actions';
import styles from '../../admin.module.css';

function Result({ state }: { state: RulesState }) {
  const t = useTranslations('Admin.rules');
  if (!state) return null;
  return 'error' in state ? (
    <Notice tone="danger">
      <p>{t(`errors.${state.error}`)}</p>
    </Notice>
  ) : (
    <Notice tone="success">
      <p>{t('saved')}</p>
    </Notice>
  );
}

const RULE_FIELDS = ['cardsPerPack', 'signupPacks', 'refillMinutes', 'maxReserve'] as const;

export function GameRulesForm({ rules }: { rules: GameRules }) {
  const t = useTranslations('Admin.rules');
  const [state, action, pending] = useActionState(saveGameRules, null);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.filters}>
        {RULE_FIELDS.map((field) => (
          <TextField
            key={field}
            label={t(`fields.${field}`)}
            name={field}
            type="number"
            inputMode="numeric"
            min={field === 'signupPacks' ? 0 : 1}
            required
            defaultValue={rules[field]}
          />
        ))}
      </div>
      <SubmitButton variant="primary" pending={pending}>
        {t('saveRules')}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function ResaleForm({ values }: { values: Record<Rarity, number> }) {
  const t = useTranslations('Admin.rules');
  const tRarity = useTranslations('Rarity');
  const [state, action, pending] = useActionState(saveResaleValues, null);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.filters}>
        {RARITIES.map((rarity) => (
          <TextField
            key={rarity}
            label={tRarity(rarity)}
            name={rarity}
            type="number"
            inputMode="numeric"
            min={0}
            required
            defaultValue={values[rarity]}
          />
        ))}
      </div>
      <SubmitButton variant="primary" pending={pending}>
        {t('saveResale')}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

/** Percentages as typed in France: "0,25". */
const asPercent = (perMillion: number) => String(perMillion / 10_000).replace('.', ',');

export function OddsForm({ odds, now }: { odds: Record<Rarity, number>; now: string }) {
  const t = useTranslations('Admin.rules');
  const tRarity = useTranslations('Rarity');
  const [state, action, pending] = useActionState(saveOdds, null);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.filters}>
        {RARITIES.map((rarity) => (
          <TextField
            key={rarity}
            label={t('percentOf', { rarity: tRarity(rarity) })}
            name={rarity}
            inputMode="decimal"
            pattern="\d{1,3}([.,]\d{1,4})?"
            required
            defaultValue={asPercent(odds[rarity])}
          />
        ))}
      </div>
      <TextField label={t('validFrom')} name="validFrom" type="datetime-local" required defaultValue={now} hint={t('validFromHint')} />
      <SubmitButton variant="primary" pending={pending}>
        {t('publishOdds')}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}
