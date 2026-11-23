#!/usr/bin/env node
// World Up's local development helper, written for Claude Code but usable at
// the keyboard: `node .claude/scripts/wu.mjs help`. No dependencies.
//
// On this Windows workstation two tools break on the case of the drive letter
// in their working directory: Vitest 5.1 loads itself twice from c:\ (every
// suite fails with "reading 'config'"), and next dev reloads every page in a
// loop from C:\ (Playwright then times out). Git Bash always hands Node C:\,
// VS Code and the PowerShell tool c:\. This script sets the case itself, so it
// works from any shell. Its logs and PIDs live in .claude/run/ (git-ignored).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WINDOWS = process.platform === 'win32';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN = path.join(ROOT, '.claude', 'run');
const BASE_URL = 'http://localhost:3000';
const MAILPIT = 'http://localhost:8025';
const COMPOSE = ['compose', '-f', 'docker-compose.dev.yml'];
const COLLECTION = 'heritage';
const MAX_BUFFER = 1 << 28;

function rootWithDrive(upper) {
  if (!WINDOWS || !/^[a-z]:/i.test(ROOT)) return ROOT;
  return (upper ? ROOT[0].toUpperCase() : ROOT[0].toLowerCase()) + ROOT.slice(1);
}
const VITEST_CWD = rootWithDrive(true);
const NEXT_CWD = rootWithDrive(false);

const bin = (cwd, ...parts) => path.join(cwd, 'node_modules', ...parts);
const VITEST = (cwd) => bin(cwd, 'vitest', 'vitest.mjs');
const NEXT = (cwd) => bin(cwd, 'next', 'dist', 'bin', 'next');
const PLAYWRIGHT = (cwd) => bin(cwd, '@playwright', 'test', 'cli.js');
const TSX = (cwd) => bin(cwd, 'tsx', 'dist', 'cli.mjs');

/**
 * The environment for a child working in `cwd`. Git Bash exports PWD as
 * C:/..., which some tools prefer to the real working directory: next dev
 * then reloads every page in a loop even when started from c:\. PWD follows
 * the child's directory instead.
 */
function envFor(cwd, plain = false) {
  const env = { ...process.env, PWD: cwd };
  delete env.OLDPWD;
  return plain ? { ...env, FORCE_COLOR: '0', NO_COLOR: '1' } : env;
}
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const seconds = (since) => `${Math.round((Date.now() - since) / 1000)} s`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- processes

/** Runs Node on a script in the foreground, its output streaming through. */
function nodeInherit(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: envFor(cwd) }).status ?? 1;
}

/** Runs Node on a script and captures its output. */
function nodeCapture(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, env: envFor(cwd, true), encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

/** Runs an npm script (no arguments), from c:\ like VS Code. */
function npmScript(script, capture) {
  return spawnSync('npm', ['run', script], {
    cwd: NEXT_CWD,
    shell: WINDOWS,
    env: envFor(NEXT_CWD, capture),
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: MAX_BUFFER,
  });
}

const pidFile = (name) => path.join(RUN, `${name}.pid`);
const logFile = (name) => path.join(RUN, `${name}.log`);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function trackedPid(name) {
  try {
    const pid = Number(fs.readFileSync(pidFile(name), 'utf8'));
    return pid && alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

/** Starts a long-running Node process that outlives this script, its output in .claude/run/<name>.log. */
function startDetached(name, cwd, args) {
  fs.mkdirSync(RUN, { recursive: true });
  const log = fs.openSync(logFile(name), 'w');
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: envFor(cwd, true),
  });
  child.unref();
  fs.closeSync(log);
  fs.writeFileSync(pidFile(name), String(child.pid));
  return child.pid;
}

function killTree(pid) {
  if (WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone
    }
  }
}

/** This project's Node processes (whatever started them), with their command lines. */
function projectNodeProcesses() {
  const base = path.basename(ROOT).toLowerCase();
  let list = [];
  if (WINDOWS) {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
    });
    try {
      const parsed = JSON.parse(result.stdout || '[]');
      list = (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine ?? '' }));
    } catch {
      list = [];
    }
  } else {
    const out = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).stdout ?? '';
    list = out
      .split('\n')
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
  }
  return list.filter((p) => p.pid !== process.pid && p.cmd.toLowerCase().includes(base));
}
const isNextProcess = (p) => /node_modules[\\/]next[\\/]/i.test(p.cmd);
const isWorkerProcess = (p) => /entrypoints[\\/]worker\.ts/i.test(p.cmd);

// ------------------------------------------------------------------- docker

function docker(args) {
  return spawnSync('docker', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

function dockerVersion() {
  const result = docker(['info', '--format', '{{.ServerVersion}}']);
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The dev containers by service name: { db: 'running (healthy)', mailpit: 'running' }. */
function devContainers() {
  const result = docker([...COMPOSE, 'ps', '--all', '--format', 'json']);
  if (result.status !== 0) return {};
  const text = result.stdout.trim();
  let rows = [];
  try {
    rows = text.startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return {};
  }
  return Object.fromEntries(rows.map((r) => [r.Service, r.Health ? `${r.State} (${r.Health})` : r.State]));
}

/** One value from the dev database, or null when it can't answer. */
function psqlValue(query) {
  const result = docker([...COMPOSE, 'exec', '-T', 'db', 'psql', '-U', 'worldup', '-d', 'worldup', '-tAc', query]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function migrationState() {
  const journal = JSON.parse(fs.readFileSync(path.join(ROOT, 'drizzle', 'meta', '_journal.json'), 'utf8'));
  const applied = psqlValue('select count(*) from drizzle.__drizzle_migrations');
  return { total: journal.entries.length, applied: applied === null ? null : Number(applied) };
}

// ------------------------------------------------------------------ the app

async function healthStatus(timeoutMs = 120_000) {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.status;
  } catch {
    return 0;
  }
}

function readEnv() {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(path.join(ROOT, '.env'), 'utf8')
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]),
    );
  } catch {
    return {};
  }
}

async function waitFor(check, timeoutMs, intervalMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function logHas(name, pattern) {
  try {
    return pattern.test(fs.readFileSync(logFile(name), 'utf8'));
  } catch {
    return false;
  }
}

function tail(file, lines) {
  try {
    return stripAnsi(fs.readFileSync(file, 'utf8')).split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(no log yet)';
  }
}

async function ensureDatabase() {
  const version = dockerVersion();
  if (!version) fail('Docker is not running: start Docker Desktop, then run this again.');
  const containers = devContainers();
  if (!/healthy/.test(containers.db ?? '') || !/running/.test(containers.mailpit ?? '')) {
    console.log('… starting Postgres and Mailpit (docker-compose.dev.yml)');
    const result = spawnSync('docker', [...COMPOSE, 'up', '-d', '--wait'], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) fail('docker compose up failed');
  }
  const { total, applied } = migrationState();
  if (applied === null || applied < total) {
    console.log(`… applying migrations (${applied ?? '?'}/${total} applied)`);
    if (npmScript('db:migrate', false).status !== 0) fail('npm run db:migrate failed');
  }
}

async function startDev() {
  if ((await healthStatus(5_000)) === 200) {
    console.log(trackedPid('dev') ? '✓ dev server already up' : '✓ a dev server started elsewhere answers on :3000');
    return;
  }
  const strays = projectNodeProcesses().filter(isNextProcess);
  if (strays.length) {
    console.log(`… stopping a stuck Next.js process (${strays.map((p) => p.pid).join(', ')})`);
    strays.forEach((p) => killTree(p.pid));
  }
  const since = Date.now();
  const pid = startDetached('dev', NEXT_CWD, [NEXT(NEXT_CWD), 'dev']);
  console.log(`… next dev starting from ${NEXT_CWD} (pid ${pid}, log .claude/run/dev.log)`);
  const up = await waitFor(async () => (await healthStatus(30_000)) === 200 || !alive(pid), 180_000, 2000);
  if (!up || !alive(pid)) {
    console.log(tail(logFile('dev'), 30));
    fail('next dev did not come up');
  }
  try {
    fs.unlinkSync(path.join(RUN, 'warm.pid'));
  } catch {
    // Not warmed yet
  }
  console.log(`✓ dev server up in ${seconds(since)}: ${BASE_URL}`);
}

async function startWorker() {
  if (trackedPid('worker')) {
    console.log('✓ worker already running');
    return;
  }
  const others = projectNodeProcesses().filter(isWorkerProcess);
  if (others.length) {
    console.log(`✓ a worker started elsewhere is running (pid ${others.map((p) => p.pid).join(', ')})`);
    return;
  }
  const pid = startDetached('worker', NEXT_CWD, [
    TSX(NEXT_CWD),
    '--env-file-if-exists=.env',
    path.join('src', 'entrypoints', 'worker.ts'),
  ]);
  const ready = await waitFor(() => logHas('worker', /Worker ready/) || !alive(pid), 60_000, 500);
  if (!ready || !alive(pid)) {
    console.log(tail(logFile('worker'), 30));
    fail('the worker did not start');
  }
  console.log(`✓ worker running (pid ${pid}, log .claude/run/worker.log)`);
}

function stop(name, matches) {
  const pids = new Set();
  const tracked = trackedPid(name);
  if (tracked) pids.add(tracked);
  for (const p of projectNodeProcesses().filter(matches)) pids.add(p.pid);
  pids.forEach(killTree);
  try {
    fs.unlinkSync(pidFile(name));
  } catch {
    // Nothing tracked
  }
  return pids.size;
}

/** The pages to compile ahead of a test run: every route, a real card and series for the dynamic ones. */
function routesToWarm() {
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'page.tsx') pages.push(path.relative(path.join(ROOT, 'src', 'app'), dir));
    }
  };
  walk(path.join(ROOT, 'src', 'app'));
  const cardSlug = psqlValue(
    `select c.slug from cards c join collections k on k.id = c.collection_id where k.slug = '${COLLECTION}' and c.hidden_reason is null order by c.id limit 1`,
  );
  const seriesSlug = psqlValue(
    `select s.slug from series s join collections k on k.id = s.collection_id where k.slug = '${COLLECTION}' order by s.id limit 1`,
  );
  const routes = new Set();
  for (const page of pages) {
    const segments = page
      .split(path.sep)
      .filter((s) => s && !/^\(.*\)$/.test(s))
      .map((s) => (s === '[collection]' ? COLLECTION : s));
    const route = `/${segments.join('/')}`;
    if (route.includes('/cards/[slug]')) {
      if (cardSlug) routes.add(route.replace('[slug]', cardSlug));
    } else if (route.includes('/series/[slug]')) {
      if (seriesSlug) routes.add(route.replace('[slug]', seriesSlug));
    } else if (!route.includes('[')) {
      routes.add(route);
    }
  }
  return [...routes].sort();
}

/**
 * A route from the command line. Git Bash rewrites an argument that starts
 * with a slash into a Windows path ("/signup" into "C:/Program Files/Git/signup",
 * "/c/heritage" into "C:/heritage"): this undoes it.
 */
function routeArg(arg) {
  const value = arg.replace(/\\/g, '/');
  const underGit = value.match(/^[A-Za-z]:\/(?:[^/]+\/)*Git(\/.*)?$/i);
  if (underGit) return underGit[1] || '/';
  const drive = value.match(/^([A-Za-z]):(\/.*)?$/);
  if (drive) return `/${drive[1].toLowerCase()}${drive[2] ?? ''}`;
  return value.startsWith('/') ? value : `/${value}`;
}

async function warm(routes, parallel = 4) {
  const since = Date.now();
  const queue = [...routes];
  const results = [];
  const run = async () => {
    for (let route = queue.shift(); route; route = queue.shift()) {
      const start = Date.now();
      let status = 0;
      try {
        status = (await fetch(BASE_URL + route, { redirect: 'manual', signal: AbortSignal.timeout(240_000) })).status;
      } catch {
        status = 0;
      }
      results.push({ route, status, ms: Date.now() - start });
    }
  };
  await Promise.all(Array.from({ length: parallel }, run));
  const broken = results.filter((r) => r.status === 0 || r.status >= 500);
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3);
  console.log(
    `✓ warmed ${results.length} pages in ${seconds(since)} (slowest: ${slowest
      .map((r) => `${r.route} ${Math.round(r.ms / 1000)} s`)
      .join(', ')})`,
  );
  for (const r of broken) console.log(`  ! ${r.route} answered ${r.status || 'nothing'}`);
}

async function purgeAdminMail() {
  const admin = readEnv().ADMIN_EMAIL;
  if (!admin) return;
  try {
    await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${admin}"`)}`, { method: 'DELETE' });
  } catch {
    // Mailpit down: the tests will say so
  }
}

// ----------------------------------------------------------------- commands

async function status() {
  const lines = [];
  const row = (label, value) => lines.push(`${label.padEnd(12)}${value}`);
  const version = dockerVersion();
  row('Docker', version ? `running (${version})` : 'NOT RUNNING: start Docker Desktop');
  if (version) {
    const containers = devContainers();
    row('Postgres', containers.db ?? 'not created (wu up)');
    row('Mailpit', containers.mailpit ? `${containers.mailpit}, inbox ${MAILPIT}` : 'not created (wu up)');
    if (/healthy/.test(containers.db ?? '')) {
      const { total, applied } = migrationState();
      row('Migrations', applied === null ? `none applied (${total} to apply)` : `${applied}/${total} applied`);
      const visible = psqlValue(
        `select count(*) from cards c join collections k on k.id = c.collection_id where k.slug = '${COLLECTION}' and c.hidden_reason is null`,
      );
      row('Catalogue', visible && visible !== '0' ? `${visible} visible cards in ${COLLECTION}` : 'empty (npm run import-catalog)');
    }
  }
  const processes = projectNodeProcesses();
  const health = await healthStatus(15_000);
  const devPid = trackedPid('dev');
  const nextPids = processes.filter(isNextProcess).map((p) => p.pid);
  row(
    'Dev server',
    health
      ? `answers ${health} on ${BASE_URL}${devPid ? ` (pid ${devPid}, .claude/run/dev.log)` : ' (started elsewhere)'}`
      : nextPids.length
        ? `Next.js processes ${nextPids.join(', ')} but no answer on :3000 (wu restart dev)`
        : 'down (wu up)',
  );
  const workerPids = processes.filter(isWorkerProcess).map((p) => p.pid);
  const trackedWorker = trackedPid('worker');
  row(
    'Worker',
    workerPids.length || trackedWorker
      ? `running (pid ${trackedWorker ?? workerPids.join(', ')}${trackedWorker ? ', .claude/run/worker.log' : ', started elsewhere'})`
      : 'down (wu up): no e-mails, pushes or scheduled jobs',
  );
  let tiles = [];
  try {
    tiles = fs.readdirSync(path.join(ROOT, 'map', 'tiles')).filter((f) => f.endsWith('.pmtiles'));
  } catch {
    tiles = [];
  }
  row('Map tiles', tiles.length ? tiles.join(', ') : 'none in map/tiles: the map shows its pins on a plain ground');
  console.log(lines.join('\n'));
}

async function up() {
  await ensureDatabase();
  await startDev();
  await startWorker();
}

function down(args) {
  const dev = stop('dev', isNextProcess);
  const worker = stop('worker', isWorkerProcess);
  console.log(`✓ stopped ${dev} Next.js and ${worker} worker process tree(s)`);
  if (args.includes('--db')) {
    // Never `down -v`: the volume holds the imported catalogue
    spawnSync('docker', [...COMPOSE, 'stop'], { cwd: ROOT, stdio: 'inherit' });
  }
}

async function restart(args) {
  const which = args[0];
  if (!which || which === 'dev') stop('dev', isNextProcess);
  if (!which || which === 'worker') stop('worker', isWorkerProcess);
  await sleep(1000);
  await ensureDatabase();
  if (!which || which === 'dev') await startDev();
  if (!which || which === 'worker') await startWorker();
}

function logs(args) {
  const count = Number(args[args.indexOf('-n') + 1]) || 40;
  const names = args.filter((a) => a === 'dev' || a === 'worker');
  for (const name of names.length ? names : ['dev', 'worker']) {
    console.log(`=== ${name} (.claude/run/${name}.log, last ${count} lines)`);
    console.log(tail(logFile(name), count));
  }
}

function unitTests(args, database) {
  const config = database ? ['--config', 'vitest.db.config.mts'] : [];
  if (database) {
    const containers = devContainers();
    if (!/healthy/.test(containers.db ?? '')) fail('Postgres is down: run `wu up` (or `npm run db:up`) first');
  }
  return nodeInherit(VITEST_CWD, [VITEST(VITEST_CWD), 'run', ...config, ...args]);
}

async function e2e(args) {
  const noWarm = args.includes('--no-warm');
  const rest = args.filter((a) => a !== '--no-warm');
  await up();
  await purgeAdminMail();
  const devPid = trackedPid('dev') ?? 'elsewhere';
  let warmedFor = null;
  try {
    warmedFor = fs.readFileSync(path.join(RUN, 'warm.pid'), 'utf8');
  } catch {
    warmedFor = null;
  }
  if (!noWarm && warmedFor !== String(devPid)) {
    await warm(routesToWarm());
    fs.writeFileSync(path.join(RUN, 'warm.pid'), String(devPid));
  }
  return nodeInherit(NEXT_CWD, [PLAYWRIGHT(NEXT_CWD), 'test', ...rest]);
}

async function check(args) {
  const steps = [
    ['lint', () => npmScript('lint', true)],
    ['typecheck', () => npmScript('typecheck', true)],
    ['unit tests', () => nodeCapture(VITEST_CWD, [VITEST(VITEST_CWD), 'run'])],
  ];
  if (args.includes('--db')) {
    steps.push(['database tests', () => nodeCapture(VITEST_CWD, [VITEST(VITEST_CWD), 'run', '--config', 'vitest.db.config.mts'])]);
  }
  if (args.includes('--py')) {
    steps.push([
      'pipeline tests',
      () =>
        spawnSync('python', ['-m', 'unittest', 'discover', '-s', 'scripts'], {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: MAX_BUFFER,
        }),
    ]);
  }
  let failed = 0;
  for (const [label, run] of steps) {
    const since = Date.now();
    const result = run();
    const output = stripAnsi(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).trim();
    if (result.status === 0) {
      const summary = output.split('\n').find((l) => /^\s*Tests\s+\d+ passed|^Ran \d+ tests/.test(l));
      console.log(`✓ ${label} (${seconds(since)})${summary ? `: ${summary.trim()}` : ''}`);
    } else {
      failed += 1;
      console.log(`✗ ${label} (${seconds(since)}), last lines:`);
      console.log(output.split('\n').slice(-80).join('\n'));
    }
  }
  return failed ? 1 : 0;
}

async function mail(args) {
  const count = Number(args[args.indexOf('-n') + 1]) || 5;
  const address = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-n');
  const url = address
    ? `${MAILPIT}/api/v1/search?limit=${count}&query=${encodeURIComponent(`to:"${address}"`)}`
    : `${MAILPIT}/api/v1/messages?limit=${count}`;
  let list;
  try {
    list = await (await fetch(url)).json();
  } catch {
    fail(`Mailpit doesn't answer on ${MAILPIT}: run wu up`);
  }
  for (const summary of list.messages ?? []) {
    const message = await (await fetch(`${MAILPIT}/api/v1/message/${summary.ID}`)).json();
    const link = /https?:\/\/\S+/.exec(message.Text ?? '')?.[0];
    const to = (summary.To ?? []).map((t) => t.Address).join(', ');
    console.log(`${summary.Created?.slice(0, 19).replace('T', ' ')}  ${to}  "${summary.Subject}"${link ? `\n    ${link}` : ''}`);
  }
  if (!list.messages?.length) console.log('(no e-mail)');
}

function sql(args) {
  if (!args.length) fail('usage: wu sql "<query>"');
  return (
    spawnSync('docker', [...COMPOSE, 'exec', '-T', 'db', 'psql', '-U', 'worldup', '-d', 'worldup', '-c', args.join(' ')], {
      cwd: ROOT,
      stdio: 'inherit',
    }).status ?? 1
  );
}

const HELP = `World Up local helper: node .claude/scripts/wu.mjs <command>

  status                 Docker, Postgres, Mailpit, migrations, catalogue, dev server, worker, map tiles
  up                     start Postgres and Mailpit, apply pending migrations, start next dev and the
                         worker in the background (logs in .claude/run/), wait until they answer
  down [--db]            stop next dev and the worker, whoever started them (--db: the containers too)
  restart [dev|worker]   stop and start again (both by default)
  logs [dev|worker] [-n N]
  warm [route...]        compile pages in next dev ahead of a test run (every route by default)
  test [vitest args]     unit tests (src/**/*.test.ts), run from C:\\ where Vitest works
  test:db [vitest args]  database tests (src/**/*.db.test.ts), same
  e2e [--no-warm] [playwright args]
                         up, purge ADMIN_EMAIL's old mails, warm once per dev server, then Playwright from c:\\
  check [--db] [--py]    lint, typecheck and unit tests (+ database, + pipeline tests), failures only in full
  mail [address] [-n N]  latest e-mails in Mailpit, with the link each contains
  sql "<query>"          psql on the dev database`;

const [command, ...args] = process.argv.slice(2);
const commands = {
  status,
  up,
  down: () => down(args),
  restart: () => restart(args),
  logs: () => logs(args),
  warm: async () => {
    await warm(args.length ? args.map(routeArg) : routesToWarm());
  },
  test: () => unitTests(args, false),
  'test:db': () => unitTests(args, true),
  e2e: () => e2e(args),
  check: () => check(args),
  mail: () => mail(args),
  sql: () => sql(args),
};

if (!command || command === 'help' || !commands[command]) {
  console.log(HELP);
  process.exit(command && command !== 'help' ? 1 : 0);
}
const code = await commands[command]();
process.exit(typeof code === 'number' ? code : 0);
