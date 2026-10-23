# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

"World Up" is a web collectible card game: adult players (18+) open packs of cards, build a collection, and can pay for a subscription or single packs. Its launch collection, "Patrimoine de France", depicts protected French monuments. The specification, [docs/cahier-des-charges-developpement.md](docs/cahier-des-charges-developpement.md) (in French), is the source of truth: read the section relevant to a task before implementing it.

Lot 1 (technical foundation, design system integration, player accounts) is validated in staging. Lot 2, the catalogue, is in progress: the Python pipeline (`scripts/`), the import, the public card pages and the catalogue back-office (`/admin`, with two-factor authentication) are written; player reports (signalements, from the card page to `/admin/reports`) and `/credits` too. The full catalogue still has to be imported and validated in staging. Lot 3, the game, is written on top of it: free packs and their opening, the collection and series pages, coins (duplicate resale, achievements), the leaderboard, `/odds`, `/rules`, and the back-office's `/admin/rules`. The legal pages (`/legal-notice`, `/terms`, `/privacy`) and the account retention are written too, ahead of lot 4, since they must exist before anyone outside the team signs up. The interface has moved to the World Up v2 design system (see "UI"). Payments (lot 4) are on hold: work goes into improving the game. The Play Store's Android app, the site itself in a Trusted Web Activity, is written too (see "Android app"). The social layer, brought forward from version 2 on 2026-10-22, is in progress (see "Social and market"): friends, a friend's collection, in-app notifications, trades between friends and the auction house are written; Web Push comes next, validated in staging like each step.

- The game is named World Up (decided on 2026-10-20). `worldup` is its technical name (containers, volumes, network, database) and stays as it is; keep it in config and env files rather than scattered through application code. The interface says "World Up"; "Patrimoine de France" is the collection's name, read from `collections.name`.
- Work proceeds in delivery lots, each validated in staging before the next: 1 foundations, 2 catalogue, 3 game, 4 payments (only after a lawyer has validated the setup), 5 closed beta and launch.
- Version 2 features (a second collection, shiny variant, card stats) are out of scope unless asked for; friends, trades between friends and the auction house were brought forward on 2026-10-22. Never in scope: a native mobile app (the Android app is the site itself, see "Android app"), NFT/blockchain, any conversion of virtual currency to euros.

## Conventions

- Code, identifiers, URLs and comments in English. All UI text in French, in `messages/fr.json` (next-intl, single locale, no locale prefix in URLs). Keys are type-checked through `src/i18n/app-config.ts`.
- The launch collection's slug is `heritage` (routes under `/c/heritage/...`); a card's slug derives from its name (`chateau-de-chambord`). The full route table is in the spec's "Interface" section.
- Every game table carries `collection_id` (friendships hold for the whole game, and a notification's is optional), and per-collection styling is read from `collections.theme`: adding a collection must not require new UI code.
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
- Two legal rules of the pipeline. Cards inside a "domaine national" (`NATIONAL_DOMAINS` in `build_cards.py`, by Wikidata ID) are hidden as `national_domain` for review: a commercial use of their image needs the authorisation of the domain's manager (Code du patrimoine, art. L621-42), whatever the photo's licence. And a photo is refused under the GFDL or GPL alone, or under a licence that wants the author named (CC BY, CC BY-SA, Free Art) when none can be: the credit is the author's required line (`Attribution`), else `Artist`, else the first uploader unless a bot. The back-office's photo replacement applies the same rules. The import hides a visible card that newly enters a national domain, or whose photo the export now refuses for its licence.
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
- **Virtual currency** (`coins.ts`): `coin_ledger` is append-only, the balance is the sum of its entries, and it can never go negative (`addCoins()` checks it under a per-player advisory lock). Currency is earned from duplicate resale, achievements and auction sales, and spent only at auctions, whose fee is destroyed so that coins don't only ever grow. A ledger entry is unique per player, reason and reference, so a resale form sent twice (same key, generated when the page renders) credits once, and an achievement pays once. Reselling always leaves the player one copy.
- **Achievements** are rows: a threshold on distinct visible cards, packs opened, cards of a rarity or completed series. Their titles come from `messages/fr.json` (`Achievements`), built from the kind and threshold.
- **Collection views** show visible cards only, even those a player already owns. A missing Legendary or Ultra rare is masked: the server sends neither its name, its photo nor its address (`toCollectionCard()`). A friend's collection shows the cards they own, Legendaries included.
- **Leaderboard** (`leaderboard.ts`): distinct visible cards, ties broken by Legendaries, then Ultra rares, and so on; equal counts share a rank (rule confirmed on 2026-10-20).
- Series progression = distinct owned cards / visible cards in the series, recalculated on each opening.
- **Staying out of gambling law**: add nothing that gives cards or currency a monetary value (no buying currency, no cash-out, no account transfer). Odds stay public, with their history. Trades and auctions make cards transferable between accounts: while every pack is free there is no "sacrifice financier", hence no JONUM, but paid packs would make the cards "objets numériques monétisables" (loi SREN, art. 40; decree 2026-60). Decided on 2026-10-22: they open without waiting for the lawyer, who examines the combination with payments before lot 4.

## Social and market

Decided on 2026-10-22, ahead of payments. The tables for the whole of it (`drizzle/0011_social.sql`, rules seeded by `0012_seed_market_rules.sql`) exist; the code comes in steps, Web Push last.

- **Friends** (`src/lib/social/friends.ts`): one `friendships` row per pair (unique on the ordered pair), `pending` until the other player accepts; a request to someone who already asked accepts theirs. Refusing, withdrawing and removing all delete the row, and removing cancels the pending trades between them. The requester is never told of a refusal. Anti-abuse limits are code constants (`MAX_FRIENDS`, `MAX_PENDING_REQUESTS`, `REQUESTS_PER_HOUR`, counted on the `friend_request` notifications since refused requests leave no row). Players find each other by exact pseudo (any case) on `/friends`, or with "Ajouter" on the leaderboard.
- Only friends see each other's collection: `/c/heritage/friends/[pseudo]` is a 404 otherwise. It reuses `CollectionGrid` with the friend's `userId` and a `viewerId` (no resale, a "Il vous manque" tab).
- **Reservations** (`src/lib/game/holds.ts`): a card offered in an open trade or up for auction, and the coins of a leading bid, stay with their owner but are reserved, computed on read like the refill, so nothing moves back when an offer expires or a bid is outbid. Resale (`resellDuplicates`, `duplicatesValue`) never sells a reserved copy. Lock order for any write that takes cards or coins: the trade or auction row, then the `user_cards` rows sorted by player and card, then the wallet locks sorted by player.
- **Notifications** (`src/lib/notifications/`): `notify()` writes the row in the event's transaction; `data` holds IDs only, and the text is rendered from `messages/fr.json` (`Notifications`) when shown (`describe.ts`). The header's bell counts the unread ones; `/activity` lists the latest 50 and marks them read once displayed. The daily retention job deletes them after 90 days (`/privacy` says so).
- **Trades** (`src/lib/game/trades.ts`, pages under `/c/heritage/trades`): cards for cards between friends, free, any card including the last copy, 1 to `trade_max_cards` cards a side. The proposer's cards are reserved from the offer; the recipient's are only checked, at the offer and again at acceptance, which moves both sides in one transaction (`moveCard()` in `transfer.ts`, achievements for both) or refuses with `tradeUnavailable` and leaves the offer open. A pending offer past `expires_at` is expired whether marked or not; the worker's `market-settle` job (every minute) marks it and tells the proposer. A deleted player's ID is set null, which voids their open offers at once; `cancelOrphanTrades()` records it, from Better Auth's `afterDelete` and the retention job. The composer (`trades/new`) gets the tradeable cards as a list and sends `"<card ID>x<copies>"` entries; on a refusal the action goes back to it with the cards chosen in the address.
- **Auctions** (`src/lib/game/auctions.ts` for the writes, `market.ts` for the pages' reads, pages under `/c/heritage/market`): ascending, with automatic bidding (`bidding.ts`, pure and unit-tested): a bid is the most the player would pay, the leader pays the second maximum plus one step, a tie goes to the earlier bid, a bid in the last minutes extends the auction, and a maximum at or above the buyout price buys at once. Any available card can go up for sale, even the last copy, at prices within its rarity's range; the seller withdraws it only while nobody has bid. A bid needs as many available coins (`availableCoins()`: the balance less the leading maximums), a leader raising counting their current one. An auction is over at `ends_at` whether settled or not: the auction's page and `/market/mine` settle it on read, the `market-settle` job within the minute. Settling debits the buyer and credits the seller less the fee, both referenced by the auction's ID (so it pays once), moves the card and grants the buyer's achievements; with no bid it is unsold, and a hidden card or a deleted seller or leader cancels it (`cancelOrphanAuctions()`, next to `cancelOrphanTrades()`). Only the leader sees their maximum; bidders stay anonymous, the seller's pseudo shows. `/admin/market` lists the recent auctions and trades by pseudo and cancels an auction, logged in `audit_log`. The worker and the account deletion use `auctions.ts` too, so the pages' reads (cards, pseudos, the viewer's part) stay in `market.ts`.
- The trade and auction rules (`market_rules`, `market_prices`, with a switch each for trades and auctions) are database parameters, read by `getMarketRules()` and `getMarketPrices()` and edited at `/admin/rules`. A switch turned off stops new offers, sales and bids; running auctions still end and settle, so that nothing stays reserved.

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
- Retention (`src/lib/account-retention.ts`, the worker's daily `account-retention` job, scheduled by `createQueues()`): a signup never confirmed is deleted after 30 days; an account without a sign-in or session refresh (`users.last_active_at`, set by the session hooks) for 3 years is warned by e-mail, then deleted 30 days later unless the player comes back. `/privacy` states these periods: change both together.
- Terms of use: `TERMS_VERSION` (`src/lib/account-rules.ts`) is the date of the `/terms` text. `requireSession()` sends a player who has not accepted the current version to `/accept-terms`; `/account` passes `terms: false`, so a player who refuses can still export and delete. Bump the version whenever the text changes.
- The legal pages read the publisher's and host's details from the environment (`src/lib/publisher.ts`, documented in `.env.example`), and render at request time (`connection()`) so the server's values show. They must be filled before the site opens to the public.
- Multi-account detection uses the payment method and the normalised e-mail only: no device fingerprinting without consent.
- No advertising trackers; analytics must stay in the CNIL consent-exempt configuration, so an information banner is enough.

## UI

- The public and game pages sit in the `src/app/(site)/` route group, whose layout adds the header (navigation, the player's packs and coins) and the footer. The sign-in pages (`(auth)`) and the back-office have their own layouts. The pack opening sits in `(play)`, with no layout: it fills the screen, and its close button leads back to the collection's home.
- In a Drizzle select from a single table, columns interpolated into a `sql` template come out unqualified, so a correlated subquery can turn ambiguous: write such subqueries with explicit aliases (`seriesProgress()`).
- The reference design is the "World Up v2" design system in the Claude Design project linked in the spec's "Interface" section: the Organic base (cream, terracotta, sage; Caprasimo for display, Figtree for text) with a playful tone, where game objects (cards, packs, rarity stickers) are inked stickers. Import it through the Claude Design MCP server (log in with `/design-login`), starting from `Design system World Up v2.dc.html`, `CarteV2.dc.html` (the card it imports), `_ds/organic-31cdf777-e85b-4a4e-bbaa-571dde5117fd/_ds_bundle.js`, `_ds/organic-31cdf777-e85b-4a4e-bbaa-571dde5117fd/styles.css` and `support.js`. The v1 files (`Design system World Up.dc.html`, Nocturne) are superseded. The pack opening follows `Ouverture paquet.dc.html` in the same project.
- Design tokens become CSS variables for the light and dark themes. Each component (card, button, badge, gauge, timer, purchase dialog) becomes a React component with the same variants and states as in Claude Design.
- How it is wired: `design/Design system World Up v2.dc.html` and `design/CarteV2.dc.html` are the mock-ups kept for reference. `src/styles/organic.css` (the Organic stylesheet, vendored as is, imported in a cascade layer so everything else overrides it) and `src/styles/theme.css` (grounds, text, rarity colors and the sticker look shared by every collection) are global. The theme is light by default and follows the system's dark setting; `data-theme="dark"` or `"light"` forces it on any element. The player picks Auto, Clair or Sombre in the site footer (`ThemeSwitch`): the choice lives in the `theme` cookie (`src/lib/theme-preference.ts`, a display preference, consent-exempt), which the root layout reads to set `data-theme` on `<html>`, so every page, the sign-in pages and the back-office included, renders in it with no flash. A collection's look lives in `collections.theme`, validated by `src/lib/collection-theme.ts`: its accent family per theme, the `--skin-*` variables (`--skin-color`, the pack and emblem fill) and its `emblem`, one of the icons in `src/components/collection/Emblem.tsx`. The root layout injects the default collection's variables as a `<style>`; `getActiveCollection()` and `getVisibleCard()` read the emblem, which the `Card` component takes with the collection's name. Components live in `src/components/`, as CSS modules.
- Terracotta (`--color-accent`) is for fills, icons and large text; running text in the accent color takes `--color-accent-strong`, and text on a terracotta fill takes `--color-on-accent` (the ink), which the primary button uses instead of Organic's cream, for 4.5:1.
- Icons come from `lucide-react`, with the stroke thickened for every icon in `theme.css` (`.lucide`). Fonts are served by `next/font` (`src/app/layout.tsx`), never from Google at runtime.
- `/design` is the development showcase of every component, variant and state, in both themes: check UI changes there. It returns 404 in production.
- Public card pages (`/c/heritage/cards/[slug]`) are the search-engine entry points. Each card shows its photo's author and licence with a link to the Commons file; the back shows the excerpt, the article link and "Texte : Wikipédia, licence CC BY-SA 4.0".
- Card pages read `getVisibleCard()` (`src/lib/catalog/cards.ts`): a hidden card, or one of an inactive collection, has no page (404). `/sitemap.xml` lists every visible card, built at request time from the database. `NOINDEX=1` in staging's `.env` turns `robots.txt` into a disallow-all and adds a noindex robots meta to every page, since staging is public too.
- Targets: LCP under 2.5 s on mobile 4G (lazy-loaded WebP), Lighthouse mobile ≥ 90 performance and ≥ 95 accessibility on a card page, WCAG 2.1 AA. The pack opening plays by itself for 1.25 s (shake, tear, the cards rise), under the 3 s limit; then the player turns the cards over one by one, rarest last, or reveals them all at once ("Tout révéler"). Under `prefers-reduced-motion` nothing moves and the cards fade in. Its stage is dark in both themes, and its layout (`stage-layout.ts`) adapts to `cardsPerPack`.

## Android app

The Play Store app (`android/`, decided on 2026-10-22, spec "Application Android") is a Trusted Web Activity: an Android shell, generated by Bubblewrap, that opens `https://worldup.alng.fr` in the phone's browser without an address bar. There is no API and no second interface: the server is the same, and a site deployment updates the app. `android/README.md` has the setup (upload key, GitHub secrets, Play Console, fingerprints) and what was edited after Bubblewrap.

- `.github/workflows/android.yml`, run by hand, builds the APK and the AAB, signed with the upload key, as a run artifact; the AAB goes to the Play Console by hand. `versionCode` is the run number. A pull request touching `android/` builds the app unsigned.
- The application ID, `fr.alng.worldup`, can never change once published.
- The site's side: `src/app/manifest.ts` (`/manifest.webmanifest`), the icons in `public/icons/` (from the logo, below; the Dockerfile copies `public/` next to `server.js`), and `/.well-known/assetlinks.json` (`src/lib/android-app.ts`), built from `ANDROID_APP_ID` and `ANDROID_CERT_FINGERPRINTS` in the server's `.env`. Until they are set, the app shows an address bar.
- The logo (supplied on 2026-10-23 as PNGs from 32 to 1024 px, masters in `design/logo/`) gives every icon. As supplied, on its own cream ground: the favicon (`src/app/favicon.ico`), `src/app/icon.png`, `apple-icon.png`, `public/icons/icon-*.png` and the Android launcher icons (`mipmap-*/ic_launcher.png`). Cut out of its ground (`world-up-cutout.png`): the maskable icon, at 80 % on `--color-bg` so that it stays inside the safe zone (also the Android adaptive icon, `ic_maskable.png`, and the Play Store listing's icon); the monochrome and notification icons, its light parts in white; the Android splash; the visitor home page's logo (`public/logo/`); and the sharing image, `src/app/opengraph-image.jpg`. A new launcher icon needs a new Android release.
- Notification delegation is on: Web Push notifications from the site will show as the app's own, without a new release.
- Selling in the app (lot 4) falls under Google Play's billing rules for digital goods: decide with the lawyer before payments reach the app.

## Acceptance

The spec's "Recette" checklist defines when version 1 is done. Implement its items as automated tests where possible. The draw test (`src/lib/game/draw.test.ts`) checks the ±0.05 point of each published probability over 25,000,000 draws rather than the checklist's 1,000,000: at 1,000,000, ±0.05 point is one standard deviation for the commons, so a correct draw would fail one run in three.
