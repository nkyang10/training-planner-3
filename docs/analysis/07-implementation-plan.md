# Milebook - implementation plan for the first slice

**Status:** in progress. **Date:** 2026-11-18. **Owner:** root agent.
**Basis:** `00-EXECUTIVE-SUMMARY.md` and `05-improvement-backlog.md` (slice 1 plus the cheapest slice 2 trust items).
**Rule:** this is a private PoC. Every change below must keep `pnpm check` green, stay inside the existing architecture,
and not add infrastructure the PoC does not have.

## 1. My opinion

The analysis says Milebook is not short on features; it is short on **exposure and completion**. The coach can already write
the calendar with proof, but the runner cannot see the proof, cannot log a run without Garmin, cannot keep a sensitive
confirmation across a refresh, and cannot take their data out. Adding another dashboard would make the product wider
without making it more trustworthy.

So the first implementation slice is deliberately unglamorous:

1. Make the **completion half** work without Garmin.
2. Make the **trust machinery visible** (what changed, undo, persistent confirmation).
3. Make the **onboarding promise true** (goal reaches the coach, horizon is shown, Garmin has one working path).
4. Make the **honesty labels explicit** (PR scope, trend window, missed-run copy).
5. Make the **data leaveable** (JSON/ICS export, Garmin key deletion).
6. Make the UI **usable for motion-sensitive and keyboard users**.

The differentiating architecture is already there. This slice exposes it instead of replacing it.

## 2. Scope

### A. Implemented in this pass

| # | Item | Backlog id | Files (expected) |
|---|---|---|---|
| 1 | Goal text reaches the coach prompt | QW-1 / I-02 (facts half) | `src/coach.ts`, `src/gateway.ts`, tests |
| 2 | 180-day horizon visible in the bubble header | QW-2 / WF-09 | `src/web.ts` |
| 3 | Garmin connect: one working link, inline sync result, key deletion | I-12 / QW-3 / QW-4 / I-15 | `src/web.ts`, `src/web-coach-states.ts`, `src/types.ts`, `src/store.ts` |
| 4 | Manual/reported run logging | I-01 | new `src/manual-activity.ts`, `src/web.ts`, tests |
| 5 | Pending sensitive-state confirmation survives refresh | I-05 | `src/web.ts` (`/chat/history` + client) |
| 6 | Recent changes card plus a real undo button | I-03 | `src/web.ts`, `src/history.ts` (reuse) |
| 7 | Session intent and effort guidance in the peek and day page | I-07 | `src/web.ts` |
| 8 | Neutral missed-run copy | I-19 | `src/web.ts` |
| 9 | PR scope note, trend-window caption, validated `?month=` | I-18 / QW-6 / QW-8 | `src/web.ts` |
| 10 | Bell timestamps in the runner's timezone | QW-7 | `src/web.ts` |
| 11 | Export JSON and ICS; account-menu links | I-13 | new `src/export.ts`, `src/web.ts`, tests |
| 12 | Reduced-motion support and small accessibility fixes | I-20 / QW-5 | `src/styles.ts`, `src/web.ts` |
| 13 | Move action from the session peek | I-08 (partial) | `src/web.ts` |

### B. Deliberately deferred (and why)

| Item | Why not in this pass |
|---|---|
| Full week/agenda view, PWA manifest, service worker | Real work, but it is a layout project; the honest demo does not depend on it. Next slice. |
| Diff preview + approve before multi-session writes | Two-phase turn touches idempotency and the gateway contract; needs its own design and test budget. |
| Deterministic fallback planner | Large, and it must reuse the validator rather than bypass it. |
| Race-week brief / goal-race object | Needs a goal schema and product decisions (D5). The goal text is wired now; the object comes next. |
| Plan templates/import | Needs provenance and licensing decisions. |
| Reminders | Needs a delivery channel the PoC does not have. |
| Strength kinds, locale pass, beginner mode, non-blocking render | Schema/segment/layout work; not trust-critical. |
| Drag-and-drop | A move action plus the recent-changes card captures the need at lower risk. |

## 3. Acceptance criteria

1. A signed-in runner can log a reported run on any past/today date; it appears on the calendar, the day page and the
   training log, matches the plan with the same rules as Garmin runs, and is never overwritten by a later sync.
2. `buildCoachPrompt` contains the profile goal; a runner who typed a goal can ask "what about my goal?" and the model
   sees it.
3. The bubble header states the 180-day booking horizon from `HORIZON_DAYS`.
4. The Garmin setup card links to a real key path; a manual sync renders an inline result; the saved key can be deleted.
5. After refresh, an observing (sensitive) state still shows Confirm/Dismiss in the bubble and can be resolved.
6. The calendar shows the last change sets with before/after counts and an Undo button; undo appends an audit set and is
   idempotent; another runner's change set cannot be undone.
7. The session peek and day page say what the session is for and how hard it should feel; a missed session says the block
   does not change instead of shaming the runner.
8. Period bests say "within stored history"; a truncated trend says it uses the last 12 runs; a malformed `?month=`
   falls back to the current month instead of a 500.
9. Notification timestamps render in the runner's IANA timezone.
10. `/export.json` and `/export.ics` return only the signed-in runner's data, with no password hash and no Garmin key;
    the account menu links to them.
11. `prefers-reduced-motion` disables the CRUD flourish; focus and labels still work.
12. `pnpm check` passes; the live process is redeployed and the changed pages are verified.

## 4. Risks and mitigations

- **Direct undo route bypasses the chat-only design.** Mitigation: reuse `applyRevert`, enforce same-origin POST and
  per-user scoping, record the undo as its own change set, and keep the chat undo path untouched.
- **Manual activities could loosen plan matching.** Mitigation: do not change `matchActivitiesToPlan`; feed the same
  `Activity` shape with `source: "chat"` and let the existing same-day matcher decide.
- **`web.ts` is large and the client script is inline.** Mitigation: small, additive edits; grep every anchor; run
  typecheck and the full suite after each batch.
- **Docs and tests assert exact HTML/JSON.** Mitigation: update the affected expectations in the same change, and add
  tests for every new behaviour rather than weakening existing ones.
- **Live deployment restarts the running process.** Mitigation: run `pnpm check` first; deploy only after green; verify
  `/health`, `/login` and the changed pages; keep the existing logs.

## 5. Progress log

| Batch | State |
|---|---|
| Plan written | done |
| Coach goal + gateway pass-through | done |
| Garmin connect, sync result, key deletion | done |
| Manual activity module + route + UI | done |
| Persistent pending states | done |
| Recent changes + undo | done |
| Session intent, missed copy, PR/trend labels | done |
| Export JSON/ICS | done |
| Reduced motion + a11y | done |
| Tests, typecheck, lint | done (331 tests, 14 files, `pnpm check` green) |
| Live deploy + verification | done (live CSS v16 and new classes verified; `/login` and `/health` respond) |

## 6. Implemented in this pass

| Area | What changed | Files |
|---|---|---|
| Goal | `CoachPromptInput.goal` is rendered into the facts as `goal`; the gateway passes `profile.goal`; a prompt rule ties the plan to the goal | `src/coach.ts`, `src/gateway.ts` |
| Horizon | The bubble header prints `Books up to 180 days ahead` from `HORIZON_DAYS` | `src/web.ts` |
| Garmin connect | The states setup card links to `/calendar?garmin=setup`; the dead `[data-open-garmin]` binding is gone; the calendar shows a connect card when no key exists; manual sync results render as an inline `synced`/`syncError` banner; the modal can remove the saved key | `src/web.ts`, `src/web-coach-states.ts`, `src/types.ts`, `src/store.ts` |
| Manual run | `buildManualActivity` validates and builds a reported `Activity` with a deterministic id; `POST /activities` writes it; the day page has a log form; the calendar empty state and training-log empty state link to it | `src/manual-activity.ts`, `src/web.ts` |
| Pending states | `/chat/history` returns active/observing states; the bubble replays observing cards after refresh | `src/web.ts` |
| Recent changes | The calendar lists the last five change sets with an Undo form; `POST /calendar/changes/<id>/revert` reuses `applyRevert`, is per-runner and idempotent | `src/web.ts`, `src/history.ts` |
| Session intent | `sessionIntent` maps every kind to a purpose and effort line; the peek and day page render it; `Move` prefills the composer | `src/web.ts` |
| Missed copy | A past session reads `Not done` and says the plan does not change; the log says `No run logged - the plan does not change` | `src/web.ts` |
| Honesty labels | Period bests say "within your stored history"; the trend says it plots the last 12 runs; `?month=` and `/calendar/data?month=` fall back instead of throwing | `src/web.ts` |
| Timezone | The page carries `data-timezone`; bell timestamps format in the runner's IANA zone with a safe fallback | `src/web.ts` |
| Export | `buildExportBundle` (no password hash, no key) and `buildCalendarIcs` (all-day VEVENTs, escaped, folded); `/export.json` and `/export.ics` are linked from the account menu and profile | `src/export.ts`, `src/web.ts` |
| Reduced motion | CSS media query disables transitions/animations and hides the CRUD overlay; the client skips the flourish when `matchMedia` matches | `src/styles.ts`, `src/web.ts` |
| Tests | 331 tests in 14 files, including new manual-activity, export and honesty-slice web tests | `test/manual-activity.test.ts`, `test/export.test.ts`, `test/web.test.ts`, `test/coach.test.ts`, `test/gateway.test.ts`, `test/store.test.ts` |

**Verification.** `pnpm check` passes (lint, typecheck, 331 tests). The live process was redeployed on :8093/:8092; the
login page serves `app.css?v=16`, the stylesheet contains the new rules, and `/health` responds. A temporary live account
was created and removed: the calendar showed the horizon, empty-calendar, Garmin-connect and Recent-changes cards; a posted
reported run appeared on the day page; `/export.json` and `/export.ics` returned the bundle and a valid VCALENDAR;
`?synced=2` rendered the inline banner; and `/garmin/key/delete` rendered the removal banner. The temporary user and its
activity were deleted afterwards (0 rows left).

## 7. What this pass does not claim

- It does not add the full week/agenda view, PWA manifest/service worker, diff/approve, fallback planner, race-week
  brief, templates, reminders, strength kinds, locale pass, beginner mode or non-blocking render.
- It does not claim runtime performance numbers; the performance claims in 04 remain static-analysis only.
- It does not claim that every new route was exercised against the live database with a real account; the live smoke test
  covered the calendar cards, reported-run logging, export, sync banner and key deletion. The remaining routes are covered
  by the test suite.
- Parts of the older product docs contain pre-existing mojibake; this pass did not introduce it and only corrected the
  sections it touched.
