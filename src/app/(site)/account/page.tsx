import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ChangePasswordForm, DeleteAccountForm, PseudoForm, SignOutButton } from '@/components/account/AccountForms';
import { FooterLinks } from '@/components/layout/SiteHeader';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch';
import { requireSession } from '@/lib/session';
import { signInMethods } from '@/lib/sign-in-methods';
import { themePreference } from '@/lib/theme-preference';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account');
  return { title: t('title') };
}

// Subscription, spending cap and purchase history join this page in lot 4.
export default async function AccountPage() {
  const { user } = await requireSession('/account', { terms: false });
  const [t, tNav, format, methods, cookieStore] = await Promise.all([
    getTranslations('Account'),
    getTranslations('Nav'),
    getFormatter(),
    signInMethods(user.id),
    cookies(),
  ]);
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
            <dt>{t('profile.signIn')}</dt>
            <dd>{format.list([methods.password && t('profile.methodPassword'), methods.google && t('profile.methodGoogle')].filter((method) => method !== false))}</dd>
          </div>
          <div>
            <dt>{t('profile.memberSince')}</dt>
            <dd>{memberSince}</dd>
          </div>
        </dl>
        <PseudoForm pseudo={user.name} />
      </section>

      {/* A phone hides a player's footer: its theme and links are here instead */}
      <section className={`${styles.section} ${styles.more}`} aria-labelledby="more">
        <h2 id="more">{t('more.title')}</h2>
        <div className={styles.theme}>
          <span aria-hidden="true">{t('more.theme')}</span>
          <ThemeSwitch initial={themePreference(cookieStore)} name="theme-account" />
        </div>
        <FooterLinks className={styles.links} />
        <p className={styles.muted}>{tNav('noMoneyValue')}</p>
      </section>

      <section className={styles.section} aria-labelledby="password">
        <h2 id="password">{t('password.title')}</h2>
        {methods.password ? (
          <ChangePasswordForm />
        ) : (
          <p className={styles.muted}>
            {t.rich('password.none', { link: (chunks) => <Link href="/forgot-password">{chunks}</Link> })}
          </p>
        )}
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
        <DeleteAccountForm password={methods.password} />
      </section>
    </main>
  );
}
