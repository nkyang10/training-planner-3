export const CSS = `
:root {
  --ink: #1b120c; --ink-2: #3a2a20; --paper: #fff8f0; --surface: #ffffff; --wash: #fff1e4;
  --line: #f0dccb; --ember: #ff5a1f; --ember-text: #c23a0a; --ember-deep: #c93c0d; --solar: #ffb020; --success: #1f7a4d; --danger: #c03a2b; --muted: #7a6455;
  --radius: 20px; --shadow: 0 10px 30px rgba(27, 18, 12, .08);
  --font: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: radial-gradient(1200px 600px at 10% -10%, #ffe6cf 0%, var(--paper) 45%, #fff 100%); min-height: 100vh; display: flex; flex-direction: column; }
a { color: var(--ink); }
.top { display: flex; align-items: center; gap: 16px; padding: 14px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.8); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 5; }
.brand { font-weight: 800; letter-spacing: .08em; text-decoration: none; color: var(--ember-text); }
.top-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.sync-menu-form { margin: 0; }
.top .top-link { text-decoration: none; font-weight: 700; color: var(--ember-text); }
.top .top-link.ghost { color: var(--muted); font-weight: 600; }
main { max-width: 1080px; margin: 0 auto; padding: 24px 18px 80px; width: 100%; flex: 1 0 auto; }
/* The page column and, on wide screens, the coach column. Closed, the coach dock has no box (display:contents), so the
   page keeps its full width and only the floating launcher is visible. */
.app-shell { display: flex; flex-direction: column; width: 100%; flex: 1 0 auto; }
.page-head h1 { font-size: clamp(28px, 6vw, 44px); margin: 6px 0; letter-spacing: -.02em; }
.eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; color: var(--muted); margin: 0; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); margin-bottom: 18px; }
.card.narrow { max-width: 460px; margin: 8vh auto; }
.stack { display: grid; gap: 10px; }
label { font-weight: 600; font-size: 14px; }
input, button { font: inherit; }
input { padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
input[readonly] { background: #f6eee6; color: var(--muted); }
/* Solid deep ember keeps white labels at 5.08:1 (the old ember-to-solar gradient fell to 1.83:1 at its light end). */
.btn { display: inline-block; border: 0; background: var(--ember-deep); color: #fff; padding: 12px 18px; border-radius: 999px; font-weight: 800; cursor: pointer; text-decoration: none; text-align: center; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.error { color: var(--danger); font-weight: 600; }
.ok { color: var(--success); font-weight: 600; }
.month-nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 10px; margin-bottom: 14px; }
.month-nav a { text-decoration: none; color: var(--muted); font-weight: 600; }
.month-nav .month-current { color: var(--ink); }
.dow, .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.dow span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); text-align: center; padding-bottom: 4px; }
.cell { min-height: 104px; border: 1px solid var(--line); border-radius: 12px; padding: 6px; background: var(--wash); text-decoration: none; display: flex; flex-direction: column; align-items: stretch; gap: 2px; overflow: hidden; }
.cell.pad { background: transparent; border-style: dashed; }
.cell.today { outline: 2px solid var(--ember); outline-offset: -2px; background: #fff; }
.cell .date { font-weight: 800; font-size: 14px; line-height: 1.15; }
.session { display: block; font-size: 11px; line-height: 1.25; padding: 3px 6px; border-radius: 7px; background: #fff; border: 1px solid var(--line); }
.session.kind-interval, .session.kind-tempo { border-color: var(--ember); color: var(--ember-text); }
.session.kind-long { border-color: var(--solar); }
.session.kind-racewalk { border-color: #7a4fd6; color: #5b34b0; }
.session.kind-rest { color: var(--muted); }
.cal-items { display: flex; flex-direction: column; gap: 2px; width: 100%; min-width: 0; }
/* One row anatomy for every item type: a type rail, an optional glyph, the title, and the amount on the right. */
/* Every calendar row clears the 24px WCAG 2.2 minimum target height; pair halves make a 40px row. */
.cal-pill { display: flex; align-items: center; gap: 2px; width: 100%; min-width: 0; min-height: 24px; padding: 2px 3px; border-radius: 5px; border-left: 3px solid var(--pill-accent, var(--line)); background: var(--pill-bg, transparent); color: var(--pill-ink, var(--ink-2)); font-size: 10.5px; font-weight: 600; line-height: 1.28; }
.cal-pill .cal-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-pill .cal-glyph { flex: none; width: 8px; text-align: center; font-size: 10px; font-weight: 800; color: var(--pill-glyph, currentColor); }
.cal-pill .cal-meta { flex: none; margin-left: auto; padding-left: 2px; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--pill-meta, currentColor); letter-spacing: -.01em; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cal-pill.plan { cursor: pointer; }
.cal-pill.plan:hover { box-shadow: inset 0 0 0 1px var(--pill-accent); filter: brightness(.97); }
.cal-pill.plan:focus-visible { outline: 2px solid var(--ember); outline-offset: 1px; }
.cal-pill.plan.kind-easy { --pill-bg: #e6f5eb; --pill-ink: #17653b; --pill-accent: #2f9e5f; }
.cal-pill.plan.kind-long { --pill-bg: #fff2d2; --pill-ink: #7d5100; --pill-accent: #dfa000; }
.cal-pill.plan.kind-interval, .cal-pill.plan.kind-tempo { --pill-bg: #ffe3da; --pill-ink: #9e2409; --pill-accent: #ff5a1f; }
.cal-pill.plan.kind-rest { --pill-bg: #efedea; --pill-ink: #6f5c4d; --pill-accent: #b6a99d; }
.cal-pill.plan.kind-cross { --pill-bg: #e4eeff; --pill-ink: #214f9c; --pill-accent: #3b76d1; }
.cal-pill.plan.kind-race { --pill-bg: #ffe0e7; --pill-ink: #941c39; --pill-accent: #d92b4b; }
.cal-pill.plan.kind-racewalk { --pill-bg: #ece5ff; --pill-ink: #5130a0; --pill-accent: #7a4fd6; }
.cal-pill.record { --pill-bg: #2f7d57; --pill-ink: #fff; --pill-accent: #1f5f3f; --pill-glyph: #eafbf0; --pill-meta: #eafbf0; cursor: pointer; }
.cal-pill.record:hover { box-shadow: inset 0 0 0 1px #fff; filter: brightness(1.08); }
.cal-pill.record:focus-visible { outline: 2px solid var(--ember); outline-offset: 1px; }
/* A recorded run paired with the Garmin workout it followed: one row, one click target, one integrated peek. */
.cal-pill.paired { display: grid; gap: 0; padding: 0; border: 1px solid #ddd6f4; border-left: 0; background: #fff; border-radius: 7px; overflow: hidden; cursor: pointer; }
.cal-pill.paired:hover { box-shadow: inset 0 0 0 1px #6b5bd6; filter: brightness(1.02); }
.cal-pill.paired:focus-visible { outline: 2px solid var(--ember); outline-offset: 1px; }
.cal-pair-part { display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 20px; padding: 2px 3px; cursor: inherit; }
.cal-pair-run { border-left: 3px solid #1f5f3f; background: #2f7d57; color: #fff; }
.cal-pair-run .cal-glyph { color: #eafbf0; }
.cal-pair-run .cal-meta { color: #eafbf0; }
.cal-pair-workout { border-left: 3px solid #6b5bd6; background: #f4f1ff; color: #3f2f96; border-top: 1px solid #e7e0fa; }
.cal-pair-workout .cal-glyph { color: #6b5bd6; }
.cal-pair-workout .cal-text { font-size: 10px; }
.cal-more { flex: 0 0 auto; padding: 0 2px; color: var(--muted); font-size: 10px; font-weight: 700; line-height: 1.3; }
.sessions { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.sessions li { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.chip { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
/* Action chips read as buttons, not status badges: sentence case, no tracking. */
.chip.action { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 12px; padding: 4px 10px; }
.chip.kind-easy { border-color: #2f9e5f; color: #17653b; }
.chip.kind-long { border-color: #dfa000; color: #7d5100; }
.chip.kind-interval, .chip.kind-tempo { border-color: var(--ember); color: #9e2409; }
.chip.kind-rest { border-color: #b6a99d; color: #6f5c4d; }
.chip.kind-cross { border-color: #3b76d1; color: #214f9c; }
.chip.kind-race { border-color: #d92b4b; color: #941c39; }
.chip.kind-racewalk { border-color: #7a4fd6; color: #5130a0; }
.chip.peek-status-completed { border-color: var(--success); color: var(--success); }
.chip.peek-status-unmatched { border-color: var(--solar); color: #8a5a00; }
.chip.peek-status-missed { border-color: var(--danger); color: var(--danger); }
.chip.peek-status-upcoming, .chip.peek-status-rest { border-color: var(--line); color: var(--muted); }
.note { color: var(--ink-2); margin: 6px 0 0; }
.tick { color: var(--success); font-weight: 800; }
@media (max-width: 640px) {
  main { padding: 16px 10px 60px; }
  .cell { min-height: 78px; padding: 5px; }
  .session { font-size: 10px; padding: 2px 4px; }
  .cal-pill { font-size: 9.5px; padding: 1px 2px; border-left-width: 2px; }
  .cal-pill .cal-glyph { width: 7px; font-size: 9.5px; }
  .cal-pill .cal-meta { padding-left: 1px; }
  .cal-pair-part { padding: 1px 2px; }
  .cal-more { font-size: 9.5px; }
  .top { padding: 10px 12px; gap: 8px; }
  .top .top-link { font-size: 13px; }
}
/* The amount stays visible on small phones: it is the row's most scannable number. */
@media (pointer: coarse) {
  .cal-pill { min-height: 30px; }
  .cal-pair-part { min-height: 20px; }
}
/* The Plan / Training log switch sits inside the app bar, centered between the brand and the account actions.
   It is rendered only on pages that belong to one of the two views, never as a page-wide band. */
.view-switch { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 3px; background: var(--wash); border: 1px solid var(--line); border-radius: 999px; box-sizing: border-box; }
.top .view-switch { margin-left: auto; }
.view-thumb { position: absolute; top: 3px; left: 3px; width: calc(50% - 3px); height: calc(100% - 6px); border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(27, 18, 12, .10); transition: transform .22s ease; }
.view-switch[data-active="history"] .view-thumb { transform: translateX(100%); }
.view-tab { position: relative; z-index: 1; text-align: center; padding: 4px 14px; font-size: 12.5px; font-weight: 800; color: var(--muted); text-decoration: none; border-radius: 999px; }
.view-tab.active { color: var(--ink); }
.view-tab:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.history-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.history-summary .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; box-shadow: var(--shadow); }
.history-summary strong { display: block; font-size: 20px; letter-spacing: -.02em; }
.history-summary span { display: block; margin-top: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.range-switch { display: flex; flex-wrap: wrap; gap: 6px; }
.range-switch .chip { text-decoration: none; background: #fff; }
.range-switch .chip.active { border-color: var(--ember); color: var(--ember-text); }
.history-weeks { display: grid; gap: 18px; }
.history-week-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; margin: 0 0 8px; }
.history-week-head h2 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
.history-day { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; margin-bottom: 8px; box-shadow: var(--shadow); }
.history-day-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.history-day-head a { font-weight: 800; text-decoration: none; }
.history-plan { margin: 2px 0 8px; font-size: 12px; color: var(--ink-2); }
.history-plan .session { display: inline-block; margin: 0 4px 4px 0; }
.history-activity { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px dashed var(--line); }
.history-activity:first-of-type { border-top: 0; }
.history-activity-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.history-metrics { margin: 3px 0 0; font-size: 13px; color: var(--ink-2); }
.history-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.history-actions .chip { text-decoration: none; background: #fff; }
.coach-ask { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 5px 9px; font: inherit; font-size: 12px; font-weight: 700; line-height: 1.2; cursor: pointer; }
.coach-ask:hover { border-color: var(--ember); color: var(--ember-text); }
.history-missed { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 4px; }
.source-garmin { color: var(--success); }
.source-chat { color: var(--ember-text); }
.history-empty { text-align: center; }
.history-empty .coach-ask { margin-top: 8px; }
@media (max-width: 640px) {
  /* The app bar wraps: brand and actions on the first row, the view switch on its own full-width row —
     and only on pages that belong to a view. */
  .top { flex-wrap: wrap; }
  .top .top-actions { order: 2; }
  .top .view-switch { order: 3; flex-basis: 100%; margin: 6px 0 0; }
  .history-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .history-activity { align-items: flex-start; flex-direction: column; }
}
.chip.match-on-plan { border-color: var(--success); color: var(--success); }
.chip.match-short { border-color: var(--solar); color: #8a5a00; }
.chip.match-long { border-color: var(--ember); color: var(--ember-text); }
.chip.match-unplanned { border-color: var(--line); color: var(--muted); }
.trends { margin: 18px 0 22px; }
.trend-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
.trend-head h2 { margin: 0; font-size: 18px; letter-spacing: -.01em; }
.trend-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.trend-card { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; box-shadow: var(--shadow); }
.trend-card figcaption { font-weight: 800; font-size: 13px; margin-bottom: 6px; }
.trend-chart { display: block; width: 100%; height: auto; overflow: visible; }
.trend-bar { fill: var(--ember); opacity: .78; }
.trend-axis-line { stroke: var(--line); stroke-width: 1; }
.trend-axis { fill: var(--muted); font-size: 10px; font-family: var(--font); }
.trend-value { fill: var(--ink-2); font-size: 10px; font-family: var(--font); font-weight: 700; }
.trend-line { fill: none; stroke: var(--ember); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.trend-dot { fill: #fff; stroke: var(--ember); stroke-width: 2; }
.trend-note { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.trend-stats dl { display: grid; gap: 8px; margin: 0; }
.trend-stats dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-top: 1px dashed var(--line); padding-top: 8px; }
.trend-stats dl div:first-child { border-top: 0; padding-top: 0; }
.trend-stats dt { color: var(--muted); font-size: 12px; }
.trend-stats dd { margin: 0; font-weight: 800; }
.trend-picker { display: grid; gap: 10px; margin-top: 10px; }
.trend-picker-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; }
.trend-picker-head h3 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
.trend-picker-head p { margin: 0; }
.trend-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.trend-radio { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.trend-chip { display: inline-block; padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font-size: 12px; font-weight: 700; line-height: 1.2; cursor: pointer; }
.trend-chip:hover { border-color: var(--ember); color: var(--ember-text); }
.trend-radio:checked + .trend-chip { background: var(--ink); border-color: var(--ink); color: #fff; }
.trend-radio:focus-visible + .trend-chip { outline: 2px solid var(--ember); outline-offset: 2px; }
.trend-panels { display: grid; }
.trend-panel { display: none; width: 100%; max-width: 520px; margin: 0; justify-self: center; }
.trend-panel figcaption { font-weight: 800; font-size: 13px; margin-bottom: 6px; }
.trend-picker[data-default="pace"] .trend-panel[data-metric="pace"],
.trend-picker[data-default="hr"] .trend-panel[data-metric="hr"],
.trend-picker[data-default="cadence"] .trend-panel[data-metric="cadence"],
.trend-picker[data-default="load"] .trend-panel[data-metric="load"],
.trend-picker[data-default="distance"] .trend-panel[data-metric="distance"],
.trend-picker[data-default="duration"] .trend-panel[data-metric="duration"],
.trend-picker[data-default="elevation"] .trend-panel[data-metric="elevation"] { display: block; }
.trend-picker:has(.trend-radio:checked) .trend-panel { display: none; }
.trend-picker:has(#trend-metric-pace:checked) .trend-panel[data-metric="pace"],
.trend-picker:has(#trend-metric-hr:checked) .trend-panel[data-metric="hr"],
.trend-picker:has(#trend-metric-cadence:checked) .trend-panel[data-metric="cadence"],
.trend-picker:has(#trend-metric-load:checked) .trend-panel[data-metric="load"],
.trend-picker:has(#trend-metric-distance:checked) .trend-panel[data-metric="distance"],
.trend-picker:has(#trend-metric-duration:checked) .trend-panel[data-metric="duration"],
.trend-picker:has(#trend-metric-elevation:checked) .trend-panel[data-metric="elevation"] { display: block; }
.review-card { border-color: #f6c9ad; background: linear-gradient(135deg, #fff, var(--wash)); }
.review-card h2 { margin: 2px 0 4px; }
.review-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.review-actions .chip { text-decoration: none; background: #fff; }
.plan-compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 8px 0 10px; }
.plan-compare-grid > div { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: var(--wash); }
.plan-compare-grid strong { display: block; margin-top: 2px; }
.plan-compare-grid p { margin: 4px 0 0; font-size: 12px; }
.plan-deltas { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); }
.plan-bar { display: grid; gap: 8px; margin-top: 12px; }
.plan-bar-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) 62px; align-items: center; gap: 8px; font-size: 12px; }
.plan-bar-track { height: 10px; border-radius: 999px; background: var(--wash); overflow: hidden; }
.plan-bar-fill { display: block; height: 100%; border-radius: 999px; }
.plan-bar-plan { background: var(--solar); }
.plan-bar-actual { background: var(--ember); }
.plan-bar-row strong { text-align: right; font-size: 12px; }
.detail-summary { margin-bottom: 14px; }
/* The activity page's secondary cards pair up on wide screens: program beside muscles worked, metrics beside zones,
   splits beside laps. Below 1024px the columns collapse back into one stack in reading order. */
.activity-columns { display: block; }
.activity-col { display: block; }
@media (min-width: 1024px) {
  .activity-columns { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr); gap: 18px; align-items: start; margin-bottom: 18px; }
  .activity-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .activity-col > .card { margin-bottom: 0; }
}
@media (max-width: 640px) {
  .trend-grid { grid-template-columns: 1fr; }
  .plan-compare-grid { grid-template-columns: 1fr; }
  .plan-bar-row { grid-template-columns: 44px minmax(0, 1fr) 54px; }
}
.period-bar { display: grid; gap: 10px; margin-bottom: 16px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
.period-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.period-modes { display: inline-flex; flex-wrap: wrap; padding: 3px; background: var(--wash); border: 1px solid var(--line); border-radius: 999px; }
.period-mode { padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; color: var(--muted); text-decoration: none; }
.period-mode.active { background: #fff; color: var(--ink); box-shadow: 0 1px 4px rgba(27, 18, 12, .12); }
.period-mode:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
/* In-page segmented tabs: radio inputs switch without script (the trend picker uses the same idea). One panel shows
   at a time; with CSS disabled every panel is visible, so nothing is lost without script or :has support. */
.seg-tabs { margin: 2px 0 14px; }
.seg-tabs > .seg-input { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.seg-labels { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; background: var(--wash); border: 1px solid var(--line); border-radius: 999px; }
.seg-label { padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 800; color: var(--muted); cursor: pointer; user-select: none; }
.seg-label:hover { color: var(--ink); }
.seg-panel { display: none; }
.seg-tabs > .seg-input:nth-of-type(1):checked ~ .seg-labels > .seg-label:nth-child(1),
.seg-tabs > .seg-input:nth-of-type(2):checked ~ .seg-labels > .seg-label:nth-child(2),
.seg-tabs > .seg-input:nth-of-type(3):checked ~ .seg-labels > .seg-label:nth-child(3),
.seg-tabs > .seg-input:nth-of-type(4):checked ~ .seg-labels > .seg-label:nth-child(4) { background: #fff; color: var(--ink); box-shadow: 0 2px 8px rgba(27, 18, 12, .10); }
.seg-tabs > .seg-input:nth-of-type(1):focus-visible ~ .seg-labels > .seg-label:nth-child(1),
.seg-tabs > .seg-input:nth-of-type(2):focus-visible ~ .seg-labels > .seg-label:nth-child(2),
.seg-tabs > .seg-input:nth-of-type(3):focus-visible ~ .seg-labels > .seg-label:nth-child(3),
.seg-tabs > .seg-input:nth-of-type(4):focus-visible ~ .seg-labels > .seg-label:nth-child(4) { outline: 2px solid var(--ember); outline-offset: 2px; }
.seg-tabs > .seg-input:nth-of-type(1):checked ~ .seg-panels > .seg-panel:nth-child(1),
.seg-tabs > .seg-input:nth-of-type(2):checked ~ .seg-panels > .seg-panel:nth-child(2),
.seg-tabs > .seg-input:nth-of-type(3):checked ~ .seg-panels > .seg-panel:nth-child(3),
.seg-tabs > .seg-input:nth-of-type(4):checked ~ .seg-panels > .seg-panel:nth-child(4) { display: block; }
.period-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.period-nav a { text-decoration: none; color: var(--muted); font-weight: 700; }
.period-nav a:hover { color: var(--ember-text); }
.period-label { font-weight: 800; font-size: 14px; }
.period-nav .chip { text-decoration: none; background: #fff; color: var(--ink); }
.period-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.period-picker input, .period-picker select { padding: 7px 9px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); font: inherit; font-size: 12px; color: var(--ink); }
.period-picker .btn { padding: 8px 14px; font-size: 12px; }
.period-rows { display: grid; gap: 8px; }
.period-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); text-decoration: none; color: var(--ink); }
.period-row:hover { border-color: var(--ember); }
.period-row h2 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
.period-row p { margin: 3px 0 0; }
.period-row .chip { text-decoration: none; background: #fff; white-space: nowrap; }
.period-empty { margin: 0 0 8px; }
@media (max-width: 640px) {
  .period-bar { padding: 9px 10px; }
  .period-top { align-items: stretch; }
  .period-modes { width: 100%; }
  .period-mode { flex: 1 1 0; text-align: center; }
  .period-nav { justify-content: space-between; }
  .period-picker { width: 100%; }
  .period-picker input, .period-picker select { flex: 1 1 auto; min-width: 0; }
  .period-row { align-items: flex-start; }
}
.load-card { display: grid; gap: 10px; margin-bottom: 16px; }
.load-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.load-head h2 { margin: 2px 0 0; font-size: 22px; }
.load-chip { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; border: 1px solid transparent; white-space: nowrap; }
.load-chip.steady { background: #e8f5ea; color: #1f7a3a; border-color: #b9e0c2; }
.load-chip.watch { background: #fff3d6; color: #8a5a00; border-color: #f0d49a; }
.load-chip.high { background: #ffe4dc; color: #a3260b; border-color: #ffb7a6; }
.load-chip.insufficient, .load-chip.no-data { background: var(--wash); color: var(--muted); border-color: var(--line); }
.load-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
/* The plain-English warning leads; the raw numbers stay secondary so jargon never outranks the sentence. */
.load-stat { padding: 8px 10px; background: transparent; border: 1px dashed var(--line); border-radius: 12px; }
.load-stat strong { display: block; font-size: 15px; letter-spacing: -.01em; color: var(--ink-2); }
.load-stat span { display: block; margin-top: 2px; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.load-actions { display: flex; flex-wrap: wrap; gap: 8px; }
/* The consultative ramp warning: data first, the decision handed back, in the watch-chip amber. */
.load-warning { margin: 0; padding: 10px 12px; border: 1px solid #f0d49a; background: #fff8e8; color: #8a5a00; border-radius: 12px; font-size: 13px; font-weight: 600; }
.metric-extra-card h2 { margin-bottom: 8px; }
.metric-extra-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.metric-extra { padding: 9px 10px; background: var(--wash); border: 1px solid var(--line); border-radius: 10px; }
.metric-extra span { display: block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.metric-extra strong { display: block; margin-top: 2px; font-size: 14px; }
.best-efforts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.best-efforts div { display: flex; align-items: baseline; gap: 5px; padding: 6px 9px; background: #fff; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; }
.best-efforts span { color: var(--muted); }
.best-efforts strong { font-size: 13px; }
.splits-card { margin-bottom: 16px; }
.splits-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
.splits-head h2 { margin: 0; }
.splits-head p { margin: 0; }
.splits-table { display: grid; gap: 2px; }
.split-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; align-items: center; padding: 8px 10px; border-radius: 9px; font-size: 13px; }
.split-row:nth-child(odd) { background: var(--wash); }
.split-header { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: transparent !important; padding-top: 2px; padding-bottom: 4px; }
.split-row span:first-child { font-weight: 800; }
@media (max-width: 640px) {
  .load-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .load-head { align-items: flex-start; }
  .metric-extra-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .split-row { grid-template-columns: .9fr 1fr 1fr .9fr; padding: 7px 8px; font-size: 12px; }
}
.best-efforts-card { margin-bottom: 16px; }
.best-efforts .best-effort { flex-wrap: wrap; border-radius: 12px; padding: 7px 10px; }
.best-efforts .best-effort.pr { border-color: var(--ember); background: #fff7f1; }
.best-efforts small { color: var(--muted); font-size: 11px; }
.pr-chip { background: var(--ember-deep); border-color: var(--ember-deep); color: #fff; font-size: 9px; padding: 2px 6px; }
.workout-card { margin-bottom: 16px; }
.workout-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
.workout-head h2 { margin: 0; }
.workout-name { margin: 0 0 2px; font-weight: 800; }
.workout-summary { margin: 0 0 10px; color: var(--ink-2); font-size: 13px; line-height: 1.45; }
.workout-table { display: grid; gap: 2px; }
.workout-row { display: grid; grid-template-columns: 26px 1.1fr .8fr 1.1fr; gap: 6px; align-items: center; padding: 7px 9px; border-radius: 9px; font-size: 12px; }
.workout-row:nth-child(odd) { background: var(--wash); }
.workout-header { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: transparent !important; padding-top: 2px; padding-bottom: 4px; }
.workout-row span:first-child { font-weight: 800; color: var(--muted); }
.workout-notes { margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid var(--solar); background: #fffaf1; border-radius: 0 8px 8px 0; font-size: 13px; }
.history-program { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 6px; font-size: 12px; color: var(--ink-2); }
.history-program .chip, .peek-program-chip { border-color: #6b5bd6; color: #3f2f96; background: #efeaff; }
.laps-card { margin-bottom: 16px; }.laps-table { display: grid; gap: 2px; }
.lap-row { display: grid; grid-template-columns: 1.4fr .8fr .8fr .9fr .8fr; gap: 6px; align-items: center; padding: 8px 10px; border-radius: 9px; font-size: 12px; }
.lap-row:nth-child(odd) { background: var(--wash); }
.lap-header { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: transparent !important; padding-top: 2px; padding-bottom: 4px; }
.lap-row span:first-child { font-weight: 800; }
.hr-zones-card { margin-bottom: 16px; }
.zone-bar { display: flex; height: 18px; overflow: hidden; border-radius: 999px; background: var(--wash); border: 1px solid var(--line); }
.zone-seg { display: block; height: 100%; }
.zone-1 { background: #9cc5e8; }
.zone-2 { background: #7bc8a4; }
.zone-3 { background: #f4c95d; }
.zone-4 { background: #f29e4c; }
.zone-5 { background: #e4572e; }
.zone-legend { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 9px; font-size: 12px; color: var(--muted); }
.zone-key { display: inline-flex; align-items: center; gap: 5px; }
.zone-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
@media (max-width: 640px) {
  .lap-row { grid-template-columns: 1.3fr .7fr .8fr .9fr .7fr; padding: 7px 8px; font-size: 11px; }
  .best-efforts .best-effort { border-radius: 10px; }
}
/* Ink label on the kept ember-to-solar gradient: 5.92-10.09:1, where white fell to 1.83:1 at the solar end. */
#coach-bubble { position: fixed; right: 18px; bottom: 18px; z-index: 20; border: 0; border-radius: 999px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: var(--ink); background: linear-gradient(135deg, var(--ember), var(--solar)); box-shadow: 0 12px 30px rgba(255, 90, 31, .35); cursor: pointer; }
#coach-panel { position: fixed; right: 18px; bottom: 18px; z-index: 21; width: min(380px, calc(100vw - 24px)); height: calc(100vh - 36px); height: calc(100dvh - 36px); max-height: calc(100dvh - 36px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 24px 60px rgba(27, 18, 12, .25); overflow: hidden; }
.coach-dock { display: contents; }
#month-picker { position: fixed; z-index: 55; display: grid; gap: 10px; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 44px rgba(27, 18, 12, .24); }
#month-picker[hidden] { display: none; }
.month-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.month-picker-head button { border: 0; background: transparent; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; }
.month-picker-year { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.month-picker-year select { flex: 1; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 7px 8px; font: inherit; }
.month-picker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.month-picker-grid button { border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 8px 4px; font: inherit; font-size: 12px; cursor: pointer; }
.month-picker-grid button:hover, .month-picker-grid button:focus-visible { background: var(--wash); border-color: var(--ember); }
.month-picker-foot { display: flex; justify-content: flex-end; }
.month-picker-foot button { border: 0; border-radius: 999px; background: var(--wash); color: var(--ember-text); padding: 6px 10px; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }

#day-menu { position: fixed; z-index: 50; display: grid; gap: 2px; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 44px rgba(27, 18, 12, .24); }
#day-menu[hidden] { display: none; }
.day-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 6px 8px; font-size: 12px; }
.day-menu-head button { border: 0; background: transparent; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; }
#day-menu button[data-action] { border: 0; border-radius: 9px; background: transparent; color: var(--ink); text-align: left; padding: 9px 10px; font: inherit; font-size: 13px; cursor: pointer; }
#day-menu button[data-action]:hover:not(:disabled), #day-menu button[data-action]:focus-visible:not(:disabled) { background: var(--wash); outline: 2px solid transparent; }
#day-menu button[data-action]:disabled { color: var(--muted); opacity: .55; cursor: not-allowed; }

/* Head and actions stay pinned; only the body scrolls, so a 7-step program never folds the action row below the fold. */
#activity-peek { position: fixed; z-index: 48; display: flex; flex-direction: column; gap: 10px; width: min(360px, calc(100vw - 16px)); max-height: min(76vh, 560px); overflow: hidden; padding: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 20px 50px rgba(27, 18, 12, .26); }
#activity-peek[hidden] { display: none; }
#activity-peek:focus { outline: none; }
#activity-peek:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.peek-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.peek-head-text { min-width: 0; }
.peek-eyebrow { margin: 0; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.peek-head h2 { margin: 2px 0 0; font-size: 18px; letter-spacing: -.01em; overflow-wrap: anywhere; }
.peek-close { flex: none; border: 0; background: transparent; color: var(--muted); font-size: 20px; line-height: 1; padding: 2px 4px; border-radius: 8px; cursor: pointer; }
.peek-close:hover, .peek-close:focus-visible { background: var(--wash); color: var(--ink); }
.peek-body { display: grid; gap: 10px; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 2px; }
.peek-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.peek-meta .chip { text-decoration: none; }
.peek-metrics { font-size: 13px; }
.peek-plan { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 10px; background: var(--wash); border: 1px solid var(--line); border-radius: 10px; }
.peek-plan-text { font-size: 12px; color: var(--ink-2); }
.peek-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.peek-stat { padding: 7px 8px; background: #fff; border: 1px solid var(--line); border-radius: 9px; }
.peek-stat span { display: block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.peek-stat strong { display: block; margin-top: 1px; font-size: 13px; }
.peek-efforts { display: flex; flex-wrap: wrap; gap: 6px; }
.peek-effort { display: inline-flex; align-items: baseline; gap: 4px; padding: 5px 8px; background: #fff; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; }
.peek-effort span { color: var(--muted); }
.peek-effort strong { font-size: 12px; }
.peek-effort.pr { border-color: var(--ember); background: #fff7f1; }
.peek-note { margin: 0; font-size: 13px; color: var(--ink-2); }
.peek-program-chip { border-color: #6b5bd6; color: #3f2f96; background: #f3f0ff; }
.peek-program { display: grid; gap: 8px; padding: 10px; background: #fbf9ff; border: 1px solid #e4dcfb; border-radius: 12px; }
.peek-program-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.peek-program-name { font-size: 13px; color: #3f2f96; overflow-wrap: anywhere; }
.peek-workout-summary { margin: 0; font-size: 12.5px; color: #3f2f96; font-weight: 600; }
.peek-steps { display: grid; gap: 4px; }
.peek-step { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 5px 8px; background: #fff; border: 1px solid var(--line); border-radius: 8px; font-size: 12px; }
.peek-step-index { color: var(--muted); font-weight: 800; font-size: 10px; }
.peek-step-intensity { font-weight: 700; }
.peek-step-duration { color: var(--ink-2); }
.peek-step-target { color: #3f2f96; font-weight: 700; margin-left: auto; }
.peek-step-head { padding: 0 8px; background: transparent; border: 0; }
.peek-step-head .peek-step-index,
.peek-step-head .peek-step-intensity,
.peek-step-head .peek-step-duration,
.peek-step-head .peek-step-target { color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.peek-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
.peek-actions .btn { padding: 8px 12px; font-size: 12px; }
.peek-actions .chip { text-decoration: none; background: #fff; }

#coach-panel[hidden] { display: none; }
#coach-panel header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--wash); border-bottom: 1px solid var(--line); }
#coach-panel header button { border: 0; background: transparent; width: 32px; height: 32px; padding: 0; display: grid; place-items: center; border-radius: 8px; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); }
#coach-panel header button:hover { background: rgba(27, 18, 12, .06); color: var(--ink); }
.coach-head-actions { display: flex; align-items: center; gap: 6px; }
/* A close affordance belongs to the floating sheet; the docked column uses the same "−" minimize it always had. */
#coach-panel header #coach-close { display: none; }
.coach-head-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.coach-head-text strong { font-size: 14px; }
.coach-head-text .coach-horizon { margin-left: 0; }
/* The coach surface is grouped, not one long stream: conversation, durable states, calendar changes. */
.coach-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 6px 10px; background: var(--surface); border-bottom: 1px solid var(--line); }
.coach-tab { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); padding: 7px 6px; font: inherit; font-size: 12.5px; font-weight: 800; line-height: 1.2; cursor: pointer; }
.coach-tab:hover { color: var(--ink); background: var(--wash); }
.coach-tab[aria-selected="true"] { background: var(--wash); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.coach-tab:focus-visible { outline: 2px solid var(--ember); outline-offset: 1px; }
.coach-tab-count { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--ember); color: #fff; font-size: 10.5px; font-weight: 800; line-height: 1; }
.coach-tab-count[hidden] { display: none; }
.coach-tab-panel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.coach-tab-panel[hidden] { display: none; }
.coach-tab-panel[data-coach-panel="chat"] { overflow: hidden; }
.coach-tab-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.coach-tab-foot { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--line); background: var(--wash); }
.coach-tab-foot .chip { text-decoration: none; background: #fff; }
.coach-tab-empty { margin: 4px 2px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.coach-state-card { margin-top: 0; }
.coach-change { padding: 10px 12px; background: #fff; border: 1px solid var(--line); border-radius: 12px; }
.coach-change.undone { opacity: .62; }
.coach-change-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 8px; }
.coach-change-head strong { font-size: 13px; overflow-wrap: anywhere; }
.coach-change-meta { font-size: 11.5px; color: var(--muted); }
.coach-change-entries { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--ink-2); display: grid; gap: 2px; }
.coach-change-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.coach-change-actions .btn { padding: 6px 10px; font-size: 12px; }
.coach-change-undo { display: contents; }
#coach-log { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 88%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
.bubble.user { align-self: flex-end; background: var(--ember-deep); color: #fff; border-bottom-right-radius: 4px; }
.bubble.coach { align-self: flex-start; background: var(--wash); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.bubble.system { align-self: center; background: #eef8f1; color: var(--success); font-size: 12px; border-radius: 999px; }
/* A guardrail is a block, not a success: amber warning styling instead of the green system pill. */
.bubble.system.warn { background: #fff4e5; border: 1px solid #f0d49a; color: #8a5a00; }
.bubble.error { align-self: center; background: #fdecea; color: var(--danger); font-size: 12px; border-radius: 999px; }
.bubble.typing { opacity: .55; }
.bubble.failure { align-self: stretch; max-width: 100%; background: #fff7ed; border: 1px solid #f1c9a8; border-radius: 12px; color: var(--ink); font-size: 13px; }
.bubble.failure strong { display: block; margin-bottom: 4px; color: var(--danger); font-size: 12px; font-weight: 800; letter-spacing: .04em; }
.bubble.failure ul { margin: 0; padding-left: 16px; }
.bubble.failure li { margin: 2px 0; line-height: 1.35; }
.failure-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.failure-actions button { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 5px 9px; font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; }
.failure-actions button:hover { border-color: var(--ember); color: var(--ember-text); }
.suggestion:focus-visible, .failure-actions button:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
#coach-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px; border-top: 1px solid var(--line); background: #fff; }
#coach-form textarea { resize: none; padding: 10px; border: 1px solid var(--line); border-radius: 12px; font: inherit; background: var(--wash); }
#coach-form .btn { padding: 10px 14px; }
#coach-suggestions { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); background: var(--wash); }
#coach-suggestions:empty { display: none; }
.suggestion { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 6px 10px; font-size: 12px; line-height: 1.2; cursor: pointer; text-align: left; }
.suggestion:hover { border-color: var(--ember); color: var(--ember-text); }
/* Wide screens: the coach is a real column beside the page, not a sheet over it. The grid only exists while the panel
   is open, so a closed dock costs no layout shift; the page reflows instead of hiding the cells the coach edits. */
@media (min-width: 1200px) {
  body.coach-open .app-shell { display: grid; grid-template-columns: minmax(0, 1fr) 340px; column-gap: 18px; padding-right: 18px; align-items: start; }
  body.coach-open main { max-width: 1080px; margin: 0 auto; padding: 24px 18px 80px; width: 100%; }
  body.coach-open .coach-dock { display: block; position: sticky; top: 84px; height: calc(100dvh - 100px); }
  body.coach-open #coach-panel { position: static; width: 100%; height: 100%; max-height: none; border-radius: 18px; }
  body.coach-open #coach-bubble { display: none; }
}
/* Below the dock breakpoint the panel floats: a right drawer on tablets, a full sheet on phones. */
@media (max-width: 1199px) {
  #coach-panel { top: 76px; right: 12px; bottom: 12px; left: auto; width: min(380px, calc(100vw - 24px)); height: auto; max-height: none; border-radius: 20px; }
  /* The floating panel gets a real close button; the docked column keeps its quiet minimize. */
  #coach-panel header #coach-close { display: grid; }
  #coach-panel header #coach-minimize { display: none; }
  body.coach-open { overflow: hidden; }
}
@media (max-width: 720px) {
  #coach-panel { top: 6px; right: 6px; bottom: 6px; left: 6px; width: auto; border-radius: 18px; }
  #coach-bubble { right: 12px; bottom: 12px; padding: 12px 16px; }
}

#calendar-fx { position: fixed; inset: 0; z-index: 30; pointer-events: none; opacity: 0; transition: opacity .2s; background: radial-gradient(circle at 50% 42%, rgba(255, 90, 31, .28), rgba(255, 176, 32, .12) 38%, transparent 65%); }
#calendar-fx.active { opacity: 1; }
body.calendar-fx-active main { animation: page-shake .55s cubic-bezier(.36,.07,.19,.97); }
.fx-ghost { position: fixed; z-index: 32; pointer-events: none; padding: 6px 10px; border-radius: 9px; background: #fff; border: 2px solid var(--ember); color: var(--ink); font-size: 13px; font-weight: 700; box-shadow: 0 18px 40px rgba(27,18,12,.3); }
.fx-trash { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%) scale(.8); z-index: 33; font-size: 46px; opacity: .18; transition: opacity .2s, transform .2s; }
.fx-trash.pop { opacity: 1; transform: translateX(-50%) scale(1.35); animation: trash-pop .9s ease-out; }
.cell.fx-land { animation: land-pulse 1.1s ease-out; }
.cell.fx-delete { animation: delete-pulse 1.1s ease-out; }
@keyframes page-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-7px); } 40%, 60% { transform: translateX(7px); } }
@keyframes land-pulse { 0% { box-shadow: 0 0 0 0 rgba(31,122,77,.7); } 60% { box-shadow: 0 0 0 14px rgba(31,122,77,0); } 100% { box-shadow: 0 0 0 0 rgba(31,122,77,0); } }
@keyframes delete-pulse { 0% { box-shadow: 0 0 0 0 rgba(192,58,43,.7); } 60% { box-shadow: 0 0 0 14px rgba(192,58,43,0); } 100% { box-shadow: 0 0 0 0 rgba(192,58,43,0); } }
@keyframes trash-pop { 0% { transform: translateX(-50%) scale(.8) rotate(0); } 35% { transform: translateX(-50%) scale(1.5) rotate(-12deg); } 100% { transform: translateX(-50%) scale(1.35) rotate(0); } }

/* End-of-delete toast: names what was deleted and points at the Recent changes card. */
.fx-toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 36; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; max-width: min(560px, calc(100vw - 24px)); padding: 10px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; box-shadow: 0 18px 44px rgba(27, 18, 12, .24); font-size: 13px; animation: toast-in .25s ease-out; }
.fx-toast span { color: var(--ink-2); }
.fx-toast a { color: var(--ember-text); font-weight: 800; text-decoration: none; }
.fx-toast a:hover { text-decoration: underline; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* Top-bar notifications */
.notif-wrap { position: relative; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); font: inherit; font-size: 18px; cursor: pointer; }
.icon-btn:hover { background: var(--wash); }
.notif-btn { position: relative; }
.notif-badge { position: absolute; top: -5px; right: -5px; display: inline-block; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; }
.notif-badge[hidden], .notif-panel[hidden], .modal[hidden] { display: none; }
.notif-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 40; width: min(360px, calc(100vw - 24px)); max-height: min(60vh, 520px); overflow: auto; padding: 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow); }
.notif-panel header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.notif-panel header .icon-btn { width: 28px; height: 28px; border: 0; background: transparent; font-size: 16px; }
.notif-list { display: grid; gap: 4px; }
.notif-item { display: grid; gap: 2px; padding: 9px 10px; border: 1px solid transparent; border-radius: 10px; color: var(--ink); text-decoration: none; }
.notif-item:hover { border-color: var(--line); background: var(--wash); }
.notif-item strong { font-size: 13px; }
.notif-item span { color: var(--ink-2); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.notif-item time { color: var(--muted); font-size: 11px; }
.notif-empty { padding: 12px 4px; }
.notif-footer { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); text-align: right; }
.notif-footer a { color: var(--ember-text); font-size: 12px; font-weight: 700; text-decoration: none; }
.notif-footer a:hover { text-decoration: underline; }

/* Account menu behind the runner's name */
.account-wrap { position: relative; }
.account-btn { display: inline-flex; align-items: center; gap: 7px; max-width: 42vw; padding: 9px 13px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ember-text); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.account-btn:hover { background: var(--wash); }
.account-btn:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-caret { flex: none; font-size: 11px; color: var(--muted); }
.account-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 40; display: grid; gap: 2px; width: min(252px, calc(100vw - 24px)); padding: 10px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow); }
.account-menu[hidden] { display: none; }
.account-id { display: grid; gap: 1px; margin: 0; padding: 2px 10px 9px; border-bottom: 1px solid var(--line); }
.account-id strong { font-size: 14px; overflow-wrap: anywhere; }
.account-id span { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.account-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ink); font: inherit; font-size: 14px; font-weight: 700; text-align: left; text-decoration: none; cursor: pointer; }
.account-item:hover { background: var(--wash); color: var(--ember-text); }
.account-item:focus-visible { outline: 2px solid var(--ember); outline-offset: -2px; }
.account-signout { color: var(--danger); }
.account-signout:hover { background: #fdeceb; color: var(--danger); }
.account-sep { margin: 6px 0; border: 0; border-top: 1px solid var(--line); }
.sync-btn span { display: inline-block; line-height: 1; font-size: 15px; }
.sync-btn:active span { transform: rotate(180deg); transition: transform .15s ease; }

/* Garmin key popup */
body.modal-open { overflow: hidden; }
.modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 18px; background: rgba(27,18,12,.45); backdrop-filter: blur(3px); }
.modal-card { width: min(560px, 100%); max-height: calc(100vh - 36px); overflow: auto; padding: 20px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 24px 70px rgba(27,18,12,.25); }
.modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.modal-head h2 { margin: 0; font-size: 22px; letter-spacing: -.01em; }
.modal-close { width: 34px; height: 34px; font-size: 20px; }
.key-steps { display: grid; gap: 6px; margin: 12px 0 14px; padding-left: 20px; color: var(--ink-2); font-size: 14px; line-height: 1.45; }
.key-steps a { color: var(--ember-text); font-weight: 600; }
.key-input-row { display: flex; align-items: stretch; gap: 8px; }
.key-input-row input { flex: 1; min-width: 0; }
.key-toggle { flex: none; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ember-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.key-toggle:hover, .key-toggle[aria-pressed="true"] { background: var(--wash); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.btn.ghost { border: 1px solid var(--line); background: transparent; color: var(--ink); box-shadow: none; }
code { padding: 1px 4px; border-radius: 5px; background: var(--wash); font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: .92em; }

.audit-summary { padding: 14px 20px; }
.audit-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.audit-stat { padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.audit-stat strong { display: block; font-size: 22px; line-height: 1.1; }
.audit-stat span { display: block; margin-top: 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 800; }
.audit-modes { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.audit-modes li { line-height: 1.4; }
.audit-item { padding: 12px 0; border-top: 1px dashed var(--line); }
.audit-item:first-of-type { border-top: 0; padding-top: 4px; }
.audit-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }
.audit-visible { margin: 0 0 4px; font-weight: 700; }
.audit-background { margin: 4px 0 0; padding: 8px 10px; border-left: 3px solid var(--solar); background: #fffaf1; border-radius: 0 8px 8px 0; font-size: 13px; color: var(--ink); }

.state-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.state-chips-label { align-self: center; font-size: 12px; font-weight: 700; color: var(--muted); }
.state-ttl-row { display: flex; align-items: center; gap: 6px; }
.state-chip { text-decoration: none; }
.state-status.state-active { color: #1f6b45; border-color: #bfe0cd; background: #eef8f2; }
.state-status.state-observing { color: #8a5a00; border-color: #f0d9a8; background: #fff8e8; }
.state-status.state-resolved { color: var(--muted); }
.state-card { margin-top: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.state-card:first-of-type { margin-top: 6px; }
.state-card.state-observing { border-color: #f0d9a8; background: #fffaf1; }
.state-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.state-head strong { font-size: 15px; }
.state-evidence { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--muted); display: grid; gap: 2px; }
.state-guardrail { margin: 8px 0 0; padding: 7px 9px; border-left: 3px solid var(--ember); background: var(--wash); border-radius: 0 8px 8px 0; font-size: 13px; }
.state-note { margin: 8px 0 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
.state-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.state-refresh { margin: 0 0 8px; }
.state-refresh .btn { font-size: 12px; padding: 7px 10px; }
.state-form { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px 10px; align-items: center; margin-top: 8px; }
.state-form label { font-size: 12px; font-weight: 800; color: var(--muted); }
.state-form input, .state-form select { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; }
.state-form .btn { grid-column: 2; justify-self: start; }
.state-history { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 7px; }
.state-history li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.bubble.state-card { max-width: 92%; border-color: #f0d9a8; background: #fffaf1; }
.state-bubble-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.state-bubble-evidence { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); display: grid; gap: 2px; }
.state-bubble-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.state-bubble-actions .btn { padding: 6px 10px; font-size: 12px; }

@media (max-width: 640px) {
  .top { gap: 8px; }
  .top-actions { gap: 8px; }
  .icon-btn { width: 34px; height: 34px; font-size: 16px; }
  .notif-panel { right: 0; width: min(360px, calc(100vw - 24px)); max-height: 70vh; }
  .account-btn { padding: 7px 10px; font-size: 13px; }
  .account-menu { width: min(252px, calc(100vw - 20px)); }
  .modal { padding: 10px; }
  .modal-card { padding: 16px; max-height: calc(100vh - 20px); }
  .modal-head h2 { font-size: 19px; }
  .modal-actions .btn { flex: 1; }
  #activity-peek { padding: 12px; border-radius: 14px; max-height: 72vh; }
  .peek-head h2 { font-size: 16px; }
  .peek-actions .btn { flex: 1 1 100%; text-align: center; }
  .audit-stats { grid-template-columns: 1fr; }
  .state-form { grid-template-columns: 1fr; }
  .state-form .btn { grid-column: 1; }
  .state-head { align-items: flex-start; }
}

@media print { .top, .notif-wrap, .account-wrap, .modal, .month-nav, form, .btn { display: none; } }

.banner { margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); font-size: 13px; font-weight: 700; }
.banner.ok { background: #eef7f1; border-color: #bfe0cc; color: var(--success); }
.banner.error { background: #fdeeea; border-color: #f1c3b8; color: var(--danger); }
.coach-horizon { margin-left: 10px; color: var(--muted); font-size: 11px; font-weight: 600; }
.head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; }
/* Today's answer strip: date, the booked session, and the two things a runner does with it. */
.today-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 12px 0 14px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
.today-strip-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.today-strip-label { font-weight: 800; font-size: 14px; }
.today-strip-date { color: var(--muted); font-size: 12px; font-weight: 600; white-space: nowrap; }
.today-strip-main { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; flex: 1 1 240px; min-width: 0; }
.today-strip-title { font-weight: 800; font-size: 15px; overflow-wrap: anywhere; }
.today-strip-meta { color: var(--ink-2); font-size: 13px; white-space: nowrap; }
.today-strip-intent { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--ink-2); }
.today-strip-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }
.today-strip-actions .btn { padding: 8px 12px; font-size: 12px; }
.today-strip-empty { color: var(--muted); font-size: 13px; flex: 1 1 240px; }
/* One-line legend for the calendar grid's three row kinds, kept scannable under the header copy. */
.cal-legend { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
/* Garmin freshness beside the data; reads as a sentence, not an uppercase chip. */
.garmin-sync-chip { text-transform: none; letter-spacing: .02em; font-weight: 600; color: var(--muted); background: #fff; }
.empty-card, .connect-card { margin-bottom: 14px; }
.empty-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.change-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.change-item { border-top: 1px dashed var(--line); padding-top: 10px; }
.change-item:first-child { border-top: 0; padding-top: 0; }
.change-item.undone { opacity: .62; }
.change-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; }
.change-undo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
/* The offer shown after a goal change: one tap opens the chat with an editable message. */
.goal-offer { display: grid; gap: 8px; margin: 12px 0; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; background: var(--wash); }
.peek-intent { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
.peek-intent-purpose { margin: 0 0 3px; font-weight: 700; }
.peek-intent-effort { margin: 0; }
.session-intent { margin: 4px 0 0; font-size: 13px; }
.session-intent-effort { margin: 2px 0 0; }
.log-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.best-scope, .trend-window { margin-top: 8px; }
.key-delete-form { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 10px; }

@media (max-width: 640px) { .log-row { grid-template-columns: 1fr; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
  #calendar-fx, .fx-trash, .fx-ghost { display: none !important; }
  body.calendar-fx-active main { animation: none !important; }
}

/* The Muscle tab: a two-view figure, a heat legend and a per-muscle editor over the same form. */
.view-switch { grid-template-columns: repeat(3, 1fr); }
.view-thumb { width: calc((100% - 6px) / 3); }
.view-switch[data-active="history"] .view-thumb { transform: translateX(100%); }
.view-switch[data-active="muscle"] .view-thumb { transform: translateX(200%); }
.muscle-workspace { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; margin: 14px 0; }
.muscle-map-col { min-width: 0; }
/* The reusable 3D muscle plugin's tabbed shell: a 3D figure tab and a list (text) tab. */
.muscle-plugin { display: grid; gap: 8px; }
.muscle-plugin-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--wash); }
.muscle-plugin-tab { border: 0; background: transparent; padding: 4px 14px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 800; color: var(--muted); cursor: pointer; }
.muscle-plugin-tab[aria-selected="true"] { background: #fff; color: var(--ink); box-shadow: 0 2px 8px rgba(27, 18, 12, .10); }
.muscle-plugin-tab:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.muscle-plugin-panel[hidden] { display: none; }
.muscle-list-tab { margin-top: 8px; border: 1px dashed var(--line); border-radius: 12px; background: #fff; padding: 10px 14px; }
.worked-list-tab { margin-top: 8px; display: grid; gap: 6px; }
.muscle-list-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.worked-list-tab .worked-chip { text-decoration: none; }
.muscle-legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; }
.legend-swatch { display: inline-block; width: 20px; height: 12px; border-radius: 3px; border: 1px solid rgba(27, 18, 12, .18); }
.legend-label { font-size: 11px; font-weight: 800; color: var(--muted); margin: 0 2px; }
.muscle-legend-note { margin: 4px 0 0; }
.muscle-editor-col { display: grid; gap: 10px; min-width: 0; }
.muscle-tray { display: flex; flex-wrap: wrap; gap: 6px; }
.muscle-tray-chip { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.muscle-tray-chip.active { border-color: var(--ember); color: var(--ember-text); background: #fff7f1; }
.muscle-tray-remove { border: 0; background: transparent; color: var(--muted); font-size: 13px; line-height: 1; cursor: pointer; padding: 0 2px; }
.muscle-tray-remove:hover { color: var(--danger); }
.muscle-editor { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--wash); }
.muscle-ed-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.muscle-ed-head strong { font-size: 16px; }
.muscle-ed-remove { margin-left: auto; padding: 5px 10px; font-size: 12px; }
.muscle-ed-soreness { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.muscle-ed-soreness input[type="range"] { padding: 0; border: 0; background: transparent; accent-color: var(--ember-deep); }
.muscle-ed-readout { font-weight: 800; font-size: 13px; white-space: nowrap; }
.muscle-ed-anchors { margin: 0; }
.muscle-ed-conditions, .muscle-ed-side, .muscle-ed-warmup { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.muscle-condition-chip { border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink-2); padding: 5px 10px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.muscle-condition-chip[aria-pressed="true"] { border-color: var(--ember-deep); background: var(--ember-deep); color: #fff; }
.muscle-ed-side label, .muscle-ed-warmup label { font-size: 12px; font-weight: 600; }
.muscle-ed-knowledge { border: 1px dashed var(--line); border-radius: 12px; background: #fff; padding: 10px; }
.muscle-ed-knowledge summary { font-weight: 700; font-size: 13px; cursor: pointer; }
.muscle-ed-knowledge-line { margin: 8px 0 0; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
.muscle-ed-drills { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.muscle-ed-drills li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 13px; }
.muscle-quick { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: #fff; }
.muscle-quick legend { font-weight: 800; font-size: 13px; padding: 0 4px; }
.muscle-quick-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.muscle-quick-row label { font-size: 12px; }
.muscle-quick-row select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); font: inherit; font-size: 13px; }
.muscle-quick-conditions { display: flex; flex-wrap: wrap; gap: 6px; }
.quick-condition { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
.quick-condition input { width: auto; padding: 0; margin: 0; }
.muscle-list-groups { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.muscle-list-groups > li > strong { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.muscle-list-items { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.muscle-list-items li { display: grid; gap: 1px; }
.muscle-list-items label { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; }
.muscle-list-items input { width: auto; padding: 0; margin: 0; }
.muscle-readiness { font-weight: 800; }
.readiness-steady { border-color: #bfe0cc; color: #1f7a3a; background: #eef8f1; }
.readiness-watch { border-color: #f0d49a; color: #8a5a00; background: #fff8e8; }
.readiness-care { border-color: #ffb7a6; color: #a3260b; background: #ffe9e2; }
.readiness-urgent { border-color: var(--danger); color: #fff; background: var(--danger); }
.muscle-reading-card, .muscle-care-card { margin-bottom: 16px; }
.muscle-reading-head-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between; }
.muscle-reading-head-row h2 { margin: 0; }
.muscle-reading-list { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.muscle-reading { padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.muscle-reading.care { border-color: #f1b8a8; background: #fff3ec; }
.muscle-reading-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.muscle-reading-head strong { font-size: 15px; }
.muscle-tagline { text-transform: none; letter-spacing: 0; }
.muscle-level { font-weight: 800; }
.level-ok { border-color: #bfe0cc; color: #1f7a3a; background: #eef8f1; }
.level-sore { border-color: #f0d49a; color: #8a5a00; background: #fff8e8; }
.level-heavy { border-color: #ffb7a6; color: #a3260b; background: #ffe9e2; }
.level-watch { border-color: #e0c89a; color: #7a5a10; background: #fdf3df; }
.level-warning { border-color: #f19a86; color: #a3260b; background: #ffe4dc; }
.level-urgent { border-color: var(--danger); color: #fff; background: var(--danger); }
.muscle-care-card { border-color: #f1b8a8; }
.muscle-care-card h2 { margin-top: 0; }
.state-offer-form { margin: 8px 0 0; }
.muscle-drill-section { margin-bottom: 16px; }
.muscle-drill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-top: 10px; }
.muscle-drill-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.muscle-drills { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.muscle-drills li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 13px; }
.drill-cat { text-transform: none; letter-spacing: 0; font-weight: 800; font-size: 10px; }
.drill-mobility { border-color: #3b76d1; color: #214f9c; background: #e4eeff; }
.drill-activation { border-color: #2f9e5f; color: #17653b; background: #e6f5eb; }
.drill-recovery { border-color: #b6a99d; color: #6f5c4d; background: #efedea; }
.muscle-history { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.muscle-history li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.training-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
.training-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-top: 10px; border-top: 1px dashed var(--line); }
.training-row:first-child { border-top: 0; padding-top: 0; }
.training-row-main { display: grid; min-width: 180px; }
.training-row-chips { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 200px; }
.training-row-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.training-row-actions .chip { text-decoration: none; background: #fff; white-space: nowrap; }
.worked-chip { text-transform: none; letter-spacing: 0; font-size: 11px; }
.worked-chip.primary { border-color: var(--ember-deep); color: var(--ember-text); background: #fff7f1; font-weight: 800; }
.worked-chip.secondary { border-color: #ecd9b8; color: #7a6455; background: #fffdf8; }
.muscles-worked-card { margin-bottom: 16px; }
.muscle-safety-list { margin: 10px 0 0; padding-left: 18px; display: grid; gap: 6px; color: var(--ink-2); font-size: 13px; line-height: 1.45; }
.muscle-calendar-chip { text-transform: none; letter-spacing: 0; font-weight: 800; text-decoration: none; border-color: #ffb7a6; color: #a3260b; background: #ffe9e2; }
/* The muscle status layer: the app-bar badge, the live status card and its one-tap controls. */
.view-badge { position: absolute; top: -5px; right: -4px; min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 10.5px; font-weight: 800; line-height: 17px; text-align: center; pointer-events: none; box-shadow: 0 1px 3px rgba(27, 18, 12, .25); }
.attention-badge { display: inline-block; vertical-align: 2px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 12px; font-weight: 800; line-height: 20px; text-align: center; }
.muscle-attention-chip { text-transform: none; letter-spacing: 0; font-weight: 800; text-decoration: none; border-color: #ffb7a6; color: #a3260b; background: #ffe9e2; }
.muscle-status-card { margin-bottom: 16px; }
/* Muscle page: the status/readings rail sits beside the check-in figure from 1024px, so the first interactive
   surface is visible at load instead of below a tall status card. Below that, DOM order (status → form → readings)
   is preserved. */
.muscle-layout { display: block; }
@media (min-width: 1024px) {
  .muscle-layout { display: grid; grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); gap: 18px; align-items: start; margin-bottom: 18px; }
  .muscle-layout > div { min-width: 0; display: grid; gap: 18px; align-content: start; }
  .muscle-layout > div > .card { margin-bottom: 0; }
  .muscle-status-slot { grid-column: 1; grid-row: 1; }
  .muscle-readings-slot { grid-column: 1; grid-row: 2; }
  .muscle-form-slot { grid-column: 2; grid-row: 1 / span 2; }
}
.muscle-status-clear { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
.muscle-status-list { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.muscle-status-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.muscle-attention-dot { flex: 0 0 auto; width: 14px; height: 14px; margin-top: 4px; border-radius: 999px; border: 1px solid rgba(27, 18, 12, .18); }
.muscle-status-main { flex: 1 1 260px; display: grid; gap: 4px; min-width: 0; }
.muscle-status-main p { margin: 0; }
.muscle-status-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }
.muscle-status-actions .chip { text-decoration: none; background: #fff; white-space: nowrap; }
.status-action-form { display: inline-flex; margin: 0; }
.status-action { cursor: pointer; }
.status-action:hover { border-color: var(--ember); color: var(--ember-text); }
.status-allbetter-form { margin: 0; }
.quick-hold { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; }
.quick-hold input { width: auto; padding: 0; margin: 0; }
.muscle-worked-status-row { margin: 8px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.muscle-worked-status { display: inline-flex; align-items: center; gap: 5px; text-decoration: none; background: #fff; text-transform: none; letter-spacing: 0; font-weight: 700; }
.muscle-worked-status .muscle-attention-dot { width: 10px; height: 10px; margin-top: 0; }
.muscle-form { display: grid; gap: 12px; }
.muscle-form-row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 12px; }
.muscle-form-row label { font-size: 13px; }
.muscle-form-row input, .muscle-form-row select { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); font: inherit; }
.hidden { display: none !important; }
/* The 3D muscle viewer: a physically rendered figure the runner can orbit, pause and click. */
.muscle-viewer-wrap { position: relative; display: grid; gap: 8px; }
.muscle-viewer { position: relative; height: 460px; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: radial-gradient(120% 90% at 50% 0%, #fffdf7 0%, #fbf1e3 55%, #f6e6cd 100%); box-shadow: var(--shadow); touch-action: none; }
.muscle-viewer.compact { height: 340px; }
.muscle-viewer canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.muscle-viewer-hint { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 20px; text-align: center; }
.muscle-viewer-failed { display: grid; place-items: center; padding: 20px; text-align: center; color: var(--muted); font-size: 13px; }
.viewer-controls { display: flex; flex-wrap: wrap; gap: 6px; }
.viewer-controls .chip { cursor: pointer; background: #fff; }
.viewer-controls .chip[aria-pressed="true"] { border-color: var(--ember); color: var(--ember-text); }
.viewer-tooltip { position: absolute; z-index: 4; max-width: 210px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255, 255, 255, .95); box-shadow: var(--shadow); font-size: 12px; font-weight: 700; pointer-events: none; }
.muscle-viewer-note { margin: 0; }
@media (max-width: 780px) {
  .muscle-workspace { grid-template-columns: 1fr; }
  .muscle-viewer { height: 380px; }
  .muscle-viewer.compact { height: 300px; }
}
@media (max-width: 640px) {
  .muscle-ed-soreness { grid-template-columns: auto minmax(0, 1fr); }
  .muscle-ed-readout { grid-column: 1 / -1; }
  .training-row-actions { margin-left: 0; }
}
/* Common footer: sits at the bottom of every page (main is flex:1) and holds the language switcher. */
.site-footer { border-top: 1px solid var(--line); background: rgba(255,255,255,.7); padding: 14px 20px; margin-top: auto; }
.site-footer-inner { max-width: 1080px; margin: 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.footer-tagline { font-size: 12px; color: var(--muted); }
.lang-switch { display: flex; align-items: center; gap: 8px; }
.lang-switch-label { font-size: 12px; color: var(--muted); }
.lang-switch-label::before { content: "\\1F310 "; margin-right: 4px; }
.lang-btn { display: inline-block; text-decoration: none; font-size: 12px; font-weight: 600; color: var(--ink); background: var(--wash); border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; transition: background .15s ease, border-color .15s ease; }
.lang-btn:hover { border-color: var(--ember); }
.lang-btn[aria-current="true"] { background: var(--ember); border-color: var(--ember); color: #fff; cursor: default; }
@media (max-width: 640px) {
  .site-footer-inner { justify-content: center; }
}
`;
