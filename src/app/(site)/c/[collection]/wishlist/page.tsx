import { ArrowLeftRight, Gavel, Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CardRow } from '@/components/card/CardRow';
import { displayName } from '@/components/card/card-format';
import { ButtonLink } from '@/components/ui/Button';
import { MoreInfo } from '@/components/ui/MoreInfo';
import { WishButton } from '@/components/wishlist/WishButton';
import { printedSeries } from '@/lib/catalog/cards';
import { toCollectionCard } from '@/lib/game/collection';
import { auctionsOfCards } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { listWishlist, WISHLIST_MAX } from '@/lib/game/wishlist';
import { requireSession } from '@/lib/session';
import styles from '../game.module.css';
import own from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wishlist');
  return { title: t('title') };
}

// The friends named on a wish, the others counted
const FRIENDS_SHOWN = 3;

/**
 * The cards the player wishes for, and where to find each: the auctions
 * running (the lowest price, a link to them), the friends who own it (a link
 * to an offer asking them for it). Those to be found come first. A wished card
 * is one the player lacks: its name and rarity only, like the collection's.
 */
export default async function WishlistPage({ params }: PageProps<'/c/[collection]/wishlist'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.wishlist);
  const now = new Date();

  const [t, tCollection, tCard, entries] = await Promise.all([
    getTranslations('Wishlist'),
    getTranslations('Collection'),
    getTranslations('Card'),
    listWishlist(user.id, collection.id),
  ]);
  const ids = entries.map((entry) => entry.id);
  const [sales, printed] = await Promise.all([auctionsOfCards(ids, user.id, now), printedSeries(ids)]);
  const labels = { publicDomain: tCard('publicDomain'), unknownLicense: tCard('unknownLicense') };
  const wishes = entries
    .map((entry) => ({
      entry,
      card: toCollectionCard({ ...entry, quantity: null }, printed.get(entry.id) ?? null, collection.slug, labels),
      sale: sales.get(entry.id) ?? null,
    }))
    // Stable: the latest first within each half
    .sort((a, b) => Number(Boolean(b.sale || b.entry.friends.length)) - Number(Boolean(a.sale || a.entry.friends.length)));
  const onSale = wishes.filter((wish) => wish.sale).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.collection}>{tCollection('title')}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('count', { count: entries.length, max: WISHLIST_MAX })}</p>
        {onSale > 0 && (
          <div className={styles.actions}>
            <ButtonLink href={paths.marketWished} icon={<Gavel aria-hidden />}>
              {t('marketLink', { count: onSale })}
            </ButtonLink>
          </div>
        )}
        <MoreInfo summary={t('howItWorks')}>
          <p>{t('intro', { max: WISHLIST_MAX })}</p>
          <p>{t('introFriends')}</p>
        </MoreInfo>
      </header>

      {wishes.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('empty')}</p>
          <ButtonLink href={`${paths.collection}?tab=missing`} variant="primary" icon={<Heart aria-hidden />}>
            {t('browseMissing')}
          </ButtonLink>
        </div>
      ) : (
        <ul className={own.list}>
          {wishes.map(({ entry, card, sale }) => {
            const name = displayName(entry.name);
            const others = entry.friends.length - FRIENDS_SHOWN;
            return (
              <li key={entry.id} className={own.item}>
                <CardRow
                  card={card.data}
                  state="missing"
                  emblem={collection.emblem}
                  action={<WishButton collection={collection.slug} cardId={entry.id} name={entry.name} wished />}
                />
                <div className={own.where}>
                  {sale && (
                    <Link href={paths.marketOfCard(entry.slug)} className={own.source}>
                      <Gavel aria-hidden />
                      {t('onSale', { count: sale.count, price: sale.lowestPrice })}
                    </Link>
                  )}
                  {entry.friends.length > 0 && (
                    <div className={own.source}>
                      <ArrowLeftRight aria-hidden />
                      <span>{t('friends', { count: entry.friends.length })}</span>
                      <ul className={own.friends}>
                        {entry.friends.slice(0, FRIENDS_SHOWN).map((pseudo) => (
                          <li key={pseudo}>
                            <Link
                              href={`${paths.newTrade(pseudo)}&want=${entry.id}x1`}
                              className={own.friend}
                              aria-label={t('askFriend', { pseudo, name })}
                            >
                              {pseudo}
                            </Link>
                          </li>
                        ))}
                        {others > 0 && <li className={own.others}>{t('otherFriends', { count: others })}</li>}
                      </ul>
                    </div>
                  )}
                  {!sale && entry.friends.length === 0 && <p className={own.nowhere}>{t('nowhere')}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
