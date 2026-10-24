'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, todayInFrance } from '@/lib/account-rules';
import { authClient } from '@/lib/auth-client';
import styles from './AuthForm.module.css';
import { errorFor, type FormError, type FormErrorCode, formLevelError, useFocusOnError, useFormError } from './form-errors';
import { continueWithGoogle, GoogleErrorNotice, GoogleLogo, OrDivider } from './GoogleButton';
import { SubmitButton } from './SubmitButton';

const FIELD_CODES = {
  name: ['INVALID_PSEUDO', 'PSEUDO_TAKEN'],
  email: ['INVALID_EMAIL'],
  password: ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'],
  birthDate: ['INVALID_BIRTH_DATE', 'UNDERAGE'],
  acceptTerms: ['TERMS_NOT_ACCEPTED'],
} satisfies Record<string, FormErrorCode[]>;

/**
 * Signs up with an e-mail and a password, or with Google: the same pseudo,
 * birth date and terms, then the address of the Google account, already
 * confirmed. `google`: whether Google sign-in is set up on the server;
 * `withGoogle`: start with it (/signup?with=google). `home`: where a player
 * signed up with Google lands. `googleError`: why Google sent them back here.
 */
export function SignupForm({
  google,
  withGoogle,
  home,
  googleError,
}: {
  google: boolean;
  withGoogle: boolean;
  home: string;
  googleError?: string;
}) {
  const t = useTranslations('Auth.signup');
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [method, setMethod] = useState<'email' | 'google'>(google && withGoogle ? 'google' : 'email');
  const switched = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useFocusOnError(formRef, error);

  // The button that switched the method is gone: focus the first field
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    formRef.current?.querySelector('input')?.focus();
  }, [method]);

  function switchTo(next: 'email' | 'google') {
    switched.current = true;
    setError(null);
    setMethod(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    if (method === 'google') {
      const error = await continueWithGoogle({
        callbackURL: home,
        errorCallbackURL: '/signup?with=google',
        // Checked by the server (src/lib/auth.ts) before leaving for Google
        signup: {
          name: String(data.get('name')),
          birthDate: String(data.get('birthDate')),
          acceptTerms: data.get('acceptTerms') === 'on',
        },
      });
      // On success the browser is on its way to Google: the form stays busy
      if (error) {
        setPending(false);
        setError(toFormError(error));
      }
      return;
    }
    const email = String(data.get('email'));
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
      <p className={styles.intro}>{method === 'google' ? t('googleIntro') : t('intro')}</p>
      {googleError && !error && <GoogleErrorNotice code={googleError} />}
      {google && method === 'email' && (
        <>
          <Button block onClick={() => switchTo('google')} icon={<GoogleLogo />}>
            {t('withGoogle')}
          </Button>
          <OrDivider />
        </>
      )}
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
      {method === 'email' && (
        <>
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
        </>
      )}
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
      {method === 'google' ? (
        <>
          {/* Google's logo keeps its colors on a light button, as its branding rules ask */}
          <SubmitButton block pending={pending} icon={<GoogleLogo />}>
            {t('googleSubmit')}
          </SubmitButton>
          <button type="button" className={`${styles.linkButton} ${styles.switch}`} onClick={() => switchTo('email')}>
            {t('withEmail')}
          </button>
        </>
      ) : (
        <SubmitButton variant="primary" block pending={pending}>
          {t('submit')}
        </SubmitButton>
      )}
      {/* GDPR, art. 13: what the data is for, where it is collected */}
      <p className={styles.notice}>{t.rich('privacy', { link: (chunks) => <Link href="/privacy">{chunks}</Link> })}</p>
      <p className={styles.footer}>
        {t('haveAccount')} <Link href="/login">{t('login')}</Link>
      </p>
    </form>
  );
}
