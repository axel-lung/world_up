import { randomUUID } from 'node:crypto';
import { ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Coins, Gavel, Map as MapIcon, RotateCw, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { RarityBadge } from '@/components/rarity/Rarity';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Tag } from '@/components/ui/Tag';
import { WishButton } from '@/components/wishlist/WishButton';
import { db } from '@/db';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { articleUrl, cardImageUrl, cardPath, commonsFileUrl, getVisibleCard, type VisibleCard } from '@/lib/catalog/cards';
import { licenseLinkUrl, WIKIPEDIA_TEXT_LICENSE_URL } from '@/lib/catalog/licenses';
import { type CardNeighbours, getSeries, ownedCopies, ownedNeighbours } from '@/lib/game/collection';
import { liveAuctionsOfCard, sellableCopies } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getResaleValues } from '@/lib/game/rules';
import { isWished } from '@/lib/game/wishlist';
import { getSession } from '@/lib/session';
import { listFriends } from '@/lib/social/friends';
import phone from '../../../../phone.module.css';
import { resellAction } from '../../collection/actions';
import { parseGridParams, parseResaleParams } from '../../filters';
import { ResaleNotice } from '../../ResaleNotice';
import styles from './page.module.css';
import { ReportForm } from './ReportForm';

// Public card pages are the game's entry points from search engines: the
// photo, the excerpt and their credits, readable without an account.

const DESCRIPTION_MAX = 160;

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

const place = (card: VisibleCard) => [card.department, card.region].filter(Boolean).join(' · ');

// The list a player came from (?from=): their collection or a series, with its filters
const FROM = /^\/c\/([a-z0-9-]+)\/(collection|series\/([a-z0-9-]+))(\?[^#]*)?$/;

/**
 * The list the card was opened from, which its page goes back to, and the
 * card's place among the owned cards of it, for the phone's arrows. Without
 * one, the page goes back to the collection.
 */
async function origin(from: unknown, card: VisibleCard, collection: string, userId: string) {
  const match = typeof from === 'string' ? FROM.exec(from) : null;
  if (!match || match[1] !== collection) return { back: gamePath(collection).collection, list: null, neighbours: null };
  const filters = parseGridParams(Object.fromEntries(new URLSearchParams(match[4] ?? '')));
  const seriesSlug = match[3] ?? filters.series;
  const series = seriesSlug ? await getSeries(card.collectionId, seriesSlug) : null;
  const neighbours = await ownedNeighbours(
    {
      userId,
      collectionId: card.collectionId,
      rarity: filters.rarity,
      seriesId: series?.id ?? null,
      departmentCode: filters.department,
      tab: filters.tab,
    },
    card.id,
  );
  return { back: match[0], list: match[0], neighbours };
}

export async function generateMetadata({ params }: PageProps<'/c/[collection]/cards/[slug]'>): Promise<Metadata> {
  const { collection, slug } = await params;
  const card = await getVisibleCard(collection, slug);
  if (!card) return {};
  const t = await getTranslations('CardPage');
  const name = displayName(card.name);
  const description = card.excerpt
    ? shorten(card.excerpt, DESCRIPTION_MAX)
    : t('description', { name, place: place(card), collection: card.collectionName });
  const url = cardPath(collection, card.slug);
  const height = card.photoWidth && card.photoHeight ? Math.round((800 * card.photoHeight) / card.photoWidth) : undefined;
  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: name,
      description,
      images: [{ url: cardImageUrl(card.photoImage, 800), width: 800, height, alt: name }],
    },
  };
}

export default async function CardPage({ params, searchParams }: PageProps<'/c/[collection]/cards/[slug]'>) {
  const { collection, slug } = await params;
  const card = await getVisibleCard(collection, slug);
  if (!card) notFound();

  const [t, tCard, session, query] = await Promise.all([
    getTranslations('CardPage'),
    getTranslations('Card'),
    getSession(),
    searchParams,
  ]);
  // The signed-in player's copies, what one duplicate resells for, the copies
  // they can put up for auction and the auctions running for the card
  const now = new Date();
  const [copies, resale, sellable, auctions, from, friends, wished] = session
    ? await Promise.all([
        ownedCopies(session.user.id, card.id),
        getResaleValues(db, card.collectionId),
        sellableCopies(session.user.id, card.id, now),
        liveAuctionsOfCard(card.id, now),
        origin(query.from, card, collection, session.user.id),
        listFriends(session.user.id),
        isWished(session.user.id, card.id),
      ])
    : [0, null, 0, 0, null, [], false];
  const paths = gamePath(collection);
  // The page with the list it was opened from, which the arrows and the resale keep
  const page = cardPath(collection, card.slug);
  const within = (slug: string) =>
    from?.list ? `${cardPath(collection, slug)}?from=${encodeURIComponent(from.list)}` : cardPath(collection, slug);
  const neighbours: CardNeighbours | null = from?.neighbours ?? null;
  const name = displayName(card.name);
  const license = photoLicenseLabel(card.photoLicense, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
  });
  const [printed] = card.series;
  const external = (href: string) =>
    function ExternalLink(chunks: ReactNode) {
      return (
        <a href={href} target="_blank" rel="noopener">
          {chunks}
        </a>
      );
    };

  return (
    <main className={styles.page} data-player={session ? true : undefined} data-hide-tab-bar={session ? true : undefined}>
      {/* A player's phone: the card fills the screen, its actions within the thumb's reach */}
      {from && (
        <div className={`${styles.top} phone-only`}>
          <Link href={from.back} className={styles.round} aria-label={t('close')}>
            <X aria-hidden />
          </Link>
          <span className={styles.position}>
            {neighbours && t('position', { position: neighbours.position, total: neighbours.total })}
          </span>
          {copies > 0 ? (
            <span className={styles.copies}>
              <span aria-hidden="true">×{copies}</span>
              <span className="sr-only">{tCard('copiesLarge', { count: copies })}</span>
            </span>
          ) : (
            <span className={styles.spacer} aria-hidden="true" />
          )}
        </div>
      )}

      <header className={styles.header}>
        <Link href="/" className={styles.collection}>
          {card.collectionName}
        </Link>
        <h1>{name}</h1>
        <p className={styles.place}>{place(card)}</p>
        <div className={styles.tags}>
          {/* A player's phone has it on the card's frame only */}
          <span className={styles.rarity}>
            <RarityBadge rarity={card.rarity} />
          </span>
          {card.protection && <Tag>{t(`protection.${card.protection}`)}</Tag>}
          {card.unesco && <Tag variant="sage">{t('unesco')}</Tag>}
          {card.endangered && <Tag>{t('endangered')}</Tag>}
        </div>
      </header>

      <section className={styles.card} aria-labelledby="card-heading">
        <h2 id="card-heading" className="sr-only">
          {t('cardHeading')}
        </h2>
        {neighbours && (
          <Link href={within(neighbours.previous)} replace className={`${styles.arrow} phone-only`} aria-label={t('previous')}>
            <ChevronLeft aria-hidden />
          </Link>
        )}
        <div className={styles.face}>
          <Card
            card={toCardData(card, printed ? { name: printed.name, number: printed.number, total: printed.total } : null, license)}
            collection={{ name: card.collectionName, emblem: card.collectionEmblem }}
            size="large"
            flippable
            priority
            sizes="(max-width: 392px) calc(100vw - 32px), 360px"
            copies={Math.max(copies, 1)}
          />
        </div>
        {neighbours && (
          <Link
            href={within(neighbours.next)}
            replace
            className={`${styles.arrow} ${styles.next} phone-only`}
            aria-label={t('next')}
          >
            <ChevronRight aria-hidden />
          </Link>
        )}
      </section>
      {session && (
        <p className={`${styles.hint} phone-only`}>
          <RotateCw aria-hidden />
          {t('flipHint')}
        </p>
      )}

      <div className={styles.details}>
        {session && (
          <section className={`${styles.section} ${styles.owned}`} aria-labelledby="owned-heading">
            <h2 id="owned-heading">{t('ownedHeading')}</h2>
            <ResaleNotice outcome={parseResaleParams(query)} />
            <p>{copies > 0 ? t('owned', { count: copies }) : t('notOwned')}</p>
            {copies === 0 && (
              <div className={styles.actions}>
                <WishButton collection={collection} cardId={card.id} name={card.name} wished={wished} variant="button" />
              </div>
            )}
            {copies > 1 && resale && (
              <form action={resellAction} className={styles.actions}>
                <input type="hidden" name="collection" value={collection} />
                <input type="hidden" name="cardId" value={card.id} />
                {/* A new key each time the page renders: sending the form twice sells once */}
                <input type="hidden" name="key" value={randomUUID()} />
                <input type="hidden" name="back" value={page} />
                <Button type="submit" icon={<Coins aria-hidden />}>
                  {t('resellOne', { coins: resale[card.rarity] })}
                </Button>
              </form>
            )}
            {(sellable > 0 || auctions > 0) && (
              <div className={styles.actions}>
                {sellable > 0 && (
                  <ButtonLink href={paths.sell(card.slug)} icon={<Gavel aria-hidden />}>
                    {t('sell')}
                  </ButtonLink>
                )}
                {auctions > 0 && (
                  <ButtonLink href={paths.marketOfCard(card.slug)} variant="ghost">
                    {t('liveAuctions', { count: auctions })}
                  </ButtonLink>
                )}
              </div>
            )}
          </section>
        )}

        {/* Outside what the player owns, which a phone keeps for the dock */}
        {session && card.latitude !== null && (
          <div className={`${styles.actions} ${styles.mapAction}`}>
            <ButtonLink href={paths.mapOfCard(card.slug)} icon={<MapIcon aria-hidden />}>
              {t('seeOnMap')}
            </ButtonLink>
          </div>
        )}

        {card.excerpt && (
          <section className={styles.section} aria-labelledby="about-heading">
            <h2 id="about-heading">{t('aboutHeading')}</h2>
            <p>{card.excerpt}</p>
            <a className={styles.external} href={articleUrl(card.articleTitle)} target="_blank" rel="noopener">
              {tCard('readArticle')}
              <ArrowUpRight aria-hidden />
            </a>
            <p className={styles.license}>{tCard.rich('textLicense', { link: external(WIKIPEDIA_TEXT_LICENSE_URL) })}</p>
          </section>
        )}

        {card.series.length > 0 && (
          <section className={`${styles.section} ${styles.facts}`} aria-labelledby="series-heading">
            <h2 id="series-heading">{t('seriesHeading')}</h2>
            <ul className={styles.series}>
              {card.series.map((s) => (
                <li key={s.slug}>
                  <span>{s.name}</span>
                  <span className={styles.number}>{t('seriesNumber', { number: s.number, total: s.total })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${styles.section} ${styles.facts}`} aria-labelledby="photo-heading">
          <h2 id="photo-heading">{t('photoHeading')}</h2>
          <p>
            {t.rich('photoCredit', {
              author: card.photoAuthor ?? tCard('unknownAuthor'),
              license,
              licenseLink: (chunks) => {
                const href = licenseLinkUrl(card.photoLicenseUrl);
                return href ? external(href)(chunks) : chunks;
              },
              link: external(commonsFileUrl(card.photoCommonsFile!)),
            })}
          </p>
          <Link href="/credits" className={styles.sources}>
            {t('sources')}
          </Link>
          {session && <ReportForm cardId={card.id} />}
        </section>

        {!session && (
          <section className={`${styles.section} ${styles.collect}`} aria-labelledby="collect-heading">
            <h2 id="collect-heading">{t('collectHeading')}</h2>
            <p>{t('collectText')}</p>
            <div className={styles.actions}>
              <ButtonLink href="/signup" variant="primary">
                {t('signup')}
              </ButtonLink>
              <ButtonLink href={`/login?next=${encodeURIComponent(cardPath(collection, card.slug))}`}>{t('login')}</ButtonLink>
            </div>
          </section>
        )}
      </div>

      {session && (
        <div className={`${styles.dock} phone-only`}>
          {copies === 0 ? (
            // Nothing to resell: the card goes on the wishlist instead
            <WishButton
              collection={collection}
              cardId={card.id}
              name={card.name}
              wished={wished}
              variant="dock"
              className={styles.action}
            />
          ) : (
            <Sheet
              title={t('resellTitle')}
              closeOnSubmit
              trigger={{
                className: styles.action,
                disabled: copies < 2 || !resale,
                content: (
                  <>
                    <Coins aria-hidden />
                    {t('dockResell', { coins: resale ? resale[card.rarity] : 0 })}
                  </>
                ),
              }}
            >
              {copies > 1 && resale && (
                <form action={resellAction} className={styles.sheetForm}>
                  <p>{t('resellQuestion', { name, coins: resale[card.rarity] })}</p>
                  <p className={phone.muted}>{t('resellKeep')}</p>
                  <input type="hidden" name="collection" value={collection} />
                  <input type="hidden" name="cardId" value={card.id} />
                  {/* A new key each time the page renders: sending the form twice sells once */}
                  <input type="hidden" name="key" value={randomUUID()} />
                  <input type="hidden" name="back" value={within(card.slug)} />
                  <Button type="submit" variant="primary" size="large" block icon={<Coins aria-hidden />}>
                    {t('resellOne', { coins: resale[card.rarity] })}
                  </Button>
                </form>
              )}
            </Sheet>
          )}
          <Link href={sellable > 0 ? paths.sell(card.slug) : paths.marketOfCard(card.slug)} className={styles.action}>
            <Gavel aria-hidden />
            {t('dockAuctions')}
          </Link>
          <Sheet
            title={t('tradeTitle')}
            trigger={{
              className: `${styles.action} ${styles.trade}`,
              disabled: copies === 0,
              content: (
                <>
                  <ArrowLeftRight aria-hidden />
                  {t('dockTrade')}
                </>
              ),
            }}
          >
            {friends.length > 0 ? (
              <>
                <p className={phone.muted}>{t('tradeWith', { name })}</p>
                <ul className={phone.rows}>
                  {friends.map((friend) => (
                    <li key={friend.id}>
                      <Link href={`${paths.newTrade(friend.pseudo)}&give=${card.id}x1`} replace className={phone.row}>
                        <span className={phone.avatar} aria-hidden="true">
                          {friend.pseudo.charAt(0).toLocaleUpperCase('fr')}
                        </span>
                        <span className={phone.rowText}>
                          <span className={phone.rowTitle}>{friend.pseudo}</span>
                        </span>
                        <ChevronRight aria-hidden className={phone.chevron} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={phone.muted}>
                {t.rich('tradeNoFriends', {
                  friends: (chunks) => (
                    <Link href="/friends" replace>
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </Sheet>
        </div>
      )}
    </main>
  );
}
