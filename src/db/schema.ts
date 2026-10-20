import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
