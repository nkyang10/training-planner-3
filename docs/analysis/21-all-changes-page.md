# All changes: a standalone page for schedule, runs and muscles (2026-11-22)

**Status.** Shipped. `/changes` is a general, server-rendered page reached from the account menu's **All changes**
item, the calendar card's **See all changes** link and the dock's **Open all changes** link. It has three sections
(schedule, activity, muscle), four counted filters, a filtered summary and its own empty state. `pnpm check` is green at
**566/566 tests in 21 files**. No schema change.

## 1. What shipped

### The page

`/changes` is a projection of the three stores the app already keeps, not a new audit table. The page head reads
**All changes** (`changes.allEyebrow`, `changes.allTitle`, `changes.allIntro`), then a filter row:

- `All 10` · `Schedule 5` · `Activity 3` · `Muscle 2` — server-rendered links (`/changes`, `?type=schedule`,
  `?type=activity`, `?type=muscle`) with the active link carrying `aria-current="page"`.
- The summary is `10 changes` on the All view and `Showing 3 of 10 changes` on a filtered view, so the total and the
  slice are both legible.

The sections are cards, in this order:

- **Schedule changes.** The existing audited card, re-headed for the page (`headingKey: "changes.scheduleTitle"`),
  reading the latest 20 change sets. It keeps the counted Undo, the in-place toast, the `Show all N` disclosure and the
  no-JS form; the form's `next` is `/changes`, and the revert route lands at
  `/changes?undone=N#recent-changes` with the counted banner. The page does not duplicate the raw coach summary.
- **Activity changes.** The latest 30 activities, sorted by `createdAt` (the log or sync time) and labelled
  `Run logged` or `Garmin run synced` by source. Each row links the run day to `/day/<day>`, the title to
  `/activity/<id>`, shows distance/duration/pace/HR and the source chip, and has a `Details` action. The meta is
  `Changed 19 Nov · 2 days ago` via the same `timeMeta` helper as the schedule card.
- **Muscle changes.** The latest 20 check-ins plus every status control, merged and sorted by event time:
  - a check-in says `Muscle check-in`, `for Fri, 20 Nov · 2 muscles · worst: Hamstrings 6/10 · (Tight / stiff)`,
    links to `/muscle?day=<day>` and, when linked, `From this run` to the activity;
  - a control says `Status held`, `Status released` or `Marked all better`, with the muscle short name and the hold or
    resolved detail, and links to `/muscle?focus=<id>#check-in`.

The empty page is a single card: `No changes yet. Book a session, log a run or check in your muscles and it will appear
here.` A non-empty page with one empty section shows that section's own empty line. The footnote is
`Newest first. Schedule changes can be undone; runs and muscle entries open their page.`

### Navigation and entry points

- The account menu (behind the runner's name) gains **All changes** (`account.changes`) between Coaching states and the
  sync item. It is on every page, including the calendar.
- The calendar card's footnote gains **See all changes** (`changes.seeAll`) pointing at `/changes`; the page's own
  schedule card omits the link so it does not point at itself.
- The dock's footer link is now `/changes` with **Open all changes** (`coach.changesAll`); the old
  `/calendar#recent-changes` label is gone.
- The page uses `activeView: "changes"`: `ViewName` gains the value, `navLabel` returns `changes.allTitle`, and
  `renderViewSwitch` keeps the three projection tabs reachable with none selected and no sliding thumb. The page title
  is `All changes · Milebook`; the page context is `All changes`.

## 2. Data model and limits

No table, column or write path changed. The page reads:

| Section | Store read | Order | What the row is |
|---|---|---|---|
| Schedule | `listChangeSets(user, 20)` | `createdAt` desc | an audited coach batch with `before`/`after` and a revert form |
| Activity | `listActivities(user, 30)` | `createdAt` desc (the route sorts) | the latest activity record and its log/sync time |
| Muscle | `listMuscleCheckIns(user, 20)` + `listMuscleStatusControls(user)` | event time desc | the latest check-in or the hold/resolve control |

The schedule rows are an audit: every coach write and every undo is a change set. The activity and muscle rows are
**latest records**, not edit logs: a re-synced Garmin run updates its row, and a check-in is a dated report. The page
does not pretend otherwise; the intro says "Schedule edits, logged runs and muscle check-ins". A true edit log for runs
and muscles would need a new audit table, which is out of scope for this slice.

The page is limited to the latest 20 schedule batches, 30 runs and 20 check-ins plus all controls; there is no
pagination. The counts in the filters and the summary reflect the rows actually shown.

## 3. Files and tests

- **`src/web.ts`**: `ChangesFilter` and `CHANGES_FILTERS` (`:676`), `changesFilterHref`/`changesFilterBar` (`:691`),
  `activityEventRow` (`:709`), `muscleCheckInRow` (`:722`), `muscleControlRow` (`:740`), `renderChangesPage` (`:764`),
  the `/changes` route (`:4719`), `RecentChangesCardOptions` (`:623`), `timeMeta` (`:554`), `safeNext` (`:229`,
  now accepts `/changes` and `/changes?…`), `renderViewSwitch` (`:2204`) and the account-menu item (`:1828`).
- **`src/web-html.ts`**: `ViewName` gains `"changes"`.
- **`src/i18n.ts`**: the page copy (`changes.allTitle` at `:774`, `changes.filterSummary` at `:778`, the section,
  filter, event and status keys), `account.changes` (`:63`) and `coach.changesAll` (`:97`), in en and zh-HK.
- **`src/styles.ts`**: `.filter-bar`/`.filter-pill`/`.filter-count` (`:765`), `.event-list`/`.event-item`/`.event-head`/
  `.event-detail`/`.event-actions` (`:775`), `.change-see-all` (`:762`), and the focus rings.
- **`test/web.test.ts`**: `renders the all-changes page across schedule, activity and muscle` (the three sections, the
  counted filters, `Showing 1 of 4 changes`, the account menu, the nav with no `aria-current`, the no-JS undo landing)
  and `shows the all-changes empty state and the account-menu entry`; the calendar card's `See all changes` link; the
  dock label assertions updated to `Open all changes` / `查看所有變更`.
- **`test/i18n.test.ts`**: `changes.allTitle`, `changes.filterSummary` and `account.changes` in both locales.
- **`test/muscle-web.test.ts`**: the cross-runner leak assertion now checks the specific `Calves 7/10` row instead of the
  generic `1 muscle`, which is now also part of the client-side change copy.

`pnpm check`: **566/566 tests in 21 files**, lint and `tsc --noEmit` clean.

## 4. Measured (seeded runner)

| Measure | 1280x900 | 390x844 | 320x700 |
|---|---|---|---|
| Document height | 2075 px | 2512 px | 2707 px |
| Schedule card | 897 px | 1208 px | 1324 px |
| Activity card (3 rows) | 380 px | 438 px | 438 px |
| Muscle card (2 rows) | 284 px | 304 px | 304 px |
| Horizontal overflow | none | none | none |
| Filters | `All 10` / `Schedule 5` / `Activity 3` / `Muscle 2` | same | same |

The filtered views are short: the Activity page is 900 px with a 380 px card and `Showing 3 of 10 changes`; the Muscle
page is 900 px with a 284 px card and `Showing 2 of 10 changes`. The account menu opened with
`aria-expanded="true"` and `hidden` removed. The page title is `All changes · Milebook` (`所有變更 · Milebook`); the
zh-HK summary is `10 項變更`. The three nav tabs carry no `aria-current`; the page's active filter does.

## 5. Verification

- `pnpm check` green at **566/566** in 21 files.
- The page test seeds one change set, one Garmin activity, one check-in and one held control, then asserts the three
  section ids, the `4 changes` summary, the schedule headline and `name="next" value="/changes"`, the activity title and
  `/activity/garmin%3Aall-1`, the `Hamstrings 6/10` and `held until you change it` rows, the three filter hrefs and the
  nav slice with no `aria-current`.
- The three filtered views keep only their own section id and report `Showing 1 of 4` / `Showing 2 of 4` /
  `Showing 1 of 4`.
- The no-JS undo posts `next=/changes`, redirects to `/changes?undone=1#recent-changes`, and the landing page shows the
  counted banner and the schedule card.
- The empty page shows `changes-empty-card` and no section ids; the calendar page contains the `/changes` account link.
- The calendar card's `See all changes` link and the dock's `Open all changes` link are asserted.
- Captures: the account menu, the two filters, the zh-HK page, 390 and 320 with no horizontal overflow
  (`docs/design/changes-page/`).

## 6. Limits and next

- **Projection, not an audit.** Runs and muscle rows are latest records; a re-sync or a new check-in overwrites the
  visible timestamp. A real edit log needs a schema change and write-path hooks.
- **Latest N, no pagination.** 20 schedule batches, 30 runs, 20 check-ins plus controls. A future pass could add a
  "Load more" or a period picker, as the training log has.
- **The page is long at 1280** (2075 px). The filters and section cards make it navigable, but the schedule card still
  dominates; a compact schedule mode or a section jump bar is the next density lever.
- **No fourth nav tab.** The page is reached from the account menu, the calendar card and the dock; the three projection
  tabs stay visible with none selected. This is deliberate (the user asked for the account-menu entry), but a tab would
  make the page more discoverable.
- **Activity action copy.** The row's action is the generic `Details`; the title link is the primary route to the run.
  "Open run" would be clearer in a future copy pass.
- **Muscle controls show only hold/resolve.** The derived level and conditions live on the muscle page; the changes row
  names the muscle and the control state, not the full status.
- **One runner, one seeded dataset, one moment.** No user testing; the next step is still runners reading the page cold.

## 7. Evidence

- [docs/design/changes-page/](../../design/changes-page/README.md) — the nine captures, the account menu, the two
  filters, the zh-HK page and `changes-page.json` (filters, section/document heights, overflow, nav and account items).
- [20-recent-changes-implementation.md](20-recent-changes-implementation.md) — the schedule card this page reuses.
- [19-recent-changes-review.md](19-recent-changes-review.md) — the review that produced the card.
- Harness (gitignored): `tmp/recent-changes/changes-page.mjs`; the seed now adds the activity, check-in and held-status
  rows.
