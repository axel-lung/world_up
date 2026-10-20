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
    // Better Auth's two-factor plugin; only the back-office account turns it on.
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
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
    // Created by a two-factor verification: required for /admin (src/lib/admin.ts).
    twoFactorVerified: boolean('two_factor_verified').notNull().default(false),
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

// The back-office account's authenticator app secret and backup codes, both
// encrypted by Better Auth.
export const twoFactors = pgTable(
  'two_factors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    // False until the first code from the app is checked
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [index('two_factors_user_id_idx').on(table.userId)],
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
    // For the review of the 20th-century cards (architect's copyright)
    inceptionYear: integer('inception_year'),
    architectDeathYear: integer('architect_death_year'),
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
    // Pack draws pick the n-th visible card of one rarity, in id order.
    index('cards_visible_rarity_idx')
      .on(table.collectionId, table.rarity, table.id)
      .where(sql`${table.hiddenReason} IS NULL`),
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

// Every back-office action: who did what to which target, and the values before
// and after. Never updated or deleted.
export const auditLog = pgTable(
  'audit_log',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Kept when the admin account is deleted
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_log_target_idx').on(table.targetType, table.targetId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
);

export const reportType = pgEnum('report_type', ['photo', 'text', 'other']);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

// A player's report about a card's photo or text, handled in the back-office.
export const reports = pgTable(
  'reports',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Null once the player deletes the account: the report stays, anonymous
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    type: reportType('type').notNull(),
    message: text('message').notNull(),
    status: reportStatus('status').notNull().default('open'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('reports_status_created_at_idx').on(table.status, table.createdAt),
    index('reports_user_id_idx').on(table.userId),
    index('reports_card_id_idx').on(table.cardId),
  ],
);

// The game (lot 3). Every tunable rule is a row here, never a code constant:
// src/lib/game/ reads them on each refill, opening and resale.

// Pack rules of a collection. Subscribers get their own values in lot 4.
export const gameRules = pgTable('game_rules', {
  collectionId: integer('collection_id')
    .primaryKey()
    .references(() => collections.id),
  cardsPerPack: integer('cards_per_pack').notNull().default(5),
  // Packs a player has on first entering the collection
  signupPacks: integer('signup_packs').notNull().default(10),
  refillMinutes: integer('refill_minutes').notNull().default(10),
  maxReserve: integer('max_reserve').notNull().default(10),
  updatedAt: updatedAt(),
});

// Coins for reselling one duplicate copy, by rarity.
export const resaleValues = pgTable(
  'resale_values',
  {
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    rarity: rarity('rarity').notNull(),
    coins: integer('coins').notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.rarity] })],
);

// Published odds: a change is a new set of rows for every rarity, sharing one
// valid_from, and is never overwritten. /odds shows the whole history.
export const rarityOdds = pgTable(
  'rarity_odds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    rarity: rarity('rarity').notNull(),
    // Parts per million: a set sums to 1,000,000 (0.25 % is 2,500)
    perMillion: integer('per_million').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('rarity_odds_collection_valid_from_key').on(table.collectionId, table.validFrom, table.rarity)],
);

// Free packs in reserve, refilled on read (src/lib/game/refill.ts). The row
// also serves as the player's lock while a pack opens.
export const packState = pgTable(
  'pack_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    packs: integer('packs').notNull(),
    lastRefill: timestamp('last_refill', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.collectionId] })],
);

export const packOrigin = pgEnum('pack_origin', ['free', 'subscription', 'bonus', 'purchase']);

export const packOpenings = pgTable(
  'pack_openings',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    origin: packOrigin('origin').notNull(),
    // Sent by the page: a second request with the same key opens nothing
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('pack_openings_user_key').on(table.userId, table.idempotencyKey),
    index('pack_openings_user_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const packCards = pgTable(
  'pack_cards',
  {
    openingId: integer('opening_id')
      .notNull()
      .references(() => packOpenings.id, { onDelete: 'cascade' }),
    // 1 to cards_per_pack, in reveal order
    position: integer('position').notNull(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    // The player's first copy of the card
    isNew: boolean('is_new').notNull(),
    // The shiny variant is a version 2 option: always false for now
    shiny: boolean('shiny').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.openingId, table.position] })],
);

export const userCards = pgTable(
  'user_cards',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    quantity: integer('quantity').notNull(),
    firstObtainedAt: timestamp('first_obtained_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.cardId] }),
    index('user_cards_collection_user_idx').on(table.collectionId, table.userId),
  ],
);

export const coinReason = pgEnum('coin_reason', ['resale', 'achievement']);

// Append-only: the balance is the sum of the player's entries and never goes
// below zero (src/lib/game/coins.ts).
export const coinLedger = pgTable(
  'coin_ledger',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    amount: integer('amount').notNull(),
    reason: coinReason('reason').notNull(),
    // Unique per player and reason, so the same credit is never written twice:
    // "<request key>:<card id>" for a resale, the achievement's ID for a reward
    reference: text('reference').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('coin_ledger_user_reason_reference_key').on(table.userId, table.reason, table.reference)],
);

export const achievementKind = pgEnum('achievement_kind', [
  'distinct_cards',
  'packs_opened',
  'rarity_owned',
  'series_completed',
]);

// An achievement is reached when the player's count for its kind (distinct
// visible cards, packs opened, visible cards of `rarity`, completed series)
// reaches `threshold`. Its title comes from messages/fr.json (Achievements).
export const achievements = pgTable(
  'achievements',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    code: text('code').notNull(),
    kind: achievementKind('kind').notNull(),
    threshold: integer('threshold').notNull(),
    rarity: rarity('rarity'),
    rewardCoins: integer('reward_coins').notNull(),
    // Display order on the player's page
    position: integer('position').notNull(),
  },
  (table) => [uniqueIndex('achievements_collection_code_key').on(table.collectionId, table.code)],
);

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: integer('achievement_id')
      .notNull()
      .references(() => achievements.id),
    obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);
