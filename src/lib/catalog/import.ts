import { copyFile, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Database } from '@/db';
import { cards, cardSeries, collections, series } from '@/db/schema';
import { type Catalog, type CatalogCard, photoFiles } from './export-format';
import { renumberSeries } from './series-numbers';

// Rows per statement, under PostgreSQL's limit of 65,535 parameters.
const BATCH = 1000;

export interface ImportReport {
  cards: number;
  inserted: number;
  updated: number;
  /** Cards in the game that the export no longer has: kept as they are. */
  notInExport: number;
  series: number;
  hidden: Record<string, number>;
}

async function listFiles(dir: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(dir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
}

/**
 * Copies the photos the catalogue uses from the export to the uploads volume,
 * before any database change, so that no card ever points to a missing file.
 * A file already there is skipped: its name comes from its content.
 */
export async function copyImages(catalog: Catalog, sourceDir: string, targetDir: string): Promise<number> {
  const files = [...new Set(catalog.cards.flatMap(photoFiles))];
  const available = await listFiles(sourceDir);
  const missing = files.filter((file) => !available.has(file));
  if (missing.length > 0) {
    throw new Error(`${missing.length} photo files missing from ${sourceDir}, for example ${missing.slice(0, 3).join(', ')}`);
  }
  await mkdir(targetDir, { recursive: true });
  const present = await listFiles(targetDir);
  let copied = 0;
  for (const file of files) {
    if (present.has(file)) continue;
    const target = path.join(targetDir, file);
    await copyFile(path.join(sourceDir, file), `${target}.part`);
    await rename(`${target}.part`, target);
    copied += 1;
  }
  return copied;
}

const excluded = (column: AnyPgColumn) => sql.raw(`excluded."${column.name}"`);
const current = (column: AnyPgColumn) => sql.raw(`"cards"."${column.name}"`);
// A new photo replaces the old one unless the back-office chose it; an export
// without a usable photo keeps the one the card has.
const photoValue = (column: AnyPgColumn): SQL =>
  sql`CASE WHEN "cards"."photo_locked" OR excluded."photo_image" IS NULL THEN ${current(column)} ELSE ${excluded(column)} END`;

function cardRow(collectionId: number, card: CatalogCard, slug: string): typeof cards.$inferInsert {
  const photo = card.photo;
  return {
    collectionId,
    wikidataId: card.wikidata_id,
    slug,
    name: card.name,
    rarity: card.rarity,
    rank: card.rank,
    protection: card.protection,
    unesco: card.unesco,
    endangered: card.endangered,
    family: card.family,
    departmentCode: card.department_code,
    department: card.department,
    region: card.region,
    inceptionYear: card.inception,
    architectDeathYear: card.architect_death,
    excerpt: card.excerpt,
    articleTitle: card.article.title,
    articleRevision: card.article.revision,
    photoImage: photo ? photo.files['400'].replace(/-400\.webp$/, '') : null,
    photoCommonsFile: photo?.commons_file ?? null,
    photoWidth: photo?.width ?? null,
    photoHeight: photo?.height ?? null,
    photoAuthor: photo?.author ?? null,
    photoLicense: photo?.license ?? null,
    photoLicenseUrl: photo?.license_url ?? null,
    photoProblem: card.photo_problem,
    memorial: card.memorial,
    commercial: card.commercial,
    twentiethCentury: card.twentieth_century,
    nationalDomain: card.national_domain,
    hiddenReason: card.hidden_reason,
  };
}

/**
 * Loads a parsed export into the database, in one transaction: upserts the
 * series and the cards by Wikidata ID, then their series memberships. Running
 * it again with the same export changes nothing. An existing card keeps its
 * rarity, rank, slug and visibility (a card hidden for want of a photo comes
 * back once the export has one; a visible card the export newly places in a
 * national domain, or whose photo it now refuses for its licence, is hidden for
 * review), and its photo when the back-office chose it.
 */
export async function importCatalog(database: Database, catalog: Catalog): Promise<ImportReport> {
  return database.transaction(async (tx) => {
    // One import at a time
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('import-catalog'))`);
    const [collection] = await tx
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.slug, catalog.collection));
    if (!collection) throw new Error(`Unknown collection "${catalog.collection}"`);
    const collectionId = collection.id;

    const seriesRows = await tx
      .insert(series)
      .values(catalog.series.map((s) => ({ collectionId, slug: s.slug, type: s.type, name: s.name })))
      .onConflictDoUpdate({
        target: [series.collectionId, series.slug],
        set: { type: sql.raw('excluded."type"'), name: sql.raw('excluded."name"') },
      })
      .returning({ id: series.id, slug: series.slug });
    const seriesIds = new Map(seriesRows.map((s) => [s.slug, s.id]));

    // Existing cards keep their slug; a new card whose slug is taken gets its Wikidata ID appended
    const existing = await tx
      .select({ wikidataId: cards.wikidataId, slug: cards.slug })
      .from(cards)
      .where(eq(cards.collectionId, collectionId));
    const existingSlugs = new Map(existing.map((c) => [c.wikidataId, c.slug]));
    const taken = new Set(existingSlugs.values());
    const ranked = [...catalog.cards].sort((a, b) => a.rank - b.rank);
    const rows = ranked.map((card) => {
      let slug = existingSlugs.get(card.wikidata_id);
      if (!slug) {
        slug = taken.has(card.slug) ? `${card.slug}-${card.wikidata_id.toLowerCase()}` : card.slug;
        taken.add(slug);
      }
      return cardRow(collectionId, card, slug);
    });

    const cardIds = new Map<string, number>();
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const result = await tx
        .insert(cards)
        .values(rows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [cards.collectionId, cards.wikidataId],
          set: {
            name: excluded(cards.name),
            protection: excluded(cards.protection),
            unesco: excluded(cards.unesco),
            endangered: excluded(cards.endangered),
            family: excluded(cards.family),
            departmentCode: excluded(cards.departmentCode),
            department: excluded(cards.department),
            region: excluded(cards.region),
            inceptionYear: excluded(cards.inceptionYear),
            architectDeathYear: excluded(cards.architectDeathYear),
            excerpt: excluded(cards.excerpt),
            articleTitle: excluded(cards.articleTitle),
            articleRevision: excluded(cards.articleRevision),
            photoImage: photoValue(cards.photoImage),
            photoCommonsFile: photoValue(cards.photoCommonsFile),
            photoWidth: photoValue(cards.photoWidth),
            photoHeight: photoValue(cards.photoHeight),
            photoAuthor: photoValue(cards.photoAuthor),
            photoLicense: photoValue(cards.photoLicense),
            photoLicenseUrl: photoValue(cards.photoLicenseUrl),
            photoProblem: sql`CASE WHEN "cards"."photo_locked" THEN "cards"."photo_problem" ELSE excluded."photo_problem" END`,
            memorial: excluded(cards.memorial),
            commercial: excluded(cards.commercial),
            twentiethCentury: excluded(cards.twentiethCentury),
            nationalDomain: excluded(cards.nationalDomain),
            // A visible card leaves the packs until the back-office reviews it
            // when it has just entered a national domain (a new decree), or
            // when the export now refuses its photo for its licence
            hiddenReason: sql`CASE
              WHEN "cards"."hidden_reason" = 'photo' AND excluded."photo_image" IS NOT NULL THEN excluded."hidden_reason"
              WHEN "cards"."hidden_reason" IS NULL AND excluded."national_domain" AND NOT "cards"."national_domain"
                THEN 'national_domain'::hidden_reason
              WHEN "cards"."hidden_reason" IS NULL AND NOT "cards"."photo_locked" AND excluded."photo_problem" = 'license'
                AND "cards"."photo_problem" IS DISTINCT FROM 'license' THEN 'photo'::hidden_reason
              ELSE "cards"."hidden_reason" END`,
            updatedAt: sql`now()`,
          },
        })
        // xmax is 0 on a freshly inserted row
        .returning({ id: cards.id, wikidataId: cards.wikidataId, inserted: sql<boolean>`xmax = 0` });
      for (const row of result) {
        cardIds.set(row.wikidataId, row.id);
        if (row.inserted) inserted += 1;
      }
    }

    // Series memberships of the exported cards: drop the ones the export no
    // longer has, append the new ones at the end of their series, in rank order
    const memberships = await tx
      .select({ cardId: cardSeries.cardId, seriesId: cardSeries.seriesId, position: cardSeries.position })
      .from(cardSeries)
      .innerJoin(cards, eq(cards.id, cardSeries.cardId))
      .where(eq(cards.collectionId, collectionId));
    const key = (cardId: number, seriesId: number) => `${cardId}:${seriesId}`;
    const existingPairs = new Set(memberships.map((m) => key(m.cardId, m.seriesId)));
    const lastPosition = new Map<number, number>();
    for (const m of memberships) lastPosition.set(m.seriesId, Math.max(lastPosition.get(m.seriesId) ?? 0, m.position));
    const wanted = new Set<string>();
    const additions: (typeof cardSeries.$inferInsert)[] = [];
    for (const card of ranked) {
      const cardId = cardIds.get(card.wikidata_id)!;
      for (const slug of card.series) {
        const seriesId = seriesIds.get(slug)!;
        wanted.add(key(cardId, seriesId));
        if (existingPairs.has(key(cardId, seriesId))) continue;
        const position = (lastPosition.get(seriesId) ?? 0) + 1;
        lastPosition.set(seriesId, position);
        additions.push({ cardId, seriesId, position });
      }
    }
    const exported = new Set(cardIds.values());
    for (const m of memberships) {
      if (exported.has(m.cardId) && !wanted.has(key(m.cardId, m.seriesId))) {
        await tx.execute(sql`DELETE FROM card_series WHERE card_id = ${m.cardId} AND series_id = ${m.seriesId}`);
      }
    }
    for (let i = 0; i < additions.length; i += BATCH * 5) {
      await tx.insert(cardSeries).values(additions.slice(i, i + BATCH * 5));
    }
    await renumberSeries(tx, collectionId);

    const hidden = await tx
      .select({ reason: cards.hiddenReason, count: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(eq(cards.collectionId, collectionId), isNotNull(cards.hiddenReason)))
      .groupBy(cards.hiddenReason);
    return {
      cards: rows.length,
      inserted,
      updated: rows.length - inserted,
      notInExport: existing.filter((c) => !cardIds.has(c.wikidataId)).length,
      series: catalog.series.length,
      hidden: Object.fromEntries(hidden.map((h) => [h.reason!, h.count])),
    };
  });
}
