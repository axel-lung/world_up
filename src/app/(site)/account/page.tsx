import { AtSign, ChevronDown, ChevronRight, CircleHelp, Download, KeyRound, LogIn, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ChangePasswordForm, DeleteAccountForm, PseudoForm, SignOutButton } from '@/components/account/AccountForms';
import { FooterLinks } from '@/components/layout/SiteHeader';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch';
import { Sheet, type SheetTrigger } from '@/components/ui/Sheet';
import { db } from '@/db';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { coinBalance } from '@/lib/game/coins';
import { collectionCounts } from '@/lib/game/collection';
import { playerRank } from '@/lib/game/leaderboard';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import { signInMethods } from '@/lib/sign-in-methods';
import { themePreference } from '@/lib/theme-preference';
import phone from '../phone.module.css';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account');
  return { title: t('title') };
}

/**
 * The player's account. A phone shows it as a profile: who they are and their
 * figures, then the settings as rows, each opening its form in a sheet (the
 * same form a wider screen shows in its section), the theme, the site's
 * information, signing out and deleting the account.
 */
// Subscription, spending cap and purchase history join this page in lot 4.
export default async function AccountPage() {
  const { user } = await requireSession('/account', { terms: false });
  const [t, tNav, tGame, format, methods, cookieStore, collection] = await Promise.all([
    getTranslations('Account'),
    getTranslations('Nav'),
    getTranslations('Game'),
    getFormatter(),
    signInMethods(user.id),
    cookies(),
    getActiveCollection(DEFAULT_COLLECTION_SLUG),
  ]);
  // The player's figures in the game, for the phone's profile
  const [counts, balance, rank] = collection
    ? await Promise.all([
        collectionCounts({ userId: user.id, collectionId: collection.id }),
        coinBalance(db, user.id),
        playerRank(collection.id, user.id),
      ])
    : [null, null, null];
  // birthDate is a calendar date: format it in UTC so it never shifts by a day.
  const birthDate = format.dateTime(new Date(`${user.birthDate}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  const memberSince = format.dateTime(user.createdAt, { dateStyle: 'long', timeZone: 'Europe/Paris' });
  const signIn = format.list(
    [methods.password && t('profile.methodPassword'), methods.google && t('profile.methodGoogle')].filter((method) => method !== false),
  );

  // A phone's setting: an icon, its name, its value, then a chevron
  const row = (icon: ReactNode, label: string, value: string | null, className?: string): SheetTrigger => ({
    className: [styles.row, className].filter(Boolean).join(' '),
    content: (
      <>
        {icon}
        <span className={styles.rowLabel}>{label}</span>
        {value && <span className={styles.rowValue}>{value}</span>}
        <ChevronRight aria-hidden className={styles.chevron} />
      </>
    ),
  });

  return (
    <main className={`${styles.page} ${phone.page}`}>
      <header className={`${phone.head} phone-only`}>
        <h1>{t('profileTitle')}</h1>
      </header>
      <header className={`${styles.header} wide-only`}>
        <h1>{t('title')}</h1>
        <SignOutButton />
      </header>

      <section className={`${phone.card} ${styles.identity} phone-only`} data-disc="sage" aria-labelledby="identity-heading">
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden="true">
            {user.name.charAt(0).toLocaleUpperCase('fr')}
          </span>
          <span className={styles.whoText}>
            <h2 id="identity-heading" className={styles.pseudo}>
              {user.name}
            </h2>
            <span className={styles.since}>{t('memberSinceOn', { date: memberSince })}</span>
          </span>
        </div>
        {collection && counts && balance !== null && (
          <ul className={styles.stats}>
            <li>
              <Link href={gamePath(collection.slug).collection} className={styles.stat}>
                <span className={styles.statValue}>{format.number(counts.owned)}</span>
                <span className={styles.statLabel}>{tGame('stats.cards', { count: counts.owned })}</span>
              </Link>
            </li>
            <li>
              <span className={styles.stat}>
                <span className={styles.statValue}>{format.number(balance)}</span>
                <span className={styles.statLabel}>{tGame('stats.coins', { count: balance })}</span>
              </span>
            </li>
            <li>
              <Link href="/leaderboard" className={styles.stat}>
                <span className={styles.statValue}>{rank ? tGame('stats.rankValue', { rank }) : '–'}</span>
                <span className={styles.statLabel}>{tGame('stats.rank')}</span>
              </Link>
            </li>
          </ul>
        )}
      </section>

      {/* The settings: sections on a wider screen, rows of one list on a phone */}
      <div className={styles.settings}>
        <section className={`${styles.section} ${styles.setting}`} aria-labelledby="profile">
          <h2 id="profile" className="wide-only">
            {t('profile.title')}
          </h2>
          <Sheet inline title={t('profile.email')} trigger={row(<Mail aria-hidden />, t('profile.email'), user.email)}>
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
                <dd>{signIn}</dd>
              </div>
              <div>
                <dt>{t('profile.memberSince')}</dt>
                <dd>{memberSince}</dd>
              </div>
            </dl>
          </Sheet>
          <Sheet
            inline
            title={t('profile.pseudo')}
            trigger={row(<AtSign aria-hidden />, t('profile.pseudo'), user.name, styles.first)}
          >
            <PseudoForm pseudo={user.name} />
          </Sheet>
        </section>

        <section className={`${styles.section} ${styles.setting}`} aria-labelledby="password">
          <h2 id="password" className="wide-only">
            {t('password.title')}
          </h2>
          <Sheet inline title={t('password.title')} trigger={row(<KeyRound aria-hidden />, t('password.title'), null)}>
            {methods.password ? (
              <ChangePasswordForm />
            ) : (
              <p className={styles.muted}>
                {t.rich('password.none', { link: (chunks) => <Link href="/forgot-password">{chunks}</Link> })}
              </p>
            )}
          </Sheet>
        </section>

        <div className={`${styles.row} ${styles.static} phone-only`}>
          <LogIn aria-hidden />
          <span className={styles.rowLabel}>{t('profile.signIn')}</span>
          <span className={styles.rowValue}>{signIn}</span>
        </div>

        <section className={`${styles.section} ${styles.setting}`} aria-labelledby="data">
          <h2 id="data" className="wide-only">
            {t('data.title')}
          </h2>
          <Sheet inline title={t('data.title')} trigger={row(<Download aria-hidden />, t('data.title'), null)}>
            <p className={styles.muted}>{t('data.intro')}</p>
            {/* A plain link: the browser downloads the file the route sends. */}
            <a className={`btn btn-secondary ${styles.download}`} href="/account/export" download>
              <Download aria-hidden />
              {t('data.export')}
            </a>
          </Sheet>
        </section>
      </div>

      {/* A phone hides a player's footer: its theme and links are here instead */}
      <div className={`${styles.theme} phone-only`}>
        <span aria-hidden="true">{t('more.theme')}</span>
        <ThemeSwitch initial={themePreference(cookieStore)} name="theme-account" />
      </div>
      <details className={`${styles.help} phone-only`}>
        <summary>
          <CircleHelp aria-hidden className={styles.helpIcon} />
          <span>{t('more.help')}</span>
          <ChevronDown aria-hidden className={styles.helpChevron} />
        </summary>
        <FooterLinks className={styles.links} />
        <p className={styles.muted}>{tNav('noMoneyValue')}</p>
      </details>
      <SignOutButton block className="phone-only" />

      <section className={`${styles.section} ${styles.danger} ${styles.deletion}`} aria-labelledby="delete">
        <h2 id="delete" className="wide-only">
          {t('delete.title')}
        </h2>
        <Sheet inline title={t('delete.title')} trigger={{ className: styles.deleteLink, content: t('delete.title') }}>
          <p className={styles.muted}>{t('delete.intro')}</p>
          <DeleteAccountForm password={methods.password} />
        </Sheet>
      </section>
    </main>
  );
}
