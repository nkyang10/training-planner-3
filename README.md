# training-planner-poc3

**POC3 — a calendar-first AI coach.** The private calendar is the product; the coach lives in a bubble on the calendar and
books, moves, deletes and reverts training sessions in front of the runner. The coach is an LLM behind a validating gateway,
not a human. Accounts are standalone: sign up, sign in, keep your own profile and calendar.

## Quick start

```bash
pnpm install
```

```powershell
$env:POC3_AUTH_SECRET='<long random secret>'
$env:POC3_DB='sqlite:data/poc3.sqlite'
$env:POC3_MODEL_BASE_URL='http://192.168.1.202:8102/v1'
$env:POC3_MODEL_API_KEY='<model key>'
$env:POC3_MODEL_NAME='dgx/general'
$env:POC3_MAX_ATTEMPTS='2'
pnpm dev
```

- Calendar / sign-up: **http://127.0.0.1:8091/signup** (then `/login`)
- Coach bubble: bottom-right **💬 Coach**
- Gateway: **http://127.0.0.1:8090/health**

The live deployment runs the calendar on **8093** and the gateway on **8092**; the defaults above are 8091/8090.

## What is in the box

| Surface | What it does |
|---|---|
| Private calendar | month grid, session chips, today ring, Garmin `✓ n` badges, day detail; click a day for actions; middle nav (viewed month, no separate heading) opens a year/month picker |
| Training log | `/history`; **Week / Month / Year** views with previous/next/current navigation and date/month/year pickers; week = seven day cards, month = week rows, year = month rows; adaptive daily/weekly/monthly volume plus pace/HR trends, plan-match badges, **weekly load/ACWR/hard-easy card**, **period best efforts**, per-activity Ask coach, **Review my week** prompt and auto-sync review prompt |
| Activity detail | `/activity/<id>`; full metrics, **rich Garmin metrics, fastest efforts with PR badges, per-kilometre splits, Garmin laps/intervals and HR-zone time**, planned-vs-actual comparison with distance/duration deltas and bars, Ask coach, day/plan links |
| 💬 Coach bubble | self-implemented same-origin chat; restores the recent conversation after refresh; add / move / delete / revert sessions |
| Coach gateway | OpenAI-compatible `poc3-coach`; validates every proposal before writing; one bounded repair/clarification loop |
| Accounts | signup, login, profile (display name, timezone, goal, password), per-user isolation |
| Audit log | every batch stored with before/after snapshots; idempotent `coach_turns` records; undo via the coach, no history panel |
| Suggestions | the coach returns 1–3 tappable follow-ups after each turn; the rail shows starter prompts when there are none, and a missing target renders a structured "Not applied" card |
| Garmin sync | per-runner Personal API key saved from the calendar popup; the Sync Garmin button is always available and opens the key guide when none is saved; automatic on every new browser session (login or resumed auth cookie) plus page-load backoff; pulls the last 90 days; repeated sync upserts by activity id and enriches load/cadence/elevation/effect/HR-zone fields; a top-bar notification bell records successes and errors; run detail fetches per-kilometre samples and lap summaries on demand |

## Docs

- **[docs/POC3-CALENDAR.md](docs/POC3-CALENDAR.md)** — the standalone solution document: architecture, accounts, coach
  contract, CRUD/batch, change history/revert, suggestions, animation, training log, activity detail, trends, auto-sync,
  Garmin, API, runbook, limits.
- **[docs/TRAINING-LOG-PLAN.md](docs/TRAINING-LOG-PLAN.md)** — training-log research, feature inventory and the implemented
  load/ramp, rich-metrics, per-kilometre-split, lap/interval, HR-zone, best-efforts/PR and weekly-review slices.
- **[docs/FEATURES-FOR-REVIEW.md](docs/FEATURES-FOR-REVIEW.md)** — remaining candidate features, prioritised and waiting
  for owner review.
- ADRs: [0001](docs/adr/0001-server-validated-coach.md), [0002](docs/adr/0002-calendar-first-bubble.md),
  [0003](docs/adr/0003-validation-feedback-loop.md).

## Status

- 164 tests in 8 files; `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Live-verified: multi-user signup/login/profile/isolation, multi-day batch CRUD, in-place grid refresh (including delete
  without reload), page-wide CRUD animation, conversation reload after refresh, LLM-driven undo, starter and follow-up
  suggestions, non-scrolling suggestion rail, minimize-to-bubble, structured failure cards, Plan/Training log switcher,
  timezone-correct "today", native tool calls, validation feedback, clarification instead of a dead-end fallback, and
  idempotent request replay.
- Live-verified Garmin: a real personal-key pull of **100 activities** (the list endpoint's supported maximum), the 90-day
  filter/upsert, enriched load/cadence/elevation/effect/HR-zone fields, the current week's real load card, per-kilometre
  splits on a real run detail, Garmin laps/intervals, HR zones and PR badges, period best efforts, the auto-sync review
  prompt, and the week/month/year selector against the live database.
- Fixture/mock-verified: populated week, month and year training-log views plus the load card, weekly review prompt, period
  best efforts and activity detail with rich metrics, per-kilometre splits, laps, HR zones and PR badges (headless Chrome,
  [docs/design/training-log.png](docs/design/training-log.png),
  [docs/design/training-log-week.png](docs/design/training-log-week.png),
  [docs/design/training-log-year.png](docs/design/training-log-year.png) and
  [docs/design/activity-detail.png](docs/design/activity-detail.png)), plan-vs-actual matcher, adaptive daily/weekly/monthly
  volume and pace/HR charts, load/ramp and hard/easy classification, per-kilometre split parsing, lap mapping, HR zones,
  personal bests and auto-sync backoff.
- Each runner saves their own Garmin Personal API key in the calendar popup; the key is verified before it is stored and
  is never shown again in full. The key is per-runner, not deployment-wide. The notification bell records sync successes
  and errors; a new browser session (login or a resumed auth cookie) triggers one pull when a key is saved.
- Not in scope: admin console, Strava, payments, external calendar sync, production multi-tenant deployment.

## Honest limits

The coach accepts bookings up to **180 days ahead** (shown in the bubble header). The model gets one bounded repair attempt;
there is no open-ended agent loop. There is no streaming in the bubble; the auth cookie is signed with
`POC3_AUTH_SECRET` (set a strong secret); the gateway trusts the internal `x-poc3-user` header; SQLite is single-process.
Garmin sync is capped at 100 activities per pull. The Personal API key is stored per runner in SQLite in plaintext, so
run this PoC on a private server. Training load is
Garmin's proprietary value; ACWR is a soft coupled 7/28-day signal, not medical advice. Per-kilometre splits are computed
on demand from Garmin detail samples; Garmin's own lap/interval summaries are shown separately. HR-zone time has no stored
zone boundaries. PR badges and period best efforts are bests within stored history (100 activities/90 days), not a lifetime
record; a dedicated records page and zone charts are later slices.
See the solution doc and training-log plan for the full list.

## License

Private proof of concept. No license granted for redistribution.
