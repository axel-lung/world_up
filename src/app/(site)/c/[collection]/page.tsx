import { randomUUID } from 'node:crypto';
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUser,
  Coins,
  Copy,
  Heart,
  History,
  Info,
  Layers,
  LayoutGrid,
  Map as MapIcon,
  Medal,
  PackageOpen,
  Percent,
  Store,
  Tag,
  Trophy,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { PackReserve, PackReserveHero } from '@/components/pack/PackReserve';
import { StreakButton } from '@/components/streak/StreakButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { Sheet, type SheetTrigger } from '@/components/ui/Sheet';
import { db } from '@/db';
import { achievementTitle } from '@/lib/game/achievement-title';
import { listAchievements } from '@/lib/game/achievements';
import { coinBalance, duplicatesValue } from '@/lib/game/coins';
import { collectionCounts, seriesProgress, type SeriesProgress } from '@/lib/game/collection';
import { playerRank } from '@/lib/game/leaderboard';
import { wishesOnSale } from '@/lib/game/market';
import { getReserve } from '@/lib/game/packs';
import { getStreak } from '@/lib/game/streaks';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { nextReceivedOffer, receivedOffers } from '@/lib/game/trades';
import { unreadCount } from '@/lib/notifications/notifications';
import { requireSession } from '@/lib/session';
import { receivedRequestCount } from '@/lib/social/friends';
import phone from '../../phone.module.css';
import { resellAction } from './collection/actions';
import { parseResaleParams } from './filters';
import styles from './game.module.css';
import home from './home.module.css';
import { ResaleNotice } from './ResaleNotice';

export async function generateMetadata({ params }: PageProps<'/c/[collection]'>): Promise<Metadata> {
  const collection = await getActiveCollection((await params).collection);
  return collection ? { title: collection.name } : {};
}

const SERIES_GROUPS: SeriesProgress['type'][] = ['region', 'family', 'unesco', 'endangered'];
// What the home shows before "Voir tout": the series furthest along, the achievements closest
const TOP_SERIES = 4;
type AchievementProgress = Awaited<ReturnType<typeof listAchievements>>[number];
const NEXT_ACHIEVEMENTS = 3;

/** A tile's family, which gives its colors: the collection, trading, playing, the rest. */
type MenuTone = 'collection' | 'trade' | 'play' | 'info';

/**
 * The player's home in a collection: packs, progress, coins, then the series
 * furthest along and the achievements closest to hand, each with the full list
 * folded under "Voir tout". A phone gets it at a glance instead: the reserve
 * and its button, three figures, a mosaic of tiles to every part of the game
 * (Claude Design's "Accueil - Menu global.dc.html", option 2b), then what
 * waits for the player ("À faire").
 */
export default async function GameHomePage({ params, searchParams }: PageProps<'/c/[collection]'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.home);
  const now = new Date();

  const [
    t,
    tNav,
    tTrades,
    tAchievement,
    tRarity,
    format,
    query,
    reserve,
    streak,
    counts,
    series,
    achievements,
    balance,
    duplicates,
    rank,
    offer,
    offers,
    requests,
    unread,
    wishedOnSale,
  ] = await Promise.all([
      getTranslations('Game'),
      getTranslations('Nav'),
      getTranslations('Trades'),
      getTranslations('Achievements'),
      getTranslations('Rarity'),
      getFormatter(),
      searchParams,
      getReserve(user.id, collection.id, now),
      getStreak(user.id, collection.id, now),
      collectionCounts({ userId: user.id, collectionId: collection.id }),
      seriesProgress(user.id, collection.id),
      listAchievements(user.id, collection.id),
      coinBalance(db, user.id),
      duplicatesValue(user.id, collection.id, now),
      playerRank(collection.id, user.id),
      nextReceivedOffer(user.id, collection.id, now),
      receivedOffers(user.id, collection.id, now),
      receivedRequestCount(user.id),
      unreadCount(user.id),
      wishesOnSale(user.id, collection.id, now),
    ]);
  const number = (value: number) => format.number(value);
  const percent = (owned: number, total: number) =>
    format.number(total ? owned / total : 0, { style: 'percent', maximumFractionDigits: 1 });
  const obtained = achievements.filter((a) => a.obtainedAt).length;
  const share = (owned: number, total: number) => (total ? owned / total : 0);
  const topSeries = series
    .filter((s) => s.owned > 0)
    .sort((a, b) => share(b.owned, b.total) - share(a.owned, a.total) || b.owned - a.owned)
    .slice(0, TOP_SERIES);
  const nextAchievements = achievements
    .filter((a) => !a.obtainedAt)
    .sort((a, b) => b.progress / b.threshold - a.progress / a.threshold || a.threshold - b.threshold)
    .slice(0, NEXT_ACHIEVEMENTS);
  const [nearest] = nextAchievements;
  const cardsCount = (items: { quantity: number }[]) => items.reduce((sum, item) => sum + item.quantity, 0);

  const seriesGauge = (s: SeriesProgress) => (
    <li key={s.id}>
      <Gauge
        label={<Link href={paths.series(s.slug)}>{s.name}</Link>}
        value={share(s.owned, s.total)}
        tone={s.type === 'unesco' ? 'sage' : 'accent'}
        valueText={`${number(s.owned)} / ${number(s.total)}`}
      />
    </li>
  );
  const achievementRow = (achievement: AchievementProgress) => (
    <li key={achievement.id} className={styles.achievement} data-done={achievement.obtainedAt ? true : undefined}>
      <span className={styles.achievementIcon} aria-hidden="true">
        {achievement.obtainedAt ? <Check /> : <Trophy />}
      </span>
      <span className={styles.achievementText}>
        <span>{achievementTitle(tAchievement, tRarity, achievement)}</span>
        <span className={styles.achievementMeta}>
          {achievement.obtainedAt
            ? t('obtainedOn', { date: format.dateTime(achievement.obtainedAt, { dateStyle: 'long', timeZone: 'Europe/Paris' }) })
            : t('progress', { progress: number(achievement.progress), threshold: number(achievement.threshold) })}
        </span>
      </span>
      <span className={styles.reward}>{t('reward', { coins: achievement.rewardCoins })}</span>
    </li>
  );
  // Every achievement in a sheet, the nearest first: from "À faire" and from the menu
  const achievementsSheet = (trigger: SheetTrigger) => (
    <Sheet title={t('achievementsHeading')} trigger={trigger}>
      <p className={phone.muted}>{t('achievementsCount', { obtained, total: achievements.length })}</p>
      <ul className={`${styles.achievements} ${home.achievements}`}>
        {[...nextAchievements, ...achievements.filter((a) => !nextAchievements.includes(a))].map(achievementRow)}
      </ul>
    </Sheet>
  );

  // A menu tile's face: its icon on a disc, its name, and what waits there as a
  // sticker, read out after the name (", 3 non lues")
  const menuFace = (icon: ReactNode, label: string, waiting?: { count: number; label: string }) => (
    <>
      <span className={home.menuIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={home.menuLabel}>{label}</span>
      {waiting && waiting.count > 0 && (
        <>
          <span className={home.menuCount} aria-hidden="true">
            {waiting.count > 99 ? '99+' : number(waiting.count)}
          </span>
          <span className="sr-only">, {waiting.label}</span>
        </>
      )}
    </>
  );
  const menuLink = (
    href: string,
    tone: MenuTone,
    icon: ReactNode,
    label: string,
    waiting?: { count: number; label: string },
  ) => (
    <li data-tone={tone}>
      <Link href={href} className={home.menuTile}>
        {menuFace(icon, label, waiting)}
      </Link>
    </li>
  );

  return (
    <main className={`${styles.page} ${phone.page}`}>
      <ResaleNotice outcome={parseResaleParams(query)} />

      {/* A phone */}
      <header className={`${phone.head} ${home.head} phone-only`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a WebP already sized, like the cards */}
        <img src="/logo/world-up-96.webp" width={96} height={96} alt={tNav('brand')} className={home.logo} />
        <h1>{t('welcome', { pseudo: user.name })}</h1>
        <StreakButton view={streak} collection={collection.slug} />
        <NotificationBell unread={unread} label={tNav('activity', { count: unread })} className={home.bell} />
      </header>

      <section className={`${phone.card} phone-only`} aria-labelledby="reserve-heading">
        <h2 id="reserve-heading" className="sr-only">
          {t('packsHeading')}
        </h2>
        <PackReserveHero
          available={reserve.packs}
          max={reserve.maxReserve}
          nextPackAt={reserve.nextPackAt?.toISOString() ?? null}
          serverNow={now.toISOString()}
          openHref={paths.open}
          emblem={collection.emblem}
        />
      </section>

      <ul className={`${phone.tiles} ${home.tiles} phone-only`}>
        <li>
          <Link href={paths.collection} className={phone.tile}>
            <Layers aria-hidden />
            <span className={phone.tileValue}>{number(counts.owned)}</span>
            <span className={phone.tileLabel}>{t('stats.cards', { count: counts.owned })}</span>
          </Link>
        </li>
        <li>
          <Link href="/account" className={phone.tile}>
            <Coins aria-hidden />
            <span className={phone.tileValue}>{number(balance)}</span>
            <span className={phone.tileLabel}>{t('stats.coins', { count: balance })}</span>
          </Link>
        </li>
        <li>
          <Link href="/leaderboard" className={phone.tile}>
            <Trophy aria-hidden />
            <span className={phone.tileValue}>{rank ? t('stats.rankValue', { rank }) : '–'}</span>
            <span className={phone.tileLabel}>{t('stats.rank')}</span>
          </Link>
        </li>
      </ul>

      {/* Four tiles a row, colored by family: the collection (sand), trading
          (sage), playing (terracotta), the rest (outlined) */}
      <nav className="phone-only" aria-label={t('menu.label')}>
        <ul className={home.menu}>
          {menuLink(paths.collection, 'collection', <Layers />, t('menu.collection'))}
          {menuLink(paths.map, 'collection', <MapIcon />, t('menu.map'))}
          {menuLink(`${paths.collection}?by=series`, 'collection', <LayoutGrid />, t('menu.series'))}
          {menuLink(`${paths.collection}?tab=duplicates`, 'collection', <Copy />, t('menu.duplicates'), {
            count: duplicates.copies,
            label: t('menu.toResell', { count: duplicates.copies }),
          })}
          {menuLink(paths.market, 'trade', <Store />, t('menu.market'))}
          {menuLink(paths.trades, 'trade', <ArrowLeftRight />, t('menu.trades'), {
            count: offers,
            label: t('menu.waiting', { count: offers }),
          })}
          {menuLink('/friends', 'trade', <Users />, t('menu.friends'), {
            count: requests,
            label: t('menu.waiting', { count: requests }),
          })}
          {menuLink('/leaderboard', 'trade', <Medal />, t('menu.leaderboard'))}
          {menuLink(paths.history, 'play', <History />, t('menu.history'))}
          {/* The streak's screen opens from the flame in the head */}
          <li data-tone="play">
            {achievementsSheet({
              className: home.menuTile,
              content: menuFace(<Trophy />, t('menu.achievements')),
            })}
          </li>
          {menuLink(paths.myAuctions, 'trade', <Tag />, t('menu.mySales'))}
          {menuLink('/activity', 'play', <Bell />, t('menu.activity'), {
            count: unread,
            label: t('menu.unread', { count: unread }),
          })}
          {menuLink('/account', 'info', <CircleUser />, t('menu.account'))}
          {menuLink('/rules', 'info', <BookOpen />, t('menu.rules'))}
          {menuLink('/odds', 'info', <Percent />, t('menu.odds'))}
          {menuLink('/credits', 'info', <Info />, t('menu.credits'))}
        </ul>
      </nav>

      {(offer || wishedOnSale > 0 || duplicates.copies > 0 || nearest) && (
        <section className={`${phone.section} phone-only`} aria-labelledby="todo-heading">
          <h2 id="todo-heading">{t('todo')}</h2>
          <ul className={phone.rows}>
            {offer && (
              <li>
                <Link href={`${paths.trades}?offer=${offer.id}`} className={phone.row}>
                  <span className={phone.disc} data-tone="sage" aria-hidden="true">
                    <ArrowLeftRight />
                  </span>
                  <span className={phone.rowText}>
                    <span className={phone.rowTitle}>{t('todoOffer', { pseudo: offer.other ?? tTrades('formerPlayer') })}</span>
                    <span className={phone.rowMeta}>
                      {tTrades('summary', { give: cardsCount(offer.gives), get: cardsCount(offer.gets) })} ·{' '}
                      {tTrades('expiresIn', { when: format.relativeTime(offer.expiresAt, now) })}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className={phone.chevron} />
                </Link>
              </li>
            )}
            {wishedOnSale > 0 && (
              <li>
                <Link href={paths.marketWished} className={phone.row}>
                  <span className={phone.disc} data-tone="accent" aria-hidden="true">
                    <Heart />
                  </span>
                  <span className={phone.rowText}>
                    <span className={phone.rowTitle}>{t('todoWished', { count: wishedOnSale })}</span>
                    <span className={phone.rowMeta}>{t('todoWishedWhere')}</span>
                  </span>
                  <ChevronRight aria-hidden className={phone.chevron} />
                </Link>
              </li>
            )}
            {duplicates.copies > 0 && (
              <li>
                <Sheet
                  title={t('resellTitle')}
                  closeOnSubmit
                  trigger={{
                    className: phone.row,
                    content: (
                      <>
                        <span className={phone.disc} data-tone="accent" aria-hidden="true">
                          <Coins />
                        </span>
                        <span className={phone.rowText}>
                          <span className={phone.rowTitle}>{t('todoDuplicates', { copies: duplicates.copies })}</span>
                          <span className={phone.rowMeta}>{t('todoDuplicatesFor', { coins: duplicates.coins })}</span>
                        </span>
                        <ChevronRight aria-hidden className={phone.chevron} />
                      </>
                    ),
                  }}
                >
                  <form action={resellAction} className={home.resell}>
                    <p>{t('resellAllQuestion', { copies: duplicates.copies, coins: duplicates.coins })}</p>
                    <p className={phone.muted}>{t('resellHint')}</p>
                    <input type="hidden" name="collection" value={collection.slug} />
                    {/* A new key each time the page renders: sending the form twice sells once */}
                    <input type="hidden" name="key" value={randomUUID()} />
                    <input type="hidden" name="back" value={paths.home} />
                    <Button type="submit" variant="primary" size="large" block icon={<Coins aria-hidden />}>
                      {t('resellAllSubmit', { copies: duplicates.copies })}
                    </Button>
                  </form>
                </Sheet>
              </li>
            )}
            {nearest && (
              <li>
                {achievementsSheet({
                  className: phone.row,
                  content: (
                    <>
                      <span className={phone.disc} aria-hidden="true">
                        <Trophy />
                      </span>
                      <span className={phone.rowText}>
                        <span className={phone.rowTitle}>{achievementTitle(tAchievement, tRarity, nearest)}</span>
                        <span className={phone.rowMeta}>
                          {t('progress', { progress: number(nearest.progress), threshold: number(nearest.threshold) })} ·{' '}
                          {t('reward', { coins: nearest.rewardCoins })}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className={phone.chevron} />
                    </>
                  ),
                })}
              </li>
            )}
          </ul>
        </section>
      )}

      {/* A wider screen */}
      <header className={`${styles.header} wide-only`}>
        <p className={styles.eyebrow}>{collection.name}</p>
        <div className={home.wideTitle}>
          <h1>{t('welcome', { pseudo: user.name })}</h1>
          <StreakButton view={streak} collection={collection.slug} />
        </div>
      </header>

      <div className={`${styles.columns} wide-only`}>
        <section className={styles.section} aria-labelledby="packs-heading">
          <h2 id="packs-heading">{t('packsHeading')}</h2>
          <PackReserve
            available={reserve.packs}
            max={reserve.maxReserve}
            nextPackAt={reserve.nextPackAt?.toISOString() ?? null}
            serverNow={now.toISOString()}
            refillMinutes={reserve.refillMinutes}
            shopHref={null}
          />
          <div className={styles.actions}>
            <ButtonLink href={paths.open} variant="primary" size="large" icon={<PackageOpen aria-hidden />}>
              {t('openPack')}
            </ButtonLink>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="collection-heading">
          <h2 id="collection-heading">{t('collectionHeading')}</h2>
          <Gauge
            label={t('myCollection')}
            value={counts.all ? counts.owned / counts.all : 0}
            valueText={`${number(counts.owned)} / ${number(counts.all)} · ${percent(counts.owned, counts.all)}`}
          />
          <p className={styles.balance}>
            <Coins aria-hidden />
            <span>{t.rich('balance', { count: balance, strong: (chunks) => <strong>{chunks}</strong> })}</span>
          </p>
          {duplicates.copies > 0 && (
            <p className={styles.muted}>
              {t('duplicates', { copies: duplicates.copies, coins: duplicates.coins })}
            </p>
          )}
          <div className={styles.actions}>
            <ButtonLink href={paths.collection}>{t('seeCollection')}</ButtonLink>
            {duplicates.copies > 0 && (
              <ButtonLink href={`${paths.collection}?tab=duplicates`} variant="ghost">
                {t('seeDuplicates')}
              </ButtonLink>
            )}
          </div>
        </section>
      </div>

      <section className={`${styles.section} wide-only`} aria-labelledby="series-heading">
        <h2 id="series-heading">{t('seriesHeading')}</h2>
        {topSeries.length > 0 ? (
          <ul className={styles.gauges}>{topSeries.map(seriesGauge)}</ul>
        ) : (
          <p className={styles.muted}>{t('noSeriesYet')}</p>
        )}
        <details className={styles.seeAll}>
          <summary>
            {t('allSeries', { count: series.length })}
            <ChevronDown aria-hidden />
          </summary>
          <div className={styles.stack}>
            {SERIES_GROUPS.map((type) => {
              const group = series.filter((s) => s.type === type);
              if (group.length === 0) return null;
              return (
                <div key={type} className={styles.stack}>
                  <h3 className={styles.groupTitle}>{t(`seriesTypes.${type}`)}</h3>
                  <ul className={styles.gauges}>{group.map(seriesGauge)}</ul>
                </div>
              );
            })}
          </div>
        </details>
      </section>

      <section className={`${styles.section} wide-only`} aria-labelledby="achievements-heading">
        <div className={styles.sectionHeader}>
          <h2 id="achievements-heading">{t('achievementsHeading')}</h2>
          <span className={styles.muted}>{t('achievementsCount', { obtained, total: achievements.length })}</span>
        </div>
        {nextAchievements.length > 0 && (
          <>
            <h3 className={styles.groupTitle}>{t('nextAchievements')}</h3>
            <ul className={styles.achievements}>{nextAchievements.map(achievementRow)}</ul>
          </>
        )}
        <details className={styles.seeAll}>
          <summary>
            {t('allAchievements', { count: achievements.length })}
            <ChevronDown aria-hidden />
          </summary>
          <ul className={styles.achievements}>{achievements.map(achievementRow)}</ul>
        </details>
      </section>
    </main>
  );
}
