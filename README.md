<h1 align="center">⚡ POC3</h1>

<p align="center">
  <strong>A calendar-first AI coach for runners.</strong><br>
  The private calendar is the product; the coach lives in a bubble on it and books, moves, deletes and reverts training
  sessions in front of the runner.
</p>

<p align="center">
  <a href="#status"><img alt="Tests: 172 passing" src="https://img.shields.io/badge/tests-172%20passing-1f7a4d"></a>
  <a href="#status"><img alt="Typecheck: passing" src="https://img.shields.io/badge/typecheck-passing-1f7a4d"></a>
  <img alt="Node.js 24+" src="https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&amp;logoColor=white">
  <img alt="TypeScript 5.x" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&amp;logoColor=white">
  <img alt="Private proof of concept" src="https://img.shields.io/badge/license-private%20PoC-7a6455">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-is-in-the-box">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#docs">Docs</a> ·
  <a href="#deploy-the-live-process">Deploy</a> ·
  <a href="#status">Status</a> ·
  <a href="#honest-limits">Limits</a>
</p>

<p align="center">
  <img src="docs/design/calendar-pills.png" alt="POC3 November calendar with colored plan pills and green recorded-run pills" width="900">
</p>

<p align="center"><em>Plan pills are colored by kind; green ✓ pills are recorded runs.</em></p>

> **POC3** is a proof of concept: a private training calendar owned by the system, with an LLM coach behind a validating
> gateway. Accounts are independent; every runner keeps their own profile, plan, training log and coach conversation.

**Stack:** TypeScript · Node.js 24 · SQLite (`node:sqlite`) · vanilla HTML/CSS/JS · Vitest · OpenAI-compatible gateway.

## Quick start

**Prerequisites:** Node.js **24+** and pnpm.

```powershell
pnpm install

$env:POC3_AUTH_SECRET='<long random secret>'
$env:POC3_DB='sqlite:data/poc3.sqlite'
$env:POC3_MODEL_BASE_URL='http://192.168.1.202:8102/v1'
$env:POC3_MODEL_API_KEY='<model key>'
$env:POC3_MODEL_NAME='dgx/general'
$env:POC3_MAX_ATTEMPTS='2'
pnpm dev
```

PowerShell is shown above; on macOS/Linux use `export NAME=value` instead.

| Surface | Default URL |
|---|---|
| Calendar / sign-up | **http://127.0.0.1:8091/signup** (then `/login`) |
| Coach bubble | bottom-right **💬 Coach** on the calendar |
| Gateway health | **http://127.0.0.1:8090/health** |

The live deployment runs the calendar on **:8093** and the gateway on **:8092**; the defaults above are **:8091/:8090**.
See the [environment reference](docs/POC3-CALENDAR.md#environment-reference) for every variable.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the calendar web process and the coach gateway. |
| `pnpm test` | Run the Vitest suite (172 tests in 9 files). |
| `pnpm typecheck` | Type-check `src`, `test` and `tools` with `tsc --noEmit`. |
| `pnpm lint` | Dependency-free gate: no console output outside `src/index.ts`, no TODO/FIXME, no `any` or secrets in `src`/`test`. |
| `pnpm deploy:live` | Restart the live :8093/:8092 process with `tools/deploy.ps1`. |

## What is in the box

### 🗓️ Plan

- **Private month calendar** — Monday-first grid, today ring, colored plan pills, green `✓` recorded-run pills, hover
  tooltips and a `+n more` hint for busy days.
- **Day actions** — click a day to add, move, delete, ask the coach or open the day detail; the middle nav opens a
  year/month picker.
- **In-place updates** — coach turns refresh the grid without a reload; changed pills animate into place.

### 📈 Training log

- **Week / Month / Year** views with previous/next/current navigation and date/month/year pickers.
- Week = seven day cards with plan-match badges; month = week rows; year = month rows.
- Adaptive daily/weekly/monthly volume, pace/HR trends, consistency, weekly load/ACWR/hard-easy, period best efforts
  and PR badges.
- Per-activity **Ask coach**, **Review my week** and auto-sync review prompts.

### 🏃 Activity detail

- Full metrics, rich Garmin metrics, fastest 1 km / 1 mi / 5 km efforts, per-kilometre splits, Garmin laps/intervals and
  HR-zone time.
- Planned-vs-actual comparison with distance/duration deltas and bars, plus links back to the day and plan.

### 💬 Coach

- Self-implemented same-origin bubble; restores the recent conversation after refresh.
- Add / move / delete / revert sessions; 1–3 tappable follow-ups; starter prompts; a structured **Not applied** card.
- The OpenAI-compatible `poc3-coach` gateway validates every proposal before writing, with one bounded
  repair/clarification loop and idempotent request replay.
- Every batch is stored with before/after snapshots; undo is requested in chat, with no history panel.

### 🔐 Accounts & Garmin

- Standalone accounts: signup, login, profile (display name, timezone, goal, password), per-user isolation.
- Per-runner Garmin Personal API key, verified before storage and never shown again in full. The top-bar sync icon sits
  next to the notification bell and opens the key guide when none is saved.
- Automatic sync on every new browser session (login or resumed auth cookie) plus page-load backoff. Pulls the last
  90 days, up to 100 activities per pull; repeated syncs upsert by `(user_id, activity_id)` and enrich
  load/cadence/elevation/effect/HR-zone fields.
- The same Garmin activity can be synced independently by multiple accounts; run detail fetches per-kilometre samples
  and lap summaries on demand.
- Notification bell is the sync feed: manual/key syncs confirm, automatic no-change checks stay silent, errors always
  appear. Routine "Auto-synced N" and "Garmin sync: N imported" banners are gone; the review card appears only for a
  genuinely new activity.

## Architecture

```mermaid
flowchart LR
    B["Browser<br/>calendar · training log · coach bubble"]
    W["POC3 web<br/>:8093"]
    G["POC3 gateway<br/>:8092"]
    M["LLM<br/>dgx/general"]
    S[("SQLite<br/>accounts, plan, activities, messages, change sets")]

    B -->|"/calendar · /history"| W
    B -->|"/chat"| W
    W -->|"x-poc3-user"| G
    G -->|"OpenAI-compatible"| M
    W --- S
    G --- S
```

One SQLite file, two processes:

- **POC3 web** owns accounts, the calendar, the training log, activity detail, Garmin sync and the same-origin bubble
  proxy.
- **POC3 gateway** owns the OpenAI-compatible contract, validates `propose_calendar_turn`, and writes validated change
  sets through the same store.
- The bubble is not an iframe: it can read and animate the grid directly (ADR-0002).

## Project layout

| Path | What lives there |
|---|---|
| `src/` | Web server, gateway, coach contract, store, Garmin sync, training-log math. |
| `test/` | 172 Vitest tests across 9 files. |
| `docs/` | Solution doc, training-log plan, feature backlog, ADRs and design screenshots. |
| `tools/` | Dependency-free lint gate and the live deploy script. |

## Docs

| Document | What it answers |
|---|---|
| [Solution document](docs/POC3-CALENDAR.md) | Architecture, accounts, coach contract, CRUD/batch, change history/revert, suggestions, animation, training log, activity detail, trends, auto-sync, Garmin, API, runbook and limits. |
| [Training-log plan](docs/TRAINING-LOG-PLAN.md) | Research, feature inventory and the implemented load/ramp, rich-metrics, per-kilometre-split, lap/interval, HR-zone, best-efforts/PR and weekly-review slices. |
| [Feature backlog](docs/FEATURES-FOR-REVIEW.md) | Remaining candidate features, prioritised and waiting for owner review. |
| [ADR-0001](docs/adr/0001-server-validated-coach.md) | LLM proposes; the server validates before writing. |
| [ADR-0002](docs/adr/0002-calendar-first-bubble.md) | The calendar is the product; the bubble is same-origin, not an iframe. |
| [ADR-0003](docs/adr/0003-validation-feedback-loop.md) | Rejected proposals are fed back for one repair/clarification; turns are idempotent. |

More screenshots: [calendar CRUD animation](docs/design/calendar-crud-animation.png) ·
[coach starter suggestions](docs/design/coach-starter-suggestions.png) ·
[delete in place](docs/design/coach-delete-in-place.png) ·
[training log week](docs/design/training-log-week.png) ·
[activity detail](docs/design/activity-detail.png).

## Deploy the live process

On Windows, every completed change is deployed by restarting the live :8093/:8092 process:

```powershell
pnpm deploy:live
```

`tools/deploy.ps1` reads the auth secret from `data/poc3-auth.secret`, uses `sqlite:data/poc3-auth.sqlite`, stops only the
process whose command line contains `src/index.ts`, starts `pnpm dev`, waits for `/health` and `/login`, and rejects a
stylesheet without the calendar pill styles. Logs are `data/poc3-live.out.log` and `data/poc3-live.err.log`; the deploy
history is `data/poc3-deploy.log`.

## Status

| Gate | State |
|---|---|
| Tests | **172 / 172** in 9 files |
| Lint | pass (`pnpm lint`) |
| Typecheck | pass (`pnpm typecheck`) |
| Live deployment | calendar **:8093**, gateway **:8092** |

**Live-verified:** multi-user signup/login/profile/isolation; multi-day batch CRUD; in-place grid refresh including delete
without reload; page-wide CRUD animation; conversation reload after refresh; LLM-driven undo; starter and follow-up
suggestions; non-scrolling suggestion rail; minimize-to-bubble; structured failure cards; Plan/Training log switcher;
timezone-correct "today"; native tool calls; validation feedback; clarification instead of a dead-end fallback; idempotent
request replay.

**Live-verified Garmin:** a real personal-key pull of **100 activities** (the list endpoint's maximum); the 90-day
filter/upsert; enriched load/cadence/elevation/effect/HR-zone fields; the current week's real load card; per-kilometre
splits on a real run detail; Garmin laps/intervals; HR zones and PR badges; period best efforts; the auto-sync review
prompt; and the week/month/year selector against the live database.

**Cross-account:** two accounts can store the same Garmin activity independently, and a repeated sync leaves the
notification count unchanged.

**Notifications:** automatic no-change page loads leave both the page and the bell silent; the existing new-activity
notification and the 2026-11-15 recorded run remain. Manual/key no-new confirmations and newest-new targeting are
test-covered.

**Fixture-verified:** populated week, month and year training-log views plus the load card, weekly review prompt, period
best efforts and activity detail with rich metrics, per-kilometre splits, laps, HR zones and PR badges (headless Chrome:
[training log](docs/design/training-log.png), [week](docs/design/training-log-week.png),
[year](docs/design/training-log-year.png), [activity detail](docs/design/activity-detail.png)); plan-vs-actual matcher;
adaptive volume and pace/HR charts; load/ramp and hard/easy classification; split parsing; lap mapping; HR zones; personal
bests; auto-sync backoff.

**Calendar pills:** planned sessions and recorded runs render as colored descriptions in each day cell, with the full
kind/metrics/note in the hover tooltip and a `+n more` hint when a day has more than four items (headless Chrome:
[calendar-pills.png](docs/design/calendar-pills.png)).

**Not in scope:** admin console, Strava, payments, external calendar sync, production multi-tenant deployment.

## Honest limits

- **Booking horizon:** the coach accepts bookings up to **180 days ahead** (shown in the bubble header).
- **Model loop:** one bounded repair attempt; there is no open-ended agent loop.
- **No streaming:** the bubble waits for the full reply.
- **Auth:** the cookie is signed with `POC3_AUTH_SECRET`; set a strong secret.
- **Gateway trust:** the gateway trusts the internal `x-poc3-user` header; keep it on a private network.
- **SQLite:** single-process; run one app process per database.
- **Garmin:** capped at **100 activities per pull**; the Personal API key is stored per runner in SQLite in plaintext, so
  run this PoC on a private server.
- **Training load:** Garmin's proprietary value; ACWR is a soft coupled 7/28-day signal, not medical advice.
- **Splits and zones:** per-kilometre splits are computed on demand from Garmin detail samples; Garmin's own
  lap/interval summaries are separate; HR-zone time has no stored zone boundaries.
- **PRs:** PR badges and period best efforts are bests within stored history (100 activities / 90 days), not a lifetime
  record. A dedicated records page and zone charts are later slices.

See the [solution document](docs/POC3-CALENDAR.md) and [training-log plan](docs/TRAINING-LOG-PLAN.md) for the full list.

## License

> Private proof of concept. No license granted for redistribution.
