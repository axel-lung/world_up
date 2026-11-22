'use client';

import { ArrowUpRight, Camera, Check, Image as ImageIcon, Info, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { EmblemIcon } from '@/components/collection/Emblem';
import { WIKIPEDIA_TEXT_LICENSE_URL } from '@/lib/catalog/licenses';
import type { Emblem } from '@/lib/collection-theme';
import { RARITY_PIPS, type Rarity } from '@/lib/rarity';
import { displayName, needsLetterbox, photoSizes, seriesNumber } from './card-format';
import styles from './Card.module.css';

export interface CardPhoto {
  /** Served from /uploads in production, never from Wikimedia. */
  src: string;
  srcSet?: string;
  width?: number;
  height?: number;
  author: string | null;
  license: string;
  /** The licence's text, which the CC 2.0 and 3.0 licences want linked from each copy. */
  licenseUrl?: string | null;
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

/** The collection a card belongs to: its emblem is printed in the footer. */
export interface CardCollection {
  name: string;
  emblem: Emblem;
}

export interface CardProps {
  card: CardData;
  collection: CardCollection;
  /** grid: from 160 px wide; large: from 300 px wide (card page, pack opening). */
  size?: 'grid' | 'large';
  /** missing: not owned yet, greyed, with only its name and rarity (no photo, no link). */
  state?: 'owned' | 'missing';
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
  /**
   * The card's page: the name becomes a link covering the whole front, and
   * the card leans in under the pointer. Never on a missing card.
   */
  href?: string;
  /** A control over the photo's top-left corner, above the card's link: the wishlist's heart. */
  action?: ReactNode;
}

/**
 * The band at the foot of each face, in the rarity's color like the frame:
 * its name and 1 to 6 dots, so rarity never relies on color alone.
 */
function RarityBand({ rarity, label }: { rarity: Rarity; label: string }) {
  return (
    <div className={styles.band}>
      <span>{label}</span>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: RARITY_PIPS[rarity] }, (_, index) => (
          <span key={index} className={styles.dot} />
        ))}
      </span>
    </div>
  );
}

// Links and buttons inside a flippable card must not turn it over.
const stop = (event: MouseEvent) => event.stopPropagation();

export function Card({
  card,
  collection,
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
  href: hrefProp,
  action,
}: CardProps) {
  const t = useTranslations('Card');
  const tRarity = useTranslations('Rarity');
  const [flipped, setFlipped] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const noPhoto = photoFailed || !card.photo.src;

  const large = size === 'large';
  const missing = state === 'missing';
  const href = missing ? undefined : hrefProp;
  const shiny = shinyProp && !missing;
  const canFlip = flippable && !missing;
  const hasBack = !missing && (canFlip || face === 'back');
  const showBack = hasBack && (face === 'back') !== flipped;
  const letterbox = framing === 'auto' && needsLetterbox(card.photo.width, card.photo.height);
  const imageSizes = letterbox ? photoSizes(sizes, card.photo.width, card.photo.height) : sizes;
  // Both images of a letterboxed photo load the same file, so they share its
  // srcSet and priority: the blurred copy is often the page's largest paint
  const imageLoading = {
    srcSet: card.photo.srcSet,
    sizes: imageSizes,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    fetchPriority: priority ? ('high' as const) : undefined,
    decoding: 'async' as const,
  };

  const rarityLabel = tRarity(card.rarity);
  const name = displayName(card.name);
  const number = card.series ? seriesNumber(card.series.number, card.series.total) : null;
  const author = card.photo.author ?? t('unknownAuthor');
  const place = (large ? [card.department, card.region] : [card.department ?? card.region]).filter(Boolean).join(' · ');
  const badges = [
    card.protection && { key: 'protection', label: t(`protection.${card.protection}`) },
    card.unesco && { key: 'unesco', label: t('unesco') },
  ].filter((badge) => !!badge);
  const commonsLink = (chunks: ReactNode) => (
    <a href={card.photo.fileUrl} target="_blank" rel="noopener" onClick={stop}>
      {chunks}
    </a>
  );
  const licenseLink = (chunks: ReactNode) =>
    card.photo.licenseUrl ? (
      <a href={card.photo.licenseUrl} target="_blank" rel="noopener license" onClick={stop}>
        {chunks}
      </a>
    ) : (
      chunks
    );
  const textLicenseLink = (chunks: ReactNode) => (
    <a href={WIKIPEDIA_TEXT_LICENSE_URL} target="_blank" rel="noopener license" onClick={stop}>
      {chunks}
    </a>
  );
  const emblem = (
    <span className={styles.emblem} role="img" aria-label={t('collectionEmblem', { collection: collection.name })}>
      <EmblemIcon emblem={collection.emblem} aria-hidden />
    </span>
  );

  const ariaLabel = [name, rarityLabel, missing && t('ariaMissing'), shiny && t('ariaShiny')].filter(Boolean).join(', ');

  return (
    <article
      className={styles.card}
      data-size={size}
      data-state={state}
      data-rarity={card.rarity}
      data-letterbox={letterbox || undefined}
      data-selected={selected || undefined}
      data-flippable={canFlip || undefined}
      data-linked={href ? true : undefined}
      aria-label={ariaLabel}
      onClick={canFlip ? () => setFlipped((value) => !value) : undefined}
    >
      <div className={styles.inner} data-flipped={showBack || undefined}>
        {/* inert: the links and buttons of the face turned away can't take the focus */}
        <div className={`${styles.face} ${styles.front}`} aria-hidden={showBack || undefined} inert={showBack || undefined}>
          <div className={styles.panel}>
            <div className={styles.photoArea}>
              {/* .washed: the design system's softened photo treatment */}
              <div className={`washed ${styles.photo}`}>
                {missing ? (
                  // Not owned yet: an empty slot with the collection's emblem, never the photo
                  <div className={styles.slot} aria-hidden="true">
                    <span>
                      <EmblemIcon emblem={collection.emblem} />
                    </span>
                  </div>
                ) : noPhoto ? (
                  <div className={styles.photoFallback}>
                    <ImageIcon aria-hidden />
                    <span>{name}</span>
                  </div>
                ) : (
                  <>
                    {letterbox && (
                      // eslint-disable-next-line @next/next/no-img-element -- see below
                      <img className={styles.photoBackdrop} src={card.photo.src} {...imageLoading} alt="" aria-hidden="true" />
                    )}
                    {/* Plain <img>: the catalogue import already produces 400 and 800 px
                        WebP files, so next/image would only re-encode them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.photoImage}
                      src={card.photo.src}
                      {...imageLoading}
                      alt={name}
                      onError={() => setPhotoFailed(true)}
                    />
                  </>
                )}
              </div>
              {!large && !missing && !noPhoto && (
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
                    <Info aria-hidden />
                  </span>
                </button>
              )}
              {action && <div className={styles.action}>{action}</div>}
              {showCredit && !large && (
                <div className={styles.creditOverlay}>
                  {t.rich('photoOverlay', { author, license: card.photo.license, licenseLink, link: commonsLink })}
                </div>
              )}
              {shiny && (
                <span className={styles.shinySticker}>
                  <Sparkles aria-hidden />
                  {large ? <span>{t('shiny')}</span> : <span className="sr-only">{t('shiny')}</span>}
                </span>
              )}
            </div>

            {large && !missing && (
              <div className={styles.credit}>
                <Camera aria-hidden />
                <span>
                  {t.rich('photoCaption', {
                    author,
                    license: card.photo.license,
                    licenseLink,
                    link: commonsLink,
                    hidden: (chunks) => <span className="sr-only">{chunks}</span>,
                  })}
                </span>
              </div>
            )}

            <div className={styles.text}>
              <h3 className={styles.name}>
                {href ? (
                  <Link href={href} className={styles.nameLink} onClick={stop}>
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h3>
              {/* A missing card shows its name and rarity only */}
              {!missing && place && (
                <div className={styles.place}>
                  <MapPin aria-hidden />
                  <span>{place}</span>
                </div>
              )}
              {!missing && badges.length > 0 && (
                <div className={styles.badges}>
                  {badges.map((badge) => (
                    <span key={badge.key} className={styles.badge} data-badge={badge.key}>
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.footer}>
              {emblem}
              <span className={styles.seriesName}>{card.series?.name}</span>
              <span className={styles.number}>{number}</span>
            </div>
          </div>
          <RarityBand rarity={card.rarity} label={rarityLabel} />
          {shiny && <div className={styles.shine} aria-hidden="true" />}
        </div>

        {hasBack && (
          <div className={`${styles.face} ${styles.back}`} aria-hidden={!showBack || undefined} inert={!showBack || undefined}>
            <div className={styles.panel}>
              <div className={styles.backTop}>
                <h3 className={styles.backName}>{name}</h3>
                {emblem}
              </div>
              {card.excerpt && <p className={styles.excerpt}>{card.excerpt}</p>}
              {large && card.articleUrl && (
                <a className={styles.articleLink} href={card.articleUrl} target="_blank" rel="noopener" onClick={stop}>
                  {t('readArticle')}
                  <ArrowUpRight aria-hidden />
                </a>
              )}
              <span className={styles.textLicense}>
                {t.rich('textLicense', { link: (chunks) => (large ? textLicenseLink(chunks) : chunks) })}
              </span>
              <div className={styles.photoSection}>
                <span className={styles.photoHeading}>{t('photoHeading')}</span>
                <span className={styles.photoAuthor}>
                  {author} · {large ? licenseLink(card.photo.license) : card.photo.license}
                </span>
                {large && (
                  <a className={styles.commonsLink} href={card.photo.fileUrl} target="_blank" rel="noopener" onClick={stop}>
                    {t('commonsFile')}
                    <ArrowUpRight aria-hidden />
                  </a>
                )}
              </div>
              <div className={styles.backFooter}>
                <span>{large ? t('copiesLarge', { count: copies }) : t('copiesGrid', { count: copies })}</span>
                <span>{number}</span>
              </div>
            </div>
            <RarityBand rarity={card.rarity} label={rarityLabel} />
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
          <Check aria-hidden />
          <span className="sr-only">{t('selected')}</span>
        </span>
      )}
    </article>
  );
}
