'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, todayInFrance } from '@/lib/account-rules';
import { authClient } from '@/lib/auth-client';
import styles from './AuthForm.module.css';
import { errorFor, type FormError, type FormErrorCode, formLevelError, useFocusOnError, useFormError } from './form-errors';
import { SubmitButton } from './SubmitButton';

const FIELD_CODES = {
  name: ['INVALID_PSEUDO', 'PSEUDO_TAKEN'],
  email: ['INVALID_EMAIL'],
  password: ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'],
  birthDate: ['INVALID_BIRTH_DATE', 'UNDERAGE'],
  acceptTerms: ['TERMS_NOT_ACCEPTED'],
} satisfies Record<string, FormErrorCode[]>;

export function SignupForm() {
  const t = useTranslations('Auth.signup');
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useFocusOnError(formRef, error);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email'));
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(data.get('name')),
      email,
      password: String(data.get('password')),
      birthDate: String(data.get('birthDate')),
      // Checked by the server (src/lib/auth.ts), which records the consent.
      acceptTerms: data.get('acceptTerms') === 'on',
      callbackURL: '/email-verified',
    } as Parameters<typeof authClient.signUp.email>[0]);
    setPending(false);
    if (error) setError(toFormError(error));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>{t('sentTitle')}</h1>
        <Notice tone="success">
          <p>{t('sent', { email: sentTo })}</p>
        </Notice>
        <p className={styles.intro}>{t('sentHint')}</p>
      </div>
    );
  }

  const fieldCodes = Object.values(FIELD_CODES).flat();
  const formError = formLevelError(error, fieldCodes);
  return (
    // POST: submitted before hydration, the password must not end up in the URL.
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.intro}>{t('intro')}</p>
      <TextField
        label={t('pseudo')}
        name="name"
        autoComplete="username"
        required
        minLength={3}
        maxLength={20}
        hint={t('pseudoHint')}
        error={errorFor(error, FIELD_CODES.name)}
      />
      <TextField
        label={t('email')}
        name="email"
        type="email"
        autoComplete="email"
        required
        error={errorFor(error, FIELD_CODES.email)}
      />
      <TextField
        label={t('password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        hint={t('passwordHint', { min: MIN_PASSWORD_LENGTH })}
        error={errorFor(error, FIELD_CODES.password)}
      />
      <TextField
        label={t('birthDate')}
        name="birthDate"
        type="date"
        autoComplete="bday"
        required
        min="1900-01-01"
        max={todayInFrance(new Date())}
        hint={t('birthDateHint')}
        error={errorFor(error, FIELD_CODES.birthDate)}
      />
      <div>
        <Checkbox name="acceptTerms" required aria-invalid={errorFor(error, FIELD_CODES.acceptTerms) ? true : undefined}>
          {t.rich('terms', { link: (chunks) => <Link href="/terms">{chunks}</Link> })}
        </Checkbox>
        {errorFor(error, FIELD_CODES.acceptTerms) && (
          <Notice tone="danger">
            <p>{error?.message}</p>
          </Notice>
        )}
      </div>
      {formError && (
        <Notice tone="danger">
          <p>{formError}</p>
        </Notice>
      )}
      <SubmitButton variant="primary" block pending={pending}>
        {t('submit')}
      </SubmitButton>
      <p className={styles.footer}>
        {t('haveAccount')} <Link href="/login">{t('login')}</Link>
      </p>
    </form>
  );
}
