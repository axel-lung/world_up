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

/** `returnTo`: where to go once signed in; also where a new verification link leads. */
export function LoginForm({ returnTo }: { returnTo: string }) {
  const t = useTranslations('Auth.login');
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Accounts with two-factor authentication (the back-office one) answer
  // the password with a request for a code
  const [step, setStep] = useState<'password' | 'code' | 'backup'>('password');
  useFocusOnError(formRef, error);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    if (step === 'password') {
      // On success, the client follows callbackURL with a full page load.
      const { data: result, error } = await authClient.signIn.email({
        email: String(data.get('email')),
        password: String(data.get('password')),
        callbackURL: returnTo,
      });
      setPending(false);
      if (error) setError(toFormError(error));
      else if (result && 'twoFactorRedirect' in result) setStep('code');
      return;
    }
    const code = String(data.get('code')).replace(/\s+/g, '');
    const { error } =
      step === 'code'
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    if (error) {
      setPending(false);
      setError(toFormError(error));
      if (error.code === 'INVALID_TWO_FACTOR_COOKIE' || error.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') {
        setStep('password');
      }
      return;
    }
    window.location.assign(returnTo);
  }

  const notice =
    error?.code === 'EMAIL_NOT_VERIFIED' ? (
      <Notice>
        <p>{t('notVerified')}</p>
      </Notice>
    ) : (
      error && (
        <Notice tone="danger">
          <p>{error.message}</p>
        </Notice>
      )
    );

  if (step !== 'password') {
    const backup = step === 'backup';
    return (
      <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
        <h1 className={styles.title}>{t('codeTitle')}</h1>
        <p className={styles.intro}>{backup ? t('backupIntro') : t('codeIntro')}</p>
        <TextField
          key={step}
          label={backup ? t('backupCode') : t('code')}
          name="code"
          autoComplete="one-time-code"
          inputMode={backup ? 'text' : 'numeric'}
          autoFocus
          required
        />
        {notice}
        <SubmitButton variant="primary" block pending={pending}>
          {t('verify')}
        </SubmitButton>
        <button
          type="button"
          className={`${styles.inlineLink} ${styles.linkButton}`}
          onClick={() => {
            setError(null);
            setStep(backup ? 'code' : 'backup');
          }}
        >
          {backup ? t('useApp') : t('useBackup')}
        </button>
      </form>
    );
  }

  return (
    // POST: submitted before hydration, the password must not end up in the URL.
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <h1 className={styles.title}>{t('title')}</h1>
      <TextField label={t('email')} name="email" type="email" autoComplete="email" required />
      <TextField label={t('password')} name="password" type="password" autoComplete="current-password" required />
      <Link href="/forgot-password" className={styles.inlineLink}>
        {t('forgot')}
      </Link>
      {notice}
      <SubmitButton variant="primary" block pending={pending}>
        {t('submit')}
      </SubmitButton>
      <p className={styles.footer}>
        {t('noAccount')} <Link href="/signup">{t('signup')}</Link>
      </p>
    </form>
  );
}
