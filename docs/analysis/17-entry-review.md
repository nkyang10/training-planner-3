# Milebook - the post-login entry: review and shipped simplification

**Status:** shipped 2026-11-20: implementation, full gate **560/560**, headless-Chrome captures, live deploy
(calendar :8093, gateway :8092, CSS **v29**) and a 19-check live probe with one real plan turn; the temporary
account and its 16 rows were removed afterwards. **Date:** 2026-11-20.
**Lens:** the first screen a runner lands on after login - what it asks of them, what is actually needed, and how many
decisions it forces before the plan is visible.
**Relation to earlier work:** builds on [13-layout-review.md](13-layout-review.md), which measured the 217 px page
head. That review fixed the height; this pass fixes the **number of jobs** the head mixes. The coach dock (13) already
owns **Chat / States / Changes**, and the Muscles tab already badges soreness; the calendar page now stops duplicating
those surfaces in its header.

## 1. The finding

At 1164 px (zh-HK, 2026-11-20), above the calendar:

- **11 visible targets in 4 clusters**: log a run, recent changes, 4 status links, ask coach, log a run again, and
  3 month controls.
- **3 separate ways to add training** (header log, today ask, today log).
- **4 status links styled as filter pills**, pointing to 2 pages (`/coach-states` ×3, `/muscle` ×1).
- **2 equal CTAs in the today card**, 26 px and 21 px tall (WCAG 2.2 SC 2.5.8 minimum is 24 px; mobile guidance is
  44 px).
- The coach CTA carried `data-coach-send="false"`: it opened the composer with `Add a session on 2026-11-20: ` -
  **English on a Chinese page** - and waited for the runner to write the request.
- The grid started at **y 479** (53% of a 900 px viewport); four rows fit.

The page was ordered by what the system knows (identity, legend, actions, states) rather than by the runner's question
("what now?"). The today answer was the fifth block down, and an empty today handed the decision back as a choice.

## 2. What shipped

| Surface | Before | After |
|---|---|---|
| Page head | eyebrow + 44 px h1 + welcome + full-sentence legend + action row + state chips (**217 px**) | h1 + welcome on one baseline (**51 px**) |
| Today | a strip with two equal CTAs; the coach one only prefilled a half-written composer | hero card: date, one-line answer, next session, one **44 px** primary, one **24 px** quiet manual link, one context line |
| States | 4 uppercase pill links (3 to `/coach-states`, 1 to `/muscle`) | one 12 px "Coach is watching:" line with dotted-underline text links |
| Legend | a sentence under the head | 3-swatch key inside the month card, above the grid |
| Garmin freshness | a chip in the action row | 11 px meta on the right of the key row; no key -> "Garmin is not connected ›" link |
| Recent changes | header shortcut + bottom card + dock tab | bottom card + dock tab (header shortcut removed) |
| Empty month | empty card (3 equal buttons) + connect card | the same hero: "Nothing booked this month." + one plan request + quiet manual link |

The one new content is the **next-session** line ("Next: tomorrow · Easy 5 km"), computed from a 14-day lookahead so an
empty today has an anchor instead of a dead end. If nothing is booked in that window it says so.

The primary action now **sends a complete localized request in one click** (`data-coach-send` absent -> send), with a
plan intent scoped to today (or to the month when the month is empty). The manual log remains one quiet link to the day
form. When a session is booked, the primary is **View day**; when a run is recorded, it is **View details** - one
primary per state, never two equal buttons.

## 3. Measurements

| Metric | Before | After |
|---|---|---|
| Page head | 217 px | **51 px** |
| Today card | 69 px | 97 px (empty day) |
| Grid top, 1164×900 | 479 px | **362 px** |
| Grid top, 390×844 | 556 px | **461 px** |
| Visible calendar rows, 900 px | 4 | almost 5 |
| Visible targets above the grid | 11 | **7** |
| Add-training paths | 3 | 1 primary + 1 secondary |
| Primary CTA height | 26 px | **44 px** |
| Manual link height | 21 px | 24 px |

Evidence: [current entry, annotated](../design/entry-review/current-entry-annotated.png) and
[shipped entry](../design/entry-review/shipped-entry.png); [phone](../design/entry-review/shipped-entry-phone.png).

## 4. Verification

- `pnpm check`: lint, `tsc --noEmit`, **560/560 tests in 21 files** (4 new entry tests; the legend/sync/state
  assertions were updated).
- Seeded headless-Chrome captures at 1164×900 and 390×844 in zh-HK; **0 JS exceptions**. A separate booked-today
  capture checked the session state (the hero never repeats a distance the title already states).
- Live deploy: `/login` serves **app.css?v=29**; the stylesheet carries `.cal-key`, `.entry-context` and
  `.calendar-head`; the deploy script gates those classes and v29.
- Live probe (**19/19**): a temporary account saw the hero, the key, the connect meta and the empty-month request;
  the primary's real plan turn returned a 111-character Chinese reply and booked **6 sessions / 6 changes**; the
  calendar re-rendered with the key; the temp account and its **16 rows** were removed (0 rows left).

## 5. What is protected / not changed

- The app bar (brand, Plan / Log / Muscles, bell, account), the month grid and its typed rows, the peeks, the coach
  dock, the recent-changes card and the Garmin modal.
- The manual log path (hero secondary + day form), the states manager and the Muscles tab badge. The muscle alert
  survives as the tab badge and as text in the context line.
- The empty-month copy is neutral ("this month"), so a returning runner with a blank month does not read onboarding
  copy.

## 6. Caveats

- The next-session line is a **14-day lookahead**; it does not scan the whole plan horizon.
- The header "Recent changes" shortcut is gone; the card below and the dock's Changes tab remain. On wide screens with
  the dock closed, undo is two clicks (bubble -> Changes) or a scroll. This is the one deliberate discoverability
  tradeoff.
- The primary plan request is a real model turn; the coach may propose rather than write. The live probe happened to
  book six sessions; that is the existing plan-mode contract, not a new guarantee.
- No streaming; the button disables while the turn is in flight (existing `sendInFlight` guard).

## 7. Files changed

- `src/web.ts` - calendar head/hero/context/key/empty month, 14-day next-session lookahead, title-aware amounts,
  CSS v29.
- `src/styles.ts` - `.calendar-head`, today-hero grid, `.entry-context`, `.cal-key`, key swatches, quiet links; removed
  the old legend/state-chip/empty-card rules.
- `src/i18n.ts` - new calendar keys (key, context, next, hero, empty month, view detail); removed the obsolete
  eyebrow/legend/empty/connect/askCoachFull/detail keys and the two chip-row labels.
- `test/web.test.ts` - updated the legend/sync/state assertions; added the entry tests (empty day + next session,
  booked today, recorded run, empty month).
- `tools/deploy.ps1` - v29 gate + entry-style check.
- `docs/design/entry-review/` - before/shipped captures.
