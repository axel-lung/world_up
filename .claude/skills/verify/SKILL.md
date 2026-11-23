---
name: verify
description: Choose and run the checks a World Up change needs before it is handed over or committed (lint, typecheck, unit, database, Python pipeline and end-to-end tests, screenshots, the /design showcase), the way CI runs them, and read their failures. Use after editing code and before saying a change works.
---

# Verifying a change

Run everything through `node .claude/scripts/wu.mjs` (see the `local-dev` skill for why). CI (`.github/workflows/ci.yml`) runs, in order: lint, typecheck, unit tests, Python pipeline tests, a check that `schema.ts` has its migration, migrations, database tests, build, Playwright against `next start`, and the production stack under Docker Compose.

## Always

```sh
node .claude/scripts/wu.mjs check          # lint + typecheck + unit tests, full output only for what fails
```

`typecheck` runs `next typegen` first, so route types and `messages/fr.json` keys (typed through `src/i18n/app-config.ts`) are checked too: a missing translation key is a type error.

## Then, by what changed

| Changed | Also run |
| --- | --- |
| `src/db/schema.ts` | `npm run db:generate -- --name <change>`, check the SQL in `drizzle/`, `wu up` (applies it), `wu check --db`. CI fails if the schema and the migrations disagree. |
| `drizzle/*.sql` written by hand (seeds, data) | `wu up`, then `wu sql` to look at the rows, `wu check --db` |
| `src/lib/game/**`, `src/lib/social/**`, `src/lib/notifications/**`, `src/lib/players/**`, `src/lib/map/**`, `src/lib/catalog/**`, `src/lib/account-retention.ts`, auth | `wu check --db`, or the matching `*.db.test.ts` alone: `wu test:db src/lib/game/trades.db.test.ts` |
| `scripts/*.py` | `wu check --py` |
| pages, components, CSS | screenshots (`shot.mjs`, phone and wide, light and dark) and the area's e2e spec, below |
| `src/worker/**`, e-mails | `wu restart worker`, then trigger the job and read `wu logs worker` / `wu mail` |
| `Dockerfile`, `docker-compose.yml`, `esbuild.config.mjs`, `src/entrypoints/**` | `npm run build`; for the stack itself, CLAUDE.md's "Commands" explains how to reproduce CI's compose job locally |
| `android/**`, `capacitor.config.ts` | not buildable here without Android Studio: `android/README.md`, or the `android.yml` workflow (a pull request builds it unsigned) |
| anything a player sees | `npm run build` once before handing over a large change: some errors only show in a production build |

## End-to-end tests

```sh
node .claude/scripts/wu.mjs e2e e2e/game.spec.ts              # one spec
node .claude/scripts/wu.mjs e2e -g "under 18"                  # tests whose title matches
node .claude/scripts/wu.mjs e2e --workers=1 e2e/map.spec.ts    # rerun failures one at a time
```

`wu e2e` starts what is missing, deletes old Mailpit e-mails to `ADMIN_EMAIL` (otherwise `admin.spec.ts` fails with "Lien expiré"), compiles every page once per dev server, then runs Playwright. Run the spec of the area you touched, not the whole suite, unless the change is cross-cutting:

| Area | Spec |
| --- | --- |
| signup, login, profile, export, deletion, Google errors | `accounts.spec.ts` |
| back-office (two-factor, cards, players, rules, market, announcements) | `admin.spec.ts` |
| card pages, photo credits, reports, uploads cache, hidden cards | `cards.spec.ts` |
| collection grid and list, filters, pages, series | `collection.spec.ts` |
| packs, opening, resale, refill timer, streak, odds and rules pages | `game.spec.ts` |
| sounds switch, openings history, announcement banner | `features.spec.ts` |
| legal pages, terms acceptance | `legal.spec.ts` |
| map, monuments, on-site visits | `map.spec.ts` |
| auctions | `market.spec.ts` |
| phone layout, tab bar | `mobile.spec.ts` |
| friends, a friend's collection, trades | `social.spec.ts` |
| Web Push, service worker; the app's notification prompt | `push.spec.ts`, `app-push-prompt.spec.ts` |
| theme switch | `theme.spec.ts` |
| wishlist | `wishlist.spec.ts` |

Reading failures:
- A test that times out on a click or a heading locally, then passes alone with `--workers=1`, met a page compiled cold. That's not a bug. CI runs against `next start` and doesn't see it.
- `e2e/cards.spec.ts` imports a throwaway collection and deletes it. An interrupted run can leave a `test-xxxxxxxx` collection behind, which is harmless.
- Rate limits only apply in production (`CI=1` after `npm run build`). A test of a rate limit needs that run.
- Traces of failures are in `test-results/`. `npx playwright show-trace <trace.zip>` opens one.

## Before saying it's done

- Say what ran and what didn't (for example "e2e not run: the change is server-side only"). If something fails for a reason unrelated to the change, say which test and why you think so. Don't skip it silently.
- The spec's "Recette" checklist (`docs/cahier-des-charges-developpement.md`) defines when version 1 is done. A new rule the checklist covers deserves an automated test.
- If the change settles a decision or alters a rule, use the `record-decision` skill.
