'use client';

import { SignOutIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/account-rules';
import { authClient } from '@/lib/auth-client';
import styles from './AuthForm.module.css';
import { errorFor, type FormError, type FormErrorCode, formLevelError, useFocusOnError, useFormError } from './form-errors';
import { SubmitButton } from './SubmitButton';

/** Pending state, error and focus handling shared by the account page forms. */
function useAccountForm() {
  const toFormError = useFormError();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [done, setDone] = useState(false);
  useFocusOnError(formRef, error);

  async function run(call: () => Promise<{ error: { code?: string; status: number } | null }>) {
    setPending(true);
    setError(null);
    setDone(false);
    const { error } = await call();
    setPending(false);
    if (error) setError(toFormError(error));
    else setDone(true);
    return !error;
  }

  return { formRef, pending, error, done, run };
}

const PSEUDO_CODES: FormErrorCode[] = ['INVALID_PSEUDO', 'PSEUDO_TAKEN'];

export function PseudoForm({ pseudo }: { pseudo: string }) {
  const t = useTranslations('Account.profile');
  const router = useRouter();
  const { formRef, pending, error, done, run } = useAccountForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name'));
    if (await run(() => authClient.updateUser({ name }))) router.refresh();
  }

  const formError = formLevelError(error, PSEUDO_CODES);
  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <TextField
        label={t('pseudo')}
        name="name"
        defaultValue={pseudo}
        autoComplete="username"
        required
        minLength={3}
        maxLength={20}
        hint={t('pseudoHint')}
        error={errorFor(error, PSEUDO_CODES)}
      />
      {formError && (
        <Notice tone="danger">
          <p>{formError}</p>
        </Notice>
      )}
      {done && (
        <Notice tone="success">
          <p>{t('saved')}</p>
        </Notice>
      )}
      <div className={styles.actions}>
        <SubmitButton pending={pending}>
          {t('save')}
        </SubmitButton>
      </div>
    </form>
  );
}

const CURRENT_PASSWORD_CODES: FormErrorCode[] = ['INVALID_PASSWORD'];
const NEW_PASSWORD_CODES: FormErrorCode[] = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'];

export function ChangePasswordForm() {
  const t = useTranslations('Account.password');
  const tSignup = useTranslations('Auth.signup');
  const { formRef, pending, error, done, run } = useAccountForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const changed = await run(() =>
      authClient.changePassword({
        currentPassword: String(data.get('currentPassword')),
        newPassword: String(data.get('newPassword')),
        revokeOtherSessions: true,
      }),
    );
    if (changed) form.reset();
  }

  const formError = formLevelError(error, [...CURRENT_PASSWORD_CODES, ...NEW_PASSWORD_CODES]);
  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <TextField
        label={t('current')}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={errorFor(error, CURRENT_PASSWORD_CODES)}
      />
      <TextField
        label={t('new')}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        hint={tSignup('passwordHint', { min: MIN_PASSWORD_LENGTH })}
        error={errorFor(error, NEW_PASSWORD_CODES)}
      />
      {formError && (
        <Notice tone="danger">
          <p>{formError}</p>
        </Notice>
      )}
      {done && (
        <Notice tone="success">
          <p>{t('done')}</p>
        </Notice>
      )}
      <div className={styles.actions}>
        <SubmitButton pending={pending}>
          {t('submit')}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Leaves for `path` once the session is gone, discarding the pages rendered for it. */
function useLeave() {
  const router = useRouter();
  return (path: string) => {
    router.replace(path);
    router.refresh();
  };
}

export function DeleteAccountForm() {
  const t = useTranslations('Account.delete');
  const leave = useLeave();
  const { formRef, pending, error, run } = useAccountForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    if (await run(() => authClient.deleteUser({ password }))) leave('/?deleted=1');
  }

  const formError = formLevelError(error, CURRENT_PASSWORD_CODES);
  return (
    <form ref={formRef} method="post" className={styles.form} onSubmit={onSubmit}>
      <TextField
        label={t('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        hint={t('passwordHint')}
        error={errorFor(error, CURRENT_PASSWORD_CODES)}
      />
      {formError && (
        <Notice tone="danger">
          <p>{formError}</p>
        </Notice>
      )}
      <div className={styles.actions}>
        <SubmitButton variant="danger" pending={pending}>
          {t('submit')}
        </SubmitButton>
      </div>
    </form>
  );
}

export function SignOutButton() {
  const t = useTranslations('Account');
  const leave = useLeave();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={pending}
      icon={<SignOutIcon size={18} aria-hidden />}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        leave('/');
      }}
    >
      {t('signOut')}
    </Button>
  );
}
