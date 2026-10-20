import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { RARITIES } from '@/lib/rarity';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// Every game table references a collection, so a second collection needs no
// heavy migration. The launch collection has the slug "heritage".
export const collections = pgTable('collections', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Design-system tokens overriding the default theme for this collection.
  theme: jsonb('theme').notNull().default({}),
  active: boolean('active').notNull().default(false),
  createdAt: createdAt(),
});

// Accounts, managed by Better Auth (src/lib/auth.ts). Property names are the
// fields Better Auth reads and writes, so keep them when renaming columns.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The player's public pseudo (leaderboard), never the e-mail address.
    name: text('name').notNull(),
    // Stored lowercase by Better Auth.
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    // Required by Better Auth, never filled: players have no avatar.
    image: text('image'),
    // Players must be 18 or older; set at signup and never changed by the player.
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_name_lower_key').on(sql`lower(${table.name})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Always empty: the auth config drops them to keep personal data minimal.
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

// One "credential" row per player, holding the argon2id password hash.
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    // OAuth fields Better Auth expects; unused without social login.
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

// Password reset tokens.
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

// Proof that a player accepted a legal document (terms of use at signup).
export const consents = pgTable(
  'consents',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    document: text('document', { enum: ['terms'] }).notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('consents_user_id_idx').on(table.userId)],
);

// The catalogue, loaded by import-catalog.js from the pipeline's export
// (scripts/README.md) and edited in the back-office.
export const rarity = pgEnum('rarity', RARITIES);
export const protection = pgEnum('protection', ['classe', 'inscrit']);
// Why a card is out of packs and pages; null means visible. The import sets it
// on new cards only (except "photo" once a usable photo arrives): afterwards
// only the back-office changes it.
export const hiddenReason = pgEnum('hidden_reason', ['memorial', 'commercial', 'twentieth_century', 'photo', 'admin']);
export const photoProblem = pgEnum('photo_problem', ['missing', 'too_small', 'license', 'download']);
export const seriesType = pgEnum('series_type', ['region', 'family', 'unesco', 'endangered']);

export const cards = pgTable(
  'cards',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    wikidataId: text('wikidata_id').notNull(),
    // Public address (/c/<collection>/cards/<slug>): never changes once imported.
    slug: text('slug').notNull(),
    // Lowercase like the Wikidata label; the card capitalizes it.
    name: text('name').notNull(),
    // Frozen at import: only the back-office changes it, and logs the change.
    rarity: rarity('rarity').notNull(),
    // Popularity rank the rarity came from.
    rank: integer('rank').notNull(),
    protection: protection('protection'),
    unesco: boolean('unesco').notNull().default(false),
    endangered: boolean('endangered').notNull().default(false),
    family: text('family'),
    departmentCode: text('department_code'),
    department: text('department'),
    region: text('region'),
    excerpt: text('excerpt'),
    articleTitle: text('article_title').notNull(),
    articleRevision: integer('article_revision'),
    // The photo: the files are uploads/cards/<photo_image>-400.webp and -800.webp.
    photoImage: text('photo_image'),
    photoCommonsFile: text('photo_commons_file'),
    photoWidth: integer('photo_width'),
    photoHeight: integer('photo_height'),
    photoAuthor: text('photo_author'),
    photoLicense: text('photo_license'),
    photoLicenseUrl: text('photo_license_url'),
    // Chosen in the back-office: the import no longer replaces it.
    photoLocked: boolean('photo_locked').notNull().default(false),
    // Why the export had no usable photo for this card.
    photoProblem: photoProblem('photo_problem'),
    // Editorial flags from the pipeline, shown in the back-office.
    memorial: boolean('memorial').notNull().default(false),
    commercial: boolean('commercial').notNull().default(false),
    twentiethCentury: boolean('twentieth_century').notNull().default(false),
    hiddenReason: hiddenReason('hidden_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('cards_collection_wikidata_key').on(table.collectionId, table.wikidataId),
    uniqueIndex('cards_collection_slug_key').on(table.collectionId, table.slug),
    // Pack draws pick among the visible cards of one rarity.
    index('cards_visible_rarity_idx').on(table.collectionId, table.rarity).where(sql`${table.hiddenReason} IS NULL`),
  ],
);

export const series = pgTable(
  'series',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    slug: text('slug').notNull(),
    type: seriesType('type').notNull(),
    name: text('name').notNull(),
    // Visible cards in the series, kept by renumberSeries().
    cardCount: integer('card_count').notNull().default(0),
  },
  (table) => [uniqueIndex('series_collection_slug_key').on(table.collectionId, table.slug)],
);

export const cardSeries = pgTable(
  'card_series',
  {
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    // Stable order in the series: rank at first import, later cards after.
    position: integer('position').notNull(),
    // "004/1452" on the card: position among the visible cards, null when the
    // card is hidden. Kept by renumberSeries().
    number: integer('number'),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.seriesId] }),
    index('card_series_series_position_idx').on(table.seriesId, table.position),
  ],
);
