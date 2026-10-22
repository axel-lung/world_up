'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import styles from '@/components/account/AuthForm.module.css';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { acceptTermsAction } from './actions';

export function AcceptTermsForm({ next }: { next: string }) {
  const t = useTranslations('AcceptTerms');
  const [state, action, pending] = useActionState(acceptTermsAction, null);
  return (
    <form action={action} className={styles.form}>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.intro}>{t('intro')}</p>
      <input type="hidden" name="next" value={next} />
      <div>
        <Checkbox name="accept" required aria-invalid={state ? true : undefined}>
          {t.rich('accept', { link: (chunks) => <Link href="/terms">{chunks}</Link> })}
        </Checkbox>
        {state && (
          <Notice tone="danger">
            <p>{t('required')}</p>
          </Notice>
        )}
      </div>
      <SubmitButton variant="primary" block pending={pending}>
        {t('submit')}
      </SubmitButton>
      <p className={styles.footer}>{t.rich('refuse', { link: (chunks) => <Link href="/account">{chunks}</Link> })}</p>
    </form>
  );
}
