---
name: schema-change
description: Change World Up's database the project's way. Covers editing src/db/schema.ts, generating and checking the Drizzle migration, seed and data migrations, enum values, and adding a tunable rule (a game_rules or market_rules column edited at /admin/rules and published on /rules) through every file it touches. Use whenever a task adds or changes a table, column, enum, index or seeded row.
---

# Changing the database

## The migration

1. Edit `src/db/schema.ts`. Every game table carries `collection_id` (friendships hold for the whole game, and a notification's is optional). Tunable values are columns or rows, never code constants (anti-abuse limits such as `MAX_FRIENDS` excepted).
2. `npm run db:generate -- --name <what_changed>` (snake_case, like `wishlist` or `onsite_visits`). Read the generated SQL in `drizzle/`. Drizzle sometimes drops and re-creates where a rename was meant, or misses a default for existing rows.
3. Commit `drizzle/` with the schema: the `.sql` file, `meta/_journal.json` and the new snapshot. CI regenerates and fails on any difference.
4. `node .claude/scripts/wu.mjs up` applies it locally (it runs pending migrations), then `wu check --db`.

A migration is applied in production by `worldup-migrate` before web and worker start. It must work on a database full of players: add `NOT NULL` columns with a default, or fill them in the same migration.

## Seeds and data migrations

Seeded rows are SQL migrations of their own (`0008_seed_game_rules.sql`, `0018_seed_streak_rewards.sql`, `0023_seed_visit_achievements.sql`):

```sh
npm run db:generate -- --custom --name seed_<what>    # an empty .sql file with its journal entry
```

Write them for the `heritage` collection by slug (`SELECT c."id" ... FROM "collections" c WHERE c."slug" = 'heritage'`), with `ON CONFLICT DO NOTHING`, and a comment saying what was decided and when. A new collection gets its rows from `/admin/rules`, not from code.

## Traps already met

- **Enum values**: Drizzle runs all pending migrations in one transaction, where a value added with `ALTER TYPE ... ADD VALUE` can't be used yet (by a seed in the next migration, for example). Re-create the type instead, as `drizzle/0022_onsite_visits.sql` does: rename the old one, create the new one, `ALTER COLUMN ... USING "col"::text::"new_type"`, drop the old one. Its header comment explains it.
- **Timestamps**: compare `valid_from` and similar dates in SQL, not in JavaScript. `now()` keeps microseconds that a `Date` rounds off (see `currentOdds()`).
- **Correlated subqueries** in a single-table Drizzle select come out with unqualified columns: alias explicitly (see `seriesProgress()`).
- **Dated rows are never overwritten**: odds (`rarity_odds`) are new rows valid from now or later, and `coin_ledger` is append-only, unique per player, reason and reference.
- **Showing or hiding a card**: call `renumberSeries()` afterwards.
- **Lock order** for anything that moves cards or coins: the trade or auction row, then the `user_cards` rows sorted by player and card, then the wallet locks sorted by player.

## Adding a tunable rule

Example: the visit rules (`visit_radius_metres`, `visit_max_accuracy_metres`, `visits_per_day`), added on 2026-11-22. A new `game_rules` column goes through all of these:

| Step | File |
| --- | --- |
| Column with the seed default (`.notNull().default(...)`) | `src/db/schema.ts`, then the generated migration |
| Read it in the select, and put it in the right group type (`PackRules`, `RepairRules`, `VisitRules`, or a new one if it's edited apart) | `src/lib/game/rules.ts` (`getGameRules()`) |
| Use it, taking it as a parameter in pure code (with `now` and the random source) | `src/lib/game/*.ts` |
| Bounds for the admin form (`count(min, max)` and the like) | `src/app/admin/(granted)/rules/actions.ts` |
| The field in its form group | `src/app/admin/(granted)/rules/RulesForms.tsx` |
| The field in the audit log's labelled fields | `src/app/admin/(granted)/AuditTable.tsx` |
| The admin label | `messages/fr.json`, `Admin.rules.fields.<field>` |
| The public wording, if players are affected | `messages/fr.json` (`Rules`), `src/app/(site)/rules/page.tsx` |
| Tests: `createTestCollection()` accepts it in `rules` | `src/lib/game/testing.ts`, a `*.db.test.ts` |
| Docs | the `record-decision` skill: CLAUDE.md (or the matching `.claude/rules/` file), the spec, `/rules` |

A `market_rules` column follows the same path through `getMarketRules()`. Rows by rarity (`resale_values`, `market_prices`, `rarity_odds`) and lists (`streak_rewards`, `achievements`) have their own forms on the same page.
