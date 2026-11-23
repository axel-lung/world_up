---
name: record-decision
description: Record a decision or a finished feature in World Up's living documentation. That means the right CLAUDE.md section or .claude/rules file (dated "decided on"), the French spec in docs/, the player-facing /rules and /privacy pages, /terms with TERMS_VERSION, the GDPR register, /credits, and Claude's memory. Use when the user decides how something should work, when a feature or rule lands, or when what the docs say no longer matches the code.
---

# Recording a decision

The project keeps its decisions in the repository, dated, so that the next session (and the lawyer, and the testers) can rely on them. When something is decided or changes, update every place below that it touches, in the same change as the code.

## Where each fact goes

| What | Where |
| --- | --- |
| How the code must behave, project conventions, a stack choice | `CLAUDE.md` for what holds everywhere, otherwise the topic's file in `.claude/rules/` (the index at the end of `CLAUDE.md` lists them). English. |
| The product's specification | `docs/cahier-des-charges-developpement.md`, in French, in the matching section (`Règles métier`, `Social et marché`, `Interface`, `Sécurité, données personnelles et hébergement`, `Recette`, `Lots de livraison et questions ouvertes`...) |
| A rule players live by (odds, timers, prices, limits, streak, visits) | `/rules` (`src/app/(site)/rules/page.tsx`, `messages/fr.json` → `Rules`); odds history on `/odds` |
| New personal data, a new cookie or `localStorage` key, a new third party, a new retention period | `/privacy` (`messages/fr.json` → `Privacy`) **and** `docs/registre-des-traitements.md` (the processing's table, the "Cookies" section, the subprocessors). Retention periods change in code and `/privacy` together. |
| The terms of use | `/terms` (`messages/fr.json` → `Terms`) and bump `TERMS_VERSION` in `src/lib/account-rules.ts` to the date of the new text: every player then re-accepts at `/accept-terms` |
| A new source of third-party content (data, photos, tiles, fonts) | `/credits` |
| An Android permission or data collected by the app | tell the user: the Play Console's data safety form must be updated by hand, with the next release |
| A fact about the user, their preferences, or the state of something outside the repo (the server, the Play Console, a pending answer) | Claude's memory, not the repo |

## How to write it

- In `CLAUDE.md` and `.claude/rules/`: describe what the code does now, in the present tense, with the date the user decided it: "(decided on 2026-11-22)". Name the files and functions involved (`streaks.ts`, `repairPlayerStreak()`). Replace text that no longer holds. Don't append a contradiction below it.
- Keep a rule in one place. Add a section to a `.claude/rules/` file whose `paths:` cover the files concerned, or create a new file with its own `paths:` frontmatter and add a line to the index in `CLAUDE.md`. Something that must hold whatever file is open goes in `CLAUDE.md` itself.
- The spec is in French, in the same register as its existing text. Payments-related items stay as they are: lot 4 is on hold (see memory), so don't rewrite them unless asked.
- `docker-compose.yml` is the spec's file verbatim: change both together.
- Tell the user, in your answer, which of these documents you updated and which you left for them (for example the Play Console form, or a legal text the lawyer should review).

## Legal guardrails to re-check with any decision

- Nothing may give cards or coins a monetary value (no buying currency, no cash-out, no account transfer). Odds stay public with their history.
- Paid packs combined with trades and auctions wait for the lawyer (loi SREN, art. 40). Any decision touching this goes to the user and the lawyer, not into code.
- No advertising trackers. Analytics only in the CNIL consent-exempt configuration, and the Matomo/Plausible choice is still open: ask before picking one.
