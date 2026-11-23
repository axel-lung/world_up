#!/usr/bin/env node
// Screenshots of the local site (next dev on :3000, `wu up`), for checking a UI
// change by eye: `node .claude/scripts/shot.mjs help`.
//
// A named player (--as alice) is signed up once through the real form and
// Mailpit, then reused: their address, password and session live in
// .claude/run/players/ (git-ignored). --open N opens N of their packs first,
// so that the collection isn't empty.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN = path.join(ROOT, '.claude', 'run');
const PLAYERS = path.join(RUN, 'players');
const SHOTS = path.join(RUN, 'shots');
const BASE_URL = 'http://localhost:3000';
const MAILPIT = 'http://localhost:8025';

const HELP = `Screenshots of the local site: node .claude/scripts/shot.mjs <route>... [options]

  --phone            a phone (Pixel 7, 412 px wide, touch); a 1280 x 800 screen otherwise
  --dark | --light   force the theme (the theme cookie); the system's light by default
  --as <name>        as this test player, signed up on first use and reused afterwards
  --open <n>         open n of the player's packs first (needs --as)
  --collection <s>   the collection for --open (heritage)
  --full             the whole page, not only the screen
  --motion           keep animations (reduced motion by default, for steady pictures)
  --wait <ms>        extra wait after the page settles (default 500)

Routes may be written without their leading slash (Git Bash rewrites "/x").
Prints the path of each PNG, under .claude/run/shots/; read them to look.
Example: shot.mjs c/heritage c/heritage/collection --as alice --open 3 --phone --dark`;

/** Undoes Git Bash's rewriting of an argument that starts with a slash (see wu.mjs). */
function routeArg(arg) {
  const value = arg.replace(/\\/g, '/');
  const underGit = value.match(/^[A-Za-z]:\/(?:[^/]+\/)*Git(\/.*)?$/i);
  if (underGit) return underGit[1] || '/';
  const drive = value.match(/^([A-Za-z]):(\/.*)?$/);
  if (drive) return `/${drive[1].toLowerCase()}${drive[2] ?? ''}`;
  return value.startsWith('/') ? value : `/${value}`;
}

function parseArgs(argv) {
  const options = { routes: [], phone: false, theme: null, as: null, open: 0, collection: 'heritage', full: false, motion: false, wait: 500 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'help' || arg === '--help') options.help = true;
    else if (arg === '--phone') options.phone = true;
    else if (arg === '--dark') options.theme = 'dark';
    else if (arg === '--light') options.theme = 'light';
    else if (arg === '--full') options.full = true;
    else if (arg === '--motion') options.motion = true;
    else if (arg === '--as') options.as = argv[++i];
    else if (arg === '--open') options.open = Number(argv[++i]);
    else if (arg === '--collection') options.collection = argv[++i];
    else if (arg === '--wait') options.wait = Number(argv[++i]);
    else options.routes.push(routeArg(arg));
  }
  return options;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function confirmationLink(email) {
  const query = encodeURIComponent(`to:"${email}" subject:"Confirmez votre adresse e-mail"`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${query}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const link = /https?:\/\/\S+/.exec(message.Text ?? '')?.[0];
      if (link) return link;
    }
    await sleep(500);
  }
  fail(`no confirmation e-mail for ${email} in Mailpit: is the worker running? (wu status)`);
}

async function signUp(page, player) {
  await page.goto(`${BASE_URL}/signup`);
  await page.getByLabel('Pseudo').fill(player.pseudo);
  await page.getByLabel('Adresse e-mail').fill(player.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(player.password);
  await page.getByLabel('Date de naissance').fill('1990-05-31');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' }).waitFor({ timeout: 60_000 });
  await page.goto(await confirmationLink(player.email));
  await page.getByText('Votre adresse e-mail est confirmée').waitFor({ timeout: 60_000 });
}

async function logIn(page, player) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Adresse e-mail').fill(player.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(player.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/** Signs the named player up or in, accepts new terms, and returns their saved session's file. */
async function preparePlayer(browser, name, options) {
  fs.mkdirSync(PLAYERS, { recursive: true });
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'player';
  const credentialsFile = path.join(PLAYERS, `${slug}.json`);
  const stateFile = path.join(PLAYERS, `${slug}.state.json`);
  let player = fs.existsSync(credentialsFile) ? JSON.parse(fs.readFileSync(credentialsFile, 'utf8')) : null;
  const context = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    reducedMotion: 'reduce',
    ...(player && fs.existsSync(stateFile) ? { storageState: stateFile } : {}),
  });
  const page = await context.newPage();
  if (!player) {
    const id = Math.random().toString(36).slice(2, 6);
    player = { pseudo: `${slug}_${id}`, email: `wu-${slug}-${id}@example.test`, password: 'patrimoine-wu-2026' };
    console.log(`… signing up ${player.pseudo} (${player.email})`);
    await signUp(page, player);
    fs.writeFileSync(credentialsFile, JSON.stringify(player, null, 2));
  }
  await page.goto(`${BASE_URL}/account`);
  if (new URL(page.url()).pathname.startsWith('/login')) await logIn(page, player);
  if (new URL(page.url()).pathname.startsWith('/accept-terms')) {
    await page.getByRole('checkbox').check();
    await page.getByRole('button').last().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/accept-terms'));
  }
  if (options.open > 0) await openPacks(page, options);
  await context.storageState({ path: stateFile });
  await context.close();
  console.log(`✓ ${player.pseudo} signed in (${player.email} / ${player.password})`);
  return stateFile;
}

async function openPacks(page, { open, collection }) {
  await page.goto(`${BASE_URL}/c/${collection}/open`);
  let opened = 0;
  for (; opened < open; opened += 1) {
    const first = page.getByRole('button', { name: 'Ouvrir le paquet' });
    const next = page.getByRole('button', { name: /^Ouvrir le suivant/ });
    await first.or(next).first().waitFor({ timeout: 30_000 }).catch(() => {});
    if (await next.isVisible()) await next.click();
    else if (await first.isVisible()) await first.click();
    else break;
    await page.getByRole('button', { name: 'Tout révéler' }).click({ timeout: 30_000 });
    // The day's first pack brings the streak's screen over the cards
    const streak = page.getByRole('dialog').getByRole('button', { name: 'Continuer' });
    if (await streak.waitFor({ timeout: 4_000 }).then(() => true, () => false)) await streak.click();
    await page.getByRole('heading', { name: /^Paquet ouvert/ }).waitFor({ timeout: 30_000 });
  }
  console.log(opened === open ? `✓ opened ${opened} pack(s)` : `! opened ${opened} of ${open} packs: the reserve ran out`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.routes.length) {
    console.log(HELP);
    return;
  }
  if (options.open && !options.as) fail('--open needs --as <name>');
  try {
    await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    fail(`nothing answers on ${BASE_URL}: run node .claude/scripts/wu.mjs up`);
  }
  const browser = await chromium.launch();
  try {
    const storageState = options.as ? await preparePlayer(browser, options.as, options) : undefined;
    const device = options.phone ? { ...devices['Pixel 7'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
    const context = await browser.newContext({
      ...device,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      reducedMotion: options.motion ? 'no-preference' : 'reduce',
      ...(storageState ? { storageState } : {}),
    });
    if (options.theme) await context.addCookies([{ name: 'theme', value: options.theme, url: BASE_URL }]);
    const page = await context.newPage();
    // What the dev overlay's "Issues" badge counts, said in words
    let problems = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const route of options.routes) {
      problems = [];
      const response = await page.goto(BASE_URL + route, { waitUntil: 'load', timeout: 180_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(options.wait);
      const name = [
        route.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home',
        options.phone ? 'phone' : 'wide',
        options.theme ?? 'auto',
        options.as ? options.as.toLowerCase().replace(/[^a-z0-9]/g, '') : 'visitor',
      ].join('_');
      const file = path.join(SHOTS, `${name}.png`);
      await page.screenshot({ path: file, fullPage: options.full });
      const landed = new URL(page.url()).pathname;
      console.log(`${file}  (${response?.status() ?? '?'}${landed !== route.split('?')[0] ? `, landed on ${landed}` : ''})`);
      for (const problem of [...new Set(problems)]) console.log(`  ! ${problem.slice(0, 400)}`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

await main();
