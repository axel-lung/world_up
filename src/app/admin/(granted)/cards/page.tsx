import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { displayName } from '@/components/card/card-format';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { requireAdmin } from '@/lib/admin';
import { PAGE_SIZE, searchCards } from '@/lib/catalog/admin';
import { RARITIES } from '@/lib/rarity';
import { showCards } from './actions';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.cards');
  return { title: t('title') };
}

const STATUSES = ['all', 'visible', 'hidden', 'review'] as const;

// Unknown or malformed parameters fall back to their default
const filtersSchema = z.object({
  q: z.string().max(200).catch(''),
  status: z.enum(STATUSES).catch('all'),
  rarity: z.enum(RARITIES).nullable().catch(null),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function AdminCardsPage({ searchParams }: PageProps<'/admin/cards'>) {
  await requireAdmin();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = filtersSchema.parse({
    q: one(params.q) ?? '',
    status: one(params.status) ?? 'all',
    rarity: one(params.rarity) || null,
    page: one(params.page) ?? 1,
  });
  // Counts sent back by the bulk action
  const shown = Number(one(params.shown));
  const skipped = Number(one(params.skipped)) || 0;
  const [t, tRarity, { total, rows }] = await Promise.all([
    getTranslations('Admin'),
    getTranslations('Rarity'),
    searchCards({ query: filters.q, status: filters.status, rarity: filters.rarity, page: filters.page }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (filters.status !== 'all') query.set('status', filters.status);
    if (filters.rarity) query.set('rarity', filters.rarity);
    query.set('page', String(page));
    return `/admin/cards?${query}`;
  };
  // Hidden cards can be shown in bulk: the 20th-century review
  const bulk = filters.status === 'review' || filters.status === 'hidden';

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('cards.title')}</h1>
        <p className={styles.muted}>{t('cards.count', { count: total })}</p>
      </header>

      <form method="get" className={styles.filters}>
        <TextField label={t('cards.search')} name="q" defaultValue={filters.q} placeholder={t('cards.searchHint')} />
        <div className="field">
          <label htmlFor="status">{t('cards.status')}</label>
          <select id="status" name="status" className="input" defaultValue={filters.status}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`cards.statuses.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rarity">{t('cards.rarity')}</label>
          <select id="rarity" name="rarity" className="input" defaultValue={filters.rarity ?? ''}>
            <option value="">{t('cards.allRarities')}</option>
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {tRarity(rarity)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">{t('cards.filter')}</Button>
      </form>

      {Number.isInteger(shown) && (
        <Notice tone="success">
          <p>{t('cards.bulkShown', { count: shown })}</p>
          {skipped > 0 && <p>{t('cards.bulkSkipped', { count: skipped })}</p>}
        </Notice>
      )}

      {rows.length > 0 && (
        <form action={showCards} className={styles.stack}>
          <input type="hidden" name="back" value={pageLink(filters.page)} />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {bulk && (
                    <th scope="col">
                      <span className="sr-only">{t('cards.select')}</span>
                    </th>
                  )}
                  <th scope="col">{t('cards.name')}</th>
                  <th scope="col">{t('cards.rarity')}</th>
                  <th scope="col">{t('cards.place')}</th>
                  <th scope="col">{t('cards.visibility')}</th>
                  <th scope="col">{t('cards.dates')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((card) => (
                  <tr key={card.id}>
                    {bulk && (
                      <td>
                        <input
                          type="checkbox"
                          name="cardId"
                          value={card.id}
                          aria-label={t('cards.selectCard', { name: displayName(card.name) })}
                        />
                      </td>
                    )}
                    <td>
                      <Link href={`/admin/cards/${card.id}`}>{displayName(card.name)}</Link>
                    </td>
                    <td>{tRarity(card.rarity)}</td>
                    <td>{[card.department, card.region].filter(Boolean).join(' · ')}</td>
                    <td>{card.hiddenReason ? t(`card.hiddenReasons.${card.hiddenReason}`) : t('cards.visible')}</td>
                    <td>
                      {[
                        card.inceptionYear !== null &&
                          (card.inceptionYear < 0
                            ? t('card.yearBC', { year: String(-card.inceptionYear) })
                            : String(card.inceptionYear)),
                        card.architectDeathYear !== null &&
                          t('cards.architectDeath', { year: String(card.architectDeathYear) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bulk && (
            <div className={styles.filters}>
              <TextField label={t('cards.bulkNote')} name="note" maxLength={500} />
              <Button type="submit" variant="primary">
                {t('cards.showSelected')}
              </Button>
            </div>
          )}
        </form>
      )}

      {pages > 1 && (
        <nav className={styles.pagination} aria-label={t('cards.pagination')}>
          {filters.page > 1 && <Link href={pageLink(filters.page - 1)}>{t('cards.previous')}</Link>}
          <span>{t('cards.page', { page: filters.page, pages })}</span>
          {filters.page < pages && <Link href={pageLink(filters.page + 1)}>{t('cards.next')}</Link>}
        </nav>
      )}
    </main>
  );
}
