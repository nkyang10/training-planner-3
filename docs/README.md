# Milebook documentation

This is the maintained reference set for Milebook. Every page answers one question a maintainer actually asks, and is
edited in the same pull request as the code it describes. There is no diary here: the PoC-era analysis, review records
and iteration screenshots were removed from the release tree and remain recoverable from git history (last commit that
contained them: `e79e11b`).

## Start here

| Page | The question it answers |
|---|---|
| [PRODUCT.md](PRODUCT.md) | What is Milebook, who is it for, what is each screen for, and what is deliberately out of scope? |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What runs where, what talks to what, and where are the trust boundaries? |
| [DATA-MODEL.md](DATA-MODEL.md) | What is stored, what are the invariants, what is retained, how is it migrated and backed up? |
| [HTTP-API.md](HTTP-API.md) | What routes exist, what do they take, what do they return, and who may call them? |

## The coach

| Page | The question it answers |
|---|---|
| [COACH-CONTRACT.md](COACH-CONTRACT.md) | What may the model propose, what does the server validate, and how is a turn repaired, replayed and audited? |
| [COACHING-STATES.md](COACHING-STATES.md) | What durable context exists beyond one turn, how is it detected, and which guardrails does it enforce? |

## Domains

| Page | The question it answers |
|---|---|
| [TRAINING-LOG.md](TRAINING-LOG.md) | How are runs matched to plans, and how are volume, load, splits, laps, zones and best efforts computed? |
| [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md) | How does the body record work — catalog, check-in, deterministic reading, drills and coach suggestions? |
| [GARMIN.md](GARMIN.md) | What does the Garmin Personal API give us, what does it refuse, and how is the workout overlay built? |

## Interface

| Page | The question it answers |
|---|---|
| [UI-GRAMMAR.md](UI-GRAMMAR.md) | What is the layout grammar, the breakpoints, the accessibility rules and the i18n contract? |
| [ASSET-PROVENANCE.md](ASSET-PROVENANCE.md) | Where did every vendored asset come from, under what licence, and what attribution must ship with it? |

## Operating it

| Page | The question it answers |
|---|---|
| [OPERATIONS.md](OPERATIONS.md) | What are the settings, how do I run, deploy, back up, restore, roll back and debug it? |
| [SECURITY.md](SECURITY.md) | Which controls are in place, and which gaps are still open? |
| [LIMITS.md](LIMITS.md) | What can this product honestly not do, with what numbers, and what would lifting each limit take? |
| [TESTING.md](TESTING.md) | What does the gate run, what does it cover, what does it miss, and how do I add a test? |

## Shipping it

| Page | The question it answers |
|---|---|
| [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) | What was wrong, what is fixed, what still blocks real users, and in what order should the rest close? |
| [RELEASE.md](RELEASE.md) | What must be rearranged before production, how is a release cut, verified and rolled back? |
| [ROADMAP.md](ROADMAP.md) | What comes after this release, and which decisions block it? |

## Decisions

| Record | Decision |
|---|---|
| [adr/0001](adr/0001-server-validated-coach.md) | The LLM proposes; the server validates before writing. |
| [adr/0002](adr/0002-calendar-first-bubble.md) | The calendar is the product; the bubble is same-origin, not an iframe. |
| [adr/0003](adr/0003-validation-feedback-loop.md) | Rejected proposals are fed back once; turns are idempotent. |
| [adr/TEMPLATE.md](adr/TEMPLATE.md) | The shape of a new decision record. |

Screenshots of the shipped product (synthetic demo runner, no production data) live in
[assets/screenshots/](assets/screenshots/).

## Rules for these pages

1. **One question per page.** If a page needs "and also", it is two pages.
2. **A status header on every reference page:**
   `**Status:** current · **Owner:** <area> · **Updated:** YYYY-MM-DD · **Supersedes:** <old page or "—">`.
   Update the date when you change the page.
3. **Cite code by symbol, never by line number:** `(src/coach.ts · parseCoachTurn)`. Line numbers rot on the next
   commit; `pnpm docs:check` verifies every anchor still resolves.
4. **State facts once.** A test count, a CSS version, a port or a deployment state lives in the page that owns it —
   never copy-pasted into several pages. Prefer "run `pnpm check`" to a number.
5. **Write the current behaviour, not the history.** How something came to be is a pull request; what it does now is
   this page.
6. **No scratch paths, no absolute paths, no corruption.** `pnpm docs:check` fails on broken links, dead anchors,
   GBK-mojibake characters, `U+FFFD`, literal double-question-mark runs in prose and references to the gitignored
   scratch directory.
7. **Delete a page when its subject is gone.** A stale page is worse than no page: it teaches the wrong thing.

## Adding or retiring a page

- Adding: create the page with the status header, add it to the index above with its question, add cross-links from the
  pages that need it, and run `pnpm docs:check`.
- Retiring: fold anything still true into the page that owns the subject, remove it from this index, delete the file,
  and mention the retirement in the pull request. Git history is the archive; this tree is the reference.
