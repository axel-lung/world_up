'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Notice } from '@/components/ui/Notice';
import { MESSAGE_MAX, MESSAGE_MIN, REPORT_TYPES } from '@/lib/catalog/report-rules';
import { reportCard } from './actions';
import styles from './page.module.css';

/** "Signaler un problème", folded until the player opens it. */
export function ReportForm({ cardId }: { cardId: number }) {
  const t = useTranslations('CardPage.report');
  const [state, action, pending] = useActionState(reportCard, null);

  return (
    <details className={styles.report}>
      <summary>{t('summary')}</summary>
      {state && 'sent' in state ? (
        <Notice tone="success">
          <p>{t('sent')}</p>
        </Notice>
      ) : (
        <form action={action} className={styles.reportForm}>
          <input type="hidden" name="cardId" value={cardId} />
          <p>{t('intro')}</p>
          <fieldset className={styles.reportTypes}>
            <legend>{t('type')}</legend>
            {REPORT_TYPES.map((type) => (
              <label key={type}>
                <input type="radio" name="type" value={type} defaultChecked={type === 'photo'} />
                {t(`types.${type}`)}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="report-message">{t('message')}</label>
            <textarea
              id="report-message"
              name="message"
              className="input"
              rows={4}
              minLength={MESSAGE_MIN}
              maxLength={MESSAGE_MAX}
              required
              aria-describedby="report-message-hint"
            />
            <span id="report-message-hint" className={styles.hint}>
              {t('messageHint')}
            </span>
          </div>
          {state && 'error' in state && (
            <Notice tone="danger">
              <p>{t(`errors.${state.error}`)}</p>
            </Notice>
          )}
          <SubmitButton pending={pending}>{t('submit')}</SubmitButton>
        </form>
      )}
    </details>
  );
}
