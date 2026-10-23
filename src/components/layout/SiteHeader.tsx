import { CircleUser, Coins } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PackReserveCompact } from '@/components/pack/PackReserve';
import { ButtonLink } from '@/components/ui/Button';
import { db } from '@/db';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { coinBalance } from '@/lib/game/coins';
import { gamePath } from '@/lib/game/paths';
import { getReserve } from '@/lib/game/packs';
import { getActiveCollection } from '@/lib/game/rules';
import { unreadCount } from '@/lib/notifications/notifications';
import { getSession } from '@/lib/session';
import { themePreference } from '@/lib/theme-preference';
import { NavLinks } from './NavLinks';
import { NotificationBell } from './NotificationBell';
import styles from './SiteHeader.module.css';
import { ThemeSwitch } from './ThemeSwitch';

/** The site's header: the game's pages, and the player's packs, coins and notifications once signed in. */
export async function SiteHeader() {
  const [t, session, collection] = await Promise.all([
    getTranslations('Nav'),
    getSession(),
    getActiveCollection(DEFAULT_COLLECTION_SLUG),
  ]);
  const now = new Date();
  const player =
    session && collection
      ? await Promise.all([
          getReserve(session.user.id, collection.id, now),
          coinBalance(db, session.user.id),
          unreadCount(session.user.id),
        ])
      : null;
  const game = collection ? gamePath(collection.slug) : null;

  const items = [
    ...(session && game
      ? [
          { href: game.home, label: t('home') },
          { href: game.open, label: t('open') },
          { href: game.collection, label: t('collection'), prefix: true },
          { href: game.market, label: t('market'), prefix: true },
          { href: '/friends', label: t('friends') },
        ]
      : []),
    { href: '/leaderboard', label: t('leaderboard') },
    { href: '/rules', label: t('rules') },
  ];

  return (
    <header className={styles.header}>
      <a href="#content" className={styles.skip}>
        {t('skip')}
      </a>
      <div className={styles.bar}>
        <Link href={session && game ? game.home : '/'} className={styles.brand}>
          {t('brand')}
        </Link>
        <div className={styles.player}>
          {player && game ? (
            <>
              {/* Named by the reserve's own sentence: "7 paquets en réserve, prochain dans 04:32" */}
              <Link href={game.open} className={styles.reserve}>
                <PackReserveCompact
                  available={player[0].packs}
                  max={player[0].maxReserve}
                  nextPackAt={player[0].nextPackAt?.toISOString() ?? null}
                  serverNow={now.toISOString()}
                />
              </Link>
              <span className={styles.coins}>
                <Coins aria-hidden />
                <span>{t.rich('coins', { count: player[1], word: (chunks) => <span className={styles.coinsWord}>{chunks}</span> })}</span>
              </span>
              <NotificationBell unread={player[2]} label={t('activity', { count: player[2] })} />
              <Link href="/account" className={styles.account}>
                <CircleUser aria-hidden />
                <span className={styles.accountLabel}>{t('account')}</span>
              </Link>
            </>
          ) : (
            <>
              <ButtonLink href="/login">{t('login')}</ButtonLink>
              <ButtonLink href="/signup" variant="primary" className={styles.signup}>
                {t('signup')}
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      <NavLinks items={items} label={t('label')} />
    </header>
  );
}

export async function SiteFooter() {
  const [t, cookieStore] = await Promise.all([getTranslations('Nav'), cookies()]);
  return (
    <footer className={styles.footer}>
      <ul>
        <li>
          <Link href="/rules">{t('rules')}</Link>
        </li>
        <li>
          <Link href="/odds">{t('odds')}</Link>
        </li>
        <li>
          <Link href="/leaderboard">{t('leaderboard')}</Link>
        </li>
        <li>
          <Link href="/credits">{t('credits')}</Link>
        </li>
        <li>
          <Link href="/terms">{t('terms')}</Link>
        </li>
        <li>
          <Link href="/privacy">{t('privacy')}</Link>
        </li>
        <li>
          <Link href="/legal-notice">{t('legalNotice')}</Link>
        </li>
      </ul>
      <ThemeSwitch initial={themePreference(cookieStore)} />
      <p>{t('noMoneyValue')}</p>
    </footer>
  );
}
