import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { TextField } from '@/components/ui/TextField';
import { requireAdmin } from '@/lib/admin';
import { PLAYER_FILTERS, PLAYERS_PAGE_SIZE, searchPlayers } from '@/lib/players/admin';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.players');
  return { title: t('title') };
}

// Unknown or malformed parameters fall back to their default
const filtersSchema = z.object({
  q: z.string().max(200).catch(''),
  status: z.enum(PLAYER_FILTERS).catch('all'),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function AdminPlayersPage({ searchParams }: PageProps<'/admin/players'>) {
  await requireAdmin();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = filtersSchema.parse({ q: one(params.q) ?? '', status: one(params.status) ?? 'all', page: one(params.page) ?? 1 });
  const [t, format, { total, rows }] = await Promise.all([
    getTranslations('Admin.players'),
    getFormatter(),
    searchPlayers({ query: filters.q, filter: filters.status, page: filters.page }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PLAYERS_PAGE_SIZE));
  const pageLink = (page: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (filters.status !== 'all') query.set('status', filters.status);
    query.set('page', String(page));
    return `/admin/players?${query}`;
  };
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'short', timeZone: 'Europe/Paris' });

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('count', { count: total })}</p>
      </header>
      <p className={styles.muted}>{t('intro')}</p>

      <form method="get" className={styles.filters}>
        <TextField label={t('search')} name="q" defaultValue={filters.q} autoComplete="off" />
        <div className="field">
          <label htmlFor="status">{t('status')}</label>
          <select id="status" name="status" className="input" defaultValue={filters.status}>
            {PLAYER_FILTERS.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">{t('filter')}</Button>
      </form>

      {rows.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('pseudo')}</th>
                <th scope="col">{t('email')}</th>
                <th scope="col">{t('signedUp')}</th>
                <th scope="col">{t('lastActive')}</th>
                <th scope="col">{t('state')}</th>
                <th scope="col">{t('linked')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((player) => (
                <tr key={player.id}>
                  <td>
                    <Link href={`/admin/players/${player.id}`}>{player.pseudo}</Link>
                  </td>
                  <td>{player.email}</td>
                  <td>{date(player.createdAt)}</td>
                  <td>{date(player.lastActiveAt)}</td>
                  <td>
                    {player.bannedAt ? (
                      <Tag variant="danger">{t('states.banned')}</Tag>
                    ) : player.emailVerified ? (
                      t('states.active')
                    ) : (
                      <Tag variant="subtle">{t('states.unverified')}</Tag>
                    )}
                  </td>
                  <td>{player.linked > 0 ? <Tag variant="warning">{format.number(player.linked)}</Tag> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className={styles.pagination} aria-label={t('pagination')}>
          {filters.page > 1 && <Link href={pageLink(filters.page - 1)}>{t('previous')}</Link>}
          <span>{t('page', { page: filters.page, pages })}</span>
          {filters.page < pages && <Link href={pageLink(filters.page + 1)}>{t('next')}</Link>}
        </nav>
      )}
    </main>
  );
}
