'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { authClient } from '@/lib/auth-client';
import { isNativeApp } from '@/lib/native-app';
import { googleClientIdAction } from '@/lib/sign-in-actions';
import { useHydrated } from '@/lib/use-hydrated';
import styles from './AuthForm.module.css';

/** Google's "G", in its own colors as its branding rules require. */
export function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

interface GoogleOptions {
  callbackURL: string;
  errorCallbackURL: string;
  signup?: { name: string; birthDate: string; acceptTerms: boolean };
}

/**
 * Leaves for Google, which comes back to `callbackURL` signed in, or to
 * `errorCallbackURL` with an `error` parameter (GoogleErrorNotice). With
 * `signup`, a new account gets that pseudo and birth date: the server checks
 * them first (src/lib/auth.ts), and its refusal is returned before leaving.
 */
export async function continueWithGoogle({ callbackURL, errorCallbackURL, signup }: GoogleOptions) {
  // Google refuses its sign-in page in an app's WebView
  if (isNativeApp()) return continueInApp({ callbackURL, errorCallbackURL, signup });
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL,
    errorCallbackURL,
    ...(signup && { requestSignUp: true, additionalData: signup }),
  });
  return error;
}

/** Leaves for `errorCallbackURL` with `error`, as Google's callback does. */
function backWithError(errorCallbackURL: string, error: string) {
  const url = new URL(errorCallbackURL, window.location.origin);
  url.searchParams.set('error', error);
  window.location.assign(url.pathname + url.search + url.hash);
}

/**
 * The same in the app: the phone's own Google sign-in gives an ID token,
 * which Better Auth checks and signs in with (or signs up, with `signup`),
 * then the page goes where Google's callback would have sent it. The
 * refusals the server makes before leaving for Google are returned.
 */
async function continueInApp({ callbackURL, errorCallbackURL, signup }: GoogleOptions) {
  let idToken: string | null = null;
  try {
    const [{ SocialLogin }, webClientId] = await Promise.all([
      import('@capgo/capacitor-social-login'),
      googleClientIdAction(),
    ]);
    if (!webClientId) throw new Error('Google sign-in is off on the server');
    await SocialLogin.initialize({ google: { webClientId } });
    const { result } = await SocialLogin.login({ provider: 'google', options: {} });
    if (result.responseType === 'online') idToken = result.idToken;
  } catch (error) {
    // The player closed Google's sheet, as access_denied on the web
    if ((error as { code?: string }).code === 'USER_CANCELLED') return backWithError(errorCallbackURL, 'access_denied');
    console.error('Google sign-in failed in the app', error);
  }
  if (!idToken) return backWithError(errorCallbackURL, 'generic');

  const { error } = await authClient.signIn.social({
    provider: 'google',
    idToken: { token: idToken },
    callbackURL,
    ...(signup && { requestSignUp: true, additionalData: signup }),
  });
  if (!error) return window.location.assign(callbackURL);
  // Better Auth's answers once the token is checked, which the web flow
  // gives in the callback address ("signup disabled" there is signup_disabled)
  if (error.code === 'OAUTH_LINK_ERROR') return backWithError(errorCallbackURL, (error.message ?? '').replace(/ /g, '_'));
  if (error.code === 'EMAIL_NOT_VERIFIED') return backWithError(errorCallbackURL, 'email_not_verified');
  if (error.code === 'ACCOUNT_BANNED') return backWithError(errorCallbackURL, 'ACCOUNT_BANNED');
  return error;
}

/** Signs in with Google an account that already exists. */
export function GoogleButton({
  callbackURL,
  errorCallbackURL,
  onError,
}: {
  callbackURL: string;
  errorCallbackURL: string;
  onError?: (error: { code?: string; status: number }) => void;
}) {
  const t = useTranslations('Auth.google');
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const error = await continueWithGoogle({ callbackURL, errorCallbackURL });
    // On success the browser is on its way to Google (or, in the app, to the
    // next page): the button stays busy
    if (error) {
      setPending(false);
      onError?.(error);
    }
  }

  return (
    <Button block onClick={onClick} disabled={!hydrated || pending} icon={<GoogleLogo />}>
      {t('continue')}
    </Button>
  );
}

/** The line between the Google button and the e-mail form. */
export function OrDivider() {
  const t = useTranslations('Auth.google');
  return (
    <p className={styles.divider}>
      <span>{t('or')}</span>
    </p>
  );
}

// Better Auth's codes in the address Google's answer comes back to, and ours
// (ACCOUNT_BANNED, from the session hook)
const KNOWN_ERRORS = ['signup_disabled', 'account_not_linked', 'email_not_verified'] as const;

/** Why Google sent the player back: the `error` parameter of the login or signup page. */
export function GoogleErrorNotice({ code }: { code: string }) {
  const t = useTranslations('Auth.google.errors');
  const tErrors = useTranslations('AuthErrors');
  // The player closed Google's page or said no
  if (code === 'access_denied') {
    return (
      <Notice>
        <p>{t('cancelled')}</p>
      </Notice>
    );
  }
  const known = KNOWN_ERRORS.find((error) => error === code);
  return (
    <Notice tone="danger">
      <p>
        {code === 'ACCOUNT_BANNED'
          ? tErrors('ACCOUNT_BANNED')
          : known
            ? t.rich(known, { signup: (chunks) => <Link href="/signup?with=google">{chunks}</Link> })
            : t('generic')}
      </p>
    </Notice>
  );
}
