'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { ANNOUNCEMENT_MAX_LENGTH } from '@/lib/announcement-shared';
import { publishAnnouncementAction } from './actions';
import styles from '../../admin.module.css';

/** A new announcement: its message, an optional link, its tone and its dates (in Paris). */
export function AnnouncementForm({ now }: { now: string }) {
  const t = useTranslations('Admin.announcements');
  const [state, action, pending] = useActionState(publishAnnouncementAction, null);
  return (
    // A new key once saved: the fields empty again
    <form key={state && 'saved' in state ? now : 'form'} action={action} className={styles.form}>
      <div className="field">
        <label htmlFor="announcement-message">{t('message')}</label>
        <textarea
          id="announcement-message"
          name="message"
          className="input"
          rows={3}
          maxLength={ANNOUNCEMENT_MAX_LENGTH}
          required
          aria-describedby="announcement-message-hint"
        />
        <span id="announcement-message-hint" className={styles.muted}>
          {t('messageHint', { max: ANNOUNCEMENT_MAX_LENGTH })}
        </span>
      </div>
      <div className={styles.filters}>
        <TextField label={t('linkUrl')} name="linkUrl" maxLength={500} hint={t('linkUrlHint')} />
        <TextField label={t('linkLabel')} name="linkLabel" maxLength={60} hint={t('linkLabelHint')} />
      </div>
      <div className={styles.filters}>
        <div className="field">
          <label htmlFor="announcement-tone">{t('tone')}</label>
          <select id="announcement-tone" name="tone" className="input" defaultValue="info">
            <option value="info">{t('tones.info')}</option>
            <option value="important">{t('tones.important')}</option>
          </select>
        </div>
        <TextField label={t('startsAt')} name="startsAt" type="datetime-local" defaultValue={now} hint={t('startsAtHint')} />
        <TextField label={t('endsAt')} name="endsAt" type="datetime-local" hint={t('endsAtHint')} />
      </div>
      <SubmitButton variant="primary" pending={pending}>
        {t('publish')}
      </SubmitButton>
      {state &&
        ('error' in state ? (
          <Notice tone="danger">
            <p>{t(`errors.${state.error}`)}</p>
          </Notice>
        ) : (
          <Notice tone="success">
            <p>{t('saved')}</p>
          </Notice>
        ))}
    </form>
  );
}
