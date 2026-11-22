# All changes page evidence (2026-11-22)

The standalone `/changes` page, reached from the account menu (and from the calendar card's `See all changes` and the
dock's `Open all changes`). It is a read-only projection of three existing stores, not a new audit table: the schedule
journal is audited, while a run or a muscle check-in is the latest record with its own timestamp. The page has three
sections, server-rendered filters and no new navigation tab: the three projection tabs stay reachable with none selected.

The runner is the seeded `Ada Runner` (Asia/Taipei, fixed clock 2026-11-21 20:00, en + zh-HK): five coach batches,
three Garmin runs, one two-muscle check-in and one held status. All data is synthetic; the account and database are
scratch (`tmp/recent-changes/scratch.sqlite`), never the live one.

| Image | What it shows |
|---|---|
| `changes-1280-top.png` | The page at 1280x900: eyebrow, title, intro, four counted filters, summary and the schedule card. |
| `changes-1280-full.png` | The full page (2075 px): schedule, activity and muscle sections plus the footnote and footer. |
| `changes-1280-account.png` | The account menu open: `Profile`, `Coaching states`, **`All changes`**, sync, Garmin key, export, sign out. |
| `changes-1280-activity.png` | The Activity filter: `Showing 3 of 10 changes`, three `Garmin run synced` rows with day, title, metrics and source. |
| `changes-1280-muscle.png` | The Muscle filter: `Showing 2 of 10 changes`, a held status and the two-muscle check-in summary. |
| `changes-zh-HK-top.png` | The same page in Traditional Chinese: `所有變更`, `全部 10`, `計劃 5`, `活動 3`, `肌肉 2`, `10 項變更`. |
| `changes-zh-HK-full.png` | The full zh-HK page, including the activity and muscle sections. |
| `changes-390.png` | Phone 390x844 (2x): the page and schedule card; the four filters still fit on one row. |
| `changes-320.png` | Small phone 320x700 (2x): the page, filters and schedule card; no horizontal overflow. |

**Measured**

| Measure | 1280x900 | 390x844 | 320x700 |
|---|---|---|---|
| Document height | 2075 px | 2512 px | 2707 px |
| Schedule card | 897 px | 1208 px | 1324 px |
| Activity card (3 rows) | 380 px | 438 px | 438 px |
| Muscle card (2 rows) | 284 px | 304 px | 304 px |
| Horizontal overflow | none | none | none |
| Filters | `All 10` / `Schedule 5` / `Activity 3` / `Muscle 2` | same | same |

The filtered views are short: the Activity page is 900 px (the viewport) with a 380 px card and `Showing 3 of 10
changes`; the Muscle page is 900 px with a 284 px card and `Showing 2 of 10 changes`. The account menu opened with
`aria-expanded="true"` and `hidden` removed. The page's title is `All changes · Milebook` (`所有變更 · Milebook` in
zh-HK). The three nav tabs carry no `aria-current`; the page's own filter link does.

**Limits.** The page reads the latest 20 schedule batches, 30 runs and 20 muscle check-ins (plus every status control);
it is not paginated and it does not claim to be the complete edit history. Activity rows show the latest record and its
`createdAt` (the log or sync time); muscle rows show the latest check-in plus the hold/resolve controls. A true edit log
for runs and muscles would need a new audit table, which is out of scope for this slice. The schedule card keeps its
audited undo; the activity and muscle rows link to their pages instead. The full record is
[21-all-changes-page.md](../../analysis/21-all-changes-page.md).

**Harness** (gitignored `tmp/recent-changes/`): `changes-page.mjs` logs in, captures the page at 1280/390/320 in en +
zh-HK, the account menu, the two filters and writes `changes-page.json`; the scratch `seed.ts` now also adds the
activity, check-in and held-status rows. Headless Chrome 158 via CDP on :9223.

**Machine evidence:** `changes-page.json` (filters, section heights, document heights, overflow, account items, nav
tabs, filtered summaries). UTF-8 JSON, straight from the harness.
