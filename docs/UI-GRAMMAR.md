# UI grammar
**Status:** current · **Owner:** web UI · **Updated:** 2026-11-22 · **Supersedes:** docs/analysis/13-layout-review.md, docs/analysis/14-uiux-layout-research.md

Server-rendered HTML, one CSS template literal, inline classic scripts. No client framework, no client build step: every rule below is visible in the served HTML and in `app.css`. Sources of truth are `src/styles.ts` (the `CSS` template literal), the view builders (`src/web.ts` · `layout`, `renderChatBubble`, `renderChangesPage`, `renderAuthPage`, and the page bodies inside `createWeb`), `src/web-muscle.ts`, `src/web-coach-states.ts` and `src/i18n.ts`. The two superseded analysis files supply rationale and measurements only — never behaviour truth. Cite by symbol, never by line.

Related: [PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md) · [COACHING-STATES.md](COACHING-STATES.md) · [TESTING.md](TESTING.md) · [ASSET-PROVENANCE.md](ASSET-PROVENANCE.md).

## 1. The layout grammar

Render order (`(src/web.ts · layout)`):

| Element | Contract | Selector (all in `src/styles.ts`) |
|---|---|---|
| App bar | sticky, 1px rule, blurred white; brand + view switch + actions | `.top` |
| Brand | 22 px inline SVG mark + wordmark, links to `/calendar` | `.brand`, `.site-mark` |
| View switch | Plan / Training log / Muscles; rendered only when the page names a view | `.view-switch` |
| Page column | max 1080 px, `24px 18px 80px`, grows so the footer sits low | `main` |
| Page head | one eyebrow, one `h1`, one muted line — never a stack of blocks | `.page-head`, `.eyebrow` |
| Card | white surface, 1 px line, 20 px radius, 20 px padding, shadow, 18 px bottom gap | `.card` |
| Footer | tagline + privacy and credits links + language switch, pushed down by `margin-top: auto` | `.site-footer`, `.footer-credits` |
| Coach | `aside.coach-dock` after `</main>`; closed it has no box | `.coach-dock` |

`body` is a flex column at `min-height: 100vh` (`.top`, `body`, src/styles.ts); `.app-shell` wraps `main` + dock so the coach can become a grid column without moving the page (`.app-shell`, src/styles.ts). `layout()` writes `data-site-name`, `data-locale`, `data-page-context`, `data-active-view`, `data-timezone` on `<body>`; client scripts read those attributes instead of receiving JSON (`(src/web.ts · layout)`).

The rendered skeleton — every page body slots into `<main>`, nothing else changes:

```
<!doctype html><html lang dir>
<body data-locale data-page-context data-active-view data-timezone>
  <nav class="top"> .brand · .view-switch · .top-actions </nav>
  <div class="app-shell">
    <main> flash banner + page body </main>
    <aside class="coach-dock"> #coach-bubble + #coach-panel </aside>
  </div>
  <footer class="site-footer"> tagline + .footer-credits (/privacy, /credits) + .lang-switch </footer>
  scripts: __I18N__, notifications, account menu, muscle badge, track
```

**One job per screen.** A page shows one job per visible group, and tabs are used only when the groups have different lifecycles — read vs write (`docs/analysis/13-layout-review.md` §6). Shipped consequences: the today hero has exactly one primary action plus at most one quiet fallback (`.today-strip .btn`, `.entry-quiet-link`, src/styles.ts); the activity head has one coach action plus navigation chips (`.head-actions`, src/styles.ts); the training log, the states page and the coach panel each show one panel at a time; a day cell caps at four rows and collapses the rest into a hint (`CALENDAR_CELL_MAX_ITEMS`, `(src/calendar-items.ts · renderCalendarItems)`).

**Segmented controls** — five deliberately different variants:

| Pattern | Markup | Selection | Script needed |
|---|---|---|---|
| View switch | `<nav>` + `<a class="view-tab">` + `.view-thumb` | `data-active` translates the thumb; `aria-current="page"` | no (`(src/web.ts · renderViewSwitch)`) |
| Period modes | `<a class="period-mode">` inside `.period-modes` | `.active` + `aria-current="page"` | no |
| Filter pills | `<a class="filter-pill">` inside `.filter-bar` | `.active` + `aria-current="page"` | no |
| Page tabs | native radios `.seg-input` + `.seg-labels` + `.seg-panels` | `:checked ~ .seg-label:nth-child(n)` / `:checked ~ .seg-panel:nth-child(n)` | no |
| Trend picker | radios `.trend-radio` + labels `.trend-chip` | `:has(#trend-metric-*:checked)`, `data-default` fallback | no |

`.seg-tabs` is the canonical page-level pattern (`.seg-tabs`, `.seg-labels`, `.seg-label`, `.seg-panel`, src/styles.ts). Its ARIA contract: the wrapper carries `role="radiogroup"` and `aria-label`; the inputs are real radios sharing one `name`; each `.seg-label` is a `<label for>`; the inputs are visually hidden but focusable, and focus is proxied to the label (`.seg-tabs > .seg-input:focus-visible ~ .seg-labels > .seg-label:nth-child(n)`, src/styles.ts). It uses no `aria-controls` and no `aria-selected` — those belong to the dock's ARIA tabs, not to radios. With script, a change writes `?tab=` with `pushState` and `popstate` restores the checked radio; without script the radios still switch panels through CSS alone (`(src/web.ts · renderChatBubble)` script block). CSS enumerates segments 1–4, so a fifth segment needs new selectors.

## 2. Breakpoints

Every media query in the stylesheet, and what changes at each width:

| Width | What changes | Selector (all in `src/styles.ts`) |
|---|---|---|
| ≥1200 px | Coach becomes a 340 px dock column beside the page; launcher hidden | `@media (min-width: 1200px)` |
| ≤1199 px | Coach floats as a drawer under the bar; × replaces −; page scroll locked | `@media (max-width: 1199px)` |
| ≤720 px | Drawer becomes a full sheet inset 6 px; launcher shrinks | `@media (max-width: 720px)` |
| ≥1024 px | Activity gets two peer columns; muscle rail sits beside the check-in figure | `@media (min-width: 1024px)` |
| 1024–1199 px | With the coach open, activity and muscle columns stack again | `@media (min-width: 1024px) and (max-width: 1199px)` |
| ≤820 px | Today hero with art becomes one column; mark 84×64 | `@media (max-width: 820px)` |
| ≤780 px | Muscle workspace (figure \| editor) becomes one column; viewer 380/300 px | `@media (max-width: 780px)` |
| ≤640 px | The mobile block: app bar wraps with the switch on its own row, cells 78 px, pills 9.5 px, 2-up stat grids, single-column log/trend/plan grids, peek 72 vh, footer centred, audit stats and state form single column | `@media (max-width: 640px)` (eleven blocks) |
| coarse pointer | Calendar rows grow to a 30 px target | `@media (pointer: coarse)` |
| print | App bar, notifications, account, modal, month nav, forms, buttons and art hidden | `@media print` |
| ≥981 px | Sign-up density pass (smaller type, 48 px inputs) | `@media (min-width: 981px)` |
| 981–1120 px | Auth panel padding-inline 28 px | `@media (min-width: 981px) and (max-width: 1120px)` |
| ≥981 px & ≤840 px tall | Inputs 44 px, tighter rhythm, primary action above the fold | `@media (min-width: 981px) and (max-height: 840px)` |
| ≥981 px & ≤760 px tall | Tighter still (padding, head, foot) | `@media (max-height: 760px) and (min-width: 981px)` |
| ≤980 px | Story becomes a 40 vh brand band; the form becomes a rounded sheet; the error title gains a " ·" suffix | `@media (max-width: 980px)` |
| 641–980 px | Error banner kept to one line: flex row, 12 px title and message | `@media (min-width: 641px) and (max-width: 980px)` |
| 641–980 px & ≤860 px tall | Band 32 vh, proof row hidden | `@media (min-width: 641px) and (max-width: 980px) and (max-height: 860px)` |
| ≤640 px | Story 36 vh, sheet −24 px, inputs 50 px, submit 52 px | `@media (max-width: 640px)` (auth) |
| ≤480 px & ≤740 px tall | Story 30 vh, subtitle hidden | `@media (max-width: 480px) and (max-height: 740px)` |
| ≤380 px | Story title 29 px, object 150 px, 15 px panel padding | `@media (max-width: 380px)` |
| zh-HK | Display type gets more air: title, subtitle, head line-height | `.auth-page[lang="zh-HK"]` |

Two corrections worth keeping: **there is no 320 px media query.** The narrowest width query is 380 px, and it is auth-only. 320 px is the WCAG 2.2 SC 1.4.10 reflow floor, verified by capture with zero horizontal overflow (`docs/analysis/13-layout-review.md` §9–§10), not a breakpoint — the app reaches it by wrapping (`.top { flex-wrap: wrap }`, `.seg-labels { flex-wrap: wrap }`, `.seg-label { overflow-wrap: anywhere }`, src/styles.ts). Second, **1024 px is where two columns start, not where they stack**; the stack exists only in the `body.coach-open` override at 1024–1199 px, because the dock removes 340 px from the content area (`body.coach-open .activity-columns`, `body.coach-open .muscle-layout`, src/styles.ts).

## 3. Coach dock, drawer and sheet

| Mode | Width | Geometry | Close control | Page |
|---|---|---|---|---|
| Dock | ≥1200 px | static column in `.app-shell` grid, `position: sticky; top: 84px` | − minimize (× hidden) | reflows, nothing covered |
| Drawer | 721–1199 px | fixed, `top: 76px; right: 12px; bottom: 12px`, width `min(380px, 100vw - 24px)` | × (minimize hidden) | scroll locked + inert |
| Sheet | ≤720 px | fixed, inset 6 px, radius 18 px | × | scroll locked + inert, app bar too |

Reflow, dock only: `body.coach-open .app-shell` becomes `grid-template-columns: minmax(0, 1fr) 340px` with an 18 px gap; `#coach-panel` goes `position: static`, full width and height; `#coach-bubble` is hidden (all `src/styles.ts`). Closed, `.coach-dock { display: contents }` costs no layout shift and only the fixed launcher `#coach-bubble` is visible; its pending-decision badge is `.coach-pending-badge`.

**Inert handling** (`(src/web.ts · renderChatBubble)` script, `syncCoachInert`): while the panel is open and `matchMedia('(max-width: 1199px)')` matches, `inert` is set on `.app-shell > main` and `.site-footer`; at `matchMedia('(max-width: 720px)')` it is also set on `nav.top`, because the sheet covers the app bar while the drawer starts below it. The dock at ≥1200 px leaves the page focusable. A `resize` listener resyncs, so rotating a tablet cannot leave a stale inert page.

**Focus.** Opening adds `body.coach-open`, sets `aria-expanded="true"`, focuses the selected tab (never the composer — an "Ask coach" turn sends itself and must not pop the phone keyboard over the answer; a deliberate launcher click passes `focusComposer`), syncs inert and loads history. Closing hides the panel, restores `aria-expanded="false"`, removes the class, resyncs inert and returns focus to `#coach-bubble` (`minimizePanel`).

**Escape** is one document handler that closes one layer per press, topmost first: activity/session peek → month picker → day menu → coach panel (`minimizePanel`, so focus lands back on the launcher).

**Tabs vs page tabs.** The panel is one coach surface in three groups. `role="tablist"` + three `role="tab"` buttons carry `aria-selected`, `aria-controls` and roving `tabindex` (selected 0, others −1); three `role="tabpanel"` panels carry `aria-labelledby` and are toggled with `hidden`; Left/Right/Home/End move and wrap, and the count badge `.coach-tab-count` disappears at zero (`.coach-tabs`, `.coach-tab`, `.coach-tab-count`, src/styles.ts). This is a real ARIA tab widget with script. Page-level segmented controls are radios with CSS only (§1) — never swap the two.

## 4. Page-by-page rules

**Calendar month** — `GET /calendar` (`(src/web.ts · createWeb)`): `.page-head.calendar-head` (h1 clamp 26–38 px plus one welcome line), then `.today-strip` hero with grid areas head/main/actions/context, then the review card, then `.card.calendar-card`. Inside: `.month-nav` (prev / month picker trigger / next), `.cal-key` legend and Garmin freshness, `.dow` and `.month` as `repeat(7, minmax(0, 1fr))` grids. Cells are `<a class="cell">` links to the day page, `.cell.pad` for leading blanks, `.cell.today` a 2 px ember outline with `outline-offset: -2px`; rows are `.cal-pill` (`plan`, `record`, `paired`) with `role="button"` and `.cal-more` for overflow (`.cell`, `.cal-pill`, src/styles.ts). An empty month adds `.calendar-card.is-empty::before` and `.today-strip.has-mark` art.

**Day page** — `GET /day/:day`: head with a back link to the month, review card, two `.sessions` lists (booked, recorded), a native disclosure `<details class="log-disclosure" id="log-run">` whose `<summary class="btn">` opens the manual log form (`.log-row` two-up, one-up at ≤640), the Garmin workout card, and a small inline script that opens the disclosure when the URL hash is `#log-run`.

**Training log** — `GET /history`: `.period-bar` (week/month/year links, period nav, GET picker), one summary line, then `.seg-tabs.history-tabs` with the period panel and the Review panel (review card, `.load-card`, `.trends` with `.trend-picker`, best efforts). The tab lives in the URL (`?tab=review`) so the load chip, reload and back/forward all land on the same panel.

**Activity detail** — `GET /activity/:id`: head = eyebrow (back to log) + title + date/source chip + `.head-actions` (one `.coach-ask` plus View day / View plan / jump-to-muscles chips); `.history-summary.detail-summary` four stats; plan-vs-actual (`.plan-compare-grid`, `.plan-bar`); then `.activity-columns` — two peer columns from 1024 px, program+metrics+splits | muscles+zones+laps — and a closing coach card (`(src/web.ts · createWeb)`, `.activity-columns`, src/styles.ts).

**Muscle** — `(src/web-muscle.ts · renderMusclePage)`: head with attention and readiness lines, then `.muscle-layout`. From 1024 px it is a grid: the status rail (`.muscle-status-slot` + `.muscle-readings-slot`, 300–360 px) beside the check-in figure (`.muscle-form-slot`, spanning both rows); below 1024 px DOM order status → form → readings is preserved, so the phone reads in the order it acts. The check-in card `#check-in` holds `.muscle-workspace` (figure \| editor, one column ≤780 px), a `.muscle-quick` fieldset and the submit row; the 3D figure is `.muscle-viewer` (460 px tall, 340 compact, 380/300 ≤780 px) with the heat legend `.muscle-legend` beneath it (`(src/muscle-viewer.ts · renderMuscleViewerPanel)`).

**States** — `(src/web-coach-states.ts · renderCoachStates)`: a `<section class="page-head">` with a summary line and exactly one head action deep-linking to `?tab=set#state-form-card`, then `.seg-tabs.coach-states-tabs` with current / set / history panels: `.state-card`, `.state-form` (120 px label column, one column ≤640 px), `.state-history`. The page is the management surface behind the dock's compact States tab.

**/changes** — `(src/web.ts · renderChangesPage)`: head, `.filter-bar` of `.filter-pill` links (`?filter=all|schedule|activity|muscle`, each with a `.filter-count`), one `.changes-summary` line, then the schedule card and `#activity-changes` / `#muscle-changes` sections built from `.event-list` / `.event-item`, plus `.changes-footnote`. Empty state is a single `.changes-empty-card`.

**Auth** - `(src/web.ts · renderAuthPage)`: standalone document, no app bar and no site footer, but it does carry a centred `.auth-foot` with the privacy and credits links, because the attribution and the privacy statement must be reachable before an account exists. `.auth-skip` is the first focusable element (→ `#username`); `.auth-shell` is a grid `minmax(0, 1.06fr) minmax(0, .94fr)` that stacks under 900 px.

**Profile, audit and error pages** - the quiet pages that still use the shell: profile is a single `.card.narrow` (max 460 px, `8vh` top margin) with three `.stack` forms: the profile patch (display name, timezone, goal, new password, current password), a ghost-button "sign out everywhere" form, and the erasure form (current password plus the username typed exactly) `(src/web.ts · renderProfile)`. `/privacy` and `/goodbye` reuse the same card grammar without a session `(src/web.ts · renderPrivacy)`. The audit and error pages reuse it too `(src/web-coach-states.ts · renderCoachAudit)`.

## 5. Accessibility actually implemented

Selectors below are in `src/styles.ts`; ARIA and markup claims are in the cited builder.

| Rule | Where | Evidence |
|---|---|---|
| Focus visible | 2 px ember outline with offset on every interactive class; hidden radios proxy focus to their label | `.seg-tabs > .seg-input:focus-visible ~ .seg-labels > .seg-label:nth-child(n)`, `.trend-radio:focus-visible + .trend-chip` (src/styles.ts) |
| Target sizes | 44 px on primary actions and disclosures; 24 px floor elsewhere; 30 px calendar rows on coarse pointers | `.today-strip .btn`, `.log-disclosure > summary`, `.change-more > summary`, `.auth-reveal` (44×44); `.cal-pill { min-height: 24px }` |
| Skip link | Auth pages only: `.auth-skip` → `#username` | `.auth-skip` (src/styles.ts), `(src/web.ts · renderAuthPage)` |
| Landmarks | `nav.top`, `main`, `footer.site-footer`, `aside.coach-dock[aria-label]`, `#coach-panel[role=region]`, `nav.view-switch[aria-label]`, `nav.account-menu[aria-label]`, `section.notif-panel[aria-label]` | `(src/web.ts · layout)` |
| Disclosure state | `aria-expanded` + `aria-controls` on the launcher, the bell and the account button | `#coach-bubble`→`#coach-panel`, `#notif-btn`→`#notif-panel`, `#account-btn`→`#account-menu` |
| Radio groups | `role="radiogroup"` + `aria-label` on `.seg-tabs` and `.trend-chips` | `(src/web.ts · createWeb)`, `(src/web-coach-states.ts · renderCoachStates)` |
| Live regions | `role="log"`/`aria-live="polite"` on the coach log and notification list; `aria-live` on the muscle editor; `role="status"`/`role="alert"` banners | `#coach-log`, `#notif-list`, `#muscle-editor` |
| Dialogs | `role="dialog"` on the Garmin modal (`aria-modal="true"`) and the activity/session peek (`aria-labelledby`, focus returns to the trigger); `role="menu"` on the day menu | `#garmin-modal`, `#activity-peek`, `#day-menu` |
| Reduced motion | Global override (§7) | `@media (prefers-reduced-motion: reduce)` (src/styles.ts) |
| Forced colors | Auth surfaces, calendar art, today strip, coach launcher and avatar fall back to system colours | `@media (forced-colors: active)` (src/styles.ts) |
| No-JS fallbacks | Forms POST and 303-redirect; `<details>` disclosures (log form, goal, help, change batches); radio tabs work on CSS alone; every cell anchor still opens the day page | `(src/web.ts · createWeb)`, `.log-disclosure`, `.change-more`, `.auth-goal-disclosure` |

Known gaps, all real and all still open:

| Gap | Detail |
|---|---|
| No CSP | Only `x-content-type-options`, `referrer-policy`, `x-frame-options`, `cross-origin-opener-policy`, `permissions-policy`; HSTS only when `cookieSecure`. A CSP needs nonces for the inline scripts (`(src/web.ts · createWeb)`). |
| Soreness slider has no `aria-valuetext` | The editor's `#ed-soreness` range announces "7"; the `.muscle-ed-readout` output that says "7/10 sore to touch" is not associated with it (`(src/web-muscle.ts · muscleScript)`). |
| Legend ramp coarser than the heat function | `renderMuscleLegend` draws six swatches (0, 2, 4, 6, 8, 10); `sorenessFill` has nine stops (0, 2, 4, 5, 6, 7, 8, 9, 10), so the figure can paint a shade the legend never shows (`(src/muscle-map.ts · renderMuscleLegend)`, `(src/muscles.ts · sorenessFill)`). |
| Nested interactive markup | A day cell is an `<a>` that contains `role="button"` rows; script intercepts both and handles Enter/Space, but assistive tech sees a link containing buttons (`(src/calendar-items.ts · renderCalendarItem)`). |
| 44 px not universal | Segmented labels and coach tabs are ~30 px, `.icon-btn` and `.filter-pill` 38 px; they meet the 24 px minimum only (`docs/analysis/14-uiux-layout-research.md` item 18). |
| Script-built popups | Peek, day menu and month picker are created by script, so `aria-haspopup` on the cell and the month trigger describes a popup that only exists with JS. |

## 6. i18n and copy

Locale resolution (`(src/i18n.ts · resolveLocale)`): the `milebook_lang` cookie wins, then `Accept-Language` (prefix match: `zh-hant`, `zh-hk`, `zh-mo`, `zh` → `zh-HK`; `en*` → `en`), then `DEFAULT_LOCALE` (`en`). `/language?locale=…&next=…` sets a one-year `SameSite=Lax` cookie and redirects back to a validated same-origin path.

| Piece | Contract |
|---|---|
| Catalogs | `en` is the source of truth and defines `MessageKey`; `CATALOGS = { en, "zh-HK": zhHK }`; `t()` falls back catalog → English → key (`(src/i18n.ts · CATALOGS)`) |
| Interpolation | `{name}` tokens plus `{count, one{…} other{…}}` plurals resolved before plain tokens (`(src/i18n.ts · createTranslator)`) |
| Client strings | `clientStrings(locale)` ships every `js.*` key with the prefix stripped, every `changes.*` key, and `AUTH_CLIENT_KEYS`; `clientI18nScript` adds notif/garmin/muscle keys and serializes them to `window.__I18N__` with `<` escaped; scripts call `tr(key, fallback)` and fall back to English (`(src/i18n.ts · clientStrings)`, `(src/web.ts · clientI18nScript)`) |
| Dates | `Intl.DateTimeFormat` with `INTL_DATE_TAG` (`en` → `en-GB` so it reads day-before-month, `zh-HK` → `zh-HK`), all pinned to UTC, Monday-first weekdays (`(src/i18n.ts · createDateFormat)`) |
| Numbers | Not localized: units are literal strings — `formatMinutes` → `1h 05m`, `formatPace` → `5:30/km`, `bpm` (`(src/web.ts · formatMinutes)`, `(src/web.ts · formatPace)`) |
| Document | `<html lang dir>` from the translator; `.auth-page[lang="zh-HK"]` tunes display type (`.auth-story-title`, src/styles.ts) |

Every user-visible string is a catalog key — with these exceptions, which are real and should be fixed rather than copied:

| Where | Hardcoded English |
|---|---|
| `(src/garmin-errors.ts · describeGarminError)` | All Garmin failure prose; it reaches the UI through `syncError` / `keyError` and is interpolated into `flash.syncFailed`, so a zh-HK runner gets an English sentence inside a Chinese banner |
| `(src/calendar-items.ts · renderCalendarItem, renderCalendarItems)` | Screen-reader labels and `.sr-only` prefixes ("Planned session:", "Recorded run:", "Recorded run with Garmin workout:"), tooltips, and the "+n more" overflow hint |
| `(src/muscle-map.ts · renderMuscleLegend)` | The legend note ("Soreness heat · 0 nothing · 5 noticeable …") |
| `(src/web-muscle.ts · muscleScript)` | Editor scaffold: "Select a muscle…", "Remove", "Soreness today", anchors, "Tags:", "Side:", "Both/Left/Right", "Better once warmed up?", "Eases/Same/Worse", "Not linked to a run", the knowledge labels |
| `(src/muscle-viewer.ts · renderMuscleViewerPanel)` | "Pause rotation", "Front", "Back", "Reset" (the rotation label is also rewritten in its script) |
| `(src/web.ts · createWeb)` calendar script | Day-menu coach prompts ("Add a session on …", "Move a session to …", "Delete the session on …") and `title="Day actions"` on each cell |
| `(src/web.ts · createWeb)` calendar route | `pageLayout("Plan", …)` keeps "Plan" as the document-title context in zh-HK |

## 7. Motion

| Animation | Applied to | Timing |
|---|---|---|
| `page-shake` | `body.calendar-fx-active main` | .55 s `cubic-bezier(.36,.07,.19,.97)` |
| `land-pulse` / `delete-pulse` | `.cell.fx-land` / `.cell.fx-delete` | 1.1 s ease-out |
| `trash-pop` | `.fx-trash.pop` | .9 s ease-out |
| `toast-in` | `.fx-toast` | .25 s ease-out |
| Thumb slide | `.view-thumb` | transform .22 s ease |
| Flash overlay | `#calendar-fx` opacity, `.fx-trash` | .2 s |
| `auth-float` | `.auth-object` | 11 s ease-in-out infinite |
| `auth-spin` | `.auth-spinner` | .8 s linear infinite |
| `auth-rise` | auth mode/head/form/foot/error and story children | .48 s / .55 s, staggered .04–.21 s |
| Micro-transitions | `.sync-btn:active span` .15 s, `.lang-btn` .15 s, `.auth-field` .16 s, `.auth-submit` .16 s, `.auth-skip` .16 s, `.auth-mode-link` .18 s, `.auth-strength-bar` .18 s |

One switch covers everything: `@media (prefers-reduced-motion: reduce)` forces `animation-duration` and `transition-duration` to `.001ms !important` with one iteration, sets `scroll-behavior: auto`, hides `#calendar-fx`, `.fx-trash` and `.fx-ghost`, and cancels the page shake (`@media (prefers-reduced-motion: reduce)`, src/styles.ts). No script checks the media query itself; the CSS block is the only mechanism.

## 8. Art and assets in the UI

| Asset | Used by | Contract |
|---|---|---|
| `calendar-empty.webp` | Empty-month hero mark | `.today-strip-mark`, 120×90, `alt=""`, wrapper `aria-hidden`; 84×64 ≤820 px; hidden in print, drop-shadow dropped in forced colors |
| `calendar-wash.webp` | Paper wash behind the empty hero and the empty month card | `.today-strip.has-mark::before` at .10, `.calendar-card.is-empty::before` at .16 |
| `coach-token.webp` | Coach avatar | `.coach-avatar`, 30×30, `alt=""`, `display: none` in forced colors |
| `auth-hero.webp` | Story plate | `.auth-story-bg`, preloaded, `fetchpriority="high"` |
| `calendar-object.webp` | Floating cut-out over the story | `.auth-object`, `auth-float`, `fetchpriority="low"` |
| `paper-grain.webp` | 128 px multiply tile | `.auth-panel::before` |
| `anatomy-muscles.glb` + three.js modules | 3D muscle figure | `.muscle-viewer` via `renderMuscleViewerPanel`, served with an import map |

Serving convention (`(src/web.ts · sendAsset)`, `(src/web.ts · STATIC_ETAGS)`): every asset is read once at startup and served from memory with a strong ETag; `If-None-Match` costs a 304. `app.css` is `public, max-age=31536000, immutable` and is linked as `/static/app.css?v=${APP_CSS_VERSION}` (currently 33, `(src/web.ts · APP_CSS_VERSION)`); webp plates are `max-age=86400`; three.js modules are `no-cache`; the GLB is `max-age=3600`; pages and JSON are `no-store`. Because the CSS is immutable for a year, **a CSS change without an `APP_CSS_VERSION` bump ships nothing to returning runners** — and one plate carries its own `?v=2` query (`calendar-empty.webp`), so it needs its own bump.

## 9. Changing the UI

1. Build the page in a view builder: `pageLayout(...)` inside `(src/web.ts · createWeb)` or `layout(...)` for a standalone document, and `deps.layout` from `(src/web-muscle.ts · renderMusclePage)` and `(src/web-coach-states.ts · renderCoachStates)`. One `<h1>` in `.page-head`, sections as `.card`.
2. Add the nav entry: extend `ViewName` (`(src/web-html.ts · ViewName)`), `renderViewSwitch` and `navLabel`; a page without a view passes `"none"` and gets no tab strip.
3. Add strings to **both** locales in `CATALOGS`; `MessageKey` derives from `en`, so a missing zh-HK key silently falls back to English. `js.*` keys ship to the client automatically; new non-`js` client strings need `clientStrings` or `clientI18nScript`.
4. Put CSS in `src/styles.ts` only. Reuse the ≤640 / ≤780 / ≤820 / ≤980 overrides before inventing a breakpoint, and add the row to §2 when you do.
5. Bump `APP_CSS_VERSION`.
6. Extend the tests: `test/web.test.ts` (HTML contract, `app.css?v=`, CSS class presence, `matchMedia` strings, `cache-control`), `test/muscle-web.test.ts` for muscle markup, `test/i18n.test.ts` for catalog parity.
7. Verify no-JS: the POST path, the `<details>` fallback, radios for tabs, and that a cell anchor still reaches the day page.
8. Update this page and the domain doc it touches, then run `pnpm check`.

## 10. Rules that must not regress

- The coach is a **column, not an overlay**, at ≥1200 px: `.coach-dock` + `body.coach-open .app-shell`; measured covered area 0.
- Below 1200 px the open overlay inerts the page and returns focus to the launcher: `syncCoachInert`, `minimizePanel`, `#coach-bubble`.
- Page tabs stay native radios (`role="radiogroup"`); dock tabs stay ARIA tabs with roving `tabindex`. Never swap them.
- `.seg-tabs` must keep working with no script: `:checked ~ .seg-labels` / `:checked ~ .seg-panels`.
- One primary action per surface: `.today-strip .btn` + `.entry-quiet-link`.
- Two peer columns only at ≥1024 px, and they stack under an open dock at 1024–1199 px.
- Muscle DOM order stays status → form → readings; grid areas may move them only at ≥1024 px.
- Every user-visible string is a catalog key in both locales (§6 exceptions are debt, not precedent).
- The shell grammar holds: `.top` / `main` / `.page-head` / `.card` / `.site-footer`, no page-specific chrome.
- `.cal-pill` rows keep `role="button"` + Enter/Space handling, and a cell keeps its four-row cap.
- `APP_CSS_VERSION` ships with every CSS change; `app.css` is immutable for a year.
- Dead CSS is not precedent: `.range-switch` is still in the stylesheet but no view renders it, and `.view-switch` is declared twice (the 3-up `repeat(3, 1fr)` re-declaration wins over the 2-up original).
