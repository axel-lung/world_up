# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

"World Up" is a web collectible card game: adult players (18+) open packs of cards, build a collection, and can pay for a subscription or single packs. Its launch collection, "Patrimoine de France", depicts protected French monuments. The specification, [docs/cahier-des-charges-developpement.md](docs/cahier-des-charges-developpement.md) (in French), is the source of truth: read the section relevant to a task before implementing it.

Lot 1 (technical foundation, design system integration, player accounts) is validated in staging. Lot 2, the catalogue, is in progress: the Python pipeline (`scripts/`), the import, the public card pages and the catalogue back-office (`/admin`, with two-factor authentication) are written; player reports (signalements, from the card page to `/admin/reports`) and `/credits` too. The full catalogue is imported and checked in staging; its editorial review (20th-century cards, replacement photos for the rare cards) lives in the pipeline's lists, and the export that carries it has to be imported there again. Lot 3, the game, is written on top of it: free packs and their opening, the collection and series pages, coins (duplicate resale, achievements), the leaderboard, `/odds`, `/rules`, and the back-office's `/admin/rules`. The legal pages (`/legal-notice`, `/terms`, `/privacy`) and the account retention are written too, ahead of lot 4, since they must exist before anyone outside the team signs up. The interface has moved to the World Up v2 design system (see "UI"). Payments (lot 4) are set aside (decided on 2026-10-25): the closed beta of lot 5 opens with the game entirely free, and payments come later, still after the lawyer. The Play Store's Android app is written too: since 2026-11-12 a Capacitor shell whose own WebView shows the site, with Google sign-in and notifications made native (see "Android app"). The social layer, brought forward from version 2 on 2026-10-22, is written (see "Social and market"): friends, a friend's collection, in-app notifications, trades between friends, the auction house and Web Push, all four steps validated in staging. The back-office's `/admin/players` (search, an account's file, bans, accounts sharing a mailbox) is written too; refunds wait for payments. The daily streak (decided on 2026-11-21, see "Game rules") is written, with the pack opening reworked from the same mock-up. Added on 2026-11-22: the streak's repair and evening reminder, the history of a player's openings, sounds and vibrations, badges, the launcher's "Ouvrir un paquet" shortcut, the back-office's announcement banner and the wishlist (see "Game rules"), then the map of the monuments (see "Map"), and on 2026-11-23 unlocking a monument's card on site ("Je suis ici", see "Game rules").

- The game is named World Up (decided on 2026-10-20). `worldup` is its technical name (containers, volumes, network, database) and stays as it is; keep it in config and env files rather than scattered through application code. The interface says "World Up"; "Patrimoine de France" is the collection's name, read from `collections.name`.
- Work proceeds in delivery lots, each validated in staging before the next: 1 foundations, 2 catalogue, 3 game, 4 payments (only after a lawyer has validated the setup), 5 closed beta and launch. Since 2026-10-25 the closed beta comes before lot 4, free. It has no signup barrier (the address is only shared with the testers), and production keeps `NOINDEX=1` until the public opening.
- Version 2 features (a second collection, shiny variant, card stats) are out of scope unless asked for; friends, trades between friends and the auction house were brought forward on 2026-10-22. Never in scope: a second, native interface (the Android app shows the site itself, see "Android app"), NFT/blockchain, any conversion of virtual currency to euros.

## Conventions

- Code, identifiers, URLs and comments in English. All UI text in French, in `messages/fr.json` (next-intl, single locale, no locale prefix in URLs). Keys are type-checked through `src/i18n/app-config.ts`.
- The launch collection's slug is `heritage` (routes under `/c/heritage/...`); a card's slug derives from its name (`chateau-de-chambord`). The full route table is in the spec's "Interface" section.
- Every game table carries `collection_id` (friendships hold for the whole game, and a notification's is optional), and per-collection styling is read from `collections.theme`: adding a collection must not require new UI code.
- Tunable rules (rarity odds, refill interval and reserve size, coins per opening, prices, duplicate resale value, subscriber perks) are database parameters, never code constants. Seed defaults: 10 packs at signup, 1 pack every 10 minutes, reserve capped at 10, 5 coins per opening.
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
- The map's background (OpenStreetMap vector tiles and their glyphs) lives in `./map`, mounted read-only in `worldup-web` at `/app/map` and kept out of git and of the Docker build (see "Map").
- Card images live in the `uploads` volume (`/app/uploads`) and are served by `src/app/uploads/[...path]/route.ts` with `Cache-Control: public, max-age=31536000, immutable`. Because of that cache, a changed photo must be written under a new file name, never over an existing one.
- Server code that builds a filesystem path from runtime values needs a `/*turbopackIgnore: true*/` comment (see `src/lib/uploads.ts`). Without it, Next.js file tracing copies the whole project into `.next/standalone`, and the build prints a "Dynamic filesystem access" warning.
- `src/db/index.ts` holds the one `pg` pool per process; `src/db/schema.ts` is the Drizzle schema, and `drizzle/` holds the generated SQL migrations, which are committed.
- pg-boss queues are declared in `src/lib/queues.ts`. `migrate.js` installs the pg-boss schema and creates them, so the web app can send jobs (`src/lib/job-queue.ts`) before the worker has ever run. The worker registers the handlers in `src/worker/jobs.ts` and must stop within the 30 s `stop_grace_period`. Test shutdown with `docker stop worldup-worker`: on Windows, a signal sent to `npm` doesn't reach the Node process.
- E-mails: the web app queues `{ template, to, url }`, and the worker renders the text from `messages/fr.json` (`Email`) and sends it through Brevo's API, or over SMTP to Mailpit when `BREVO_API_KEY` is unset, as locally and in CI (`src/worker/send-email.ts`). A failure is logged with the addresses masked. Finished jobs are deleted after a day, since they hold an address and a one-time link.
- `.env.example` holds local development values and documents the production ones. The real `.env` exists only on the server.

Staging is a copy of the compose file with a different `name`, container names, Traefik router name and `APP_DOMAIN` (and Stripe in test mode); otherwise the two stacks collide on the server. On the server, staging is its own clone: each deploy regenerates `docker-compose.staging.yml` with `sed 's/worldup/worldup-staging/g' docker-compose.yml`, and its `.env` sets `COMPOSE_FILE=docker-compose.staging.yml`, so a plain `docker compose` there never starts the production stack.

## Commands

On the Windows workstation, run Vitest, next dev and Playwright through `node .claude/scripts/wu.mjs` (see "Working here with Claude Code"): they break there with the wrong drive-letter case or Git Bash's `PWD`. The npm scripts below are what CI and other machines run.

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

## Acceptance

The spec's "Recette" checklist defines when version 1 is done. Implement its items as automated tests where possible. The draw test (`src/lib/game/draw.test.ts`) checks the ±0.05 point of each published probability over 25,000,000 draws rather than the checklist's 1,000,000: at 1,000,000, ±0.05 point is one standard deviation for the commons, so a correct draw would fail one run in three.

## Topic rules

The rest of the project's rules live in `.claude/rules/`, one file per topic, moved there verbatim from this file. Each loads by itself once a file its `paths:` cover is read or edited. Read the topic's file yourself before planning work in its area, and whenever a passage refers to a section by name (`see "UI"`).

| Section | File | Loads with |
| --- | --- | --- |
| Catalogue pipeline | `.claude/rules/catalogue.md` | `scripts/`, `src/lib/catalog/`, the import, uploads, the back-office's cards and reports, `/credits` |
| Game rules the code must enforce | `.claude/rules/game.md` | `src/lib/game/`, the collection's pages, `/rules`, `/odds`, the leaderboard, the game's components, the worker, the schema and migrations |
| Social and market | `.claude/rules/social-market.md` | friends, notifications and push, trades, auctions, `/activity`, the worker, the schema |
| Map | `.claude/rules/map.md` | the map's pages and components, `src/lib/map/`, `map/`, on-site visits |
| Payments (Stripe) | `.claude/rules/payments.md` | the shop, Stripe, purchases (lot 4, on hold) |
| Security and personal data | `.claude/rules/security.md` | auth, sessions, accounts, the back-office, players, the API, the legal pages, the GDPR register |
| UI | `.claude/rules/ui.md` | every page and stylesheet, `src/components/`, `src/styles/`, `design/` |
| Android app | `.claude/rules/android.md` | `android/`, Capacitor, the native helpers, icons, the web manifest, `assetlinks.json` |

Whatever file is open, three of their rules always hold: the server decides everything (pack contents, timers, balances); nothing may give cards or coins a monetary value; personal data stays out of technical logs.

## Working here with Claude Code

- `node .claude/scripts/wu.mjs`: the local stack (`status`, `up`, `down`, `restart`, `logs`), the tests (`test`, `test:db`, `e2e`, `check`), Mailpit (`mail`) and the dev database (`sql`). It runs Vitest from `C:\` and next dev and Playwright from `c:\`, with `PWD` set to match, so it works from Git Bash and PowerShell alike. Its logs live in `.claude/run/` (git-ignored).
- `node .claude/scripts/shot.mjs`: screenshots of local pages, as a visitor or a test player (signed up once through Mailpit, packs opened on request), on a phone or a wide screen, in either theme, with the page's console errors.
- Skills (`.claude/skills/`): `local-dev` (the stack and screenshots), `verify` (which checks a change needs), `schema-change` (migrations, seeds, tunable rules), `record-decision` (where a decision is written down).
