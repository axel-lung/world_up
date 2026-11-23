---
name: local-dev
description: Start, stop or check World Up's local stack (Postgres and Mailpit in Docker, next dev, the pg-boss worker), read its logs and e-mails, query the dev database, and screenshot pages as a test player on a phone or a wide screen in either theme. Use before trying a change in the browser, before end-to-end tests, to run Vitest or Playwright at all on this Windows machine, or when the app, the database or the e-mails seem down.
---

# Local development

Everything goes through two scripts with no dependencies, run from the project root in either shell (Bash or PowerShell):

- `node .claude/scripts/wu.mjs <command>`: the stack, the tests and the data
- `node .claude/scripts/shot.mjs <route>... [options]`: screenshots

Their logs, PIDs, test players and screenshots live in `.claude/run/` (git-ignored).

## Why not `npm run dev` or `npm test` directly

On this workstation, three tools break depending on how they are launched:

| Tool | Breaks when | Symptom |
| --- | --- | --- |
| Vitest 5.1 | the working directory is `c:\` (lowercase: VS Code, the PowerShell tool) | every suite fails with "Cannot read properties of undefined (reading 'config')" |
| next dev | it sees `C:\` (uppercase), through its working directory **or Git Bash's `PWD` variable** | every page reloads in a loop (`✓ Compiled in 3ms` before each GET); Playwright times out on `/signup` |
| Playwright | it runs from `C:\`, or against pages compiled cold | clicks that "don't navigate", headings that never show |

`wu.mjs` launches each one with the right drive letter and `PWD`, so it works from Git Bash as from PowerShell. The project's `.claude/settings.json` may also hold a hook that refuses `npm test`, `npx vitest`, `npm run dev` and `npx playwright test` with a pointer here. CI (Linux) has none of these problems.

## The stack

```sh
node .claude/scripts/wu.mjs status    # Docker, Postgres, Mailpit, migrations, catalogue, dev, worker, map tiles
node .claude/scripts/wu.mjs up        # containers + pending migrations + next dev + worker, detached; waits until they answer
node .claude/scripts/wu.mjs logs dev -n 80     # or: logs worker
node .claude/scripts/wu.mjs restart worker     # after changing src/worker/ or anything the worker imports
node .claude/scripts/wu.mjs down      # stops next dev and the worker, whoever started them (--db: the containers too)
```

- Docker Desktop must be running; `status` says so when it isn't. Never `docker compose down -v`: the volume holds the imported catalogue (about 24,000 visible cards, `npm run import-catalog` from `./import` takes a while).
- next dev reloads code by itself. The worker doesn't, so restart it after touching its jobs or e-mail rendering.
- A process started from a tool call with `run_in_background` survives the call on Windows. Stopping that task does not kill it. `wu down` finds this project's Next.js and worker processes by their command line and kills them.
- The map's background tiles are usually missing locally (`status` says so): its pins then show on a plain ground. That is not a bug. See `map/README.md` and the memory note before rebuilding them, which takes hours.

## Looking at a page

```sh
node .claude/scripts/shot.mjs c/heritage c/heritage/collection --as alice --open 3 --phone --dark
```

- It prints one PNG path per route. Read the PNG to look at it, then any `!` lines under it: console errors and warnings, what the dev overlay's red "Issues" badge counts.
- `--as <name>` signs a test player up once, through the real form and the Mailpit link, then reuses the session and credentials kept in `.claude/run/players/`. `--open N` opens N of their packs first (a new player has 10 and an empty collection).
- Without `--as`, you are a visitor. Phone (`--phone`, Pixel 7 with touch, which gets the thumb layout under 720 px) or a 1280 × 800 screen. `--dark`/`--light` set the `theme` cookie. Motion is reduced unless `--motion`.
- Write routes without the leading slash, or let the script undo Git Bash's rewriting of `/x` into `C:/Program Files/Git/x`. Same for `wu warm`.
- Check a UI change on both a phone and a wide screen, in both themes. `/design` shows every component, variant and state (404 in production).
- The back-office needs the `ADMIN_EMAIL` account with an authenticator (TOTP). `e2e/admin.spec.ts` shows how to set it up from a test with `totp()` from `e2e/helpers.ts`. `shot.mjs` doesn't do it.
- For a multi-step flow (a trade between two players, an auction), write a throwaway Playwright script in the scratchpad that imports `@playwright/test` with an absolute path to the project's `node_modules`, or add a real e2e test if the flow deserves one.

## Data

```sh
node .claude/scripts/wu.mjs mail                       # latest 5 e-mails, with their links
node .claude/scripts/wu.mjs mail someone@example.test -n 3
node .claude/scripts/wu.mjs sql "select pseudo, email from users order by created_at desc limit 5"
```

- Every e-mail goes to Mailpit (inbox at http://localhost:8025). Signing up needs the worker running, since the worker sends the confirmation link.
- The dev database accumulates e2e players (`e2e_*`, `@example.test`) and sometimes leftover `test-xxxxxxxx` collections from interrupted database tests. Both are harmless.
- A tunable rule can be changed on the dev database with `wu sql` for a quick try (`update game_rules set refill_minutes = 1`). Put it back afterwards: the e2e and database tests create their own collections, but manual checks use `heritage`.

## The Android app

The app is the site in a Capacitor WebView. `android/README.md` explains how to run a branch on the emulator against the local site. Builds for the store come from the `android.yml` workflow.
