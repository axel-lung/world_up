# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

"Patrimoine de France" is a web collectible card game: adult players (18+) open packs of cards depicting protected French monuments, build a collection, and can pay for a subscription or single packs. The specification, [docs/cahier-des-charges-developpement.md](docs/cahier-des-charges-developpement.md) (in French), is the source of truth: read the section relevant to a task before implementing it.

Lot 1 (technical foundation, design system integration, player accounts) is validated in staging. Lot 2, the catalogue, is in progress: the Python pipeline (`scripts/`), the import, the public card pages and the catalogue back-office (`/admin`, with two-factor authentication) are written; player reports (signalements, from the card page to `/admin/reports`) and `/credits` too. The full catalogue still has to be imported and validated in staging. Lot 3, the game, is written on top of it: free packs and their opening, the collection and series pages, coins (duplicate resale, achievements), the leaderboard, `/odds`, `/rules`, and the back-office's `/admin/rules`.

- "worldup" is a placeholder project name (containers, volumes, network, database). It will be replaced everywhere once the game is named, so keep it in config and env files rather than scattered through application code.
- Work proceeds in delivery lots, each validated in staging before the next: 1 foundations, 2 catalogue, 3 game, 4 payments (only after a lawyer has validated the setup), 5 closed beta and launch.
- Version 2 features (player trades, auctions, friends, a second collection, shiny variant, card stats) are out of scope unless asked for. Never in scope: native mobile app, NFT/blockchain, any conversion of virtual currency to euros.

## Conventions

- Code, identifiers, URLs and comments in English. All UI text in French, in `messages/fr.json` (next-intl, single locale, no locale prefix in URLs). Keys are type-checked through `src/i18n/app-config.ts`.
- The launch collection's slug is `heritage` (routes under `/c/heritage/...`); a card's slug derives from its name (`chateau-de-chambord`). The full route table is in the spec's "Interface" section.
- Every game table carries `collection_id`, and per-collection styling is read from `collections.theme`: adding a collection must not require new UI code.
- Tunable rules (rarity odds, refill interval and reserve size, prices, duplicate resale value, subscriber perks) are database parameters, never code constants. Seed defaults: 10 packs at signup, 1 pack every 10 minutes, reserve capped at 10.
- Stack decisions: Drizzle (database access and migrations), Better Auth (accounts), GitHub (Actions CI, Dependabot), Brevo for e-mail (EU company; its transactional API in production and staging). Still open: Matomo or Plausible for analytics. Ask before picking one, then record the decision here.
- UI text addresses the player as "vous", like the design system.
- `scripts/` is reserved for the Python catalogue pipeline. Node entry points live in `src/entrypoints/`.

## Stack and runtime architecture

One Next.js 16 (TypeScript) app, PostgreSQL 16, Stripe, deployed with Docker Compose behind the Traefik instance already running on the server (EU host). `docker-compose.yml` is the specification's file verbatim: change it only deliberately, and keep the spec in sync when you do.

A single multi-stage `Dockerfile` (Node 22 Alpine, Next.js `standalone` output) builds the image `worldup-app`, which three services run:

| Service | Entry point | Role |
| --- | --- | --- |
| `worldup-migrate` | `node migrate.js` | Applies migrations and exits 0; web and worker start only after it succeeds |
| `worldup-web` | image default (Next.js server, port 3000) | Game, shop and back-office; the only service exposed through Traefik |
| `worldup-worker` | `node worker.js` | pg-boss queue (catalogue import, e-mails); must finish its running job within 30 s of SIGTERM |

`worldup-db` (Postgres) and `worldup-backup` (daily `pg_dump`, 14 days kept in `./backups`) complete the stack.

How the code maps onto it:
- The standalone output only ships what the web app imports, so the Node entry points in `src/entrypoints/*.ts` are bundled by `esbuild.config.mjs` into self-contained `dist/*.js` files, which the Dockerfile copies next to `server.js` in `/app`. There are three (`migrate.js`, `worker.js`, `import-catalog.js`); a new one needs a line in both files.
- `/api/health` (`src/app/api/health/route.ts`) returns 503 when the database is down. Traefik only routes to a healthy `worldup-web`.
- Card images live in the `uploads` volume (`/app/uploads`) and are served by `src/app/uploads/[...path]/route.ts` with `Cache-Control: public, max-age=31536000, immutable`. Because of that cache, a changed photo must be written under a new file name, never over an existing one.
- Server code that builds a filesystem path from runtime values needs a `/*turbopackIgnore: true*/` comment (see `src/lib/uploads.ts`). Without it, Next.js file tracing copies the whole project into `.next/standalone`, and the build prints a "Dynamic filesystem access" warning.
- `src/db/index.ts` holds the one `pg` pool per process; `src/db/schema.ts` is the Drizzle schema, and `drizzle/` holds the generated SQL migrations, which are committed.
- pg-boss queues are declared in `src/lib/queues.ts`. `migrate.js` installs the pg-boss schema and creates them, so the web app can send jobs (`src/lib/job-queue.ts`) before the worker has ever run. The worker registers the handlers in `src/worker/jobs.ts` and must stop within the 30 s `stop_grace_period`. Test shutdown with `docker stop worldup-worker`: on Windows, a signal sent to `npm` doesn't reach the Node process.
- E-mails: the web app queues `{ template, to, url }`, and the worker renders the text from `messages/fr.json` (`Email`) and sends it through Brevo's API, or over SMTP to Mailpit when `BREVO_API_KEY` is unset, as locally and in CI (`src/worker/send-email.ts`). A failure is logged with the addresses masked. Finished jobs are deleted after a day, since they hold an address and a one-time link.
- `.env.example` holds local development values and documents the production ones. The real `.env` exists only on the server.

Staging is a copy of the compose file with a different `name`, container names, Traefik router name and `APP_DOMAIN` (and Stripe in test mode); otherwise the two stacks collide on the server. On the server, staging is its own clone: each deploy regenerates `docker-compose.staging.yml` with `sed 's/worldup/worldup-staging/g' docker-compose.yml`, and its `.env` sets `COMPOSE_FILE=docker-compose.staging.yml`, so a plain `docker compose` there never starts the production stack.

## Commands

```sh
cp .env.example .env      # once; its values suit local development
npm run db:up             # Postgres on localhost:5432, Mailpit inbox on http://localhost:8025 (docker-compose.dev.yml)
npm run db:migrate        # apply the migrations in drizzle/, create the job queues
npm run dev               # http://localhost:3000
npm run worker            # pg-boss worker (sends the e-mails), in a second terminal
npm run import-catalog    # load ./import (the pipeline's export) into the database and ./uploads

npm run lint
npm run typecheck         # next typegen (route types such as RouteContext), then tsc
npm test                  # Vitest, src/**/*.test.ts
npm run test:db           # Vitest against the database, src/**/*.db.test.ts (needs db:up and db:migrate)
npx vitest run src/lib/uploads.test.ts   # one file
npx vitest run -t "rejects"              # tests whose name matches
python -m unittest discover -s scripts   # catalogue pipeline tests

npm run db:generate -- --name <change>   # after editing src/db/schema.ts; commit drizzle/
npm run build             # next build, then the esbuild bundles in dist/

npm run test:e2e          # Playwright, e2e/: reuses `npm run dev`, starts its own worker
npx playwright test -g "under 18"        # tests whose name matches
CI=1 npm run test:e2e     # after `npm run build`: against `next start`, rate limits on
```

The end-to-end tests need `db:up` and `db:migrate`, and read the e-mails from Mailpit's API (`e2e/helpers.ts`). `e2e/cards.spec.ts` imports a throwaway collection with `importCatalog()` and deletes it afterwards. Each test sends its own `X-Forwarded-For`, so the auth rate limits count tests apart. Better Auth only applies them in production, hence the `CI=1` run.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, migrations, the build and the end-to-end tests (with a Mailpit service). It fails when `schema.ts` changes without a generated migration. It also starts the production stack with `docker compose up -d --build --wait worldup-web worldup-worker`, on a throwaway `traefik` network. To do the same locally, create that network and point `.env` at `worldup-db` (save the development `.env` first).

The spec defines these server commands:

```sh
# Deploy: migrations run before web and worker restart
git pull && docker compose up -d --build

# Import the catalogue once the pipeline has dropped its export in ./import
docker compose exec worldup-worker node import-catalog.js
```

## Catalogue pipeline

The catalogue is built offline, then imported. Production never calls Wikimedia: no API calls while playing and no images hotlinked from Commons. The one exception is the back-office's "replace the photo" (`src/lib/catalog/commons-photo.ts`): on the admin's request, the server checks a Commons file against the pipeline's photo rules, downloads it once and stores its WebP files in `uploads`.

- Flow, in 10 steps run on a workstation (`scripts/README.md` has the commands, the rules and the export format): Wikidata extraction, rarity from 12 months of Wikipedia clickstream visits, Commons photo metadata, excerpts, editorial triage (`build_cards.py`), WebP images at 400 and 800 px named after the photo's SHA-1, then `import/catalog.json`. The `import/` folder is copied to the server's `./import` (mounted read-only in the worker), and `import-catalog.js` copies the images into `uploads` and upserts the cards.
- `scripts/` holds Python only, with no dependency on the app; `data/` (downloads and intermediate files) and `import/` are git-ignored.
- The import (`src/lib/catalog/`) checks the whole export, copies the photos, then upserts by Wikidata ID in one transaction; running it again changes nothing. Rarities are frozen at launch: the 6-monthly re-import adds monuments or better photos but never changes an existing card's rarity. Only the back-office can change a rarity, and that change is logged.
- An existing card also keeps its rank, its slug (its public address) and its visibility: `hidden_reason` is the import's on new cards only, except that a card hidden for want of a photo comes back when the export has one. A photo chosen in the back-office sets `photo_locked`, and the import then leaves it.
- `card_series.position` is a card's stable place in a series (new cards go last); `number` ("004/1452") counts only visible cards, and `series.card_count` holds the total. Call `renumberSeries()` after anything that shows or hides a card.
- Wikimedia access rules: a User-Agent with a contact address (otherwise the limit drops to 10 requests/min), at most 3 parallel requests, honour `Retry-After`.
- Photo rejection rules and the editorial hiding rules (with their counts) are in the spec's "Catalogue" section.

## Game rules the code must enforce

The server decides everything: pack contents, timers and balances. The browser only displays them.

The game lives in `src/lib/game/`; every function there takes the clock (`now`) and, for draws, the random source as parameters. Its rules (`game_rules`, `resale_values`, `rarity_odds`, `achievements`) are rows, seeded for `heritage` by `drizzle/0008_seed_game_rules.sql` and edited at `/admin/rules`.

- **Pack refill** is computed on read, with no scheduled job: `packs = min(max_reserve, stored + intervals elapsed since last_refill)`, and `last_refill` advances by that many whole intervals (`refill.ts`). A full reserve pauses the timer: the next pack comes one interval after the opening that takes it below the maximum. Only server time counts. Keep the clock injectable, because the acceptance tests use a mocked clock. A player's `pack_state` row is created with the signup packs on their first visit to the collection.
- **Pack opening** (`packs.ts`) is one SQL transaction holding a per-player lock (the `pack_state` row, `FOR UPDATE`): take one pack, create the `pack_openings` row and its 5 `pack_cards`, update `user_cards`, grant the achievements reached. A client-sent idempotency key ensures a double click opens only one pack: the page keeps the same key until an opening succeeds. On top of the reserve, a player can't open more than `OPENINGS_PER_MINUTE` (20) packs a minute.
- **Draw**: for each card, pick a rarity from the currently valid `rarity_odds`, then pick uniformly among the *visible* cards of that rarity, both with `crypto.randomInt` (`draw.ts`; the card is the n-th visible one in ID order). Hidden cards must never come out of a pack. Duplicates increment the quantity.
- **Odds** are integers in parts per million (a set sums to 1,000,000). Changes are dated rows, never overwritten, valid from now or later, never backdated; their history is published on `/odds`. Compare `valid_from` in SQL, as `currentOdds()` does: a timestamp written by `now()` has microseconds, which a JavaScript `Date` rounds off.
- **Virtual currency** (`coins.ts`): `coin_ledger` is append-only, the balance is the sum of its entries, and it can never go negative (`addCoins()` checks it under a per-player advisory lock). Currency is earned only from duplicate resale and achievements; nothing spends it yet. A ledger entry is unique per player, reason and reference, so a resale form sent twice (same key, generated when the page renders) credits once, and an achievement pays once. Reselling always leaves the player one copy.
- **Achievements** are rows: a threshold on distinct visible cards, packs opened, cards of a rarity or completed series. Their titles come from `messages/fr.json` (`Achievements`), built from the kind and threshold.
- **Collection views** show visible cards only, even those a player already owns. A missing Legendary or Ultra rare is masked: the server sends neither its name, its photo nor its address (`toCollectionCard()`).
- **Leaderboard** (`leaderboard.ts`): distinct visible cards, ties broken by Legendaries, then Ultra rares, and so on; equal counts share a rank. The spec still marks this rule "to be confirmed".
- Series progression = distinct owned cards / visible cards in the series, recalculated on each opening.
- **Staying out of gambling law**: add nothing that gives cards or currency a monetary value (no buying currency, no cash-out, no account transfer). Odds stay public, with their history.

## Payments (Stripe)

- Stripe webhooks are the source of truth: a purchased pack is credited only after Stripe confirms the payment. Verify the signature on every call, and make processing idempotent (the same event received twice credits once).
- Before checkout, the server checks age, verified e-mail, and the calendar-month spending cap (purchases plus subscription).
- The waiver of the right of withdrawal is a mandatory checkbox; its text version and the click time are stored on the `purchases` row.
- Single-pack sales sit behind a database feature flag: turning it off removes them from the shop with no redeploy and no gap in the layout.
- Cancelling the subscription takes at most 3 clicks from `/account`; perks last until the end of the paid period.
- Refunds go through the back-office, revoke the perks and write to `audit_log`.

## Security and personal data

- Passwords hashed with argon2id; rate limits on signup, login and pack opening.
- Accounts (`src/lib/auth.ts`): Better Auth with e-mail and password, a confirmed address required before signing in, a public pseudo (unique whatever the case), a birth date (18+, checked in Paris time), terms acceptance stored in `consents`. Those checks run in a request hook before Better Auth, so a signup with a known address gets the same answer as any other (no account enumeration) and its owner gets an e-mail instead.
- The forms call `/api/auth` from the browser (`src/lib/auth-client.ts`): Better Auth's rate limits apply to HTTP requests only, not to server-side `auth.api` calls. They are in memory (one web process) and key on the `X-Forwarded-For` header Traefik sets.
- Server components read the session with `getSession()` / `requireSession()` (`src/lib/session.ts`). `getAuth()` builds the auth instance on first use, since `next build` loads the modules without the runtime secrets.
- Sessions store no IP address or user agent (a database hook drops them).
- `/admin` requires two-factor authentication, and every back-office action writes to `audit_log`. The back-office account is the one whose e-mail is `ADMIN_EMAIL`; players get a 404. It sets up an authenticator app (Better Auth's `twoFactor` plugin, TOTP with backup codes, no "trust this device") at `/admin/two-factor`. A session hook sets `sessions.two_factor_verified` only on sessions created by a second-factor verification, and `requireAdmin()` (`src/lib/admin.ts`) demands it: an older session of the same account, opened before the app was set up, has to sign in again.
- Pages under `src/app/admin/(granted)/` and every server action call `requireAdmin()` themselves, since a layout is not rendered again on navigation. Catalogue changes go through `src/lib/catalog/admin.ts`, one transaction each with its `audit_log` row; showing or hiding a card renumbers the series.
- Collect only e-mail, birth date and purchase history, and keep personal data out of technical logs. Account export and deletion are self-service from `/account`.
- Multi-account detection uses the payment method and the normalised e-mail only: no device fingerprinting without consent.
- No advertising trackers; analytics must stay in the CNIL consent-exempt configuration, so an information banner is enough.

## UI

- The public and game pages sit in the `src/app/(site)/` route group, whose layout adds the header (navigation, the player's packs and coins) and the footer. The sign-in pages (`(auth)`) and the back-office have their own layouts.
- In a Drizzle select from a single table, columns interpolated into a `sql` template come out unqualified, so a correlated subquery can turn ambiguous: write such subqueries with explicit aliases (`seriesProgress()`).
- The reference design is the "World Up" design system in the Claude Design project linked in the spec's "Interface" section. Import it through the Claude Design MCP server (log in with `/design-login`), starting from `Design system World Up.dc.html`, `_ds/nocturne-b271f891-2d45-439d-a64e-f628131cb069/_ds_bundle.js`, `_ds/nocturne-b271f891-2d45-439d-a64e-f628131cb069/styles.css` and `support.js`.
- Design tokens become CSS variables for the light and dark themes. Each component (card, button, badge, gauge, timer, purchase dialog) becomes a React component with the same variants and states as in Claude Design.
- How it is wired: `design/Design system World Up.dc.html` is the mock-up kept for reference. `src/styles/nocturne.css` (the Nocturne base, imported in a cascade layer so everything else overrides it) and `src/styles/theme.css` (shared grounds, text and rarity colors) are global. The theme follows the system setting; `data-theme="dark"` or `"light"` forces it on any element. The accent family and the `--skin-*` variables come from `collections.theme`, validated by `src/lib/collection-theme.ts` and injected as a `<style>` by the root layout. Components live in `src/components/`, as CSS modules.
- `/design` is the development showcase of every component, variant and state, in both themes: check UI changes there. It returns 404 in production.
- Public card pages (`/c/heritage/cards/[slug]`) are the search-engine entry points. Each card shows its photo's author and licence with a link to the Commons file; the back shows the excerpt, the article link and "Texte : Wikipédia, licence CC BY-SA 4.0".
- Card pages read `getVisibleCard()` (`src/lib/catalog/cards.ts`): a hidden card, or one of an inactive collection, has no page (404). `/sitemap.xml` lists every visible card, built at request time from the database. `NOINDEX=1` in staging's `.env` turns `robots.txt` into a disallow-all and adds a noindex robots meta to every page, since staging is public too.
- Targets: LCP under 2.5 s on mobile 4G (lazy-loaded WebP), Lighthouse mobile ≥ 90 performance and ≥ 95 accessibility on a card page, WCAG 2.1 AA. The pack-opening animation lasts at most 3 s, can be skipped, and becomes a simple fade under `prefers-reduced-motion`.

## Acceptance

The spec's "Recette" checklist defines when version 1 is done. Implement its items as automated tests where possible. The draw test (`src/lib/game/draw.test.ts`) checks the ±0.05 point of each published probability over 25,000,000 draws rather than the checklist's 1,000,000: at 1,000,000, ±0.05 point is one standard deviation for the commons, so a correct draw would fail one run in three.
