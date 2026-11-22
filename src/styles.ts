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
.brand { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; font-weight: 800; letter-spacing: .08em; text-decoration: none; color: var(--ember-text); }
.site-mark { display: inline-flex; flex: none; width: 22px; height: 22px; color: var(--ember-text); }
.site-mark svg { display: block; width: 100%; height: 100%; }
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
/* One period summary line replaces the four stat cards on the training log; the week rows keep their own lines. */
.history-period-summary { margin: -2px 0 8px; }
.history-load-line { margin: -4px 0 10px; }
.history-load-chip { text-decoration: none; font-weight: 800; }
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
/* The dock narrows the content area by 340px; at 1024–1199px with the coach open the two columns would be ~330px
   each, so stack them. The tablet keeps side-by-side when the coach is closed. */
@media (min-width: 1024px) and (max-width: 1199px) {
  body.coach-open .activity-columns { display: block; }
  body.coach-open .activity-col { display: block; }
  body.coach-open .activity-col > .card { margin-bottom: 18px; }
  body.coach-open .muscle-layout { display: block; }
  body.coach-open .muscle-layout > div { display: block; }
  body.coach-open .muscle-layout > div > .card { margin-bottom: 16px; }
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
.seg-labels { display: flex; flex-wrap: wrap; width: fit-content; max-width: 100%; gap: 4px; padding: 3px; background: var(--wash); border: 1px solid var(--line); border-radius: 999px; }
.seg-label { flex: 0 1 auto; min-width: 0; padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 800; color: var(--muted); cursor: pointer; user-select: none; max-width: 100%; overflow-wrap: anywhere; }
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
/* The launcher doubles as the pending-decision badge host while the panel is closed (F4). */
#coach-bubble .coach-pending-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; pointer-events: none; box-shadow: 0 1px 3px rgba(27, 18, 12, .25); }
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
.coach-change-ask { border: 0; background: none; padding: 8px 2px; font: inherit; font-size: 12px; font-weight: 700; color: var(--ember-text); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.coach-change-ask:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.coach-change-more { margin-top: 2px; }
.coach-change-more > summary { display: inline-flex; align-items: center; min-height: 32px; cursor: pointer; font-size: 12px; font-weight: 700; color: var(--ember-text); list-style: none; }
.coach-change-more > summary::-webkit-details-marker { display: none; }
.coach-change-more > summary::marker { content: ""; }
.coach-change-more > summary::before { content: "+ "; }
.coach-change-more[open] > summary::before { content: "\\2212  "; }
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
/* The entry header is one line: the page title and the greeting share a baseline. */
.calendar-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 18px; }
.calendar-head h1 { margin: 0; font-size: clamp(26px, 5vw, 38px); }
.calendar-head > p.muted { margin: 0; font-size: 13px; }
/* The today hero: one answer, one primary action, one quiet fallback, and the coach's context. */
.today-strip { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "head actions" "main actions" "context context"; align-items: center; gap: 2px 20px; margin: 12px 0 14px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--ember); border-radius: 16px; box-shadow: var(--shadow); }
.today-strip-head { grid-area: head; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.today-strip-label { font-weight: 800; font-size: 14px; }
.today-strip-date { color: var(--muted); font-size: 12px; font-weight: 600; white-space: nowrap; }
.today-strip-main { grid-area: main; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.today-strip-title { font-weight: 800; font-size: 15px; overflow-wrap: anywhere; }
.today-strip-meta { color: var(--ink-2); font-size: 13px; white-space: nowrap; }
.today-strip-intent { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--ink-2); }
.today-strip-actions { grid-area: actions; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-left: 0; }
.today-strip .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; font-size: 13px; white-space: nowrap; }
.entry-quiet-link { display: inline-flex; align-items: center; min-height: 24px; padding: 0 2px; border: 0; background: none; font: inherit; font-size: 12px; color: var(--muted); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.entry-quiet-link:hover { color: var(--ember-text); }
.today-strip-empty { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.entry-next { margin-left: 6px; font-size: 13px; font-weight: 500; color: var(--muted); }
.entry-context { grid-area: context; margin: 2px 0 0; padding-top: 6px; border-top: 1px dashed var(--line); font-size: 12px; color: var(--muted); }
.entry-context-label { font-weight: 700; }
.entry-context a.chip { border: 0; padding: 0; background: none; color: var(--muted); text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 500; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
.entry-context a.chip:hover { color: var(--ember-text); }
/* The row key and freshness sit with the grid they explain. */
.cal-key { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: -6px 0 12px; font-size: 11px; color: var(--muted); }
.cal-key-item { display: inline-flex; align-items: center; gap: 5px; }
.key-swatch { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 11px; border-radius: 3px; font-style: normal; font-size: 8px; font-weight: 800; }
.key-swatch.key-plan { background: #e6f5eb; border-left: 3px solid #2f9e5f; color: #17653b; }
.key-swatch.key-record { background: #2f7d57; border-left: 3px solid #1f5f3f; color: #eafbf0; }
.key-swatch.key-pair { background: linear-gradient(180deg, #2f7d57 0 50%, #f4f1ff 50% 100%); border-left: 3px solid #6b5bd6; color: #3f2f96; }
.cal-key .garmin-sync-chip { margin-left: auto; border: 0; padding: 0; background: none; font-size: 11px; color: var(--muted); text-transform: none; letter-spacing: 0; font-weight: 500; }
.cal-key .garmin-connect-link { margin-left: auto; font-size: 11px; color: var(--muted); text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 640px) {
  .calendar-head { display: block; }
  .calendar-head h1 { margin: 0 0 2px; }
  .today-strip { grid-template-columns: minmax(0, 1fr); grid-template-areas: "head" "main" "actions" "context"; gap: 5px; }
  .today-strip-actions { flex-wrap: wrap; }
  .cal-key .garmin-sync-chip, .cal-key .garmin-connect-link { margin-left: 0; flex-basis: 100%; }
}
.change-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.change-item { border-top: 1px dashed var(--line); padding-top: 10px; }
.change-item:first-child { border-top: 0; padding-top: 0; }
/* An undone batch stays readable: the badge carries the state, the text keeps its contrast. */
.change-item.undone .change-head strong { color: var(--muted); }
.change-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; }
.change-head strong { font-size: 15px; overflow-wrap: anywhere; }
.change-meta { font-size: 12px; color: var(--muted); }
.change-badge { display: inline-block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.change-entries { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 5px; }
.change-entry { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 13px; color: var(--ink-2); line-height: 1.4; }
.change-day { flex: 0 0 84px; color: var(--muted); font-variant-numeric: tabular-nums; }
.change-what { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.change-act, .change-title { font-weight: 600; }
.change-delta { color: var(--ember-text); font-weight: 700; }
.change-kind { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.change-more { margin-top: 8px; border-top: 1px dashed var(--line); padding-top: 4px; }
.change-more > summary { display: inline-flex; align-items: center; min-height: 44px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: var(--ember-text); list-style: none; }
.change-more > summary::-webkit-details-marker { display: none; }
.change-more > summary::marker { content: ""; }
.change-more > summary::before { content: "+ "; }
.change-more[open] > summary::before { content: "\\2212  "; }
.change-actions { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.change-actions .btn { padding: 13px 16px; font-size: 13px; }
.change-ask { border: 0; background: none; padding: 10px 4px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--ember-text); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
#recent-changes .btn:focus-visible, #recent-changes .change-ask:focus-visible, #recent-changes .change-more > summary:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.change-see-all { color: var(--ember-text); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.change-see-all:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
/* The standalone all-changes page: one filter row, then schedule batches and quieter activity/muscle rows. */
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 4px; }
.filter-pill { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 7px 13px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-2); font-size: 13px; font-weight: 700; text-decoration: none; }
.filter-pill:hover { border-color: var(--ember); color: var(--ember-text); }
.filter-pill.active { border-color: var(--ember); background: var(--wash); color: var(--ember-text); }
.filter-pill:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.filter-count { font-size: 11px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
.filter-pill.active .filter-count { color: var(--ember-text); }
.changes-summary { margin: 4px 0 12px; }
.changes-footnote { margin-top: 12px; }
.changes-empty-card p { margin: 0; }
.event-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; }
.event-item { border-top: 1px dashed var(--line); padding-top: 10px; }
.event-item:first-child { border-top: 0; padding-top: 0; }
.event-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; }
.event-head strong { font-size: 15px; overflow-wrap: anywhere; }
.event-meta { font-size: 12px; color: var(--muted); }
.event-detail { margin: 6px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--ink-2); overflow-wrap: anywhere; }
.event-detail a { color: var(--ember-text); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.event-detail a:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.event-detail .chip { font-size: 10.5px; }
.event-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 8px; }
.event-actions .chip:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
/* The offer shown after a goal change: one tap opens the chat with an editable message. */
.goal-offer { display: grid; gap: 8px; margin: 12px 0; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; background: var(--wash); }
.peek-intent { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
.peek-intent-purpose { margin: 0 0 3px; font-weight: 700; }
.peek-intent-effort { margin: 0; }
.session-intent { margin: 4px 0 0; font-size: 13px; }
.session-intent-effort { margin: 2px 0 0; }
.log-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
/* The day page's log form is a native disclosure: the summary is the primary action, the form opens in place. */
.log-disclosure { margin: 0 0 18px; }
.log-disclosure > summary { display: inline-flex; align-items: center; min-height: 44px; list-style: none; cursor: pointer; }
.log-disclosure > summary::-webkit-details-marker { display: none; }
.log-disclosure > summary::marker { content: ""; }
.log-panel { margin: 10px 0 0; }
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
/* The coach-suggestion card: the model's notice about a muscle, waiting for the runner's one tap. It reads as a
   soft prompt on the page and as a chat bubble in the dock, and both surfaces post to the same decision endpoint. */
.muscle-proposal-card { margin-bottom: 16px; border-color: #f0d9a8; background: #fffaf1; }
.muscle-proposal-list { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.muscle-proposal { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.muscle-proposal p { margin: 0; }
.muscle-proposal-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.muscle-proposal-chip { border-color: #e7c98e; background: #fdf3df; color: #7a5a1f; text-transform: none; letter-spacing: 0; }
.muscle-proposal-meta { margin-top: -2px; }
/* The decision buttons are the point of the card: a full-size target on the page and a raised one in the dock,
   never the 28px sliver the first pass shipped. */
.proposal-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.proposal-actions .btn { padding: 8px 14px; font-size: 13px; }
.proposal-action-form { display: inline-flex; gap: 8px; margin: 0; }
.proposal-adjust { text-decoration: none; background: #fff; white-space: nowrap; }
#coach-panel .proposal-actions .btn { min-height: 36px; }
.banner-undo { display: inline-flex; margin: 0 0 0 8px; }
.bubble.muscle-suggestion { max-width: 92%; border-color: #f0d9a8; background: #fffaf1; }
.bubble.muscle-suggestion p { margin: 4px 0 0; }
.bubble.muscle-suggestion.ok { border-color: #b7d7b0; background: #f4faf1; }
.muscle-suggestion-pending { font-style: italic; }
.muscle-suggestion-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 700; }
.muscle-suggestion-undo { cursor: pointer; background: #fff; }
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

/* ============================================================================
   Sign-in / sign-up: a warm editorial split, with the form on paper and the
   calendar story on a generated dawn-track plate. Scoped to .auth-page so the
   rest of Milebook keeps its existing chrome.
   ========================================================================== */
.auth-page {
  --auth-paper: #fbf4ea;
  --auth-panel: #fffdf9;
  --auth-ink: #1b120c;
  --auth-muted: #75604f;
  --auth-line: #e7d4c2;
  --auth-line-strong: #a88972;
  --auth-ember: #b9380c;
  --auth-ember-bright: #ff5a1f;
  --auth-solar: #ffb020;
  --auth-sage: #1f7a4d;
  --auth-danger: #a12f22;
  --auth-font: "Segoe UI Variable Text", "Segoe UI", "Noto Sans TC", "Microsoft JhengHei UI", sans-serif;
  --auth-display: Georgia, "Noto Serif TC", "Noto Serif HK", "Times New Roman", serif;
  display: block;
  min-height: 100vh;
  background: var(--auth-paper);
  color: var(--auth-ink);
  font-family: var(--auth-font);
}
.auth-page a { color: inherit; }
.auth-page [hidden] { display: none !important; }
.auth-page main { max-width: none; width: auto; margin: 0; padding: 0; flex: none; }
.auth-page h1, .auth-page h2, .auth-page p { margin: 0; }
.auth-page button, .auth-page input, .auth-page select { font: inherit; }
.auth-page ::selection { background: #ffd7b8; color: var(--auth-ink); }

.auth-skip {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 100;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--auth-ink);
  color: #fff8f0;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-160%);
  transition: transform .16s ease;
}
.auth-skip:focus { transform: translateY(0); outline: 2px solid var(--auth-solar); outline-offset: 2px; }

.auth-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(440px, .94fr);
  min-height: 100vh;
}

/* The story panel ---------------------------------------------------------- */
.auth-story {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  min-height: 600px;
  overflow: hidden;
  isolation: isolate;
  background: #2b1a11;
  color: #fff8f0;
}
.auth-story-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 58% 50%;
  filter: saturate(.92) contrast(1.03);
  transform: scale(1.015);
}
.auth-story-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(20,12,8,.20) 0%, rgba(20,12,8,.08) 34%, rgba(20,12,8,.76) 100%),
    linear-gradient(90deg, rgba(20,12,8,.88) 0%, rgba(20,12,8,.58) 44%, rgba(20,12,8,.14) 100%),
    radial-gradient(78% 55% at 18% 100%, rgba(255,90,31,.22), transparent 72%);
}
.auth-story-inner {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 640px;
  padding: clamp(26px, 4vw, 54px) clamp(24px, 4.4vw, 64px) clamp(26px, 4vw, 48px);
}
.auth-brand {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 10px;
  min-height: 32px;
  color: #fff8f0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .02em;
  text-decoration: none;
}
.auth-brand:hover { color: var(--auth-solar); }
.auth-brand:focus-visible { outline: 2px solid var(--auth-solar); outline-offset: 5px; border-radius: 6px; }
.auth-brand .site-mark { width: 28px; height: 28px; color: var(--auth-solar); }

.auth-story .auth-eyebrow {
  margin: clamp(36px, 8vh, 78px) 0 14px;
  color: var(--auth-solar);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .18em;
  text-transform: uppercase;
}
.auth-story-title {
  max-width: 12ch;
  color: #fff8f0;
  font-family: var(--auth-display);
  font-size: clamp(44px, 5.2vw, 72px);
  font-weight: 500;
  line-height: 1.02;
  letter-spacing: -.025em;
  text-wrap: balance;
}
.auth-story-sub {
  max-width: 36ch;
  margin-top: 20px;
  color: rgba(255,248,240,.84);
  font-size: clamp(15px, 1.2vw, 17px);
  line-height: 1.65;
}
.auth-proof {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 18px;
  max-width: 400px;
  margin: 28px 0 0;
  padding: 17px 0 0;
  border-top: 1px solid rgba(255,248,240,.24);
  list-style: none;
}
.auth-proof li {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(255,248,240,.9);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.auth-proof svg { flex: none; width: 16px; height: 16px; color: var(--auth-solar); }
.auth-story-note {
  max-width: 46%;
  margin-top: auto;
  padding-top: 28px;
  color: rgba(255,248,240,.64);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .09em;
  line-height: 1.5;
  text-transform: uppercase;
}
.auth-object {
  position: absolute;
  right: -5%;
  bottom: 1.5%;
  z-index: 2;
  width: min(54%, 560px);
  height: auto;
  filter: drop-shadow(0 30px 52px rgba(0,0,0,.44));
  transform: rotate(-2.5deg);
  animation: auth-float 11s ease-in-out infinite;
  pointer-events: none;
}
@keyframes auth-float {
  0%, 100% { transform: rotate(-2.5deg) translateY(0); }
  50% { transform: rotate(-2.5deg) translateY(-10px); }
}

/* The form panel ----------------------------------------------------------- */
.auth-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: hidden;
  border-left: 1px solid var(--auth-line);
  background: var(--auth-panel);
}
.auth-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: url("/static/paper-grain.webp");
  background-size: 128px 128px;
  mix-blend-mode: multiply;
  opacity: .42;
  pointer-events: none;
}
.auth-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(120% 75% at 100% 0%, rgba(255,176,32,.10), transparent 58%),
    linear-gradient(180deg, rgba(255,255,255,.35), transparent 26%);
  pointer-events: none;
}
.auth-panel > * { position: relative; z-index: 1; }
.auth-panel-top {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 64px;
  padding: 22px clamp(20px, 3.4vw, 44px) 0;
}
.auth-panel-body {
  width: min(520px, 100%);
  margin: auto;
  padding: 22px clamp(20px, 3.4vw, 44px) 40px;
}

.auth-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--auth-line);
  border-radius: 999px;
  background: #f3e7da;
}
.auth-page .auth-mode-link {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--auth-muted);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: background .18s ease, color .18s ease, box-shadow .18s ease;
}
.auth-page .auth-mode-link:hover { color: var(--auth-ink); background: rgba(255,255,255,.55); }
.auth-page .auth-mode-link[aria-current="page"] {
  background: var(--auth-panel);
  color: var(--auth-ink);
  box-shadow: 0 2px 9px rgba(27,18,12,.11);
}
.auth-page .auth-mode-link[aria-current="page"]::after {
  content: "";
  position: absolute;
  bottom: 6px;
  left: 50%;
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--auth-ember);
  transform: translateX(-50%);
}
.auth-page .auth-mode-link:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }

.auth-head { margin-top: 30px; }
.auth-head .auth-eyebrow {
  margin: 0 0 10px;
  color: var(--auth-ember);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.auth-head h2 {
  color: var(--auth-ink);
  font-family: var(--auth-display);
  font-size: clamp(34px, 3vw, 44px);
  font-weight: 500;
  line-height: 1.08;
  letter-spacing: -.02em;
  text-wrap: balance;
}
.auth-head .auth-sub {
  max-width: 38ch;
  margin-top: 12px;
  color: var(--auth-muted);
  font-size: 14.5px;
  line-height: 1.6;
}

.auth-error {
  display: flex;
  gap: 11px;
  margin-top: 22px;
  padding: 13px 14px;
  border: 1px solid #efc6bf;
  border-left: 3px solid var(--auth-danger);
  border-radius: 12px;
  background: #fff3f0;
  color: #7d251c;
}
.auth-error svg { flex: none; width: 18px; height: 18px; margin-top: 1px; color: var(--auth-danger); }
.auth-error-title { font-size: 13px; font-weight: 800; line-height: 1.4; }
.auth-error-message { margin-top: 3px; font-size: 13px; line-height: 1.5; }
.auth-error-link { color: inherit; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
.auth-error-link:hover { color: var(--auth-ink); }
.auth-error-link:focus-visible { outline: 2px solid var(--auth-danger); outline-offset: 2px; border-radius: 3px; }
.auth-error:focus-visible { outline: 2px solid var(--auth-danger); outline-offset: 2px; }

.auth-form { display: grid; gap: 18px; margin-top: 26px; }
.auth-field { display: grid; gap: 7px; }
.auth-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.auth-label-row label, .auth-field > label {
  color: var(--auth-ink);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .01em;
}

.auth-field input, .auth-field select {
  width: 100%;
  min-height: 52px;
  padding: 0 14px;
  border: 1.5px solid var(--auth-line-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--auth-ink);
  font-family: var(--auth-font);
  font-size: 16px;
  line-height: 1.3;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}
.auth-field input::placeholder { color: #7a6455; opacity: 1; }
/* Chrome paints autofilled fields with a UA !important background. Keep the paper surface
   with an inset shadow, and keep the text in the same ink as typed text. */
.auth-field input:autofill,
.auth-field input:-webkit-autofill,
.auth-field input:-webkit-autofill:hover,
.auth-field input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--auth-ink);
  caret-color: var(--auth-ink);
  box-shadow: 0 0 0 1000px #fff inset;
  transition: background-color 9999s ease-out 0s;
}
.auth-field input:hover, .auth-field select:hover { border-color: #8e7059; }
.auth-field input:focus, .auth-field select:focus {
  outline: none;
  border-color: var(--auth-ember);
  background: #fffdf9;
  box-shadow: 0 0 0 3px rgba(185,56,12,.16);
}
.auth-field input:focus-visible, .auth-field select:focus-visible {
  outline: 2px solid var(--auth-ember);
  outline-offset: 2px;
}
.auth-field input[aria-invalid="true"] { border-color: var(--auth-danger); background: #fff8f6; }
.auth-field input[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px rgba(161,47,34,.16); }
.auth-field select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 44px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='%2375604f' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 15px center;
  background-size: 14px 14px;
  cursor: pointer;
}
.auth-password { position: relative; }
.auth-password input { padding-right: 54px; }
.auth-reveal {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--auth-muted);
  cursor: pointer;
}
.auth-reveal:hover { background: #f7ecdf; color: var(--auth-ink); }
.auth-reveal:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }
.auth-reveal svg { width: 20px; height: 20px; }
.auth-reveal .auth-eye-off { display: none; }
.auth-reveal.is-visible .auth-eye { display: none; }
.auth-reveal.is-visible .auth-eye-off { display: block; }

.auth-hint { color: var(--auth-muted); font-size: 12px; line-height: 1.5; }
.auth-hint:empty { display: none; }
.auth-field-error { color: var(--auth-danger); font-size: 12px; font-weight: 600; line-height: 1.45; }
.auth-field-error:empty { display: none; }
.auth-caps { color: #7a5000; font-size: 12px; font-weight: 700; line-height: 1.45; }
.auth-caps::before { content: "⇪ "; }

.auth-strength { display: grid; gap: 6px; margin-top: 1px; }
.auth-strength-bars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.auth-strength-bar { height: 4px; border-radius: 999px; background: #eadac8; transition: background .18s ease; }
.auth-strength[data-score="1"] .auth-strength-bar:nth-child(-n+1) { background: var(--auth-danger); }
.auth-strength[data-score="2"] .auth-strength-bar:nth-child(-n+2) { background: #a96f00; }
.auth-strength[data-score="3"] .auth-strength-bar { background: var(--auth-sage); }
.auth-strength-text { color: var(--auth-muted); font-size: 12px; line-height: 1.45; }
.auth-strength[data-tone="warn"] .auth-strength-text { color: #7a5000; }
.auth-strength[data-tone="ok"] .auth-strength-text { color: var(--auth-sage); }

.auth-goal-disclosure {
  border: 1px solid var(--auth-line-strong);
  border-radius: 12px;
  background: #fffaf4;
}
.auth-goal-disclosure summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  color: var(--auth-ink);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.4;
  list-style: none;
  cursor: pointer;
}
.auth-goal-disclosure summary::-webkit-details-marker { display: none; }
.auth-goal-summary-label { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.auth-goal-saved { color: var(--auth-sage); font-size: 11px; font-weight: 700; letter-spacing: .02em; }
.auth-goal-disclosure summary::after {
  content: "+";
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--auth-line-strong);
  border-radius: 50%;
  color: var(--auth-ember);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
}
.auth-goal-disclosure[open] summary::after { content: "−"; }
.auth-goal-disclosure summary:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; border-radius: 10px; }
.auth-goal-disclosure .auth-goal-field { padding: 0 12px 12px; }
.auth-goal-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 1px; }
.auth-goal-chip {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--auth-line-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--auth-ink);
  font-family: var(--auth-font);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.auth-goal-chip:hover { border-color: var(--auth-ember); background: #fff8f1; color: var(--auth-ember); }
.auth-goal-chip:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  margin-top: 4px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: var(--auth-ember);
  color: #fff;
  font-family: var(--auth-font);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: .01em;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(185,56,12,.22);
  transition: background .16s ease, transform .16s ease, box-shadow .16s ease;
}
.auth-submit:hover { background: #9f2f08; box-shadow: 0 12px 28px rgba(185,56,12,.28); transform: translateY(-1px); }
.auth-submit:active { transform: translateY(0); }
.auth-submit:focus-visible { outline: 2px solid var(--auth-ink); outline-offset: 3px; }
.auth-submit.is-busy, .auth-submit[aria-disabled="true"] { opacity: .74; cursor: wait; transform: none; box-shadow: none; pointer-events: none; }
.auth-submit-arrow { font-size: 18px; line-height: 1; transition: transform .16s ease; }
.auth-submit:hover .auth-submit-arrow { transform: translateX(3px); }
.auth-submit.is-busy .auth-submit-arrow { display: none; }
.auth-spinner {
  display: none;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,.42);
  border-top-color: #fff;
  border-radius: 50%;
  animation: auth-spin .8s linear infinite;
}
.auth-submit.is-busy .auth-spinner { display: block; }
@keyframes auth-spin { to { transform: rotate(360deg); } }

.auth-foot { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--auth-line); }
.auth-switch-line { color: var(--auth-muted); font-size: 13px; line-height: 1.6; }
.auth-switch-line a { color: var(--auth-ember); font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.auth-switch-line a:hover { color: var(--auth-ink); }
.auth-switch-line a:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; border-radius: 4px; }
.auth-help { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--auth-line); }
.auth-help summary {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  color: var(--auth-ink);
  font-size: 12.5px;
  font-weight: 700;
  list-style: none;
  cursor: pointer;
}
.auth-help summary::-webkit-details-marker { display: none; }
.auth-help summary::before {
  content: "?";
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border: 1px solid var(--auth-line-strong);
  border-radius: 50%;
  color: var(--auth-muted);
  font-size: 11px;
  font-weight: 700;
}
.auth-help summary:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }
.auth-help p { margin-top: 6px; color: var(--auth-muted); font-size: 12.5px; line-height: 1.55; }
.auth-help a { display: inline-block; margin-top: 6px; color: var(--auth-ember); font-size: 12.5px; font-weight: 700; }
.auth-help a:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }

.auth-lang { gap: 6px; }
.auth-lang .lang-switch-label { display: none; }
.auth-lang .lang-btn {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 5px 10px;
  border-color: var(--auth-line-strong);
  background: #fff;
  font-size: 11.5px;
}
.auth-lang .lang-btn:hover { border-color: var(--auth-ember); color: var(--auth-ember); }
.auth-lang .lang-btn:focus-visible { outline: 2px solid var(--auth-ember); outline-offset: 2px; }
.auth-lang .lang-btn[aria-current="true"] { border-color: var(--auth-ink); background: var(--auth-ink); color: #fff; }

/* A quiet entrance; the global reduced-motion block stops it for anyone who asks. */
@keyframes auth-rise {
  from { opacity: 0; transform: translateY(9px); }
  to { opacity: 1; transform: none; }
}
.auth-mode, .auth-head, .auth-form, .auth-foot, .auth-error { animation: auth-rise .48s cubic-bezier(.2,.7,.2,1) both; }
.auth-head { animation-delay: .04s; }
.auth-form { animation-delay: .08s; }
.auth-foot { animation-delay: .13s; }
.auth-story-inner > * { animation: auth-rise .55s cubic-bezier(.2,.7,.2,1) both; }
.auth-story-inner > :nth-child(2) { animation-delay: .05s; }
.auth-story-inner > :nth-child(3) { animation-delay: .09s; }
.auth-story-inner > :nth-child(4) { animation-delay: .13s; }
.auth-story-inner > :nth-child(5) { animation-delay: .17s; }
.auth-story-inner > :nth-child(6) { animation-delay: .21s; }

/* Tablet / phone: the story becomes a short brand band and the form a sheet. */
@media (max-width: 980px) {
  .auth-shell { display: block; min-height: 100vh; }
  .auth-story {
    position: relative;
    top: auto;
    height: 40vh;
    min-height: 300px;
    max-height: 430px;
  }
  .auth-story-inner {
    max-width: none;
    padding: 22px 22px 24px;
  }
  .auth-story .auth-eyebrow { margin: 22px 0 10px; }
  .auth-story-title { max-width: 12ch; font-size: clamp(34px, 7.2vw, 52px); }
  .auth-story-sub { max-width: 34ch; margin-top: 12px; font-size: 14px; }
  .auth-proof { max-width: 360px; margin-top: 16px; padding-top: 12px; gap: 6px 14px; }
  .auth-proof li { font-size: 11px; }
  .auth-story-note { display: none; }
  .auth-object { width: min(42%, 260px); right: -3%; bottom: -8%; }
  .auth-panel {
    min-height: calc(100vh - 40vh + 30px);
    margin-top: -30px;
    border-left: 0;
    border-radius: 26px 26px 0 0;
    box-shadow: 0 -20px 50px rgba(27,18,12,.20);
  }
  .auth-panel-top { min-height: 52px; padding: 16px 20px 0; }
  .auth-panel-body { width: min(460px, 100%); padding: 6px 20px 32px; }
  .auth-mode { margin-top: 4px; }
  .auth-head { margin-top: 24px; }
}

@media (max-width: 640px) {
  .auth-story { height: 36vh; min-height: 270px; }
  .auth-story-inner { padding: 18px 18px 22px; }
  .auth-brand { font-size: 14px; gap: 8px; }
  .auth-brand .site-mark { width: 25px; height: 25px; }
  .auth-story .auth-eyebrow { margin: 16px 0 8px; font-size: 10px; }
  .auth-story-title { max-width: 11ch; font-size: clamp(30px, 8.4vw, 42px); line-height: 1.07; }
  .auth-story-sub { max-width: 26ch; margin-top: 9px; font-size: 13px; line-height: 1.55; }
  .auth-proof, .auth-story-note { display: none; }
  .auth-object { width: min(44%, 180px); right: -18px; bottom: -18px; opacity: .95; }
  .auth-panel { min-height: calc(100vh - 36vh + 24px); margin-top: -24px; border-radius: 22px 22px 0 0; }
  .auth-panel-top { min-height: 46px; padding: 12px 16px 0; }
  .auth-panel-body { padding: 2px 18px 30px; }
  .auth-head { margin-top: 22px; }
  .auth-head h2 { font-size: clamp(30px, 8vw, 38px); }
  .auth-head .auth-sub { font-size: 13.5px; }
  .auth-form { gap: 16px; margin-top: 22px; }
  .auth-field input, .auth-field select { min-height: 50px; }
  .auth-submit { min-height: 52px; }
  .auth-mode-link { min-height: 40px; font-size: 12.5px; }
  .auth-lang .lang-btn { min-height: 30px; padding: 4px 9px; font-size: 11px; }
}

@media (max-width: 380px) {
  .auth-story-title { font-size: 29px; }
  .auth-object { width: 150px; right: -22px; }
  .auth-panel-body { padding-left: 15px; padding-right: 15px; }
  .auth-mode-link { padding: 0 6px; font-size: 12px; }
  .auth-label-row { gap: 6px; }
}

/* Chinese display type needs a little more air than the Latin serif. */
.auth-page[lang="zh-HK"] .auth-story-title {
  max-width: 10ch;
  font-size: clamp(38px, 4.7vw, 62px);
  line-height: 1.16;
  letter-spacing: -.01em;
}
.auth-page[lang="zh-HK"] .auth-story-sub { line-height: 1.78; }
.auth-page[lang="zh-HK"] .auth-head h2 { line-height: 1.22; letter-spacing: -.01em; }
@media (max-width: 980px) {
  .auth-page[lang="zh-HK"] .auth-story-title { font-size: clamp(32px, 6.8vw, 46px); }
}
@media (max-width: 640px) {
  .auth-page[lang="zh-HK"] .auth-story-title { font-size: clamp(29px, 8vw, 38px); }
}

@media (max-height: 760px) and (min-width: 981px) {
  .auth-panel-body { padding-top: 8px; padding-bottom: 24px; }
  .auth-head { margin-top: 20px; }
  .auth-form { gap: 14px; margin-top: 18px; }
  .auth-foot { margin-top: 14px; padding-top: 14px; }
}

/* Sign-up carries two extra fields. On a desktop viewport it tightens its rhythm so the
   primary action and the footer stay above the fold without turning the form into a wall. */
@media (min-width: 981px) {
  .auth-page[data-mode="signup"] .auth-panel-body { padding-top: 6px; padding-bottom: 24px; }
  .auth-page[data-mode="signup"] .auth-head { margin-top: 20px; }
  .auth-page[data-mode="signup"] .auth-head h2 { font-size: clamp(32px, 2.7vw, 40px); }
  .auth-page[data-mode="signup"] .auth-head .auth-sub { margin-top: 8px; }
  .auth-page[data-mode="signup"] .auth-form { gap: 13px; margin-top: 18px; }
  .auth-page[data-mode="signup"] .auth-field { gap: 5px; }
  .auth-page[data-mode="signup"] .auth-field input,
  .auth-page[data-mode="signup"] .auth-field select { min-height: 48px; }
  .auth-page[data-mode="signup"] .auth-hint { font-size: 11.5px; line-height: 1.4; }
  .auth-page[data-mode="signup"] .auth-submit { min-height: 50px; }
  .auth-page[data-mode="signup"] .auth-strength { gap: 4px; }
  .auth-page[data-mode="signup"] .auth-foot { margin-top: 14px; padding-top: 14px; }
  .auth-page[data-mode="signup"] .auth-goal-disclosure summary { min-height: 42px; }
}

/* Laptop and tablet landscape: keep the primary action above the fold without hiding a required field. */
@media (min-width: 981px) and (max-height: 840px) {
  .auth-panel-body { padding-top: 0; padding-bottom: 8px; }
  .auth-head { margin-top: 10px; }
  .auth-head .auth-sub { margin-top: 4px; }
  .auth-form { gap: 10px; margin-top: 10px; }
  .auth-field { gap: 3px; }
  .auth-field input, .auth-field select { min-height: 44px; }
  .auth-submit { min-height: 46px; }
  .auth-foot { margin-top: 8px; padding-top: 8px; }
  .auth-page[data-mode="signup"] .auth-goal-disclosure summary { min-height: 38px; }
  .auth-error { margin-top: 10px; padding: 8px 11px; gap: 8px; }
  .auth-error-title { font-size: 12px; }
  .auth-error-message { margin-top: 1px; font-size: 12px; }
  .auth-page[data-mode="signup"] .auth-panel-body { padding-top: 0; padding-bottom: 4px; }
  .auth-page[data-mode="signup"] .auth-head { margin-top: 8px; }
  .auth-page[data-mode="signup"] .auth-head .auth-sub { margin-top: 4px; }
  .auth-page[data-mode="signup"] .auth-form { gap: 9px; margin-top: 9px; }
  .auth-page[data-mode="signup"] .auth-field { gap: 2px; }
  .auth-page[data-mode="signup"] .auth-field input,
  .auth-page[data-mode="signup"] .auth-field select { min-height: 44px; }
  .auth-page[data-mode="signup"] .auth-submit { min-height: 46px; }
  .auth-page[data-mode="signup"] .auth-foot { margin-top: 6px; padding-top: 6px; }
}
@media (min-width: 981px) and (max-width: 1120px) {
  .auth-panel-body { padding-inline: 28px; }
}

/* The 980 px sheet breakpoint needs its own short-viewport composition: a shorter brand band,
   no proof row, and a tighter form so the sign-in action does not fall under the fold. */
@media (min-width: 641px) and (max-width: 980px) and (max-height: 860px) {
  .auth-story { height: 32vh; min-height: 240px; }
  .auth-story .auth-eyebrow { margin-top: 12px; }
  .auth-story-title { font-size: clamp(32px, 5.6vw, 44px); }
  .auth-story-sub { margin-top: 8px; }
  .auth-proof { display: none; }
  .auth-panel { min-height: calc(100vh - 32vh + 24px); }
  .auth-panel-top { min-height: 42px; padding-top: 10px; }
  .auth-panel-body { padding-bottom: 20px; }
  .auth-head { margin-top: 16px; }
  .auth-form { gap: 14px; margin-top: 16px; }
  .auth-foot { margin-top: 12px; padding-top: 10px; }
}

@media (max-width: 980px) {
  .auth-error-title::after { content: " ·"; }
}

/* Tablets: the error banner sits above the form; keep it to one line so the action stays reachable. */
@media (min-width: 641px) and (max-width: 980px) {
  .auth-error { margin-top: 10px; padding: 8px 11px; gap: 8px; }
  .auth-error > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; }
  .auth-error-title { font-size: 12px; }
  .auth-error-message { margin-top: 0; font-size: 12px; }
}

/* Phones: tighter rhythm, but the same 50 px controls and full labels. */
@media (max-width: 640px) {
  .auth-panel-body { padding-bottom: 24px; }
  .auth-head { margin-top: 18px; }
  .auth-form { gap: 14px; margin-top: 18px; }
  .auth-field { gap: 6px; }
  .auth-hint { font-size: 11.5px; line-height: 1.45; }
  .auth-foot { margin-top: 16px; padding-top: 14px; }
  .auth-goal-disclosure summary { min-height: 44px; }
  .auth-error { margin-top: 12px; padding: 9px 11px; gap: 8px; }
  .auth-error > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; }
  .auth-error-title { font-size: 12px; }
  .auth-error-message { margin-top: 0; font-size: 12px; }
}

/* Small phones in landscape or with a short viewport: keep the form's primary action reachable. */
@media (max-width: 480px) and (max-height: 740px) {
  .auth-story { height: 30vh; min-height: 210px; }
  .auth-story .auth-eyebrow { margin-top: 10px; }
  .auth-story-sub { display: none; }
  .auth-panel { min-height: calc(100vh - 30vh + 20px); }
  .auth-panel-body { padding-bottom: 8px; }
  .auth-head { margin-top: 10px; }
  .auth-form { gap: 10px; margin-top: 10px; }
  .auth-foot { margin-top: 8px; padding-top: 8px; }
}

/* Windows High Contrast / forced colors: keep the task legible, not the art direction. */
@media (forced-colors: active) {
  .auth-page { background: Canvas; color: CanvasText; }
  .auth-story { background: Canvas; color: CanvasText; }
  .auth-story-bg, .auth-story-shade, .auth-object, .auth-panel::before { display: none; }
  .auth-story-title, .auth-story-sub, .auth-proof, .auth-story-note, .auth-brand, .auth-brand .site-mark { color: CanvasText; }
  .auth-panel { border-left-color: CanvasText; background: Canvas; }
  .auth-field input, .auth-field select, .auth-goal-disclosure, .auth-goal-chip, .auth-mode, .auth-lang .lang-btn, .auth-help, .auth-reveal {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .auth-field select { appearance: auto; -webkit-appearance: auto; background-image: none; padding-right: 14px; }
  .auth-field input::placeholder { color: GrayText; }
  .auth-submit { border: 2px solid ButtonText; background: ButtonFace; color: ButtonText; }
  .auth-submit .auth-arrow, .auth-submit .auth-spinner { color: ButtonText; }
  .auth-error { border: 2px solid CanvasText; border-left: 3px solid CanvasText; background: Canvas; color: CanvasText; }
  .auth-error svg, .auth-error-link { color: CanvasText; }
  .auth-strength-bar { border: 1px solid CanvasText; background: Canvas; }
  .auth-strength[data-score="1"] .auth-strength-bar:nth-child(-n+1),
  .auth-strength[data-score="2"] .auth-strength-bar:nth-child(-n+2),
  .auth-strength[data-score="3"] .auth-strength-bar { background: Highlight; }
  .auth-mode-link[aria-current="page"], .auth-lang .lang-btn[aria-current="true"] {
    border-color: Highlight;
    background: Highlight;
    color: HighlightText;
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
  .auth-page .auth-mode-link { color: CanvasText; }
  .auth-page .auth-mode-link[aria-current="page"] {
    border-color: Highlight;
    background: Highlight;
    color: HighlightText;
  }
  .auth-field input:focus-visible, .auth-field select:focus-visible, .auth-reveal:focus-visible,
  .auth-goal-disclosure summary:focus-visible, .auth-goal-chip:focus-visible, .auth-submit:focus-visible,
  .auth-error:focus-visible, .auth-error-link:focus-visible, .auth-lang .lang-btn:focus-visible,
  .auth-switch-line a:focus-visible, .auth-help summary:focus-visible, .auth-help a:focus-visible,
  .auth-brand:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
}
`;
