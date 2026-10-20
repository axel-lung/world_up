'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/account-rules';
import { authClient } from '@/lib/auth-client';
import styles from './AuthForm.module.css';
import { errorFor, type FormError, type FormErrorCode, formLevelError, useFocusOnError, useFormError } from './form-errors';
import { SubmitButton } from './SubmitButton';

const PASSWORD_CODES: FormErrorCode[] = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'];

/** `token` comes from the link in the e-mail, through Better Auth's redirect. */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('Auth.reset');
  const tSignup = useTranslations('Auth.signup');
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [done, setDone] = useState(false);
  useFocusOnError(formRef, error);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password'));
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) setError(toFormError(error));
    else setDone(true);
  }

  if (done) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>{t('title')}</h1>
        <Notice tone="success">
          <p>{t('done')}</p>
        </Notice>
        <ButtonLink href="/login" variant="primary" block>
          {t('login')}
        </ButtonLink>
      </div>
    );
  }

  const formError = formLevelError(error, PASSWORD_CODES);
  const expired = error?.code === 'INVALID_TOKEN' || error?.code === 'TOKEN_EXPIRED';
  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <h1 className={styles.title}>{t('title')}</h1>
      <TextField
        label={t('password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        hint={tSignup('passwordHint', { min: MIN_PASSWORD_LENGTH })}
        error={errorFor(error, PASSWORD_CODES)}
      />
      {formError && (
        <Notice tone="danger">
          <p>{expired ? t('invalid') : formError}</p>
          {expired && <Link href="/forgot-password">{t('newLink')}</Link>}
        </Notice>
      )}
      <SubmitButton variant="primary" block pending={pending}>
        {t('submit')}
      </SubmitButton>
    </form>
  );
}
