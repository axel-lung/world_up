'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { authClient } from '@/lib/auth-client';
import styles from './AuthForm.module.css';
import { type FormError, useFocusOnError, useFormError } from './form-errors';
import { SubmitButton } from './SubmitButton';

export function ForgotPasswordForm() {
  const t = useTranslations('Auth.forgot');
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useFocusOnError(formRef, error);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email'));
    setPending(true);
    setError(null);
    // Answers the same whether the address has an account or not.
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setPending(false);
    if (error) setError(toFormError(error));
    else setSentTo(email);
  }

  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <h1 className={styles.title}>{t('title')}</h1>
      {sentTo ? (
        <Notice tone="success">
          <p>{t('sent', { email: sentTo })}</p>
        </Notice>
      ) : (
        <>
          <p className={styles.intro}>{t('intro')}</p>
          <TextField label={t('email')} name="email" type="email" autoComplete="email" required />
          {error && (
            <Notice tone="danger">
              <p>{error.message}</p>
            </Notice>
          )}
          <SubmitButton variant="primary" block pending={pending}>
            {t('submit')}
          </SubmitButton>
        </>
      )}
      <p className={styles.footer}>
        <Link href="/login">{t('back')}</Link>
      </p>
    </form>
  );
}
