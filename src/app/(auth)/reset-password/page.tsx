import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/account/AuthForm.module.css';
import { ResetPasswordForm } from '@/components/account/ResetPasswordForm';
import { Notice } from '@/components/ui/Notice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.reset');
  return { title: t('title'), referrer: 'no-referrer' };
}

// Better Auth checks the e-mail link, then redirects here with ?token=… or ?error=INVALID_TOKEN.
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams;
  if (typeof token === 'string' && token) return <ResetPasswordForm token={token} />;

  const t = await getTranslations('Auth.reset');
  return (
    <div className={styles.form}>
      <h1 className={styles.title}>{t('title')}</h1>
      <Notice tone="danger">
        <p>{t('invalid')}</p>
      </Notice>
      <Link href="/forgot-password">{t('newLink')}</Link>
    </div>
  );
}
