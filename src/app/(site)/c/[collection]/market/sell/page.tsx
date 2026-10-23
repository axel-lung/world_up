import { randomUUID } from 'node:crypto';
import { Gavel } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { db } from '@/db';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { cardPath, getVisibleCard } from '@/lib/catalog/cards';
import { ownedCopies } from '@/lib/game/collection';
import { sellableCopies } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getMarketPrices, getMarketRules } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import styles from '../../game.module.css';
import { sellAction } from '../actions';
import { MarketNotice } from '../MarketNotice';
import own from '../page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Market.sell');
  return { title: t('title') };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Puts one copy of a card up for auction: starting price, optional buyout price, duration. */
export default async function SellPage({ params, searchParams }: PageProps<'/c/[collection]/market/sell'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const query = await searchParams;
  const slug = one(query.card) ?? '';
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.sell(slug));
  const card = slug ? await getVisibleCard(collection.slug, slug) : null;
  if (!card) notFound();

  const now = new Date();
  const [t, tMarket, tCard, tRarity, rules, prices, sellable, owned] = await Promise.all([
    getTranslations('Market.sell'),
    getTranslations('Market'),
    getTranslations('Card'),
    getTranslations('Rarity'),
    getMarketRules(db, collection.id),
    getMarketPrices(db, collection.id),
    sellableCopies(user.id, card.id, now),
    ownedCopies(user.id, card.id),
  ]);
  const range = prices[card.rarity];
  const name = displayName(card.name);
  const [printed] = card.series;
  // The values typed, when the form comes back refused
  const typed = (field: string) => one(query[field])?.replace(/\D/g, '').slice(0, 9) ?? '';
  const duration = Number(typed('duration'));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.market}>{tMarket('title')}</Link>
        </p>
        <h1>{t('heading', { name })}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>

      <MarketNotice params={query} />

      <div className={own.auction}>
        <div className={own.cardColumn}>
          <Card
            card={toCardData(
              card,
              printed ? { name: printed.name, number: printed.number, total: printed.total } : null,
              photoLicenseLabel(card.photoLicense, { publicDomain: tCard('publicDomain'), unknownLicense: tCard('unknownLicense') }),
            )}
            collection={{ name: card.collectionName, emblem: card.collectionEmblem }}
            size="large"
            copies={Math.max(owned, 1)}
            sizes="(max-width: 392px) calc(100vw - 32px), 360px"
          />
          <Link href={cardPath(collection.slug, card.slug)}>{tMarket('auction.cardPage')}</Link>
        </div>

        <section className={`${styles.section} ${own.panel}`} aria-labelledby="sell-heading">
          <h2 id="sell-heading">{t('formHeading')}</h2>
          {!rules.auctionsEnabled ? (
            <Notice>
              <p>{tMarket('closed')}</p>
            </Notice>
          ) : sellable < 1 ? (
            <Notice>
              <p>{owned > 0 ? t('allPromised') : t('notOwned')}</p>
            </Notice>
          ) : (
            <form action={sellAction} className={styles.stack}>
              <input type="hidden" name="collection" value={collection.slug} />
              <input type="hidden" name="card" value={card.id} />
              <input type="hidden" name="slug" value={card.slug} />
              {/* A new key each time the page renders: sending the form twice sells once */}
              <input type="hidden" name="key" value={randomUUID()} />
              <p className={styles.muted}>
                {owned === 1 ? t('lastCopy') : t('copies', { count: sellable })}
              </p>
              <TextField
                label={t('startPrice')}
                name="start"
                type="number"
                inputMode="numeric"
                min={range.min}
                max={range.max}
                step={1}
                required
                defaultValue={typed('start') || range.min}
                hint={t('startHint', { rarity: tRarity(card.rarity), min: range.min, max: range.max })}
              />
              <TextField
                label={t('buyoutPrice')}
                name="buyout"
                type="number"
                inputMode="numeric"
                min={range.min}
                max={range.max}
                step={1}
                defaultValue={typed('buyout')}
                hint={t('buyoutHint', { max: range.max })}
              />
              <fieldset className={own.durations}>
                <legend>{t('duration')}</legend>
                {rules.auctionDurationsHours.map((hours, index) => (
                  <label key={hours} className={own.duration}>
                    <input
                      type="radio"
                      name="duration"
                      value={hours}
                      defaultChecked={rules.auctionDurationsHours.includes(duration) ? hours === duration : index === 0}
                    />
                    {t('hours', { count: hours })}
                  </label>
                ))}
              </fieldset>
              <p className={styles.muted}>{t('feeHint', { percent: rules.auctionFeePercent })}</p>
              <div className={styles.actions}>
                <Button type="submit" variant="primary" size="large" icon={<Gavel aria-hidden />}>
                  {t('submit')}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
