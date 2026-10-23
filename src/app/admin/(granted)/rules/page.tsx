import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { listAudit } from '@/lib/catalog/admin';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { PER_MILLION } from '@/lib/game/draw';
import {
  currentOdds,
  getActiveCollection,
  getGameRules,
  getMarketPrices,
  getMarketRules,
  getResaleValues,
  visibleCardsByRarity,
} from '@/lib/game/rules';
import { toParisDateTime } from '@/lib/paris-time';
import { RARITIES } from '@/lib/rarity';
import { AuditTable } from '../AuditTable';
import { GameRulesForm, MarketPricesForm, MarketRulesForm, OddsForm, ResaleForm } from './RulesForms';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.rules');
  return { title: t('title') };
}

export default async function AdminRulesPage() {
  await requireAdmin();
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const now = new Date();
  const [t, tRarity, format, rules, resale, market, prices, odds, visible, history] = await Promise.all([
    getTranslations('Admin.rules'),
    getTranslations('Rarity'),
    getFormatter(),
    getGameRules(db, collection.id),
    getResaleValues(db, collection.id),
    getMarketRules(db, collection.id),
    getMarketPrices(db, collection.id),
    currentOdds(db, collection.id, now),
    visibleCardsByRarity(collection.id),
    listAudit({ targetType: 'collection', targetId: String(collection.id), limit: 20 }),
  ]);
  const empty = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<(typeof RARITIES)[number], number>;

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro', { collection: collection.name })}</p>
      </header>

      <section className={styles.section} aria-labelledby="packs-heading">
        <h2 id="packs-heading">{t('packsHeading')}</h2>
        <GameRulesForm rules={rules} />
      </section>

      <section className={styles.section} aria-labelledby="resale-heading">
        <h2 id="resale-heading">{t('resaleHeading')}</h2>
        <p className={styles.muted}>{t('resaleIntro')}</p>
        <ResaleForm values={resale} />
      </section>

      <section className={styles.section} aria-labelledby="market-heading">
        <h2 id="market-heading">{t('marketHeading')}</h2>
        <p className={styles.muted}>{t('marketIntro')}</p>
        <MarketRulesForm rules={market} />
      </section>

      <section className={styles.section} aria-labelledby="prices-heading">
        <h2 id="prices-heading">{t('pricesHeading')}</h2>
        <p className={styles.muted}>{t('pricesIntro')}</p>
        <MarketPricesForm prices={prices} />
      </section>

      <section className={styles.section} aria-labelledby="odds-heading">
        <h2 id="odds-heading">{t('oddsHeading')}</h2>
        <p className={styles.muted}>
          {t.rich('oddsIntro', { link: (chunks) => <Link href="/odds">{chunks}</Link> })}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('rarity')}</th>
                <th scope="col">{t('currentOdds')}</th>
                <th scope="col">{t('visibleCards')}</th>
              </tr>
            </thead>
            <tbody>
              {RARITIES.map((rarity) => (
                <tr key={rarity}>
                  <th scope="row">{tRarity(rarity)}</th>
                  <td>
                    {odds
                      ? format.number(odds.odds[rarity] / PER_MILLION, { style: 'percent', maximumFractionDigits: 4 })
                      : '—'}
                  </td>
                  <td>{format.number(visible[rarity])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <OddsForm odds={odds?.odds ?? empty} now={toParisDateTime(now)} />
      </section>

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading">{t('historyHeading')}</h2>
        <AuditTable rows={history} showTarget={false} />
      </section>
    </main>
  );
}
