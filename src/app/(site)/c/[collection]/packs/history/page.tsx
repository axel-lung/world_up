import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { displayName } from '@/components/card/card-format';
import { EmblemIcon } from '@/components/collection/Emblem';
import { cardImageUrl, cardPath } from '@/lib/catalog/cards';
import { HISTORY_MAX_PAGES, HISTORY_PAGE_SIZE, type HistoryCard, openingHistory } from '@/lib/game/history';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { parisDay } from '@/lib/game/streak';
import { RARITY_PIPS } from '@/lib/rarity';
import { requireSession } from '@/lib/session';
import { FocusBroughtCards, LoadMore } from '../../GridControls';
import styles from '../../game.module.css';
import own from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('History');
  return { title: t('title') };
}

const pageStart = (index: number) => `opening-${index}`;

/**
 * The player's pack openings, newest first, by day in Paris: each pack's
 * cards in reveal order, its new cards marked. A card hidden since shows its
 * name and rarity only, and leads nowhere. "Voir plus" adds a page, up to
 * HISTORY_MAX_PAGES; the account export holds them all.
 */
export default async function HistoryPage({ params, searchParams }: PageProps<'/c/[collection]/packs/history'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.history);
  const query = await searchParams;
  const requested = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const pages = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), HISTORY_MAX_PAGES) : 1;
  const [t, tPacks, tRarity, format, { openings, total }] = await Promise.all([
    getTranslations('History'),
    getTranslations('Packs'),
    getTranslations('Rarity'),
    getFormatter(),
    openingHistory(user.id, collection.id, pages),
  ]);

  const now = new Date();
  const today = parisDay(now);
  const yesterday = parisDay(new Date(now.getTime() - 86_400_000));
  const dayTitle = (date: Date) => {
    const day = parisDay(date);
    if (day === today) return t('today');
    if (day === yesterday) return t('yesterday');
    return format.dateTime(date, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  };
  // Consecutive openings of the same Paris day
  const days: { title: string; openings: { index: number; opening: (typeof openings)[number] }[] }[] = [];
  openings.forEach((opening, index) => {
    const title = dayTitle(opening.openedAt);
    const last = days.at(-1);
    if (last?.title === title) last.openings.push({ index, opening });
    else days.push({ title, openings: [{ index, opening }] });
  });
  const shown = openings.length;
  const more = shown < total && pages < HISTORY_MAX_PAGES;

  const thumb = (card: HistoryCard) => {
    const name = displayName(card.name);
    const label = [name, tRarity(card.rarity), card.isNew && t('new')].filter(Boolean).join(', ');
    const content = (
      <>
        {card.photoImage ? (
          // A plain <img>, like the cards: the import made the WebP files
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cardImageUrl(card.photoImage, 400)}
            alt=""
            loading="lazy"
            decoding="async"
            width={64}
            height={64}
          />
        ) : (
          <EmblemIcon emblem={collection.emblem} aria-hidden className={own.emblem} />
        )}
        {card.isNew && (
          <span className={own.new} aria-hidden="true">
            {t('newShort')}
          </span>
        )}
      </>
    );
    return (
      <li key={card.position} data-rarity={card.rarity} title={name}>
        {card.slug ? (
          <Link
            href={cardPath(collection.slug, card.slug)}
            className={own.thumb}
            aria-label={label}
          >
            {content}
          </Link>
        ) : (
          <span className={own.thumb} data-hidden role="img" aria-label={label}>
            {content}
          </span>
        )}
      </li>
    );
  };

  return (
    <main className={`${styles.page} ${own.page}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.packs}>{tPacks('title')}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={own.muted}>{t('intro', { count: total })}</p>
      </header>

      {total === 0 ? (
        <p className={own.muted}>
          {t.rich('empty', { link: (chunks) => <Link href={paths.open}>{chunks}</Link> })}
        </p>
      ) : (
        days.map((day) => (
          <section key={`${day.title}-${day.openings[0].index}`} className={own.day} aria-label={day.title}>
            <h2 className={own.dayTitle}>
              {day.title}
              <span className={own.dayCount}>{t('packs', { count: day.openings.length })}</span>
            </h2>
            <ol className={own.openings}>
              {day.openings.map(({ index, opening }) => {
                const best = [...opening.cards].sort((a, b) => RARITY_PIPS[b.rarity] - RARITY_PIPS[a.rarity])[0];
                const fresh = opening.cards.filter((card) => card.isNew).length;
                const time = format.dateTime(opening.openedAt, { timeStyle: 'short', timeZone: 'Europe/Paris' });
                return (
                  <li
                    key={opening.id}
                    className={own.opening}
                    {...(index % HISTORY_PAGE_SIZE === 0 ? { id: pageStart(index), tabIndex: -1 } : {})}
                  >
                    <p className={own.openingHead}>
                      <time dateTime={opening.openedAt.toISOString()}>{time}</time>
                      <span className={own.summary}>
                        {best && t('best', { name: displayName(best.name), rarity: tRarity(best.rarity) })}
                        {' · '}
                        {t('fresh', { count: fresh })}
                      </span>
                    </p>
                    <ol className={own.strip} aria-label={t('cardsOf', { time })}>
                      {opening.cards.map(thumb)}
                    </ol>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      <FocusBroughtCards shown={shown} />
      {shown > 0 && shown < total && (
        <LoadMore
          href={more ? `${paths.history}?page=${pages + 1}` : null}
          next={pageStart(shown)}
          label={t('more')}
          status={t('shown', { shown, total })}
          hint={more ? null : t('exportHint')}
        />
      )}
    </main>
  );
}
