export const CSS = `
:root {
  --ink: #1b120c; --ink-2: #3a2a20; --paper: #fff8f0; --surface: #ffffff; --wash: #fff1e4;
  --line: #f0dccb; --ember: #ff5a1f; --solar: #ffb020; --success: #1f7a4d; --danger: #c03a2b; --muted: #7a6455;
  --radius: 20px; --shadow: 0 10px 30px rgba(27, 18, 12, .08);
  --font: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: radial-gradient(1200px 600px at 10% -10%, #ffe6cf 0%, var(--paper) 45%, #fff 100%); min-height: 100vh; }
a { color: var(--ink); }
.top { display: flex; align-items: center; gap: 16px; padding: 14px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.8); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 5; }
.brand { font-weight: 800; letter-spacing: .08em; text-decoration: none; color: var(--ember); }
.top-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.sync-icon-form { display: flex; margin: 0; }
.sync-btn { font-size: 21px; font-weight: 800; }
.sync-btn span { display: inline-block; line-height: 1; }
.sync-btn:active span { transform: rotate(180deg); transition: transform .15s ease; }
.top .profile { text-decoration: none; font-weight: 700; color: var(--ember); }
.top a:last-child { text-decoration: none; color: var(--muted); }
main { max-width: 1080px; margin: 0 auto; padding: 24px 18px 80px; }
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
.btn { display: inline-block; border: 0; background: linear-gradient(135deg, var(--ember), var(--solar)); color: #fff; padding: 12px 18px; border-radius: 999px; font-weight: 800; cursor: pointer; text-decoration: none; text-align: center; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.error { color: var(--danger); font-weight: 600; }
.ok { color: var(--success); font-weight: 600; }
.month-nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 10px; margin-bottom: 14px; }
.month-nav a { text-decoration: none; color: var(--muted); font-weight: 600; }
.month-nav .month-current { color: var(--ink); }
.dow, .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.dow span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); text-align: center; padding-bottom: 4px; }
.cell { min-height: 104px; border: 1px solid var(--line); border-radius: 12px; padding: 8px; background: var(--wash); text-decoration: none; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; overflow: hidden; }
.cell.pad { background: transparent; border-style: dashed; }
.cell.today { outline: 2px solid var(--ember); outline-offset: -2px; background: #fff; }
.cell .date { font-weight: 800; font-size: 14px; line-height: 1.15; }
.session { display: block; font-size: 11px; line-height: 1.25; padding: 3px 6px; border-radius: 7px; background: #fff; border: 1px solid var(--line); }
.session.kind-interval, .session.kind-tempo { border-color: var(--ember); color: var(--ember); }
.session.kind-long { border-color: var(--solar); }
.session.kind-racewalk { border-color: #7a4fd6; color: #5b34b0; }
.session.kind-rest { color: var(--muted); }
.cal-pill { position: relative; display: flex; align-items: center; gap: 3px; flex: 0 0 auto; min-width: 0; max-width: 100%; padding: 2px 5px; border-radius: 6px; border-left: 3px solid var(--pill-accent, var(--line)); background: var(--pill-bg, #f4f1ee); color: var(--pill-ink, var(--ink-2)); font-size: 10.5px; font-weight: 700; line-height: 1.3; }
.cal-pill .cal-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-pill .cal-check { flex: none; font-size: 9.5px; font-weight: 800; color: var(--pill-check, currentColor); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cal-pill.plan.kind-easy { --pill-bg: #e6f5eb; --pill-ink: #17653b; --pill-accent: #2f9e5f; }
.cal-pill.plan.kind-long { --pill-bg: #fff2d2; --pill-ink: #7d5100; --pill-accent: #dfa000; }
.cal-pill.plan.kind-interval, .cal-pill.plan.kind-tempo { --pill-bg: #ffe3da; --pill-ink: #9e2409; --pill-accent: #ff5a1f; }
.cal-pill.plan.kind-rest { --pill-bg: #efedea; --pill-ink: #6f5c4d; --pill-accent: #b6a99d; }
.cal-pill.plan.kind-cross { --pill-bg: #e4eeff; --pill-ink: #214f9c; --pill-accent: #3b76d1; }
.cal-pill.plan.kind-race { --pill-bg: #ffe0e7; --pill-ink: #941c39; --pill-accent: #d92b4b; }
.cal-pill.plan.kind-racewalk { --pill-bg: #ece5ff; --pill-ink: #5130a0; --pill-accent: #7a4fd6; }
.cal-pill.record { --pill-bg: #2f7d57; --pill-ink: #fff; --pill-accent: #1f5f3f; --pill-check: #d3f0df; }
.cal-more { flex: 0 0 auto; padding: 0 2px; color: var(--muted); font-size: 10px; font-weight: 800; line-height: 1.3; }
.sessions { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.sessions li { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.chip { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.note { color: var(--ink-2); margin: 6px 0 0; }
.tick { color: var(--success); font-weight: 800; }
@media (max-width: 640px) {
  main { padding: 16px 10px 60px; }
  .cell { min-height: 78px; padding: 5px; }
  .session { font-size: 10px; padding: 2px 4px; }
  .cal-pill { font-size: 9px; padding: 1px 3px; border-left-width: 2px; }
  .cal-pill .cal-check { font-size: 8px; }
  .cal-more { font-size: 9px; }
  .top { padding: 10px 12px; gap: 8px; }
  .top .profile { font-size: 13px; }
}
.view-bar { display: flex; justify-content: center; padding: 8px 16px 10px; background: rgba(255,255,255,.72); border-bottom: 1px solid var(--line); }
.view-switch { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: min(340px, 100%); padding: 4px; background: var(--wash); border: 1px solid var(--line); border-radius: 999px; box-sizing: border-box; }
.view-thumb { position: absolute; top: 4px; left: 4px; width: calc(50% - 4px); height: calc(100% - 8px); border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(27, 18, 12, .10); transition: transform .22s ease, opacity .2s; }
.view-switch[data-active="history"] .view-thumb { transform: translateX(100%); }
.view-switch[data-active="none"] .view-thumb { opacity: 0; }
.view-tab { position: relative; z-index: 1; text-align: center; padding: 7px 10px; font-size: 13px; font-weight: 800; color: var(--muted); text-decoration: none; border-radius: 999px; }
.view-tab.active { color: var(--ink); }
.view-tab:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
.history-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.history-summary .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; box-shadow: var(--shadow); }
.history-summary strong { display: block; font-size: 20px; letter-spacing: -.02em; }
.history-summary span { display: block; margin-top: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.range-switch { display: flex; flex-wrap: wrap; gap: 6px; }
.range-switch .chip { text-decoration: none; background: #fff; }
.range-switch .chip.active { border-color: var(--ember); color: var(--ember); }
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
.coach-ask:hover { border-color: var(--ember); color: var(--ember); }
.history-missed { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 4px; }
.source-garmin { color: var(--success); }
.source-chat { color: var(--ember); }
.history-empty { text-align: center; }
.history-empty .coach-ask { margin-top: 8px; }
@media (max-width: 640px) {
  .view-bar { padding: 6px 10px 8px; }
  .view-switch { width: 100%; }
  .history-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .history-activity { align-items: flex-start; flex-direction: column; }
}
.chip.match-on-plan { border-color: var(--success); color: var(--success); }
.chip.match-short { border-color: var(--solar); color: #8a5a00; }
.chip.match-long { border-color: var(--ember); color: var(--ember); }
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
.trend-axis { fill: var(--muted); font-size: 9px; font-family: var(--font); }
.trend-value { fill: var(--ink-2); font-size: 9px; font-family: var(--font); font-weight: 700; }
.trend-line { fill: none; stroke: var(--ember); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.trend-dot { fill: #fff; stroke: var(--ember); stroke-width: 2; }
.trend-note { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.trend-stats dl { display: grid; gap: 8px; margin: 0; }
.trend-stats dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-top: 1px dashed var(--line); padding-top: 8px; }
.trend-stats dl div:first-child { border-top: 0; padding-top: 0; }
.trend-stats dt { color: var(--muted); font-size: 12px; }
.trend-stats dd { margin: 0; font-weight: 800; }
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
.period-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.period-nav a { text-decoration: none; color: var(--muted); font-weight: 700; }
.period-nav a:hover { color: var(--ember); }
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
.load-stat { padding: 10px 11px; background: var(--wash); border: 1px solid var(--line); border-radius: 12px; }
.load-stat strong { display: block; font-size: 18px; letter-spacing: -.02em; }
.load-stat span { display: block; margin-top: 2px; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.load-actions { display: flex; flex-wrap: wrap; gap: 8px; }
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
.pr-chip { background: var(--ember); border-color: var(--ember); color: #fff; font-size: 9px; padding: 2px 6px; }
.laps-card { margin-bottom: 16px; }
.laps-table { display: grid; gap: 2px; }
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
#coach-bubble { position: fixed; right: 18px; bottom: 18px; z-index: 20; border: 0; border-radius: 999px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: #fff; background: linear-gradient(135deg, var(--ember), var(--solar)); box-shadow: 0 12px 30px rgba(255, 90, 31, .35); cursor: pointer; }
#coach-panel { position: fixed; right: 18px; bottom: 18px; z-index: 21; width: min(380px, calc(100vw - 24px)); height: calc(100vh - 36px); height: calc(100dvh - 36px); max-height: calc(100dvh - 36px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 24px 60px rgba(27, 18, 12, .25); overflow: hidden; }
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
.month-picker-foot button { border: 0; border-radius: 999px; background: var(--wash); color: var(--ember); padding: 6px 10px; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }

#day-menu { position: fixed; z-index: 50; display: grid; gap: 2px; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 44px rgba(27, 18, 12, .24); }
#day-menu[hidden] { display: none; }
.day-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 6px 8px; font-size: 12px; }
.day-menu-head button { border: 0; background: transparent; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; }
#day-menu button[data-action] { border: 0; border-radius: 9px; background: transparent; color: var(--ink); text-align: left; padding: 9px 10px; font: inherit; font-size: 13px; cursor: pointer; }
#day-menu button[data-action]:hover:not(:disabled), #day-menu button[data-action]:focus-visible:not(:disabled) { background: var(--wash); outline: 2px solid transparent; }
#day-menu button[data-action]:disabled { color: var(--muted); opacity: .55; cursor: not-allowed; }

#coach-panel[hidden] { display: none; }
#coach-panel header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--wash); border-bottom: 1px solid var(--line); }
#coach-panel header button { border: 0; background: transparent; width: 32px; height: 32px; padding: 0; display: grid; place-items: center; border-radius: 8px; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); }
#coach-panel header button:hover { background: rgba(27, 18, 12, .06); color: var(--ink); }
.coach-limit { display: block; margin-top: 2px; font-size: 10px; font-weight: 400; color: var(--muted); }
#coach-log { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 88%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
.bubble.user { align-self: flex-end; background: var(--ember); color: #fff; border-bottom-right-radius: 4px; }
.bubble.coach { align-self: flex-start; background: var(--wash); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.bubble.system { align-self: center; background: #eef8f1; color: var(--success); font-size: 12px; border-radius: 999px; }
.bubble.error { align-self: center; background: #fdecea; color: var(--danger); font-size: 12px; border-radius: 999px; }
.bubble.typing { opacity: .55; }
.bubble.failure { align-self: stretch; max-width: 100%; background: #fff7ed; border: 1px solid #f1c9a8; border-radius: 12px; color: var(--ink); font-size: 13px; }
.bubble.failure strong { display: block; margin-bottom: 4px; color: var(--danger); font-size: 12px; font-weight: 800; letter-spacing: .04em; }
.bubble.failure ul { margin: 0; padding-left: 16px; }
.bubble.failure li { margin: 2px 0; line-height: 1.35; }
.failure-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.failure-actions button { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 5px 9px; font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; }
.failure-actions button:hover { border-color: var(--ember); color: var(--ember); }
.suggestion:focus-visible, .failure-actions button:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
#coach-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px; border-top: 1px solid var(--line); background: #fff; }
#coach-form textarea { resize: none; padding: 10px; border: 1px solid var(--line); border-radius: 12px; font: inherit; background: var(--wash); }
#coach-form .btn { padding: 10px 14px; }
#coach-suggestions { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); background: var(--wash); }
#coach-suggestions:empty { display: none; }
.suggestion { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 6px 10px; font-size: 12px; line-height: 1.2; cursor: pointer; text-align: left; }
.suggestion:hover { border-color: var(--ember); color: var(--ember); }
@media (max-width: 640px) {
  #coach-panel { right: 6px; bottom: 6px; width: calc(100vw - 12px); height: calc(100dvh - 12px); border-radius: 18px; }
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
.notif-footer a { color: var(--ember); font-size: 12px; font-weight: 700; text-decoration: none; }
.notif-footer a:hover { text-decoration: underline; }

/* Garmin key popup */
body.modal-open { overflow: hidden; }
.modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 18px; background: rgba(27,18,12,.45); backdrop-filter: blur(3px); }
.modal-card { width: min(560px, 100%); max-height: calc(100vh - 36px); overflow: auto; padding: 20px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 24px 70px rgba(27,18,12,.25); }
.modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.modal-head h2 { margin: 0; font-size: 22px; letter-spacing: -.01em; }
.modal-close { width: 34px; height: 34px; font-size: 20px; }
.key-steps { display: grid; gap: 6px; margin: 12px 0 14px; padding-left: 20px; color: var(--ink-2); font-size: 14px; line-height: 1.45; }
.key-steps a { color: var(--ember); font-weight: 600; }
.key-input-row { display: flex; align-items: stretch; gap: 8px; }
.key-input-row input { flex: 1; min-width: 0; }
.key-toggle { flex: none; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ember); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.key-toggle:hover, .key-toggle[aria-pressed="true"] { background: var(--wash); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.btn.ghost { border: 1px solid var(--line); background: transparent; color: var(--ink); box-shadow: none; }
code { padding: 1px 4px; border-radius: 5px; background: var(--wash); font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: .92em; }

@media (max-width: 640px) {
  .top { gap: 8px; }
  .top-actions { gap: 8px; }
  .icon-btn { width: 34px; height: 34px; font-size: 16px; }
  .notif-panel { right: 0; width: min(360px, calc(100vw - 24px)); max-height: 70vh; }
  .modal { padding: 10px; }
  .modal-card { padding: 16px; max-height: calc(100vh - 20px); }
  .modal-head h2 { font-size: 19px; }
  .modal-actions .btn { flex: 1; }
}

@media print { .top, .notif-wrap, .modal, .month-nav, form, .btn { display: none; } }
`;
