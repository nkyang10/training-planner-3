# Milebook - the Recent changes card: a normal-runner review

**Status:** review only. No product file changed, nothing deployed. **Date:** 2026-11-21.
**Lens:** the normal runner - someone who did not ask for an audit log, does not know what a "batch" is, and opens
this card to answer one question: *what did my coach change, and can I put it back?*
**Relation:** reviews the card shipped with the calendar (07, 10, 13) after the entry pass (17) and the daily-page
pass (18) moved everything else out of the calendar's first screen. The coach panel's own Changes tab is in scope
because it renders the same journal and is the card's sibling.

## 1. The card's job

The calendar answers "what now?". This card answers "what changed?". It is server-rendered below the month grid
(`src/web.ts:4962`) and its data is also the coach panel's Changes tab (`src/web.ts:4509-4515`). The trust feature is
real: every coach turn stores a batch with before/after snapshots, and Undo runs the audited inverse
(`src/history.ts:37-92`), itself recorded as a batch.

A normal runner asks three questions in order:

1. **What did the coach do?** The content.
2. **When?** Freshness, against a plan whose days are in the future.
3. **Can I undo it - and what exactly will undo remove?** The blast radius.

The card answers (1) twice, in two languages of its own; (2) with an unlabelled date that can be a day off; and (3)
with a singular button that deletes a whole batch and then shows the result off-screen.

## 2. Method

- **Seeded scratch instance** (`tmp/recent-changes/seed.ts`): one runner (`Ada Runner`, Asia/Taipei, en + zh-HK),
  fixed clock `2026-11-21T12:00Z`, and five batches shaped like the owner's screenshot - two add-ons, three same-day
  updates, one 14-item plan batch. The 14-item batch owns real sessions, so its Undo can be measured.
- **Headless Chrome 158 via CDP** at 1280x900, 390x844 and 320x700, in English and Traditional Chinese; clean,
  annotated, proposed, keyboard-focus, dock, discuss and post-undo states.
- **17 probe records**: geometry, computed styles, line counts, accessible names, launcher overlap. Plus an
  accessibility-tree count, a contrast computation, and a direct run of the audited revert against a copy of the DB.
- **`pnpm check`**: lint, `tsc --noEmit`, **560/560 tests** - the baseline before the review. No `src/` file changed.

## 3. The scorecard

| Measure | Value |
|---|---|
| Card height, 1280x900 | **864.8 px** for five batches |
| Card height, 390x844 | **1382.8 px** (1.6 screens) |
| Card height, 320x700 | **1689.8 px** (2.4 screens; 56% of the 3003 px page) |
| Card start, 1280 / 390 / 320 | y **1051 / 1056 / 1138** |
| Targets in the card | **10** (5 Undo + 5 Discuss) |
| Identical accessible names | **5x** "Undo this change", **5x** "Discuss this change" |
| Longest batch | 280-char summary + 245-char detail; **508 px** at 320 |
| Undo target | **174.4 x 47 px**, the largest target in the row |
| Discuss target | **129 x 26.4 px** |
| Undone row text | muted at **2.57:1** (WCAG AA needs 4.5:1) |
| One click on the 14-item batch | **14 sessions deleted**, no confirmation |
| After Undo | lands at scroll **0**; banner y 92; card y **1083** |

## 4. Findings

### 4.1 What the runner reads

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| RC-01 | P1 | **The headline is the raw coach log, not a sentence.** Every batch starts with `add "…" on 2026-11-21; move "…" 2026-11-22 → 2026-11-22` - lowercase English verbs, ISO dates, semicolons. The summary is built at write time (`src/gateway.ts:430-439`, stored at `:841`) and printed verbatim as the row's `<strong>` (`src/web.ts:508`). In zh-HK the entire headline stays English: the card is the only English sentence in an otherwise Chinese page. | `before-card-desktop.png`, `before-card-zh-HK.png`; code anchors |
| RC-02 | P1 | **Every batch is printed twice.** The summary line and the detail line carry the same entries, with two date formats (`2026-11-21` vs `21 Nov`) and two verbs (`add` vs `Added`). The detail is assembled from `changeActionLabel` + title + `(from → to)` (`src/web.ts:498-500`). At 390 the first row is 193 px: 3 summary lines plus 2 detail lines for one batch. | probes; `before-card-390.png` |
| RC-03 | P1 | **A large batch cannot be read.** The 14-item batch is a 280-char summary cut mid-phrase at `on…` (`src/gateway.ts:438` slices at 279 chars, ignoring token boundaries) plus a 245-char run-on detail. At 320 it is 10 summary lines + 7 detail lines, 508 px tall. There is no grouping, no day order, no "show all". | `before-long-batch.png`; probe row 4 |
| RC-06 | P2 | **Same-day updates read as no-op moves.** `changeActionLabel` maps every non-add/remove/revert entry to "Moved" (`src/web.ts:479-484`) and appends `(from → to)` whenever both days exist, even when equal (`:499`). Three of the five sample batches are same-day updates, so the card says `move "長課 15 公里（含節奏段 2 組）" 2026-11-22 → 2026-11-22`. The real change was a rename/distance change, and the before/after snapshots that prove it are already stored (`src/types.ts` `ChangeEntry`); the card ignores them. The coach panel already does better: `changeEntryText` distinguishes moved vs updated (`src/web.ts:2529-2543`). | rows 1-3; code anchors |
| RC-07 | P2 | **The change time is unlabelled, far away, and in UTC.** The meta is `formatShortDate(set.createdAt.slice(0, 10))` (`src/web.ts:508`) - the UTC day. A batch made at `2026-11-19T20:00Z` is 20 Nov in Taipei but shows 19 Nov (verified: `localDay` returns `2026-11-20`, `src/time.ts:42`). Nothing says it is the change time, and on desktop it sits 893 px from the headline (meta x 1032 vs summary x 139). There is no relative time. | probe; `before-card-desktop.png` |
| RC-08 | P2 | **The copy is system vocabulary.** "batch" appears in the footnote and empty state, the footnote explains the audit model ("Undo is itself recorded as a change"), and "change" appears six times in one card (`src/i18n.ts:737-750`). A normal runner has no "batch" in their mental model; they have "my coach moved my long run". | `src/i18n.ts:737-750`; footnote |

### 4.2 What happens when the runner acts

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| RC-04 | P1 | **"Undo this change" is singular but undoes the whole batch - with no count and no confirmation.** The button is the largest target in every row (174.4 x 47 px); the form posts immediately (`src/web.ts:504-506`); there is no `confirm(` anywhere in `src/`. Measured: one click on the 14-item batch **deletes 14 sessions** (`undo-experiment.ts`). The banner afterwards says "Change undone" with no count (`src/i18n.ts:790`). The audited revert is reversible, which is the safety net - but the label does not say so. | `undo-experiment.ts`; `src/history.ts:37-92` |
| RC-05 | P1 | **After Undo the runner lands where the result is invisible.** The form redirects to `/calendar?month=…&undone=1` (`src/web.ts:5254-5255`), the browser lands at scroll 0, the banner sits at y 92, and the card starts at y 1083 - below a 900 px fold. On the phone the card starts at y 1056. The runner sees "Change undone" and the grid, but not *which* batch changed, nor the card's updated state. | `after-undo-landing.png`; landing probe |
| RC-10 | P2 | **"Discuss this change" sends a canned message the runner cannot edit.** The button carries `data-coach-message` built from `changes.discussMessage` = `Why did the plan change on {date}? ({summary})` (`src/i18n.ts:750`, `src/web.ts:502-503`). The date is the batch's creation date, not the plan day, and the parenthetical is the raw machine summary. Clicking sends immediately; if the coach is unavailable the failure is generic. | `discuss-handoff.png` |
| RC-11 | P2 | **Undo produces a near-duplicate row above the row it undid.** `summarizeUndo` prefixes the original summary with `Undo: ` and caps it at 280 chars (`src/history.ts:24-29`), so after an undo the same add line appears twice: once as `Undo: add …` with another identical "Undo this change" button, and once as the original row marked `undone`. The new button reverses the undo but is labelled exactly like the undo. For a 14-item batch the revert row is again a 280-char machine line. | `after-undo-card.png`; `src/history.ts:26-29` |
| RC-17 | P2 | **Undoing from the coach panel strips the page card's row of both actions.** The page card wraps Undo *and* Discuss in one `.change-undo` container (`src/web.ts:504-506`); the dock's in-place cleanup removes that container (`markRecentChangeUndone`, `src/web.ts:2546-2555`). Measured after a dock undo: the page row has `[]` buttons, while the dock row still has `Discuss this change`. The row is also dimmed (RC-12), so it reads as disabled. | `dock-undo.json` probe |

### 4.3 What the eye and assistive tech get

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| RC-09 | P2 | **Ten identically named buttons, and the one explanation is hover-only.** The accessibility tree contains 5x "Undo this change" and 5x "Discuss this change"; neither has `aria-label` or `aria-describedby`. The only explanation of Discuss is a `title` attribute (`src/web.ts:503`) - invisible to touch and to most screen readers. A screen-reader user cannot tell which batch a button belongs to. | AX probe; buttons probe |
| RC-12 | P2 | **The undone row fails contrast and looks disabled while still active.** `.change-item.undone { opacity: .62 }` (`src/styles.ts:731`) blends the muted text to **2.57:1** on white (13 px), below WCAG AA 4.5:1; the ink headline survives at 5.17:1. The row still has an active Discuss button, so the dimming implies inertness it does not have. | contrast math; `src/styles.ts:731` |
| RC-13 | P3 | **The two actions have different touch geometry, and the coach launcher covers one of them.** Undo is 47 px tall; Discuss is 26.4 px (below the 44 px target guidance, above the 24 px AA minimum). At 390 the fixed launcher (100.8 x 44) covers **51%** of the Discuss button when the row passes through the launcher's band; at 320 the buttons stack and the current overlap is 0% - but only by 2 px: the 174 px Undo ends at x 205 and the launcher starts at x 207. Any wider label (the prototype's counted button is 210 px) reaches 34 px under the launcher. | `fab-overlap` probes; `src/styles.ts:391-392`, `:537-539` |
| RC-16 | P3 | **The card's focus ring is the browser default, not the app's.** Computed `outline: rgb(16,16,16) auto 1px`; the app's controls use a 2 px ember ring. Visible, but off-system. | focus probe |

### 4.4 What the product says elsewhere

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| RC-14 | P3 | **Two renderers tell the same journal differently.** Page: `2 changes` / `19 Nov` / `Added`. Dock: `2 sessions` / `Nov 19` / `Add`, plus `Show on calendar`. The dock's en-US date order contradicts the app's en-GB convention (`INTL_DATE_TAG`, `src/i18n.ts:2493` vs `formatChangeDate`, `src/web.ts:2520-2528`). The dock card is structurally better (per-entry list, show-on-calendar) and the page card is visually heavier; the runner who reads both sees two stories. | `dock-changes.png`; dock probe |
| RC-15 | P3 | **Discovery.** The card starts at y 1051 on a 900 px desktop and y 1056 on a 390 phone; the header shortcut was removed in 17; the alternatives are FAB → panel → Changes tab, or the panel's "Open Recent changes" chip. For "what did the coach change?", that is two or three steps or a scroll past the whole month. Observation, not a defect - but it explains why a normal runner may never see this card. | `src/web.ts:4962`, `:2016`; `calendar-full-1280.png` |

## 5. What to keep

- The **audited revert path** and the per-row `data-change-set` id: the dock's in-place undo depends on it.
- The **no-JS form** and the server-rendered card.
- The **discuss intent** (`discuss-change` with the change-set id): the coach gets the exact batch, never a guess.
- The **empty-state promise** ("appears here with an Undo") - keep the promise, change the words.
- The **dock's card structure**: per-entry list, session count, "Show on calendar". It is the better half; bring it
  to the page rather than inventing a third design.

## 6. The fix spec (slice RC)

Ordered by user impact per line changed. All copy needs en + zh-HK.

| Fix | Closes | Change | Acceptance |
|---|---|---|---|
| **F1 Headline** | RC-01, RC-02 | Replace the raw summary with a localized count + range line built from entries: `2 sessions added · 21 Nov – 24 Nov`, `1 session updated · Sun, 22 Nov`, `14 sessions added · 17 Nov – 13 Dec`. Keep the raw summary in the store and the coach prompt; stop printing it. | The rendered card contains no `add "`, `move "` or `YYYY-MM-DD`; zh-HK shows no English verb; one line per batch. |
| **F2 Entries** | RC-02, RC-03 | Render each entry as a list row: day, action, title, kind, in day order. Show the first 3; the rest in a native `<details><summary>Show all N</summary>`. | A 14-item batch is 3 rows + one disclosure; the disclosure works without JS; the 14-item row ≤ 300 px at 320 (from 508). |
| **F3 Real deltas** | RC-06 | Say "Moved" only when the day changed. Otherwise "Updated" plus the actual delta from `before`/`after`: renamed, `15 → 18 km`, `90 → 105 min`, `note updated`. The snapshots are already in the change-set payload (`src/store.ts:749-759`), so the server card can read them today; `/chat/history` must expose them if the dock is to show deltas too. | No `→` when `fromDay === toDay`; the three sample same-day batches read "Updated …". |
| **F4 Blast radius** | RC-04, RC-05 | Label with the count: `Undo these 14 sessions` / `Undo this session`. Adopt the dock's in-place undo + toast for the page card (progressive enhancement; the form still posts). Keep the no-JS redirect but land at `#recent-changes` and name the count in the banner (`withParams` appends the query after any `#`, so the hash must be added after the redirect is built, not inside `next`). Keep the counted button clear of the launcher at 320: cap it at 176 px or reserve an 82 px right gutter in the action row. | Label contains the count; after an in-place undo the row updates and a toast names the count; the no-JS path lands at the card; no modal; the action row is clear of the launcher at 320. |
| **F5 Undo record** | RC-11 | Render a revert batch as `Undone: 2 sessions added` with an "Undone" badge and **Put it back**; the original row keeps the badge and loses Undo. | The same text is not shown twice; the undone row's only action is Ask why; the revert row's action is Put it back. |
| **F6 Time** | RC-07 | Put the time next to the headline or under it, label it `Changed`, format it in the runner's zone with `localDay(createdAt, user.timezone)`, and add relative time for the last 7 days. | A 20:00Z batch shows the runner's local day; the meta is within 24 px of the headline; no unlabelled date. |
| **F7 Copy** | RC-08 | Footnote → `Newest first. Each undo is listed too, so you can put a change back.` Empty state → `No coach changes yet. When the coach edits your calendar, it appears here with an Undo.` Drop "batch" from the UI. | No "batch" in rendered copy; the footnote states a benefit, not the audit model. |
| **F8 Access** | RC-09, RC-10, RC-16 | Give each button an accessible name with the batch (`Undo the change from 19 Nov: 2 sessions added`), make Ask why's explanation visible (or `aria-describedby`), add the 2 px ember focus ring, and build the discuss message from entry days (`Why did you change 2 sessions for 21 and 24 Nov?`). | AX tree has no duplicate names; the help is visible without hover; focus ring matches the app. |
| **F9 Undone state** | RC-12, RC-17 | Drop the 62% opacity; use a badge plus a muted colour that keeps ≥ 4.5:1. Fix the cleanup so an in-place undo removes only the Undo form, not the Discuss button. | Undone text ≥ 4.5:1; a dock undo leaves Discuss on the page row. |
| **F10 One renderer** | RC-14 | Use one vocabulary and one card component for page and dock; en-GB dates in both. | Page and dock show the same words and date order for the same batch. |
| **F11 Discovery** (optional) | RC-15 | When there are unseen batches, one quiet line under the today strip: `Coach changed 2 sessions - see what changed` (anchor to `#recent-changes`). No new header shortcut. | The line appears only with unseen batches; it links to the card. |

**Effort and risk.** F1-F5 are `src/web.ts` + `src/i18n.ts` + `src/styles.ts`, roughly 150 lines; F6-F9 are small;
F10 is a refactor of the dock card or a shared renderer. No schema change: the snapshots needed by F3 are already
stored.

**Test impact.** The existing test at `test/web.test.ts:4172-4183` asserts the raw summary is printed
(`expect(calendar).toContain("Moved Easy 5 km to Sunday")`). F1 deliberately breaks that assertion; the test must
move to the new headline (e.g. `1 session updated · 5 Nov`), and the fixture's `summary` stays useful for the coach
prompt. Add assertions for: no ISO dates in the card, the count in the undo label, the disclosure, the accessible
names, and the 4.5:1 undone colour.

**Position on confirmation.** Do not add a modal by default. The revert is audited and reversible, and F4 makes the
result visible in place. If the owner wants a guard, gate only batches above a threshold (for example more than 3
sessions) with a one-line confirm; the count label already carries the blast radius for the common case.

## 7. The prototype (measured, not shipped)

A working mock of the visual half of F1-F7 and F9 - headline, entry rows, disclosure, counted labels, undo record,
labelled time, copy and undone badge - was rendered *inside the real page* from the real journal (`/chat/history`),
using the real stylesheet plus a small injected block. It is a design prototype, not product code.

| Measure | Current | Prototype | Delta |
|---|---|---|---|
| Card, 1280x900 | 864.8 px | 914 px | +49 px (+5.7% taller) |
| Card, 390x844 | 1382.8 px | **1128 px** | **-255 px (-18%)** |
| Card, 320x700 | 1689.8 px | **1522 px** | **-168 px (-10%)** |
| 14-item row, 320 | 508 px | **285 px** | **-223 px (-44%)** |
| Undo target | 174.4 x 47 px | 210 x 47 px | count in the label, same height |
| Ask why target | 129 x 26.4 px (`Discuss`) | 57 x 36 px | smaller width, taller target |
| Long batch | 280-char summary + 245-char detail | 3 entry rows + `+ Show all 14` | readable |

Desktop is 5.7% taller because three short entry rows replace two long lines; the win there is legibility, not height.
The phone is 18% shorter, and the long batch is 44% shorter. The prototype's wider counted Undo (210 px at 320)
reaches 34 px under the launcher, which is why F4 caps it or reserves a gutter.

**Prototype limits.** `/chat/history` does not carry `before`/`after`, so the prototype shows `Updated` without the
delta that F3 can render server-side. The mock has no undo behaviour, no accessible names or focus-ring change (F8),
and is English-only. See [evidence](../../design/recent-changes/README.md).

## 8. Verification

- **Baseline:** `pnpm check` green, **560/560 tests in 21 files**; lint and `tsc --noEmit` clean. No product file
  changed by this review.
- **Captures:** 1280x900, 390x844, 320x700; English and zh-HK; 0 horizontal overflow at 320 (300 px card in a 320 px
  viewport).
- **Probes:** 17 JSON records (geometry, line counts, computed styles, focus, AX names, launcher overlap) plus the
  landing probe (`scrollY 0`, banner y 92, card y 1083).
- **Contrast:** computed from the rendered colours, not estimated: muted 5.55:1, muted at 62% 2.57:1, ink at 62%
  5.17:1.
- **Undo experiment:** the audited revert run against a copy of the scratch DB: 14 entries → 14 deleted, 0 restored.
- **Dock cross-check:** a real dock undo, then the page row inspected: `[]` buttons on the page vs `Discuss this
  change` in the dock.

## 9. Deferred and limits

- One runner, one dataset, one moment (21 Nov 2026, Asia/Taipei). The batches are seeded with the gateway's own
  `summarizeChanges` shape, not produced by a live model turn.
- No user testing: "the normal runner" is a persona, not a sample. The next step is five runners reading this card
  cold, not another heuristic pass.
- The coach panel's chat takeover and the mobile sheet are doc 13's scope; only its Changes tab is reviewed here.
- The muscle, history and day pages are out of scope.
- The prototype is a mock; the fix spec is a proposal. Nothing was implemented, so there is no new test count and no
  deploy.
- F10's shared renderer is the largest refactor and the least certain: the dock card is built client-side and the page
  card server-side, so "one renderer" may mean one server renderer plus a hydration path, or one client renderer for
  both. Decide before scheduling.

## 10. Evidence

- [docs/design/recent-changes/](../../design/recent-changes/README.md) - before, annotated, zh-HK, 390/320, long
  batch, dock, discuss, post-undo, and the proposed mock.
- Scratch harness (gitignored): `tmp/recent-changes/seed.ts`, `serve.ts`, `shoot.mjs`, `evidence.mjs`,
  `analyze.mjs`, `undo-experiment.ts`, `dock-undo-check.mjs`; `probe.json`, `evidence.json`, `undo-experiment.json`,
  `dock-undo.json` (copied into the evidence folder).
