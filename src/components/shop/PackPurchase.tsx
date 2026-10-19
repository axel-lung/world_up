'use client';

import { CheckCircleIcon, CheckIcon, GaugeIcon, InfoIcon, PackageIcon, XIcon } from '@phosphor-icons/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { RarityPips } from '@/components/rarity/Rarity';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import type { Rarity } from '@/lib/rarity';
import styles from './PackPurchase.module.css';

export interface PackOdds {
  rarity: Rarity;
  /** Between 0 and 1, as published on /odds. */
  probability: number;
}

/**
 * Buying one pack: price incl. tax, odds before payment, the mandatory waiver
 * of the withdrawal right and the spending cap. The content of the purchase
 * dialog; the shop wraps it in a modal.
 */
export function PackPurchasePanel({
  collectionName,
  cardsPerPack,
  price,
  odds,
  monthlyCap,
  fictitiousPrice = false,
  onClose,
  onPay,
}: {
  collectionName: string;
  cardsPerPack: number;
  /** Euros, tax included. */
  price: number;
  odds: PackOdds[];
  monthlyCap?: { available: number; cap: number };
  fictitiousPrice?: boolean;
  onClose?: () => void;
  /** Only callable once the waiver is ticked. */
  onPay?: () => void;
}) {
  const t = useTranslations('Purchase');
  const tRarity = useTranslations('Rarity');
  const format = useFormatter();
  const [waived, setWaived] = useState(false);
  const titleId = useId();
  const euros = (amount: number) => format.number(amount, { style: 'currency', currency: 'EUR' });

  return (
    <section className={`dialog ${styles.panel}`} aria-labelledby={titleId}>
      <div className={styles.titleRow}>
        <h2 id={titleId} className="dialog-title">
          {t('packTitle')}
        </h2>
        <Button variant="ghost" iconOnly aria-label={t('close')} className={styles.close} onClick={onClose} icon={<XIcon size={20} aria-hidden />} />
      </div>

      <div className={styles.product}>
        <span className={styles.packThumb} aria-hidden="true" />
        <div className={styles.productText}>
          <span>{t('packName', { collection: collectionName })}</span>
          <span className={styles.muted}>{t('packDescription', { count: cardsPerPack })}</span>
        </div>
        <div className={styles.price}>
          <span className={styles.amount}>{euros(price)}</span>
          <span className={styles.tax}>{t('inclTax')}</span>
        </div>
      </div>
      {fictitiousPrice && (
        <Tag variant="draft" className={styles.draft}>
          {t('fictitiousPrice')}
        </Tag>
      )}

      <div className={styles.odds}>
        <span className={styles.oddsTitle}>{t('odds')}</span>
        <ul className={styles.oddsList}>
          {odds.map(({ rarity, probability }) => (
            <li key={rarity} className={styles.oddsItem}>
              <span className={styles.oddsPips}>
                <RarityPips rarity={rarity} size={4} tone="line" />
              </span>
              <span className={styles.oddsLabel}>{tRarity(rarity)}</span>
              <span className={`${styles.muted} ${styles.oddsValue}`}>
                {format.number(probability, { style: 'percent', maximumFractionDigits: 2 })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <label className={styles.waiver}>
        <input type="checkbox" checked={waived} onChange={(event) => setWaived(event.target.checked)} />
        <span className={styles.checkbox} aria-hidden="true">
          {waived && <CheckIcon />}
        </span>
        <span>{t('waiver')}</span>
      </label>

      <div className={styles.notes}>
        {monthlyCap && (
          <span className={styles.note}>
            <GaugeIcon aria-hidden />
            {t('monthlyCap', { available: euros(monthlyCap.available), cap: euros(monthlyCap.cap) })}
          </span>
        )}
        <span className={styles.note}>
          <InfoIcon aria-hidden />
          {t('noMoneyValue')}
        </span>
      </div>

      <div className="dialog-actions">
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={!waived} onClick={onPay}>
          {t('pay', { price: euros(price) })}
        </Button>
      </div>
    </section>
  );
}

/** Shown once Stripe has confirmed the payment. */
export function PurchaseConfirmation({
  product,
  price,
  fictitiousPrice = false,
  onClose,
  onOpenPack,
}: {
  product: string;
  price: number;
  fictitiousPrice?: boolean;
  onClose?: () => void;
  onOpenPack?: () => void;
}) {
  const t = useTranslations('Purchase');
  const format = useFormatter();
  const titleId = useId();
  const amount = format.number(price, { style: 'currency', currency: 'EUR' });

  return (
    <section className={`dialog ${styles.panel}`} aria-labelledby={titleId}>
      <span className={styles.success} aria-hidden="true">
        <CheckCircleIcon size={24} />
      </span>
      <h2 id={titleId} className="dialog-title">
        {t('confirmedTitle')}
      </h2>
      <div className={`dialog-body ${styles.confirmedBody}`}>
        <span>{t(fictitiousPrice ? 'confirmedFictitious' : 'confirmedSummary', { product, price: amount })}</span>
        <span className={styles.receipt}>{t('receiptHint')}</span>
      </div>
      <div className={`dialog-actions ${styles.wrapActions}`}>
        <Button onClick={onClose}>{t('close')}</Button>
        <Button variant="primary" onClick={onOpenPack} icon={<PackageIcon size={18} aria-hidden />}>
          {t('openMyPack')}
        </Button>
      </div>
    </section>
  );
}
