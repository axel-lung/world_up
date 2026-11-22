import { ArrowLeftRight, CircleUser, Coins, House, Layers, PackageOpen } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PackReserveCompact } from '@/components/pack/PackReserve';
import { PushPrompt } from '@/components/social/PushPrompt';
import { ButtonLink } from '@/components/ui/Button';
import { receivedOffers } from '@/lib/game/trades';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { ANNOUNCEMENT_COOKIE } from '@/lib/announcement-shared';
import { currentAnnouncement } from '@/lib/announcements';
import { getActiveCollection } from '@/lib/game/rules';
import { appPushEnabled } from '@/lib/notifications/push';
import { receivedRequestCount } from '@/lib/social/friends';
import { themePreference } from '@/lib/theme-preference';
import { NavLinks } from './NavLinks';
import { NotificationBell } from './NotificationBell';
import { AnnouncementBanner } from './AnnouncementBanner';
import { getPlayerStatus } from './player-status';
import styles from './SiteHeader.module.css';
import { TabBar } from './TabBar';
import { ThemeSwitch } from './ThemeSwitch';

/**
 * The site's header: the game's pages, and the player's packs, coins and
 * notifications once signed in. On a phone, a player's links move to the tab
 * bar (SiteTabBar) and the rest of the header stays in sight.
 */
export async function SiteHeader() {
  const [t, { session, now, game, player }] = await Promise.all([getTranslations('Nav'), getPlayerStatus()]);

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
    <header className={styles.header} data-player={player ? true : undefined}>
      <a href="#content" className={styles.skip}>
        {t('skip')}
      </a>
      <div className={styles.bar}>
        <Link href={session && game ? game.home : '/'} className={styles.brand}>
          {/* The name beside it names the link; on a narrow screen it is only read out */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a WebP already sized, like the cards */}
          <img
            src="/logo/world-up-96.webp"
            srcSet="/logo/world-up-96.webp 96w, /logo/world-up-144.webp 144w"
            sizes="(max-width: 479px) 40px, 48px"
            width={96}
            height={96}
            alt=""
          />
          <span className={styles.brandName}>{t('brand')}</span>
        </Link>
        <div className={styles.player}>
          {player && game ? (
            <>
              {/* Named by the reserve's own sentence: "7 paquets en réserve, prochain dans 04:32" */}
              <Link href={game.open} className={styles.reserve}>
                <PackReserveCompact
                  available={player.reserve.packs}
                  max={player.reserve.maxReserve}
                  nextPackAt={player.reserve.nextPackAt?.toISOString() ?? null}
                  serverNow={now.toISOString()}
                />
              </Link>
              <span className={styles.coins}>
                <Coins aria-hidden />
                <span>{t.rich('coins', { count: player.coins, word: (chunks) => <span className={styles.coinsWord}>{chunks}</span> })}</span>
              </span>
              <NotificationBell unread={player.unread} label={t('activity', { count: player.unread })} />
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

/**
 * The back-office's announcement over every page, unless this visitor closed
 * it (its ID in the cookie).
 */
export async function SiteAnnouncement() {
  const [announcement, cookieStore] = await Promise.all([currentAnnouncement(), cookies()]);
  if (!announcement || cookieStore.get(ANNOUNCEMENT_COOKIE)?.value === String(announcement.id)) return null;
  const { id, message, linkUrl, linkLabel, tone } = announcement;
  return <AnnouncementBanner announcement={{ id, message, linkUrl, linkLabel, tone }} />;
}

/**
 * A player's navigation on a phone (TabBar.tsx): home, collection, the packs
 * (raised, with the packs waiting), the trades, which also stand for the
 * friends and the leaderboard (SocialTabs), with what waits for an answer,
 * and the profile. The market is reached from the collection and the cards.
 * Nothing for a visitor.
 */
export async function SiteTabBar() {
  const [t, tSocial, { session, now, game, player }] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Social'),
    getPlayerStatus(),
  ]);
  if (!session || !player || !game) return null;
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  const [offers, requests] = await Promise.all([
    collection ? receivedOffers(session.user.id, collection.id, now) : 0,
    receivedRequestCount(session.user.id),
  ]);
  const packs = player.reserve.packs;
  const waiting = offers + requests;
  return (
    <TabBar
      label={t('label')}
      items={[
        { href: game.home, label: t('home'), icon: <House aria-hidden /> },
        {
          href: game.collection,
          label: t('collection'),
          icon: <Layers aria-hidden />,
          prefix: true,
          also: [`${game.home}/series`, `${game.home}/cards`],
        },
        {
          href: game.packs,
          label: t('packsTab'),
          icon: <PackageOpen aria-hidden />,
          primary: true,
          also: [game.open],
          badge: packs > 0 ? { value: String(packs), label: t('packs', { count: packs }) } : undefined,
        },
        {
          href: game.trades,
          label: t('trades'),
          icon: <ArrowLeftRight aria-hidden />,
          prefix: true,
          also: ['/friends', `${game.home}/friends`, '/leaderboard'],
          badge: waiting > 0 ? { value: waiting > 99 ? '99+' : String(waiting), label: tSocial('waiting', { count: waiting }) } : undefined,
        },
        { href: '/account', label: t('profile'), icon: <CircleUser aria-hidden /> },
      ]}
    />
  );
}

/**
 * In the app, asks a signed-in player to turn the notifications on, after each
 * sign-in and each update of the app (PushPrompt), while the server sends to
 * the app. Nothing in a browser.
 */
export async function SitePushPrompt() {
  const { session } = await getPlayerStatus();
  if (!session || !appPushEnabled()) return null;
  return <PushPrompt signedInAt={session.session.createdAt.getTime()} />;
}

export async function SiteFooter() {
  const [t, cookieStore, { player }] = await Promise.all([getTranslations('Nav'), cookies(), getPlayerStatus()]);
  return (
    <footer className={styles.footer} data-player={player ? true : undefined}>
      <FooterLinks />
      <ThemeSwitch initial={themePreference(cookieStore)} />
      <p>{t('noMoneyValue')}</p>
    </footer>
  );
}

/** The footer's links, also listed on a player's account page, where a phone shows them instead. */
export async function FooterLinks({ className }: { className?: string }) {
  const t = await getTranslations('Nav');
  return (
    <ul className={className}>
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
  );
}
