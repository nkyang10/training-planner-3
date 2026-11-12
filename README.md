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
$env:POC3_CALENDAR_URL='http://127.0.0.1:8091/calendar'
$env:GARMIN_PERSONAL_API_KEY='<Garmin personal API key>'
pnpm dev
```

- Calendar / sign-up: **http://127.0.0.1:8091/signup** (then `/login`)
- Coach bubble: bottom-right **💬 Coach**
- Gateway: **http://127.0.0.1:8090/health**

## What is in the box

| Surface | What it does |
|---|---|
| Private calendar | month grid, session chips, today ring, Garmin `✓ n` badges, day detail; click a day for actions; month heading opens a year/month picker |
| 💬 Coach bubble | self-implemented same-origin chat; restores the recent conversation after refresh; add / move / delete / revert sessions |
| Coach gateway | OpenAI-compatible `poc3-coach`; validates every proposal before writing |
| Accounts | signup, login, profile (display name, timezone, goal, password), per-user isolation |
| Audit log | every batch stored with before/after snapshots; undo via the coach, no history panel |
| Suggestions | the coach returns 1–3 tappable follow-ups after each turn |
| Garmin sync | pulls recent activities into the calendar |

## Docs

- **[docs/POC3-CALENDAR.md](docs/POC3-CALENDAR.md)** — the standalone solution document: architecture, accounts, coach
  contract, CRUD/batch, change history/revert, suggestions, animation, Garmin, API, runbook, limits.
- **[docs/FEATURES-FOR-REVIEW.md](docs/FEATURES-FOR-REVIEW.md)** — remaining candidate features, prioritised and waiting
  for owner review.
- ADRs: [0001](docs/adr/0001-server-validated-coach.md), [0002](docs/adr/0002-calendar-first-bubble.md).

## Status

- 87 tests in 6 files; `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Live-verified: multi-user signup/login/profile/isolation, multi-day batch CRUD, in-place grid refresh, page-wide CRUD
  animation, conversation reload after refresh, LLM-driven undo, suggestions.
- Not in scope: admin console, Strava, payments, external calendar sync, production multi-tenant deployment.

## Honest limits

The coach accepts bookings up to **180 days ahead** (shown in the bubble header). There is no streaming in the bubble; the auth cookie is signed with
`POC3_AUTH_SECRET` (set a strong secret); the gateway trusts the internal `x-poc3-user` header; SQLite is single-process. See
the solution doc for the full list.

## License

Private proof of concept. No license granted for redistribution.
