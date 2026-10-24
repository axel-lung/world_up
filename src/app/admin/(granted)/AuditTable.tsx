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
  'report.resolve': 'reportResolve',
  'report.dismiss': 'reportDismiss',
  'rules.update': 'rulesUpdate',
  'resale.update': 'resaleUpdate',
  'odds.publish': 'oddsPublish',
  'market.update': 'marketUpdate',
  'prices.update': 'pricesUpdate',
  'auction.cancel': 'auctionCancel',
  'user.ban': 'userBan',
  'user.unban': 'userUnban',
} as const;

const RULE_FIELDS = [
  'cardsPerPack',
  'signupPacks',
  'refillMinutes',
  'maxReserve',
  'coinsPerOpening',
  'tradesEnabled',
  'auctionsEnabled',
  'tradeExpiryHours',
  'tradeMaxCards',
  'auctionDurationsHours',
  'auctionFeePercent',
  'bidIncrementPercent',
  'auctionExtensionMinutes',
  'maxActiveAuctions',
] as const;
const actionLabel = (action: string) => ACTION_LABELS[action as keyof typeof ACTION_LABELS];

export async function AuditTable({ rows, showTarget = true }: { rows: AuditRow[]; showTarget?: boolean }) {
  const [t, tRarity, format] = await Promise.all([getTranslations('Admin'), getTranslations('Rarity'), getFormatter()]);
  if (rows.length === 0) return <p className={styles.muted}>{t('audit.empty')}</p>;

  const reason = (value: unknown) =>
    typeof value === 'string' ? t(`card.hiddenReasons.${value as 'admin'}`) : t('cards.visible');
  const reportStatus = (value: unknown) =>
    ['open', 'resolved', 'dismissed'].includes(value as string) ? t(`reports.statuses.${value as 'open'}`) : String(value);
  const rarity = (value: unknown) => (RARITIES.includes(value as Rarity) ? tRarity(value as Rarity) : String(value));
  // Only the values that changed: "Réserve maximale : 10 → 12"; lists and ranges compared by value
  const shown = (value: unknown) =>
    typeof value === 'boolean'
      ? t(value ? 'audit.on' : 'audit.off')
      : Array.isArray(value)
        ? value.join(', ')
        : value && typeof value === 'object' && 'min' in value && 'max' in value
          ? `${value.min}–${value.max}`
          : String(value);
  const changes = (from: Record<string, unknown>, to: Record<string, unknown>, label: (key: string) => string) =>
    Object.keys(to)
      .filter((key) => JSON.stringify(from[key]) !== JSON.stringify(to[key]))
      .map((key) => `${label(key)} : ${shown(from[key])} → ${shown(to[key])}`)
      .join(' · ');
  function describe(row: AuditRow): string {
    const details = row.details as {
      from?: unknown;
      to?: unknown;
      note?: string;
      odds?: Record<string, number>;
      validFrom?: string;
      price?: number;
      bids?: number;
      trades?: number;
      auctions?: number;
    };
    if (['rules.update', 'resale.update', 'market.update', 'prices.update'].includes(row.action)) {
      const label =
        row.action === 'rules.update' || row.action === 'market.update'
          ? (key: string) => (RULE_FIELDS.includes(key as 'maxReserve') ? t(`rules.fields.${key as 'maxReserve'}`) : key)
          : rarity;
      return changes((details.from ?? {}) as Record<string, unknown>, (details.to ?? {}) as Record<string, unknown>, label);
    }
    if (row.action === 'odds.publish' && details.odds && details.validFrom) {
      const odds = RARITIES.map(
        (r) => `${tRarity(r)} ${format.number((details.odds![r] ?? 0) / 1_000_000, { style: 'percent', maximumFractionDigits: 4 })}`,
      );
      const from = format.dateTime(new Date(details.validFrom), { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
      return `${t('rules.fromDate', { date: from })} · ${odds.join(' · ')}`;
    }
    if (row.action === 'user.ban') {
      const cancelled = t('audit.banDetails', { trades: details.trades ?? 0, auctions: details.auctions ?? 0 });
      return details.note ? `${details.note} · ${cancelled}` : cancelled;
    }
    if (row.action === 'user.unban') return details.note ?? '';
    if (row.action === 'auction.cancel') {
      const sale = t('audit.auctionDetails', { price: details.price ?? 0, bids: details.bids ?? 0 });
      return details.note ? `${sale} · ${details.note}` : sale;
    }
    const change =
      row.action === 'card.hide' || row.action === 'card.show'
        ? `${reason(details.from)} → ${reason(details.to)}`
        : row.action === 'card.rarity'
          ? `${rarity(details.from)} → ${rarity(details.to)}`
          : row.action.startsWith('report.')
            ? `${reportStatus(details.from)} → ${reportStatus(details.to)}`
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
                  ) : row.targetType === 'report' ? (
                    <Link href="/admin/reports">#{row.targetId}</Link>
                  ) : row.targetType === 'collection' ? (
                    <Link href="/admin/rules">{t('audit.collectionTarget')}</Link>
                  ) : row.targetType === 'auction' ? (
                    <Link href="/admin/market">{t('audit.auctionTarget', { id: row.targetId })}</Link>
                  ) : row.targetType === 'user' ? (
                    row.targetPseudo ? (
                      <Link href={`/admin/players/${row.targetId}`}>{row.targetPseudo}</Link>
                    ) : (
                      t('audit.deletedPlayer')
                    )
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
