import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
    // Last sign-in or session refresh (once a day at most). An account inactive
    // for 3 years is deleted, 30 days after the e-mail that warns its owner
    // (src/lib/account-retention.ts).
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    inactivityNoticeAt: timestamp('inactivity_notice_at', { withTimezone: true }),
    // Set by the back-office (src/lib/players/admin.ts): the player can't sign
    // in, and other players no longer see them. Who and why: audit_log.
    bannedAt: timestamp('banned_at', { withTimezone: true }),
    // The mailbox behind the address: no "+tag", and no dots for Gmail. Two
    // accounts sharing it are likely one person's (spec, "Anti-abus").
    emailNormalized: text('email_normalized')
      .notNull()
      .generatedAlwaysAs(
        sql`lower(CASE WHEN lower(split_part("email", '@', 2)) IN ('gmail.com', 'googlemail.com') THEN replace(split_part(split_part("email", '@', 1), '+', 1), '.', '') || '@gmail.com' ELSE split_part(split_part("email", '@', 1), '+', 1) || '@' || split_part("email", '@', 2) END)`,
      ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_name_lower_key').on(sql`lower(${table.name})`),
    index('users_last_active_at_idx').on(table.lastActiveAt),
    index('users_email_normalized_idx').on(table.emailNormalized),
  ],
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
export const hiddenReason = pgEnum('hidden_reason', [
  'memorial',
  'commercial',
  'twentieth_century',
  'photo',
  'admin',
  'national_domain',
]);
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
    // Inside a "domaine national": a commercial use of its image needs the
    // authorisation of the domain's manager (Code du patrimoine, art. L621-42).
    nationalDomain: boolean('national_domain').notNull().default(false),
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

// auction_purchase and auction_sale reference the auction's ID: an auction is
// settled once.
export const coinReason = pgEnum('coin_reason', ['resale', 'achievement', 'auction_purchase', 'auction_sale']);

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

// Social (decided on 2026-10-22, ahead of payments): friends, trades between
// friends and the auction house. A card offered in a trade or put up for
// auction, and the coins of a leading bid, stay with their owner but are
// reserved: src/lib/game/holds.ts computes the reservations on read.

export const friendshipStatus = pgEnum('friendship_status', ['pending', 'accepted']);

// One row per pair of players, whoever asked first. A declined request or a
// removed friend is deleted.
export const friendships = pgTable(
  'friendships',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('friendships_pair_key').on(
      sql`least(${table.requesterId}, ${table.addresseeId})`,
      sql`greatest(${table.requesterId}, ${table.addresseeId})`,
    ),
    index('friendships_addressee_status_idx').on(table.addresseeId, table.status),
    index('friendships_requester_status_idx').on(table.requesterId, table.status),
    check('friendships_not_self', sql`${table.requesterId} <> ${table.addresseeId}`),
  ],
);

export const tradeStatus = pgEnum('trade_status', ['pending', 'accepted', 'declined', 'cancelled', 'expired']);
export const tradeSide = pgEnum('trade_side', ['proposer', 'recipient']);

// A trade offer between two friends. "pending" past expires_at counts as
// expired, whether or not the worker has marked it yet. The players are set
// null when an account is deleted, so the other one keeps the history.
export const trades = pgTable(
  'trades',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    proposerId: uuid('proposer_id').references(() => users.id, { onDelete: 'set null' }),
    recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'set null' }),
    status: tradeStatus('status').notNull().default('pending'),
    // Sent by the page: the same form sent twice creates one offer
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('trades_proposer_key').on(table.proposerId, table.idempotencyKey),
    index('trades_proposer_status_idx').on(table.proposerId, table.status),
    index('trades_recipient_status_idx').on(table.recipientId, table.status),
    index('trades_status_expires_at_idx').on(table.status, table.expiresAt),
  ],
);

// The cards of an offer: what the proposer gives, and what the recipient would give.
export const tradeItems = pgTable(
  'trade_items',
  {
    tradeId: integer('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    side: tradeSide('side').notNull(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tradeId, table.side, table.cardId] }),
    check('trade_items_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const auctionStatus = pgEnum('auction_status', ['active', 'sold', 'unsold', 'cancelled']);

// An auction with automatic bidding: each bidder gives a maximum, and the
// leader pays the second highest maximum plus one step (src/lib/game/bidding.ts).
// "active" past ends_at is over: no more bids, settled by the next read or by
// the worker's market-settle job.
export const auctions = pgTable(
  'auctions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'set null' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    startPrice: integer('start_price').notNull(),
    // Optional: a maximum bid at this price or above buys the card at once
    buyoutPrice: integer('buyout_price'),
    // What the leader pays if the auction ended now
    currentPrice: integer('current_price').notNull(),
    leaderId: uuid('leader_id').references(() => users.id, { onDelete: 'set null' }),
    // The leader's maximum: the coins held while leading, never shown to others
    leaderMax: integer('leader_max'),
    bidCount: integer('bid_count').notNull().default(0),
    status: auctionStatus('status').notNull().default('active'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('auctions_seller_key').on(table.sellerId, table.idempotencyKey),
    index('auctions_collection_status_ends_at_idx').on(table.collectionId, table.status, table.endsAt),
    index('auctions_seller_status_idx').on(table.sellerId, table.status),
    index('auctions_leader_status_idx').on(table.leaderId, table.status),
  ],
);

export const bids = pgTable(
  'bids',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    auctionId: integer('auction_id')
      .notNull()
      .references(() => auctions.id, { onDelete: 'cascade' }),
    bidderId: uuid('bidder_id').references(() => users.id, { onDelete: 'set null' }),
    maxAmount: integer('max_amount').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('bids_bidder_key').on(table.bidderId, table.idempotencyKey),
    index('bids_auction_idx').on(table.auctionId),
  ],
);

// Trade and auction rules of a collection, edited at /admin/rules. The two
// switches turn trades or auctions off without a redeploy (fraud, a bug).
export const marketRules = pgTable('market_rules', {
  collectionId: integer('collection_id')
    .primaryKey()
    .references(() => collections.id),
  tradesEnabled: boolean('trades_enabled').notNull().default(true),
  auctionsEnabled: boolean('auctions_enabled').notNull().default(true),
  tradeExpiryHours: integer('trade_expiry_hours').notNull().default(48),
  // Cards on each side of an offer
  tradeMaxCards: integer('trade_max_cards').notNull().default(5),
  auctionDurationsHours: integer('auction_durations_hours').array().notNull().default(sql`'{24,48,72}'::integer[]`),
  // Kept out of the sale price and destroyed: otherwise coins only ever grow
  auctionFeePercent: integer('auction_fee_percent').notNull().default(5),
  bidIncrementPercent: integer('bid_increment_percent').notNull().default(5),
  // A bid this close to the end pushes the end back by as much
  auctionExtensionMinutes: integer('auction_extension_minutes').notNull().default(5),
  maxActiveAuctions: integer('max_active_auctions').notNull().default(10),
  updatedAt: updatedAt(),
});

// An auction's price range by rarity: the floor is the quick resale value, the
// ceiling stops an alt account from passing coins on through an overpriced sale.
export const marketPrices = pgTable(
  'market_prices',
  {
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id),
    rarity: rarity('rarity').notNull(),
    minPrice: integer('min_price').notNull(),
    maxPrice: integer('max_price').notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.rarity] })],
);

export const notificationKind = pgEnum('notification_kind', [
  'friend_request',
  'friend_accepted',
  'trade_received',
  'trade_accepted',
  'trade_declined',
  'trade_expired',
  'auction_outbid',
  'auction_won',
  'auction_sold',
  'auction_unsold',
  'auction_cancelled',
]);

// What happened to the player (/activity, the header's bell, Web Push). `data`
// holds IDs only: the text is rendered from messages/fr.json when shown.
// Deleted after 90 days by the daily retention job.
export const notifications = pgTable(
  'notifications',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id').references(() => collections.id),
    kind: notificationKind('kind').notNull(),
    data: jsonb('data').notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('notifications_user_created_at_idx').on(table.userId, table.createdAt),
    index('notifications_unread_idx').on(table.userId).where(sql`${table.readAt} IS NULL`),
    index('notifications_created_at_idx').on(table.createdAt),
  ],
);

// One Web Push subscription per device that turned notifications on. No user
// agent, no IP address.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('push_subscriptions_user_id_idx').on(table.userId)],
);
