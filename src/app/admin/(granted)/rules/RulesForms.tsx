'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import type { GameRules, MarketRules, PriceRange } from '@/lib/game/rules';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { type RulesState, saveGameRules, saveMarketPrices, saveMarketRules, saveOdds, saveResaleValues } from './actions';
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

const RULE_FIELDS = ['cardsPerPack', 'signupPacks', 'refillMinutes', 'maxReserve', 'coinsPerOpening'] as const;

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
            min={field === 'signupPacks' || field === 'coinsPerOpening' ? 0 : 1}
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

const SWITCHES = ['tradesEnabled', 'auctionsEnabled'] as const;
const MARKET_FIELDS = [
  'tradeExpiryHours',
  'tradeMaxCards',
  'auctionFeePercent',
  'bidIncrementPercent',
  'auctionExtensionMinutes',
  'maxActiveAuctions',
] as const;

export function MarketRulesForm({ rules }: { rules: MarketRules }) {
  const t = useTranslations('Admin.rules');
  const [state, action, pending] = useActionState(saveMarketRules, null);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.filters}>
        {SWITCHES.map((field) => (
          <Checkbox key={field} name={field} defaultChecked={rules[field]}>
            {t(`fields.${field}`)}
          </Checkbox>
        ))}
      </div>
      <div className={styles.filters}>
        {MARKET_FIELDS.map((field) => (
          <TextField
            key={field}
            label={t(`fields.${field}`)}
            name={field}
            type="number"
            inputMode="numeric"
            min={field === 'auctionFeePercent' || field === 'auctionExtensionMinutes' ? 0 : 1}
            required
            defaultValue={rules[field]}
          />
        ))}
        <TextField
          label={t('fields.auctionDurationsHours')}
          name="auctionDurationsHours"
          required
          defaultValue={rules.auctionDurationsHours.join(', ')}
          hint={t('durationsHint')}
        />
      </div>
      <SubmitButton variant="primary" pending={pending}>
        {t('saveMarket')}
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function MarketPricesForm({ prices }: { prices: Record<Rarity, PriceRange> }) {
  const t = useTranslations('Admin.rules');
  const tRarity = useTranslations('Rarity');
  const [state, action, pending] = useActionState(saveMarketPrices, null);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.filters}>
        {RARITIES.flatMap((rarity) =>
          (['min', 'max'] as const).map((bound) => (
            <TextField
              key={`${rarity}-${bound}`}
              label={t(bound === 'min' ? 'minPrice' : 'maxPrice', { rarity: tRarity(rarity) })}
              name={`${rarity}${bound === 'min' ? 'Min' : 'Max'}`}
              type="number"
              inputMode="numeric"
              min={1}
              required
              defaultValue={prices[rarity][bound]}
            />
          )),
        )}
      </div>
      <SubmitButton variant="primary" pending={pending}>
        {t('savePrices')}
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
