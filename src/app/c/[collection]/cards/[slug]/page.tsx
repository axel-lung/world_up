import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { ButtonLink } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { articleUrl, cardImageUrl, cardPath, commonsFileUrl, getVisibleCard, type VisibleCard } from '@/lib/catalog/cards';
import { getSession } from '@/lib/session';
import styles from './page.module.css';

// Public card pages are the game's entry points from search engines: the
// photo, the excerpt and their credits, readable without an account.

const DESCRIPTION_MAX = 160;

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

const place = (card: VisibleCard) => [card.department, card.region].filter(Boolean).join(' · ');

export async function generateMetadata({ params }: PageProps<'/c/[collection]/cards/[slug]'>): Promise<Metadata> {
  const { collection, slug } = await params;
  const card = await getVisibleCard(collection, slug);
  if (!card) return {};
  const t = await getTranslations('CardPage');
  const name = displayName(card.name);
  const description = card.excerpt
    ? shorten(card.excerpt, DESCRIPTION_MAX)
    : t('description', { name, place: place(card), collection: card.collectionName });
  const url = cardPath(collection, card.slug);
  const height = card.photoWidth && card.photoHeight ? Math.round((800 * card.photoHeight) / card.photoWidth) : undefined;
  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: name,
      description,
      images: [{ url: cardImageUrl(card.photoImage, 800), width: 800, height, alt: name }],
    },
  };
}

export default async function CardPage({ params }: PageProps<'/c/[collection]/cards/[slug]'>) {
  const { collection, slug } = await params;
  const card = await getVisibleCard(collection, slug);
  if (!card) notFound();

  const [t, tCard, tRarity, session] = await Promise.all([
    getTranslations('CardPage'),
    getTranslations('Card'),
    getTranslations('Rarity'),
    getSession(),
  ]);
  const name = displayName(card.name);
  const license = photoLicenseLabel(card.photoLicense, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
  });
  const [printed] = card.series;
  const external = (href: string) =>
    function ExternalLink(chunks: ReactNode) {
      return (
        <a href={href} target="_blank" rel="noopener">
          {chunks}
        </a>
      );
    };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.collection}>
          {card.collectionName}
        </Link>
        <h1>{name}</h1>
        <p className={styles.place}>{place(card)}</p>
        <div className={styles.tags}>
          <span className={styles.rarity} data-rarity={card.rarity}>
            {tRarity(card.rarity)}
          </span>
          {card.protection && <Tag>{t(`protection.${card.protection}`)}</Tag>}
          {card.unesco && <Tag>{t('unesco')}</Tag>}
          {card.endangered && <Tag>{t('endangered')}</Tag>}
        </div>
      </header>

      <section className={styles.card} aria-labelledby="card-heading">
        <h2 id="card-heading" className="sr-only">
          {t('cardHeading')}
        </h2>
        <Card
          card={toCardData(card, printed ? { name: printed.name, number: printed.number, total: printed.total } : null, license)}
          size="large" flippable priority sizes="(max-width: 392px) calc(100vw - 32px), 360px" />
      </section>

      <div className={styles.details}>
        {card.excerpt && (
          <section className={styles.section} aria-labelledby="about-heading">
            <h2 id="about-heading">{t('aboutHeading')}</h2>
            <p>{card.excerpt}</p>
            <a className={styles.external} href={articleUrl(card.articleTitle)} target="_blank" rel="noopener">
              {tCard('readArticle')}
              <ArrowUpRightIcon aria-hidden />
            </a>
            <p className={styles.license}>{tCard('textLicense')}</p>
          </section>
        )}

        {card.series.length > 0 && (
          <section className={styles.section} aria-labelledby="series-heading">
            <h2 id="series-heading">{t('seriesHeading')}</h2>
            <ul className={styles.series}>
              {card.series.map((s) => (
                <li key={s.slug}>
                  <span>{s.name}</span>
                  <span className={styles.number}>{t('seriesNumber', { number: s.number, total: s.total })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section} aria-labelledby="photo-heading">
          <h2 id="photo-heading">{t('photoHeading')}</h2>
          <p>
            {t.rich('photoCredit', {
              author: card.photoAuthor ?? tCard('unknownAuthor'),
              license,
              link: external(commonsFileUrl(card.photoCommonsFile!)),
            })}
          </p>
        </section>

        {!session && (
          <section className={`${styles.section} ${styles.collect}`} aria-labelledby="collect-heading">
            <h2 id="collect-heading">{t('collectHeading')}</h2>
            <p>{t('collectText')}</p>
            <div className={styles.actions}>
              <ButtonLink href="/signup" variant="primary">
                {t('signup')}
              </ButtonLink>
              <ButtonLink href={`/login?next=${encodeURIComponent(cardPath(collection, card.slug))}`}>{t('login')}</ButtonLink>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
