'use client';

import { ArrowUpRightIcon, CameraIcon, CheckIcon, ImageIcon, InfoIcon, MapPinIcon, SparkleIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { RARITY_PIPS, type Rarity } from '@/lib/rarity';
import { displayName, needsLetterbox, seriesNumber } from './card-format';
import styles from './Card.module.css';

export interface CardPhoto {
  /** Served from /uploads in production, never from Wikimedia. */
  src: string;
  srcSet?: string;
  width?: number;
  height?: number;
  author: string | null;
  license: string;
  /** The file page on Wikimedia Commons. */
  fileUrl: string;
}

export interface CardData {
  name: string;
  rarity: Rarity;
  department: string | null;
  region: string | null;
  /** null for the few World Heritage monuments that are not historic monuments. */
  protection: 'classe' | 'inscrit' | null;
  unesco: boolean;
  /** The series printed in the footer, usually the region; a few cards have none. */
  series: { name: string; number: number; total: number } | null;
  photo: CardPhoto;
  excerpt?: string;
  articleUrl?: string;
}

export interface CardProps {
  card: CardData;
  /** grid: from 160 px wide; large: from 300 px wide (card page, pack opening). */
  size?: 'grid' | 'large';
  /**
   * missing: not owned yet, greyed with its name. masked: not owned, name hidden
   * (the server should not send the real name or photo for these).
   */
  state?: 'owned' | 'missing' | 'masked';
  face?: 'front' | 'back';
  /** Click, or the "Voir le verso" button, turns the card over. */
  flippable?: boolean;
  /** Copies owned: "×2" badge in the grid, count on the back. */
  copies?: number;
  isNew?: boolean;
  shiny?: boolean;
  selected?: boolean;
  /** center: always crop to 4:3, even photos that would get a blurred background. */
  framing?: 'auto' | 'center';
  /** `sizes` for the photo's srcSet. */
  sizes?: string;
  /** Eager, high-priority photo: the card is the page's main content. */
  priority?: boolean;
}

function Banner({ rarity, label, icon, suffix }: { rarity: Rarity; label: string; icon?: ReactNode; suffix?: ReactNode }) {
  return (
    <div className={styles.banner}>
      <span className={styles.bannerLabel}>
        {icon}
        <span>{label}</span>
        {suffix && <span className={styles.bannerSuffix}>{suffix}</span>}
      </span>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: RARITY_PIPS[rarity] }, (_, index) => (
          <span key={index} className={styles.pip} />
        ))}
      </span>
    </div>
  );
}

// Links and buttons inside a flippable card must not turn it over.
const stop = (event: MouseEvent) => event.stopPropagation();

export function Card({
  card,
  size = 'grid',
  state = 'owned',
  face = 'front',
  flippable = false,
  copies = 1,
  isNew = false,
  shiny: shinyProp = false,
  selected = false,
  framing = 'auto',
  sizes,
  priority = false,
}: CardProps) {
  const t = useTranslations('Card');
  const tRarity = useTranslations('Rarity');
  const [flipped, setFlipped] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const large = size === 'large';
  const missing = state !== 'owned';
  const masked = state === 'masked';
  const shiny = shinyProp && !missing;
  const canFlip = flippable && !missing;
  const hasBack = !missing && (canFlip || face === 'back');
  const showBack = hasBack && (face === 'back') !== flipped;
  const letterbox = framing === 'auto' && needsLetterbox(card.photo.width, card.photo.height);

  const rarityLabel = tRarity(card.rarity);
  const name = masked ? t('toDiscover') : displayName(card.name);
  const number = card.series ? seriesNumber(card.series.number, card.series.total) : null;
  const author = card.photo.author ?? t('unknownAuthor');
  const place = (large ? [card.department, card.region] : [card.department ?? card.region]).filter(Boolean).join(' · ');
  const badges = [card.protection && t(`protection.${card.protection}`), card.unesco ? t('unesco') : null].filter(Boolean);
  const commonsLink = (chunks: ReactNode) => (
    <a href={card.photo.fileUrl} target="_blank" rel="noopener" onClick={stop}>
      {chunks}
    </a>
  );

  const ariaLabel = masked
    ? t('ariaMasked', { rarity: rarityLabel })
    : [name, rarityLabel, missing && t('ariaMissing'), shiny && t('ariaShiny')].filter(Boolean).join(', ');

  return (
    <article
      className={styles.card}
      data-size={size}
      data-state={state}
      data-rarity={card.rarity}
      data-letterbox={letterbox || undefined}
      data-selected={selected || undefined}
      data-flippable={canFlip || undefined}
      aria-label={ariaLabel}
      onClick={canFlip ? () => setFlipped((value) => !value) : undefined}
    >
      <div className={styles.inner} data-flipped={showBack || undefined}>
        <div className={`${styles.face} ${styles.front}`} aria-hidden={showBack || undefined}>
          <Banner
            rarity={card.rarity}
            label={rarityLabel}
            icon={shiny && <SparkleIcon weight="fill" aria-label={t('shiny')} />}
            suffix={shiny && large && t('shinySuffix')}
          />

          <div className={styles.photo}>
            {letterbox && !missing && !photoFailed && (
              // eslint-disable-next-line @next/next/no-img-element -- see below
              <img className={styles.photoBackdrop} src={card.photo.src} alt="" aria-hidden="true" />
            )}
            {photoFailed ? (
              <div className={styles.photoFallback}>
                <ImageIcon aria-hidden />
                <span>{masked ? '?' : name}</span>
              </div>
            ) : (
              // Plain <img>: the catalogue import already produces 400 and 800 px
              // WebP files, so next/image would only re-encode them.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.photoImage}
                src={card.photo.src}
                srcSet={card.photo.srcSet}
                sizes={sizes}
                alt={name}
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : undefined}
                decoding="async"
                onError={() => setPhotoFailed(true)}
              />
            )}
            {!large && !missing && !photoFailed && (
              <button
                type="button"
                className={styles.infoButton}
                aria-label={t('photoCredit')}
                aria-expanded={showCredit}
                onClick={(event) => {
                  stop(event);
                  setShowCredit((value) => !value);
                }}
              >
                <span>
                  <InfoIcon aria-hidden />
                </span>
              </button>
            )}
            {showCredit && !large && (
              <div className={styles.creditOverlay}>
                {t.rich('photoOverlay', { author, license: card.photo.license, link: commonsLink })}
              </div>
            )}
          </div>

          {large && !missing && (
            <div className={styles.credit}>
              <CameraIcon aria-hidden />
              <span>{t.rich('photoCaption', { author, license: card.photo.license, link: commonsLink })}</span>
            </div>
          )}

          {masked ? <div className={styles.toDiscover}>{name}</div> : <h3 className={styles.name}>{name}</h3>}
          <div className={styles.place}>
            <MapPinIcon aria-hidden />
            <span>{place}</span>
          </div>
          <div className={styles.badges}>
            {badges.map((badge) => (
              <span key={badge} className={styles.badge}>
                {badge}
              </span>
            ))}
          </div>
          <div className={styles.footer}>
            <span>{card.series?.name}</span>
            <span>{number}</span>
          </div>
          {shiny && <div className={styles.shine} aria-hidden="true" />}
        </div>

        {hasBack && (
          <div className={`${styles.face} ${styles.back}`} aria-hidden={!showBack || undefined}>
            <Banner rarity={card.rarity} label={rarityLabel} />
            <h3 className={styles.backName}>{name}</h3>
            {card.excerpt && <p className={styles.excerpt}>{card.excerpt}</p>}
            {large && card.articleUrl && (
              <a className={styles.articleLink} href={card.articleUrl} target="_blank" rel="noopener" onClick={stop}>
                {t('readArticle')}
                <ArrowUpRightIcon aria-hidden />
              </a>
            )}
            <span className={styles.textLicense}>{t('textLicense')}</span>
            <div className={styles.photoSection}>
              <span className={styles.photoHeading}>{t('photoHeading')}</span>
              <span className={styles.photoAuthor}>
                {author} · {card.photo.license}
              </span>
              {large && (
                <a className={styles.commonsLink} href={card.photo.fileUrl} target="_blank" rel="noopener" onClick={stop}>
                  {t('commonsFile')}
                  <ArrowUpRightIcon aria-hidden />
                </a>
              )}
            </div>
            <div className={styles.backFooter}>
              <span>{large ? t('copiesLarge', { count: copies }) : t('copiesGrid', { count: copies })}</span>
              <span>{number}</span>
            </div>
          </div>
        )}
      </div>

      {canFlip && (
        <button
          type="button"
          className={styles.flipButton}
          aria-pressed={showBack}
          onClick={(event) => {
            stop(event);
            setFlipped((value) => !value);
          }}
        >
          {showBack ? t('showFront') : t('showBack')}
        </button>
      )}
      {isNew && !missing && <span className={styles.newBadge}>{t('new')}</span>}
      {copies > 1 && !large && !missing && (
        <span className={styles.copiesBadge}>
          <span aria-hidden="true">×{copies}</span>
          <span className="sr-only">{t('copiesBadge', { count: copies })}</span>
        </span>
      )}
      {selected && (
        <span className={styles.selectedBadge}>
          <CheckIcon aria-hidden />
          <span className="sr-only">{t('selected')}</span>
        </span>
      )}
    </article>
  );
}
