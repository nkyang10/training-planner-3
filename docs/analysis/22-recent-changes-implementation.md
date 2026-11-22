# Recent changes: implementation record (2026-11-22)

**Status.** F1-F5 of [the review](21-recent-changes-review.md) shipped. F6-F9 shipped in the same slice because the
card rewrite touched the same lines; F10 is partial (one vocabulary, two renderers); F11 (the discovery line) was not
shipped. No schema change: the change set already stored `before`/`after`, and the audited revert path is untouched.
The follow-up all-changes page ([23](23-all-changes-page.md)) reuses this card under a schedule heading; the calendar
card's footnote now links to it with **See all changes**, and the dock's footer link is **Open all changes**.

## 1. What the runner sees

### Headline (F1)

The card no longer prints the coach's stored summary. Each batch is one sentence built from its entries:

- `2 sessions added · 21 Nov – 24 Nov`
- `1 session updated · Sun, 22 Nov`
- `14 sessions added · 17 Nov – 13 Dec`
- `Undone: 2 sessions added · 21 Nov – 24 Nov`
- `2 sessions put back · 21 Nov – 24 Nov` (an undo that restored removed sessions)
- `3 changes` when one batch mixes verbs

The verb comes from the entries (`add`, `remove`, `update`); a revert batch infers what the undo reversed from the
snapshots: `after === null` means the undo removed an added session, `before === null` means it restored a removed one,
otherwise it updated. A mixed batch says `N changes` rather than inventing a verb. The range is the first and last day
the batch touched; a single day is a weekday label, not an ISO date. English uses the app's `en-GB` order (`Sun, 22
Nov`); zh-HK uses `11月22日週日` and never an English verb.

### Entries (F2, F3)

Each entry is a row: day, action, title, kind chip. Rows are sorted by day (`toDay ?? fromDay`), first three visible,
the rest inside a native `<details><summary>Show all N</summary>` that works without JavaScript. The 14-item batch is
3 rows + one disclosure.

`Moved` appears only when the day changed; otherwise the row says `Updated` and carries the real delta from the
snapshots:

- `from 6 Nov` for a move (the new day is already the row's day column)
- `renamed` when the title changed
- `18 km → 15 km` / `1h 30m → 1h 45m` when distance or duration changed
- `Easy → Tempo` when the kind changed
- `note updated` when only the note changed

The old card printed a `→` even when `fromDay === toDay`; that no-op is gone. The three seeded same-day batches now
read `Updated …` with their actual change, not `Moved`.

### Time (F6)

The meta is `Changed 19 Nov · 2 days ago` in the runner's zone (`localDay(createdAt, user.timezone)`): `today`,
`yesterday`, `N days ago` up to a week, then `Changed 5 Nov`. The test seeds `2026-11-04T20:00Z`, which is already
05 Nov in Asia/Hong_Kong, and asserts `Changed today` — the old UTC slice would have said 4 Nov.

### Blast radius (F4)

The label carries the count: `Undo 1 session`, `Undo 2 sessions`, `Undo 14 sessions`. The page form is enhanced in
place: the audited revert runs, the row is marked undone, the form is removed, a toast says `Undone: 2 sessions`, and
the grid and the dock refresh without a reload. The plain form still posts; the route redirects to
`/calendar?month=…&undone=N#recent-changes` and the banner names the count (`1 session undone`). No modal.

At 320 the counted button is 136-143 px wide and ends at x 174; the launcher starts at x 207, so the destructive action
is clear. The action row is 207-214 px in the widest case, inside the 260 px card content.

### Undo record (F5)

A revert batch is its own card: `Undone: 2 sessions added` + an `Undone` badge + **Put it back**. The button posts to
the revert batch's own id, so pressing it undoes the undo; the toast says `Put back: 2 sessions`. The original row keeps
its headline and badge and loses its Undo form; `Ask why` stays. The same text is never shown twice.

### Access and state (F8, F9)

- Every Undo's accessible name is the visible label + `—` + the batch headline (`Undo 2 sessions — 2 sessions updated ·
  22 Nov – 26 Nov`); every Ask why is `Ask why — <headline>`; the disclosure summary is unique. Names are unique within
  the page card (11) and within the dock's cards (16); the two surfaces repeat the same batch names because they show
  the same journal, and they are separate regions.
- Ask why's explanation is an `sr-only` span wired with `aria-describedby`, not hover-only.
- The card's buttons, Ask why and the disclosure summary get the app's 2 px ember focus ring.
- An undone batch keeps its text: a badge plus a muted headline at 5.55:1 instead of the old 62% opacity (2.57:1).
- The in-place cleanup removes only `.change-undo-form`, so the page row keeps Ask why (RC-17 fixed).

### Copy (F7)

Footnote: `Newest first. Each undo is listed too, so you can put a change back.` Empty state: `No coach changes yet.
When the coach edits your calendar, it appears here with an Undo.` No "batch" in rendered copy.

## 2. How it is built

- **Server card:** `recentChangesCard` (`src/web.ts:617`) with `changeAction`, `revertAction`, `changeHeadline`
  (`:521`), `changeRange`, `changeMeta`, `describeChangeEntry` (`:562`), `changeEntryRow` and `discussMessageFor`
  (`:599`). The card is still server-rendered, still carries `data-change-set`, and still ships the no-JS form.
- **Client enhancement:** `trf` (`:2169`) fills the new placeholders; `wireRecentChanges` (`:2763`) enhances the page
  form; `markRecentChangeUndone` (`:2741`) removes only the form and appends the badge; `buildChangeCard` (`:2792`)
  rebuilds the dock card with the same words, sorted entries and a disclosure; `undoToast` (`:2756`) picks the undo or
  put-back toast.
- **i18n:** en/zh `changes.*` (`src/i18n.ts:737`, `:1961`), `flash.changeUndoneCount`, `js.changeUndoToast` /
  `js.changePutBackToast`; `clientStrings` (`:2655`) now exposes `changes.*` alongside `js.*`; `DateFormat.weekdayDate`
  (`:2507`, `:2544`) adds the weekday label.
- **CSS:** `.change-*` (`src/styles.ts:736-761`), `.coach-change-ask` / `.coach-change-more` (`:495-502`).
- **Route and flash:** `src/web.ts:5524-5527` appends the hash after `withParams`; the banner is at `:311`.

No schema change. The page card reads `before`/`after`; `/chat/history` still does not expose them, which is the one
F10 gap (below).

## 3. Tests

- `test/i18n.test.ts`: the removed `changes.undo` key is replaced by `changes.undoCount` and
  `changes.headline.added`; `weekdayDate` and `clientStrings` exposing `changes.*` are asserted.
- `test/web.test.ts`: the old test asserted the raw summary (`Moved Easy 5 km to Sunday`); it is rewritten as
  `renders a batch as a human sentence and undoes it through the audited path` — headline, no raw summary, entry,
  delta, local-day meta, unique aria-labels, counted Undo, the `#recent-changes` landing and the counted banner, then
  the already-undone error.
- Four new tests: `renders a large batch as three entries plus a disclosure` (3 visible / 14 total, sorted, no `add "`),
  `describes a same-day update with its real delta` (no `Moved`, `15 km → 18 km`), `dates a batch in the runner's zone
  and marks an undone batch without dimming it` (20:00Z is the local day; badge; no form), and
  `renders a revert batch as an undo record with Put it back` (`Undone: 2 sessions added`, `data-change-putback`).
- `pnpm check`: **564/564 tests in 21 files**; lint and `tsc --noEmit` clean.

## 4. Measured (same seeded journal)

| Measure | Before | Shipped | Delta |
|---|---|---|---|
| Card, 1280x900 | 864.8 px | 897 px | +32.2 px (+3.7%) |
| Card, 390x844 | 1382.8 px | **1208 px** | **-174.8 px (-12.6%)** |
| Card, 320x700 | 1689.8 px | **1324 px** | **-365.8 px (-21.7%)** |
| 14-item row, 320 | 508 px | **254 px** | **-254 px (-50%)** |
| Undo label | `Undo this change` (x5) | `Undo 1 session` / `Undo 2 sessions` / `Undo 14 sessions` | count |
| Undo target | 174.4 x 47 px | 136-143 x 45 px | clear of the launcher at 320 |
| Ask why target | 129 x 26.4 px (`Discuss this change`) | 57 x 36 px | +9.6 px tall |
| Meta | `19 Nov` (UTC slice) | `Changed 19 Nov · 2 days ago` | local day + relative |
| Undone text | 2.57:1 | 5.55:1 | badge, no opacity |
| AX names | 5 x `Undo this change` + 5 x `Discuss this change` | unique within page card and dock | F8 |

Desktop is 3.7% taller because three short entry rows replace two long lines; the phone is 12.6% shorter and the small
phone 21.7% shorter, and the 14-item row is half its former height. The shipped card is 17 px shorter than the 914 px
design mock at 1280 and 198 px shorter at 320; at 390 it is 80 px taller than the mock. The win on desktop is legibility,
not height.

## 5. Verification

- `pnpm check` green, **564/564** in 21 files.
- **No-JS path:** the test posts the plain form and asserts 303, `undone=1#recent-changes`, the session restored, the
  revert batch recorded, and the landing banner `1 session undone`.
- **In-place undo:** captured at 1280: the row is `.undone`, its only button is `Ask why`, the meta carries the badge,
  the toast says `Undone: 2 sessions`, the grid refreshed, and the card is 889 px after the form is removed.
- **Dock:** the same five batches show the same headlines and en-GB dates, sorted entries, `Show all 14` on the long
  batch, counted Undo labels, Ask why and `Show on calendar`.
- **zh-HK:** the card is fully Chinese (`新增 2 項訓練 · 11月21日 – 11月24日`, `復原 2 項訓練`, `顯示全部 14`), with
  the runner's Chinese session titles unchanged.
- **AX:** page card 11 unique names; dock 16 unique DOM names; no duplicates within either surface (`ax.json`).
- **Contrast:** the undone headline uses `--muted` at 5.55:1; no opacity.
- **Geometry:** no horizontal overflow at 320 (300 px card in a 320 px viewport); the widest action row is 214 px.

## 6. Residual risks and not shipped

- **F10 is partial.** The page card is server-rendered and the dock card is client-built; they share words, dates,
  counted labels and Ask why, but not a renderer. `/chat/history` does not carry `before`/`after`, so the dock's entries
  show the action and title only, while the page card shows the deltas. Exposing the snapshots is the next step if the
  dock must show `15 → 18 km`.
- **F11 was not shipped.** The card still starts below the fold: y 1051 at 1280, 1056 at 390, 1138 at 320. The quiet
  discovery line under the today strip is still the recommended fix.
- **In-place undo and the revert row.** The page card does not append the new revert row until the next load; the dock's
  Changes tab refreshes and shows it, and the no-JS path shows it immediately. This keeps the page card server-rendered.
- **Launcher overlap at 320.** The counted Undo is clear, but the fixed launcher can still cover the right edge of
  `Ask why` when a row's actions sit at the launcher's y (31-38 px of the 57 px link). The left part remains tappable and
  the page scrolls; a future pass could reserve the 82 px gutter for the whole action row.
- **Desktop height.** +3.7% is the price of three named entries; a future density pass could collapse the entry list to
  two rows on desktop, but that weakens F2's "three entries then disclosure".
- **One runner, one dataset, one moment.** The batches are seeded with the gateway's `summarizeChanges` shape, not a
  live model turn; there is no user testing. The next step is still five runners reading the card cold.
- **zh-HK copy.** The new strings follow the catalog's Cantonese-ish register (`復原`, `問原因`, `顯示全部`, `變更於`),
  but a native review of the new copy is still worthwhile.

## 7. Evidence

- Shipped captures: `docs/design/recent-changes/shipped-card-desktop.png`, `-desktop-open`, `-390`, `-320`, `-zh-HK`,
  `shipped-long-batch.png`, `shipped-undo-in-place.png`, `shipped-dock-changes.png`, `shipped-dock-long.png`.
- Machine evidence: `shipped.json` (card/row/action geometry, dock text, post-undo state) and `ax.json` (AX names);
  harness `tmp/recent-changes/shipped.mjs` and `ax-check.mjs` (gitignored).
- Review: [21-recent-changes-review.md](21-recent-changes-review.md); design folder:
  [docs/design/recent-changes/](../../design/recent-changes/README.md).
- Follow-up: [23-all-changes-page.md](23-all-changes-page.md) - the standalone page that reuses this card for schedule.
