'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { changeBan } from './actions';
import styles from '../../../admin.module.css';

/** Bans an active account, with the reason the player is sent; lifts the ban of a banned one. */
export function BanForm({ userId, banned }: { userId: string; banned: boolean }) {
  const t = useTranslations('Admin');
  const [state, action, pending] = useActionState(changeBan, null);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={banned ? 'unban' : 'ban'} />
      {banned ? (
        <>
          <p className={styles.muted}>{t('player.unbanIntro')}</p>
          <TextField label={t('player.note')} name="text" maxLength={500} />
          <SubmitButton variant="primary" pending={pending}>
            {t('player.unban')}
          </SubmitButton>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ban-reason">{t('player.reason')}</label>
            <textarea
              id="ban-reason"
              name="text"
              className="input"
              rows={3}
              maxLength={500}
              required
              aria-describedby="ban-reason-hint"
            />
            <span id="ban-reason-hint" className={styles.muted}>
              {t('player.reasonHint')}
            </span>
          </div>
          <SubmitButton variant="danger" pending={pending}>
            {t('player.ban')}
          </SubmitButton>
        </>
      )}
      {state &&
        ('error' in state ? (
          <Notice tone="danger">
            <p>{t(`errors.${state.error}`)}</p>
          </Notice>
        ) : (
          <Notice tone="success">
            <p>{t(state.done === 'banned' ? 'player.bannedDone' : 'player.unbannedDone')}</p>
          </Notice>
        ))}
    </form>
  );
}
