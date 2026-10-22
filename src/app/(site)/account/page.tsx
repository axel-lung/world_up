import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ChangePasswordForm, DeleteAccountForm, PseudoForm, SignOutButton } from '@/components/account/AccountForms';
import { requireSession } from '@/lib/session';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account');
  return { title: t('title') };
}

// Subscription, spending cap and purchase history join this page in lot 4.
export default async function AccountPage() {
  const { user } = await requireSession('/account');
  const t = await getTranslations('Account');
  const format = await getFormatter();
  // birthDate is a calendar date: format it in UTC so it never shifts by a day.
  const birthDate = format.dateTime(new Date(`${user.birthDate}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  const memberSince = format.dateTime(user.createdAt, { dateStyle: 'long', timeZone: 'Europe/Paris' });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <SignOutButton />
      </header>

      <section className={styles.section} aria-labelledby="profile">
        <h2 id="profile">{t('profile.title')}</h2>
        <dl className={styles.facts}>
          <div>
            <dt>{t('profile.email')}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t('profile.birthDate')}</dt>
            <dd>{birthDate}</dd>
          </div>
          <div>
            <dt>{t('profile.memberSince')}</dt>
            <dd>{memberSince}</dd>
          </div>
        </dl>
        <PseudoForm pseudo={user.name} />
      </section>

      <section className={styles.section} aria-labelledby="password">
        <h2 id="password">{t('password.title')}</h2>
        <ChangePasswordForm />
      </section>

      <section className={styles.section} aria-labelledby="data">
        <h2 id="data">{t('data.title')}</h2>
        <p className={styles.muted}>{t('data.intro')}</p>
        {/* A plain link: the browser downloads the file the route sends. */}
        <a className={`btn btn-secondary ${styles.download}`} href="/account/export" download>
          <Download aria-hidden />
          {t('data.export')}
        </a>
      </section>

      <section className={`${styles.section} ${styles.danger}`} aria-labelledby="delete">
        <h2 id="delete">{t('delete.title')}</h2>
        <p className={styles.muted}>{t('delete.intro')}</p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
