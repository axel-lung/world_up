'use client';

import { useTranslations } from 'next-intl';
import { type RefObject, useEffect } from 'react';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/account-rules';

// Error codes with a French message of their own in AuthErrors (messages/fr.json):
// ours (src/lib/auth-errors.ts) and the Better Auth ones the forms can meet.
const CODES = [
  'INVALID_PSEUDO',
  'PSEUDO_TAKEN',
  'INVALID_BIRTH_DATE',
  'UNDERAGE',
  'TERMS_NOT_ACCEPTED',
  'BIRTH_DATE_LOCKED',
  'INVALID_EMAIL',
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_PASSWORD',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'SESSION_EXPIRED',
] as const;

export type FormErrorCode =
  | (typeof CODES)[number]
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'TOO_MANY_REQUESTS'
  // Not an error for the player: the login form explains it.
  | 'EMAIL_NOT_VERIFIED';

export interface FormError {
  code?: FormErrorCode;
  message: string;
}

/** Turns an auth API error into a French message. */
export function useFormError() {
  const t = useTranslations('AuthErrors');
  return (error: { code?: string; status: number }): FormError => {
    if (error.status === 429) return { code: 'TOO_MANY_REQUESTS', message: t('TOO_MANY_REQUESTS') };
    switch (error.code) {
      case 'EMAIL_NOT_VERIFIED':
        return { code: error.code, message: '' };
      case 'PASSWORD_TOO_SHORT':
        return { code: error.code, message: t('PASSWORD_TOO_SHORT', { min: MIN_PASSWORD_LENGTH }) };
      case 'PASSWORD_TOO_LONG':
        return { code: error.code, message: t('PASSWORD_TOO_LONG', { max: MAX_PASSWORD_LENGTH }) };
    }
    const code = CODES.find((known) => known === error.code);
    return code ? { code, message: t(code) } : { message: t('generic') };
  };
}

/** The message to show under a field when the error is one of `codes`. */
export function errorFor(error: FormError | null, codes: readonly FormErrorCode[]): string | undefined {
  return error?.code && codes.includes(error.code) ? error.message : undefined;
}

/** The message to show above the submit button: errors no field claims. */
export function formLevelError(error: FormError | null, fieldCodes: readonly FormErrorCode[]): string | undefined {
  return error && !(error.code && fieldCodes.includes(error.code)) ? error.message : undefined;
}

/** After a failed submit, moves focus to the first invalid field or the error message. */
export function useFocusOnError(formRef: RefObject<HTMLFormElement | null>, error: FormError | null) {
  useEffect(() => {
    if (!error) return;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
    if (target && !target.matches('input')) target.tabIndex = -1;
    target?.focus();
  }, [formRef, error]);
}
