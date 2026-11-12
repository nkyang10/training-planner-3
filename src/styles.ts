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
.top .profile { margin-left: auto; text-decoration: none; font-weight: 700; color: var(--ember); }
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
.month-nav .month-this { color: var(--ember); }
.month-nav .month-this.active { color: var(--muted); }
.month-nav .month-current.active { color: var(--ember); }
.dow, .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.dow span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); text-align: center; padding-bottom: 4px; }
.cell { min-height: 104px; border: 1px solid var(--line); border-radius: 12px; padding: 8px; background: var(--wash); text-decoration: none; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.cell.pad { background: transparent; border-style: dashed; }
.cell.today { outline: 2px solid var(--ember); outline-offset: -2px; background: #fff; }
.cell .date { font-weight: 800; font-size: 14px; }
.session { display: block; font-size: 11px; line-height: 1.25; padding: 3px 6px; border-radius: 7px; background: #fff; border: 1px solid var(--line); }
.session.kind-interval, .session.kind-tempo { border-color: var(--ember); color: var(--ember); }
.session.kind-long { border-color: var(--solar); }
.session.kind-racewalk { border-color: #7a4fd6; color: #5b34b0; }
.session.kind-rest { color: var(--muted); }
.done { font-size: 11px; color: var(--success); font-weight: 700; }
.sessions { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.sessions li { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--wash); }
.chip { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.note { color: var(--ink-2); margin: 6px 0 0; }
.tick { color: var(--success); font-weight: 800; }
@media (max-width: 640px) {
  main { padding: 16px 10px 60px; }
  .cell { min-height: 78px; padding: 5px; }
  .session { font-size: 10px; padding: 2px 4px; }
  .top { padding: 10px 12px; gap: 8px; }
  .top .profile { font-size: 13px; }
}
#coach-bubble { position: fixed; right: 18px; bottom: 18px; z-index: 20; border: 0; border-radius: 999px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: #fff; background: linear-gradient(135deg, var(--ember), var(--solar)); box-shadow: 0 12px 30px rgba(255, 90, 31, .35); cursor: pointer; }
#coach-panel { position: fixed; right: 18px; bottom: 18px; z-index: 21; width: min(380px, calc(100vw - 24px)); height: calc(100vh - 36px); height: calc(100dvh - 36px); max-height: calc(100dvh - 36px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 24px 60px rgba(27, 18, 12, .25); overflow: hidden; }
.month-title { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: baseline; gap: 6px; }
.month-title:hover .month-caret, .month-title:focus-visible .month-caret { color: var(--ember); }
.month-caret { color: var(--muted); font-size: 18px; }
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
#coach-panel header button { border: 0; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); }
.coach-limit { display: block; margin-top: 2px; font-size: 10px; font-weight: 400; color: var(--muted); }
#coach-log { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 88%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
.bubble.user { align-self: flex-end; background: var(--ember); color: #fff; border-bottom-right-radius: 4px; }
.bubble.coach { align-self: flex-start; background: var(--wash); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.bubble.system { align-self: center; background: #eef8f1; color: var(--success); font-size: 12px; border-radius: 999px; }
.bubble.error { align-self: center; background: #fdecea; color: var(--danger); font-size: 12px; border-radius: 999px; }
.bubble.typing { opacity: .55; }
#coach-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px; border-top: 1px solid var(--line); background: #fff; }
#coach-form textarea { resize: none; padding: 10px; border: 1px solid var(--line); border-radius: 12px; font: inherit; background: var(--wash); }
#coach-form .btn { padding: 10px 14px; }
#coach-suggestions { flex: 0 0 auto; max-height: 96px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--line); background: var(--wash); }
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

@media print { .top, .month-nav, form, .btn { display: none; } }
`;
