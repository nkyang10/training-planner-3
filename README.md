# training-planner-poc3

**POC3 — a calendar-first AI coach.** The private calendar is the product; the coach lives in a bubble on the calendar and
books, moves and deletes training sessions in front of the runner. The coach is an LLM behind a validating gateway, not a
human.

This repo is standalone. Open WebUI is an optional companion surface (full chat + native Calendar mirror), not a
requirement.

## Quick start

```bash
pnpm install
```

```powershell
$env:POC3_TOKENS='{"demo-token":"demo-runner"}'
$env:POC3_DB='sqlite:data/poc3.sqlite'
$env:POC3_MODEL_BASE_URL='http://192.168.1.202:8102/v1'
$env:POC3_MODEL_API_KEY='<model key>'
$env:POC3_MODEL_NAME='dgx/general'
$env:POC3_CALENDAR_URL='http://127.0.0.1:8091/calendar'
$env:GARMIN_PERSONAL_API_KEY='<Garmin personal API key>'
pnpm dev
```

- Calendar: **http://127.0.0.1:8091/calendar** — token `demo-token`
- Coach bubble: bottom-right **💬 Coach**
- Gateway: **http://127.0.0.1:8090/health**
- Optional full chat: set `POC3_CHAT_URL` (e.g. `http://127.0.0.1:3010`) → Open WebUI

## What is in the box

| Surface | What it does |
|---|---|
| Private calendar | month grid, session chips, today ring, Garmin `✓ n` badges, day detail |
| 💬 Coach bubble | self-implemented same-origin chat; books, moves and deletes sessions |
| Coach gateway | OpenAI-compatible `poc3-coach`; validates every proposal before writing |
| Garmin sync | pulls recent activities into the calendar |
| Native calendar mirror | optional: mirrors sessions into Open WebUI's own Calendar, namespaced `poc3_session_id` |

## Docs

- **[docs/POC3-CALENDAR.md](docs/POC3-CALENDAR.md)** — the standalone solution document: architecture, coach contract,
  CRUD/batch semantics, animation, Garmin, API, runbook, limits.
- **[docs/FEATURES-FOR-REVIEW.md](docs/FEATURES-FOR-REVIEW.md)** — candidate features from PoC1/PoC2/Open WebUI, prioritised
  and waiting for owner review.
- ADRs: [0001](docs/adr/0001-server-validated-coach.md), [0002](docs/adr/0002-calendar-first-bubble.md),
  [0003](docs/adr/0003-native-calendar-mirror.md).

## Status

- 51 tests in 6 files; `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Live-verified: multi-day batch CRUD, in-place grid refresh, page-wide CRUD animation, Garmin sync, native calendar
  move/delete/prune, conversation recall.
- Not in scope: multi-user, admin console, Strava, payments, external calendar sync.

## Honest limits

The bubble does not reload old messages after a refresh; there is no streaming in the bubble; one runner only; Open WebUI's
native calendar UI refreshes on navigation. See the solution doc for the full list.

## License

Private proof of concept. No license granted for redistribution.
