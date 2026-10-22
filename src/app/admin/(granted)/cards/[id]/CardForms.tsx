'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import type { HiddenReason } from '@/lib/catalog/admin';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { type ActionState, changePhoto, changeRarity, changeVisibility } from './actions';
import styles from '../../../admin.module.css';

function Result({ state }: { state: ActionState }) {
  const t = useTranslations('Admin');
  if (!state) return null;
  return 'error' in state ? (
    <Notice tone="danger">
      <p>{t(`errors.${state.error}`)}</p>
    </Notice>
  ) : (
    <Notice tone="success">
      <p>{t('card.saved')}</p>
    </Notice>
  );
}

const HIDE_REASONS: HiddenReason[] = ['admin', 'memorial', 'commercial', 'national_domain', 'twentieth_century', 'photo'];

export function VisibilityForm({ cardId, hiddenReason }: { cardId: number; hiddenReason: HiddenReason | null }) {
  const t = useTranslations('Admin.card');
  const [state, action, pending] = useActionState(changeVisibility, null);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="cardId" value={cardId} />
      {hiddenReason ? (
        <>
          <input type="hidden" name="reason" value="visible" />
          <TextField label={t('note')} name="note" maxLength={500} />
          <SubmitButton variant="primary" pending={pending}>
            {hiddenReason === 'twentieth_century'
              ? t('showReviewed')
              : hiddenReason === 'national_domain'
                ? t('showAuthorised')
                : t('show')}
          </SubmitButton>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="hide-reason">{t('hideReason')}</label>
            <select id="hide-reason" name="reason" className="input" defaultValue="admin">
              {HIDE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`hiddenReasons.${reason}`)}
                </option>
              ))}
            </select>
          </div>
          <TextField label={t('note')} name="note" maxLength={500} />
          <SubmitButton variant="danger" pending={pending}>
            {t('hide')}
          </SubmitButton>
        </>
      )}
      <Result state={state} />
    </form>
  );
}

export function RarityForm({ cardId, rarity }: { cardId: number; rarity: Rarity }) {
  const t = useTranslations('Admin.card');
  const tRarity = useTranslations('Rarity');
  const [state, action, pending] = useActionState(changeRarity, null);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="cardId" value={cardId} />
      <div className="field">
        <label htmlFor="new-rarity">{t('newRarity')}</label>
        <select id="new-rarity" name="rarity" className="input" defaultValue={rarity}>
          {RARITIES.map((value) => (
            <option key={value} value={value}>
              {tRarity(value)}
            </option>
          ))}
        </select>
      </div>
      <Checkbox name="confirm">{t('rarityConfirm')}</Checkbox>
      <SubmitButton pending={pending}>{t('changeRarity')}</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function PhotoForm({ cardId }: { cardId: number }) {
  const t = useTranslations('Admin.card');
  const [state, action, pending] = useActionState(changePhoto, null);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="cardId" value={cardId} />
      <TextField label={t('commonsFile')} name="file" required maxLength={500} placeholder="Château de Chambord.jpg" />
      <SubmitButton pending={pending}>{t('changePhoto')}</SubmitButton>
      <Result state={state} />
    </form>
  );
}
