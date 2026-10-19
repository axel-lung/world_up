import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Every game table references a collection, so a second collection needs no
// heavy migration. The launch collection has the slug "heritage".
export const collections = pgTable('collections', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Design-system tokens overriding the default theme for this collection.
  theme: jsonb('theme').notNull().default({}),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
