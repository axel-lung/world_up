import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { adminStatus } from '@/lib/admin';
import { getSession } from '@/lib/session';
import { ReauthenticateButton, TwoFactorSetup } from './TwoFactorSetup';
import styles from '../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.twoFactor');
  return { title: t('title'), robots: { index: false, follow: false } };
}

// Outside the (granted) group: the admin comes here before the session has
// passed a second factor, to set up the app or to sign in again with a code.
export default async function TwoFactorPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=%2Fadmin');
  const status = adminStatus(session);
  if (!status) notFound();
  if (status === 'granted') redirect('/admin');
  const t = await getTranslations('Admin.twoFactor');

  return (
    <main className={`${styles.page} ${styles.narrow}`}>
      {status === 'enroll' ? (
        <>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
          <TwoFactorSetup />
        </>
      ) : (
        <>
          <h1>{t('reauthTitle')}</h1>
          <p>{t('reauth')}</p>
          <ReauthenticateButton />
        </>
      )}
    </main>
  );
}
