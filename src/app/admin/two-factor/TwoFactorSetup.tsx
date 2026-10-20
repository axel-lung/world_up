'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { type FormEvent, useRef, useState } from 'react';
import { type FormError, useFocusOnError, useFormError } from '@/components/account/form-errors';
import { SubmitButton } from '@/components/account/SubmitButton';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { authClient } from '@/lib/auth-client';
import styles from '../admin.module.css';

interface Enrollment {
  qr: string;
  secret: string;
  backupCodes: string[];
}

/**
 * The password, then the QR code, the setup key and the backup codes, then a
 * first code from the app: Better Auth turns two-factor on and replaces the
 * session with one that has passed it.
 */
export function TwoFactorSetup() {
  const t = useTranslations('Admin.twoFactor');
  const router = useRouter();
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  useFocusOnError(formRef, error);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get('password'));
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !('totpURI' in data) || !data.totpURI) {
      setError(error ? toFormError(error) : toFormError({ status: 500 }));
      return;
    }
    const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
    setEnrollment({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }), secret, backupCodes: data.backupCodes ?? [] });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get('code')).replace(/\s+/g, '');
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setPending(false);
      setError(toFormError(error));
      return;
    }
    // The new session cookie is set: the back-office now opens
    router.push('/admin');
  }

  const notice = error && (
    <Notice tone="danger">
      <p>{error.message}</p>
    </Notice>
  );

  if (!enrollment) {
    return (
      <form ref={formRef} method="post" className={styles.form} onSubmit={start}>
        <TextField label={t('password')} name="password" type="password" autoComplete="current-password" required />
        {notice}
        <SubmitButton variant="primary" pending={pending}>
          {t('start')}
        </SubmitButton>
      </form>
    );
  }

  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={confirm}>
      <p>{t('scan')}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser */}
      <img src={enrollment.qr} alt={t('qrAlt')} width={220} height={220} />
      <p>
        {t('secret')} : <span className={styles.secret}>{enrollment.secret}</span>
      </p>
      <section className={styles.section} aria-labelledby="backup-heading">
        <h2 id="backup-heading">{t('backupTitle')}</h2>
        <p>{t('backupIntro')}</p>
        <ul className={styles.codes}>
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>
      <TextField label={t('code')} name="code" autoComplete="one-time-code" inputMode="numeric" required />
      {notice}
      <SubmitButton variant="primary" pending={pending}>
        {t('confirm')}
      </SubmitButton>
    </form>
  );
}

/** Ends this session and goes back to the login form, which will ask for a code. */
export function ReauthenticateButton() {
  const t = useTranslations('Admin.twoFactor');
  const router = useRouter();
  return (
    <Button
      variant="primary"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login?next=%2Fadmin');
      }}
    >
      {t('signOut')}
    </Button>
  );
}
