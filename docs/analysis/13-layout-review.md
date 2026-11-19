# POC3 — page-layout review and the coach dock

**Status:** review + implemented slice. The coach bubble is now a **docked coach column on wide screens** and a
**tabbed sheet below 1200 px**; the panel itself is grouped into **Chat / States / Changes**. Verified 2026-11-20
with 511 tests, typecheck, lint and a headless-Chrome capture pass. **Date:** 2026-11-20.
**Lens:** 排版 — hierarchy, density, above-the-fold composition, scan path, responsive wrapping and the
relationship between the page and the coach overlay — judged page by page against what a runner actually does.
**Relation to earlier work:** builds on [10-uiux-design-review.md](10-uiux-design-review.md) (UX-22 measured the
overlay covering the grid; UX-12/UX-14 measured the popup stack and state cards) and on the localization slice that
landed the same day (en + zh-HK). This pass adds the missing **page-composition** review and ships the coach
regrouping; it does not repeat the earlier contrast/touch-target work.

## 1. Method and evidence

The app was booted on an in-memory demo runner (one realistic November: matched and unmatched runs, a paired Garmin
workout, a change set, active + proposed coaching states, a muscle check-in) and captured in headless Chrome over
CDP at **1280×900 desktop** and **390×844 phone** (device scale 2), plus a **1024×768 tablet** check. Every page was
shot closed and with the coach open, and the three coach tabs were exercised (click and keyboard), as were
**Escape**, **Ask coach** focus and an **in-place undo**. A DOM probe recorded geometry per state:

- panel and main rects, overlap area, computed `position`, month-card rect, tab-strip rect, tab button rects;
- chat log `clientHeight`/`scrollHeight`, page/scroll heights;
- tab state (`aria-selected`, `tabIndex`, active panel), badge text, watermark value, `activeElement`;
- `Runtime.exceptionThrown` was collected for every page: **0 exceptions**.

Evidence images: [docs/design/layout-review](../design/layout-review/) — before/after composites, the three-tab
dock, and the phone sheet. Raw captures and probes are gitignored under `tmp/layout-review/`.
The **before** shots were taken before the en/zh-HK slice finished, so their copy is Traditional Chinese; compare
geometry, not language. The after shots are English.

## 2. What changed in the coach surface (summary)

| | Before | After |
|---|---|---|
| Desktop placement | `position: fixed`, 380×864 at x 882–1262, **on top of** the page (y 18, over the app bar) | docked column **beside** the page: 340×800 at x 922–1262, y 84; content reflows |
| Desktop overlap | **242,572 px²** (298 px of a 1,080 px main; 26 % of the 1,002 px month card) | **0 px²** |
| Month card at 1280 | 1,002 px wide | 826 px wide (at 1440: ≈988 px, effectively unchanged) |
| Chat log at 900 px viewport | 640 px tall | 493 px tall (tab strip costs 45 px + header rhythm) |
| Tablet 1024 | 380 px overlay, 42 % of the card | 380 px drawer under the app bar (overlay by design); content scroll locked |
| Phone | 378×808 takeover at y 30, over the top bar, one 32 px “−” | 378×832 sheet at y 6 with tabs, a visible **×**, scroll locked |
| Panel groups | one scroll column: messages, state cards, guardrails, suggestions, composer | **Chat / States / Changes**, one visible at a time, counts on States (proposed) and Changes (unseen) |
| Undo | only on the calendar’s Recent changes card (full reload) | also in the Changes tab, **in place**; the page card is updated too |
| Active states | never shown from history (only proposals in the log) | persistent States tab with Confirm / Dismiss / Resolve / Discuss |
| Ask coach focus | always focused the textarea (phone keyboard over the answer) | focuses the active tab; the composer is focused only when the runner opens the launcher |

## 3. Per-page layout review

Severity: **P1** blocks daily use or comprehension; **P2** flow/consistency. Effort: S (<1 h), M (half day), L.
“Above the fold” is 1280×900 / 390×844 unless stated.

### Calendar — Plan (`/calendar`)

**Verdict:** strong rows and a real “today” answer, but the page head eats a quarter of the first screen before the
month grid starts. **Above the fold:** page head + today strip + 1.5 weeks of the month (desktop); app bar + head +
today strip + one week (phone).

- **P1 — the head is a stack of six blocks (217 px).** Eyebrow, 44 px h1, welcome, a 60-word legend sentence, action
  chips and state chips push the month card to y 480 (closed) / 497 (docked) at 900 px; on the phone the grid starts
  at y 620 of 844. The legend still teaches in prose (UX-06 only partly landed). **Fix (M):** h1 + one welcome line +
  a three-swatch legend row (planned / recorded / run+program), state chips in one horizontally scrollable row;
  target grid ≤360 px from the top on desktop and ≤520 px on the phone. [styles.ts](../../src/styles.ts) page-head
  and `.cal-legend`; [web.ts](../../src/web.ts) calendar body.
- **P2 — the coach launcher floats over the last row of the grid.** At the bottom-right the 48 px pill can sit on
  top of a cell’s `+n more` row. **Fix (S):** reserve a bottom-right safe corner in the grid card (padding) or dock
  the launcher to the card edge.
- **P2 — mobile cells are 46.8 px wide** (328 px grid / 7) with 15 px rows; titles truncate to “✓ Mornin…”. The real
  fix is the planned week view (I-09); until then the dock does not touch this, and the phone sheet keeps the grid
  readable when the coach is closed.
- **Shipped:** the dock removes the overlay (the runner now watches the coach edit every cell), and the panel no
  longer covers the bell/account in the app bar.

### Day (`/day/<date>`)

**Verdict:** the cleanest page in the product; h1 is now human (“Tue, 17 Nov 2026”). **Above the fold:** header,
“Booked by the coach”, “Recorded activities”; the log form starts below 900 px on the phone.

- **P2 — the session card has no primary action.** The runner sees the intent line but no Ask coach / View plan in
  the card; the coach is a floating pill. **Fix (S):** put Ask coach + View plan in the card head, matching the
  today strip.
- **P2 — the subline mixes an ISO date, the runner and a Profile link** (“2026-11-17 · Ada Runner · Profile”). The
  Profile link is a different job on a day page. **Fix (S):** “Tue, 17 Nov 2026 · Ada Runner” and drop the link.
- **P2 — the log form is a full-width five-field row**; on the phone it is a long stack after the two cards.
  **Fix (S):** a collapsible “Log a run” disclosure, collapsed when a run already exists.

### Training log (`/history` week / month / year)

**Verdict:** honest and complete, but the page answers the least urgent question first. **Above the fold:**
summary stat row + load card; the week’s day cards start after the trend card.

- **P1 — the week rows are buried under three summary cards.** At week view the page is **2,198 px** tall on desktop
  and **2,585 CSS px** on the phone; summary → load → trend → day cards. A runner opening “this week” wants the
  seven days first. **Fix (M):** summary row → **day cards** → load/trend; or put load/trend in a second tab
  (“Review”) under the period switch. Reuse the existing card components; no data change.
- **P2 — the trend card is a card of chips plus a chart of panels**, visually heavier than the week it explains.
  **Fix (S):** collapse it to a 2-row strip when the period has fewer than two runs (the empty state already says
  “Need at least two runs…”).
- **P2 — the period switch sits in the page head as a second segmented control** beside the app-bar switch; on the
  phone the two controls wrap into three rows. **Fix (S):** one control per job: app bar = Plan/Log/Muscles;
  page = Week/Month/Year, sticky under the app bar.

### Activity detail (`/activity/<id>`)

**Verdict:** the best content in the product, in the longest column. **Above the fold:** title, four stat cards,
plan-vs-actual, the start of the Garmin program. The muscle card, splits, laps, zones and Ask coach are below.

- **P1 — every card is full width in one column (2,233 px at 1280).** Garmin program and muscle card are both
  tall; splits and laps are tables that fit side by side. **Fix (M):** at ≥1024 use a two-column card grid
  (`grid-template-columns: 1.15fr .85fr`) for program / muscles / splits / laps; keep metrics and plan-vs-actual
  full width.
- **P1 — Ask coach is the last card on the page.** It is the natural next step after the plan comparison.
  **Fix (S):** a head action beside the date plus the existing bottom card.
- **P2 — the muscle card repeats its full 3D viewer** and pushes the splits further down. **Fix (S):** on the
  activity detail show the worked-muscle chips + a “Check in” link by default; the viewer behind “Show figure”.

### Muscle (`/muscle`)

**Verdict:** the status layer reads well, but the first interactive surface is below the fold. **Above the fold:**
page head + status card (2 muscles) + the start of the check-in card; the 3D figure is below 900 px.

- **P1 — status card, check-in form and 3D viewer are stacked.** The runner must scroll to the figure before
  selecting a muscle. **Fix (M):** at ≥1024, two columns: status/reading rail (360 px) + check-in figure (fluid);
  the figure becomes visible at load. On the phone keep the stack but collapse the status card to one summary row.
- **P2 — the plugin tab strip (“3D figure / List”) sits inside the form**, below the card heading; the list is the
  no-script/keyboard path but is not visible as an alternative until the form is reached. **Fix (S):** move the tab
  strip to the card head.
- **P2 — the “Honest notes” card and the per-muscle knowledge panel are long prose blocks** at the bottom.
  **Fix (S):** disclosure rows.

### Coach states page (`/coach-states`)

**Verdict:** careful and complete (1,722 px), but it now duplicates the dock’s States tab. **Above the fold:**
active + proposed cards; set-state form and history below.

- **P2 — two equal-weight sections plus a form plus history in one column.** **Fix (S/M):** tabs (Active / Proposed /
  History) or a two-column grid; keep the counts line.
- **P2 — the set-state form uses a 120 px label column** and a 7-day number input; it is the least-used block but
  the tallest. **Fix (S):** disclosure under the cards.

### Profile (`/profile`)

**Verdict:** clean single card; the best “quiet” page. **Above the fold:** everything.

- **P2 — the bottom link row is a run-on**: “Garmin connection - Export my data (/JSON) · Calendar export (.ICS)”.
  **Fix (S):** three labeled rows (Muscle check-ins, Coaching states, Data) with one link each.

### Login / signup (`/login`, `/signup`)

**Verdict:** a centered narrow card; no layout defect. The signup still asks for an **IANA timezone string**
(UX-09) and neither password field has the Show/Hide the Garmin key form has (UX-25). **Fix (S):** a zone select
prefilled from `Intl.DateTimeFormat().resolvedOptions().timeZone`, and one password toggle shared with the Garmin
form. (Not changed in this slice.)

### Coach panel — before the change

**Verdict:** the pattern is right; the composition was wrong on every page. The 380 px overlay covered the right
third of the grid, sat over the app bar, and on the phone was a takeover with one 32 px “−”. The single scroll
column mixed four objects with different lifecycles (conversation, durable decisions, audit trail, transient
status), so a proposal was safe only while it was last; active states never rendered; Undo lived only on the
calendar; and Ask coach popped the phone keyboard over the answer.

## 4. The coach dock: design and shipped behavior

Three options were scored (coverage, chat space, discoverability, implementation risk, mobile):

| | Coverage | Chat | Discoverability | Risk (5 = safe) | Mobile | Total |
|---|---|---|---|---|---|---|
| A — tabs only, floating panel | 3 | 4 | 4 | 4 | 2 | 17 |
| B — docked rail everywhere | 5 | 5 | 5 | 2 | 1 | 18 |
| **C — hybrid: dock ≥1200, drawer 721–1199, sheet ≤720** | **5** | **4** | **5** | **3** | **5** | **22** |

**C shipped.** The breakpoint is 1200 px because a dock at 1024 would leave ~77 px month cells (unusable), while at
1280 the page keeps a 826 px month card and at 1440 the card is back to ≈988 px (baseline 1,002 px). The phone keeps
a full sheet: there is no side-by-side room, so the tabs are what make the sheet navigable.

### Information architecture

- **Chat** — the conversation, the pending-proposal cards, the suggestion rail and the composer. The only tab with a
  composer.
- **States** — every non-resolved coaching state, **proposed first**, then active. Confirm / Dismiss / Resolve /
  Discuss; the consequence note (`uiNote`) rides with each card. Footer: “All coaching states”. The badge counts
  **proposed** states only — an active state is context, not an alert.
- **Changes** — the five latest change sets, newest first: summary, date, entries (Add / Moved / Update / Delete with
  from → to days), **Undo this change**, Discuss, Show on calendar. The badge counts **unseen** batches since the
  last time the tab was opened (localStorage watermark), not every batch that can still be undone.
- **Not tabs:** Today (the server-rendered today strip already answers it), notifications (the bell owns sync),
  Muscles (its own app-bar tab), profile/settings, coach audit. A fourth tab would have duplicated a surface or
  mixed two consequence models (confirm vs undo).

### Interaction details shipped

- A real `role="tablist"` with roving `tabindex`, `aria-selected`, `aria-controls`, `role="tabpanel"`, Left/Right +
  Home/End, and automatic activation.
- **Open:** the panel reflows the page (desktop) or becomes a sheet (below 1200); the active tab is focused. Ask
  coach does **not** focus the textarea, so the phone keyboard stays down; a deliberate launcher click does focus
  the composer.
- **Close:** `−` minimizes the docked column; the floating drawer/sheet shows a visible **×** (same action). Escape
  closes the panel and returns focus to the launcher; the existing one-popup stack is preserved.
- **Undo in place:** the audited revert runs via fetch, the dock card dims to “Undone”, the calendar grid refreshes,
  the server-rendered Recent changes card loses its Undo form (matched by `data-change-set`), a toast confirms, and
  the Changes tab re-reads the journal. No reload, no lost conversation.
- **Cross-tab freshness:** after every turn the dock re-reads `/chat/history` (now one request: messages, states and
  changes) so the two context tabs stay in step with the reply and the calendar.
- **Badges:** States = proposed count; Changes = unseen count, cleared when the tab is opened. Both carry a title
  and the count is part of the tab’s accessible name.

### Measurements (after)

| State | Panel | Page | Overlap |
|---|---|---|---|
| Desktop 1280×900 | 340×800 at x 922–1262, `position: static`, sticky | main 904 px, month card 826×654, grid y 497 | **0** |
| Tablet 1024×768 | 380×680 at x 632–1012, fixed drawer under the bar | main 1024, scroll locked | 258,400 px² (overlay by design) |
| Phone 390×844 | 378×832 at x 6, y 6, fixed sheet, scroll locked | — | full sheet |

## 5. Verification

- `pnpm check` green: lint, `tsc --noEmit`, **511 tests in 21 files**. Two tests are new (the Chinese dock labels and
  the `/chat/history` change journal); the existing bubble test gained the dock/tab/CSS assertions and the
  `data-change-set` hook.
- Headless Chrome: 0 JS exceptions across **27 page states**; probes confirmed dock overlap 0, static panel, tab click
  and ArrowRight selection, badge clearing on the Changes tab, in-place undo marking **both** the dock card and the
  Recent changes card, Escape closing to the launcher, and Ask coach leaving focus on the tab (no textarea focus).
- Screenshots: [before/after desktop](../design/layout-review/before-after-coach-dock.png),
  [the three tabs](../design/layout-review/coach-dock-tabs.png),
  [before/after phone](../design/layout-review/before-after-coach-mobile.png).
- Live redeployed 2026-11-20: `/login` serves `app.css?v=26`, the stylesheet carries `.coach-dock`, `.coach-tabs`
  and `body.coach-open`, and gateway `/health` is 200. The deploy gate now checks those dock styles and the v26 link.

## 6. Top layout fixes, ordered by impact

1. **Dock the coach beside the page on wide screens** — shipped; removes 242,572 px² of covered content.
2. **Group the coach into Chat / States / Changes** — shipped; active states and Undo are reachable from every page.
3. **Give the phone a tabbed sheet with a visible close** — shipped; no more takeover with one 32 px “−”.
4. **Compact the calendar head** (h1 + one line + swatch legend; state chips in one row) — pending, M; moves the
   month grid up ~140 px.
5. **History: week days before load/trend cards** — pending, M; the page currently opens on summaries, not the week.
6. **Activity detail: two-column secondary cards + Ask coach in the head** — pending, M; cuts ~500 px.
7. **Muscle: status rail + 3D figure side by side** — pending, M; the first control is below the fold today.
8. **Day/profile/state-page polish** (session actions, drop the Profile link from the day subline, labeled profile
   links, disclosure for the log/set-state forms) — pending, S each.

## 7. What is deliberately left for the next slice

- A context chip above the transcript naming the Ask-coach origin (day/run/state), and a cross-tab “Coach replied”
  bar when a reply lands while the runner is on States or Changes. The counts are the cheap 80 %.
- A sheet with three snap points (148 / 55dvh / 92dvh) and `visualViewport` handling on iOS; today the sheet is one
  full-height state with scroll lock.
- Refreshing the server-rendered today strip and state chips after an in-place undo (the grid refreshes; the strip
  is still first-paint until reload).
- Clamping day-menu/peek popups to the main column instead of `innerWidth` under a dock.
- Extracting `renderChatBubble()`’s ~1,300-line inline script into a module; the tab logic is tested through the
  rendered page and the browser probe, not a unit seam.
- The remaining structural mobile gap: a week/agenda plan view under 640 px (I-09), which no coach layout can fix.
