import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { auditLog, cards, collections, users } from '@/db/schema';
import type { Rarity } from '@/lib/rarity';
import { renumberSeries } from './series-numbers';

// Catalogue queries and changes of the back-office. Every change runs in a
// transaction that also writes its audit_log row.

export type HiddenReason = NonNullable<typeof cards.$inferSelect.hiddenReason>;
export const HIDDEN_REASONS: HiddenReason[] = ['admin', 'memorial', 'commercial', 'twentieth_century', 'photo'];
// Hidden until someone decides: shown under "À revoir"
export const REVIEW_REASONS: HiddenReason[] = ['twentieth_century', 'photo'];

export type CardStatusFilter = 'all' | 'visible' | 'hidden' | 'review';
export const PAGE_SIZE = 50;

export class CatalogError extends Error {
  constructor(readonly code: 'noPhoto' | 'rarityUnchanged' | 'notFound') {
    super(code);
  }
}

export async function catalogStats() {
  const rows = await db
    .select({ reason: cards.hiddenReason, count: count() })
    .from(cards)
    .groupBy(cards.hiddenReason);
  const byReason = Object.fromEntries(rows.filter((r) => r.reason).map((r) => [r.reason!, r.count])) as Partial<
    Record<HiddenReason, number>
  >;
  const visible = rows.find((r) => !r.reason)?.count ?? 0;
  const hidden = rows.filter((r) => r.reason).reduce((sum, r) => sum + r.count, 0);
  const review = REVIEW_REASONS.reduce((sum, reason) => sum + (byReason[reason] ?? 0), 0);
  return { visible, hidden, review, byReason };
}

export async function searchCards({
  query,
  status,
  rarity,
  page,
}: {
  query: string;
  status: CardStatusFilter;
  rarity: Rarity | null;
  page: number;
}) {
  const conditions: (SQL | undefined)[] = [
    status === 'visible' ? isNull(cards.hiddenReason) : undefined,
    status === 'hidden' ? isNotNull(cards.hiddenReason) : undefined,
    status === 'review' ? inArray(cards.hiddenReason, REVIEW_REASONS) : undefined,
    rarity ? eq(cards.rarity, rarity) : undefined,
  ];
  const text = query.trim();
  if (text) {
    const like = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(or(ilike(cards.name, like), ilike(cards.slug, like), eq(cards.wikidataId, text.toUpperCase())));
  }
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(cards).where(where);
  const rows = await db
    .select({
      id: cards.id,
      name: cards.name,
      rarity: cards.rarity,
      department: cards.department,
      region: cards.region,
      hiddenReason: cards.hiddenReason,
      inceptionYear: cards.inceptionYear,
      architectDeathYear: cards.architectDeathYear,
    })
    .from(cards)
    .where(where)
    .orderBy(cards.rank, cards.id)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { total, rows };
}

export async function getAdminCard(id: number) {
  const [card] = await db
    .select({ card: cards, collectionSlug: collections.slug, collectionName: collections.name })
    .from(cards)
    .innerJoin(collections, eq(collections.id, cards.collectionId))
    .where(eq(cards.id, id));
  return card ?? null;
}

export async function listAudit({ targetType, targetId, limit, offset = 0 }: {
  targetType?: string;
  targetId?: string;
  limit: number;
  offset?: number;
}) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      admin: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.adminId))
    .where(
      and(
        targetType ? eq(auditLog.targetType, targetType) : undefined,
        targetId ? eq(auditLog.targetId, targetId) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit)
    .offset(offset);
}

/** The card, locked for the rest of the transaction. */
async function lockCard(tx: Transaction, id: number) {
  const [card] = await tx.select().from(cards).where(eq(cards.id, id)).for('update');
  if (!card) throw new CatalogError('notFound');
  return card;
}

function audit(tx: Transaction, adminId: string, action: string, cardId: number, details: Record<string, unknown>) {
  return tx.insert(auditLog).values({ adminId, action, targetType: 'card', targetId: String(cardId), details });
}

/** Shows a card (reason null) or hides it, and renumbers its collection's series. */
export async function setCardVisibility(
  database: Database,
  adminId: string,
  cardId: number,
  reason: HiddenReason | null,
  note: string | null,
): Promise<void> {
  await database.transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    if (card.hiddenReason === reason) return;
    if (!reason && !card.photoImage) throw new CatalogError('noPhoto');
    await tx.update(cards).set({ hiddenReason: reason, updatedAt: sql`now()` }).where(eq(cards.id, cardId));
    await renumberSeries(tx, card.collectionId);
    await audit(tx, adminId, reason ? 'card.hide' : 'card.show', cardId, {
      from: card.hiddenReason,
      to: reason,
      ...(note ? { note } : {}),
    });
  });
}

export async function setCardRarity(database: Database, adminId: string, cardId: number, rarity: Rarity): Promise<void> {
  await database.transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    if (card.rarity === rarity) throw new CatalogError('rarityUnchanged');
    await tx.update(cards).set({ rarity, updatedAt: sql`now()` }).where(eq(cards.id, cardId));
    await audit(tx, adminId, 'card.rarity', cardId, { from: card.rarity, to: rarity });
  });
}

export interface NewPhoto {
  image: string;
  commonsFile: string;
  width: number;
  height: number;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
}

/** Replaces the photo (files already in uploads) and locks it against the import. */
export async function setCardPhoto(database: Database, adminId: string, cardId: number, photo: NewPhoto): Promise<void> {
  await database.transaction(async (tx) => {
    const card = await lockCard(tx, cardId);
    await tx
      .update(cards)
      .set({
        photoImage: photo.image,
        photoCommonsFile: photo.commonsFile,
        photoWidth: photo.width,
        photoHeight: photo.height,
        photoAuthor: photo.author,
        photoLicense: photo.license,
        photoLicenseUrl: photo.licenseUrl,
        photoLocked: true,
        photoProblem: null,
        updatedAt: sql`now()`,
      })
      .where(eq(cards.id, cardId));
    await audit(tx, adminId, 'card.photo', cardId, { from: card.photoCommonsFile, to: photo.commonsFile });
  });
}
