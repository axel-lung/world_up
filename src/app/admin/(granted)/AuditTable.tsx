import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { listAudit } from '@/lib/catalog/admin';
import { RARITIES, type Rarity } from '@/lib/rarity';
import styles from '../admin.module.css';

type AuditRow = Awaited<ReturnType<typeof listAudit>>[number];

// audit_log.action -> its label (translation keys can't hold a dot)
const ACTION_LABELS = {
  'card.hide': 'cardHide',
  'card.show': 'cardShow',
  'card.rarity': 'cardRarity',
  'card.photo': 'cardPhoto',
} as const;
const actionLabel = (action: string) => ACTION_LABELS[action as keyof typeof ACTION_LABELS];

export async function AuditTable({ rows, showTarget = true }: { rows: AuditRow[]; showTarget?: boolean }) {
  const [t, tRarity, format] = await Promise.all([getTranslations('Admin'), getTranslations('Rarity'), getFormatter()]);
  if (rows.length === 0) return <p className={styles.muted}>{t('audit.empty')}</p>;

  const reason = (value: unknown) =>
    typeof value === 'string' ? t(`card.hiddenReasons.${value as 'admin'}`) : t('cards.visible');
  const rarity = (value: unknown) => (RARITIES.includes(value as Rarity) ? tRarity(value as Rarity) : String(value));
  function describe(row: AuditRow): string {
    const details = row.details as { from?: unknown; to?: unknown; note?: string };
    const change =
      row.action === 'card.hide' || row.action === 'card.show'
        ? `${reason(details.from)} → ${reason(details.to)}`
        : row.action === 'card.rarity'
          ? `${rarity(details.from)} → ${rarity(details.to)}`
          : `${details.from ?? t('card.none')} → ${details.to ?? t('card.none')}`;
    return details.note ? `${change} · ${details.note}` : change;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('audit.when')}</th>
            <th scope="col">{t('audit.who')}</th>
            <th scope="col">{t('audit.action')}</th>
            {showTarget && <th scope="col">{t('audit.target')}</th>}
            <th scope="col">{t('audit.details')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{format.dateTime(row.createdAt, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })}</td>
              <td>{row.admin ?? t('audit.deletedAdmin')}</td>
              <td>{actionLabel(row.action) ? t(`audit.actions.${actionLabel(row.action)}`) : row.action}</td>
              {showTarget && (
                <td>
                  {row.targetType === 'card' ? (
                    <Link href={`/admin/cards/${row.targetId}`}>#{row.targetId}</Link>
                  ) : (
                    `${row.targetType} ${row.targetId}`
                  )}
                </td>
              )}
              <td>{describe(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
