#!/usr/bin/env node
// PreToolUse hook on Bash and PowerShell (.claude/settings.json), Windows only.
// Vitest, next dev and Playwright each break on this workstation with the
// wrong drive-letter case or Git Bash's PWD (see wu.mjs); .claude/scripts/wu.mjs
// sets both for them. A direct call is refused with the command to use instead.

import fs from 'node:fs';

if (process.platform !== 'win32') process.exit(0);

let command = '';
try {
  command = String(JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.command ?? '');
} catch {
  process.exit(0);
}
if (!command || /\.claude[\\/]scripts[\\/]/.test(command)) process.exit(0);

// A command word: at the start, or after a separator, a pipe, a paren or a space
const at = (pattern) => new RegExp(`(^|[\\s;&|(])(${pattern})(?=$|[\\s;&|)'"])`, 'i');
const RULES = [
  [at('npx\\s+vitest|npm\\s+(run\\s+)?test(:watch)?|npm\\s+run\\s+test:db'), 'node .claude/scripts/wu.mjs test [files] (test:db for the database tests, check for lint + typecheck + tests)'],
  [at('npx\\s+playwright\\s+test|npm\\s+run\\s+test:e2e'), 'node .claude/scripts/wu.mjs e2e [playwright args]'],
  [at('npm\\s+run\\s+dev|npx\\s+next\\s+dev|next\\s+dev'), 'node .claude/scripts/wu.mjs up (then status, logs dev, down)'],
];

const hit = RULES.find(([pattern]) => pattern.test(command));
if (!hit) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `On this Windows workstation that command breaks on the drive letter's case or Git Bash's PWD ` +
        `(Vitest fails every suite from c:\\, next dev reloads pages in a loop from C:\\). ` +
        `Run it as: ${hit[1]}. See the local-dev skill.`,
    },
  }),
);
