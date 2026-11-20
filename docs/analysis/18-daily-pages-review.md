# Milebook - the daily pages: the entry method applied to the training log and the day

**Status:** shipped 2026-11-20: implementation, full gate **560/560**, headless-Chrome captures at 1164x900 and
390x844, live deploy (calendar :8093, gateway :8092, CSS **v30**) and a **20-check live probe** with a real manual-run
POST; the temporary account and its rows were removed. **Date:** 2026-11-20.
**Lens:** the same decision-tax method as [17-entry-review.md](17-entry-review.md): inventory every target above the
fold, name the page's one job, keep one primary, demote or delete the rest.
**Relation:** 17 fixed the post-login calendar. This pass applies the method to the two daily-use pages behind it and
audits the remaining pages with the same lens.

## 1. The method, repeated

1. Seed a realistic runner; capture each page at desktop and phone with DOM probes (page head, blocks, above-fold
   targets, document height).
2. Inventory every block and target above the fold; count jobs and competing primaries.
3. Ask "is all necessary?" of each block; delete, merge or demote.
4. Leave one primary and one quiet fallback; put the answer first.
5. Test, capture before/after, deploy, verify live.

## 2. The cross-page scorecard

| Page | First-screen question | Decision tax | Verdict |
|---|---|---|---|
| Calendar | What now? | 11 targets / 4 jobs | shipped in 17 |
| Training log | What happened this period? | eyebrow + intro + 6 filter controls + 4 stat cards + 2 tabs; the cards duplicate the week summary | **shipped here** |
| Day | What is planned today, and how do I log it? | 3-line head mixing date/runner/profile; always-open 5-field form; no primary | **shipped here** |
| Activity detail | What did this run do, and what next? | 4 equal head actions + a duplicate bottom coach card | deferred |
| Muscle | How do my muscles feel, and what do I log? | status rail + 3D figure + form; dense but task-driven | deferred |
| Coach states | What is the coach tracking? | tabbed management page | deferred |
| Profile | Who am I? | one card | keep |
| Login/signup | How do I get in? | form friction (IANA timezone string, no password toggle), not decision load | separate pass |

## 3. Training log: what shipped

The page's job is to show a period's actual training; the days are the answer. Three things were competing with that:

- **The eyebrow repeated the app-bar tab.** "Training log" appeared in the tab, the eyebrow and the document title.
  The head is now the h1 "Past training" + the existing intro (two lines, no eyebrow).
- **Four stat cards duplicated the week summary.** The cards showed runs / distance / time / longest; the week header
  already said "N runs - X km - D - planned Y km". They are now one 17 px line:
  `3 runs - 31.7 km - 3h 07m - longest 18.4 km`. The line keeps the longest stat the cards had and the planned tail.
- **The week header repeated that line.** Removed; the per-week rows in Month/Year keep their own compact lines.

Kept deliberately: the period bar (Week/Month/Year, date, Go, range, This week) and the Days/Review tabs. This page's
job is period navigation, not a single call to action; the filter count is unchanged, but the visual weight and the
duplicate numbers are not. The Review tab's load, trend and best-efforts cards remain the rich view.

**Measured:** page head 117 -> **95 px**; the tabs start at **y 408** instead of y 482 (74 px higher); full page
1570 -> **1474 px**; phone 1759 -> **1556 px**; the four cards (a 2x2 grid on phone) become one line.

**Tradeoff:** four big numbers are less scannable than four cards. The numbers are all still present, one line lower
in emphasis, and the Review tab is one tap away.

## 4. Day page: what shipped

The page's job is to answer "what is planned today?" and then log the run.

- **The subline mixed three jobs.** `2026-11-17 - Ada Runner - Profile` repeated the h1 date, repeated the app-bar
  account name, and offered a Profile link on a training day. It is gone; the header is the back link + the date.
- **The log form was always open.** Five fields and a submit button occupied the lower half of the page before the
  runner had decided to log anything. It is now a native `<details>` disclosure: the summary is the page's one
  primary, a 44 px **Log a run** button; the form opens in place. The native element keeps the no-JS path, and a
  six-line script opens the disclosure when the calendar's `/day/...#log-run` link lands with that hash.
- **The order is unchanged**: booked session -> recorded activities -> log -> Garmin workouts. The primary sits below
  the answer; the recorded empty copy still says "Log a run below", which is now the disclosure.

**Measured:** full page 1315 -> **900 px** on desktop (one screen); phone 1471 -> **856 px** closed, 1421 px open;
page head 80 px desktop / 59 px phone (was three lines); one primary instead of an always-open form.

**Tradeoff:** the form is one tap away instead of always visible. The primary is above the fold, the native details
works without script, and the form's fields and POST are unchanged.

## 5. What is protected

- App bar, calendar grid, typed rows, peeks, coach dock, recent-changes card and Garmin modal.
- The day's booked and recorded content, the log form's fields and POST, and the day's Garmin workouts.
- The training log's period bar, Days/Review tabs, load/trend/best-efforts cards and per-week/per-month rows.
- The tests: 560/560, with new assertions for the period summary and the day disclosure; the day's RPE field, the
  history's plan/activity rows and the account-menu Profile link still pass.

## 6. Verification

- `pnpm check`: lint, `tsc --noEmit`, **560/560 tests in 21 files**.
- Seeded headless-Chrome captures at 1164x900 and 390x844; **0 JS exceptions**; probes record the page head, summary
  line, disclosure state, block positions and document height.
- Live deploy: gateway 200, calendar 200, `/login` serves **app.css?v=30**; the stylesheet carries `.log-disclosure`
  and `.history-period-summary`.
- Live probe (**20/20**): the day disclosure and summary, the removed subline, the surviving RPE field and hash
  script; the history period line and removed cards; a real manual-run POST (5 km / 30 min) that then appeared on the
  day and produced `1 run - 5 km - 30 min - longest 5 km` on the history page; the temp account was removed (0 rows).
- Evidence: [before/after captures](../design/daily-pages/).

## 7. Deferred, with reasons

- **Activity detail:** four equal head actions (Ask coach / View day / View plan / Muscles) plus a duplicate bottom
  coach card. The head action is the quick path; the bottom card explains the comment-only contract. A future pass
  can make Ask coach the one primary and the other three quiet links, but this is a detail page, not an entrance.
- **Muscle:** the status rail, the 3D figure and the check-in form are a tool, not a dashboard; the form is the
  primary and the density is the task. A future pass could collapse the check-in form behind one button, but the
  figure needs the space.
- **Coach states:** a management/deep-link page, already tabbed; no daily decision. Keep.
- **Profile:** one card; keep.
- **Login/signup:** the next highest-friction entrance. The IANA timezone string and the missing password toggle are
  form friction, a different method. Recommend a timezone select and a show-password control.

## 8. Files changed

- `src/web.ts` - day header, native log disclosure + hash-open script; history head, one period summary line, week
  header; CSS v30.
- `src/styles.ts` - `.log-disclosure` summary, `.log-panel`, `.history-period-summary`.
- `test/web.test.ts` - day disclosure + subline assertions; history summary + removed-cards assertions.
- `tools/deploy.ps1` - v30 gate + daily-page classes.
- `docs/design/daily-pages/` - before/after captures.
