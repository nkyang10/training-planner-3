# POC3 — candidate features for owner review

**Status:** review list for the remaining work. The first POC3 slice is implemented: standalone accounts/profiles,
change history with LLM-driven undo, and coach suggestions. Everything below is still a proposal; the owner reviews and picks
the next slice.

This list pulls the useful parts of PoC1 and PoC2 into the calendar-first POC3. Priorities are recommendations, not
commitments.

Legend: **P0** = next slice, high value/low risk · **P1** = strong follow-up · **P2** = later · **P3** = only with a clear
product reason.

---

## 1. Where the previous solutions left useful parts

| Source | Useful part | POC3 already has it? | What is missing / worth carrying over |
|---|---|---|---|
| **PoC1** | Deterministic planner + calendar | No (POC3 is LLM-first) | A deterministic fallback planner when the model is down or returns invalid JSON |
| PoC1 | Garmin + Strava sync | Garmin yes, Strava no | Strava as a second activity source; unified activity model |
| PoC1 | Admin console | No | A read-only admin/debug page: messages, memories, sessions, sync runs |
| PoC1 | Uploads (plan files) | No | Upload a race plan/PDF and let the coach import it |
| PoC1 | Auth / multi-user | **Yes** — signup/login/profile, per-user isolation | Email verification, password reset, SSO |
| PoC1 | Coach conversation | Bubble | Conversation persistence in the bubble (currently reload loses it) |
| PoC2 | Self-implemented bubble | Yes | Streaming, history reload, retry, error states |
| PoC2 | CRUD + batch + animation | Yes | Diff preview, conflict detection |
| POC3 | Change history + undo | **Yes** — change_sets, before/after, LLM revert | Audit viewer, redo, selective revert |
| POC3 | Coach suggestions | **Yes** — 1–3 tappable follow-ups | Suggestion ranking, feedback loop |
| PoC2 | Prompt history + memory | Yes | Memory management ("forget that"), summarisation |
| PoC2 | Garmin Personal API quirks | Yes | Background sync, dedupe, post-run feedback |
| **POC3** | Calendar-first UX | Yes | Make it mobile/PWA, add week/agenda views, reminders |

---

## 2. Candidate feature table

### A. Calendar UX

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| A1 | **Bubble loads recent conversation** from SQLite on open | The bubble currently starts empty after refresh; the coach "remembers" but the runner cannot see the thread | **P0** | S | Needs a `GET /chat/history` route and message rendering; keep last N turns |
| A2 | ~~Undo last coach change~~ | **Implemented** — change journal + LLM revert + bubble Undo | — | — | See change history section |
| A3 | **Diff preview / confirm before apply** | "Review original existing too" becomes visible: show add/move/delete diff before writing | **P1** | M | Two-phase turn: propose → confirm; gateway must not write on propose |
| A4 | Streaming reply in the bubble | Long coach answers feel dead; streaming would keep the reply alive | **P1** | M | SSE parsing in bubble; gateway already emits one chunk, extend to token chunks |
| A5 | Week / agenda view + "today" button | Month grid is good for planning; week/agenda is better for daily use | P1 | M | Reuse `/calendar/data`; new render path |
| A6 | Drag-and-drop reschedule with confirm | Direct manipulation is faster than typing "move Tuesday" | P2 | L | Needs drag targets, conflict rules, coach re-validation |
| A7 | Reminders / notifications | A plan is only useful if the runner is nudged | P1 | M | Browser notifications or email; per-session reminder time |
| A8 | Weekly load / volume summary | Runners care about weekly km and hard/easy balance | P1 | M | Sum sessions by week; warn on ramp > 10–15% |
| A9 | iCal export | The system calendar is private; runners may want it elsewhere | P2 | S | Read-only `.ics` endpoint; no external sync |
| A10 | Mobile PWA / installable | Calendar-first is a phone product | P1 | M | Manifest, service worker, offline shell |
| A11 | Reduced-motion / accessibility pass | The animation is intentionally loud; some users need it off | P1 | S | `prefers-reduced-motion`; keyboard focus, aria labels |
| A12 | Multi-month / year heatmap | Training history and consistency | P2 | M | Aggregate activities/sessions by month |

### B. Coach and planning

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| B1 | **Post-run feedback loop** | After Garmin sync, the coach should say "you ran 5.2 km at easy pace; keep Sunday long" | **P0** | M | Needs activity context in prompt + a "review my week" turn |
| B2 | **Deterministic fallback planner** | Model outage or invalid JSON should not leave the runner with nothing | **P0** | M | Reuse PoC1 planner ideas; gateway fallback when `parseCoachTurn` fails |
| B3 | **Memory manager** | Let the runner see/delete what the coach remembers | P1 | S | `GET/DELETE /memories`; UI list in bubble/settings |
| B4 | **Goal / race countdown** | "10k in 8 weeks" should become a visible target and a plan end date | P1 | M | Session kind `race`; countdown card; plan horizon |
| B5 | **Conflict detection** | Two sessions on one day, or a hard day after a race | P1 | M | Rules: max 2/day, no hard after race, rest day spacing |
| B6 | **Injury / fatigue guardrails** | The coach should stop, not push, when the runner reports pain | **P0** | S | Prompt rule + hard block on booking when pain keywords; safety copy |
| B7 | **Plan templates** | "Base 5k", "10k 8-week", "Half marathon" starting points | P2 | M | Template JSON; coach fills dates |
| B8 | **Conversation summarisation** | Long histories hit prompt limits | P2 | M | Summarise older turns into memories |
| B9 | **Language / locale** | Chinese/English mix is already real | P1 | S | Detect language; keep Traditional Chinese rule; date formats |
| B10 | **Coach persona / tone settings** | Some runners want blunt, some gentle | P2 | S | Prompt variant; store preference |

### C. Data and integrations

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| C1 | **Auto-sync Garmin after an activity** | Manual `/sync` is easy to forget | **P0** | M | Poll every N minutes or on calendar open; dedupe by activity id |
| C2 | **Activity detail + pace/HR charts** | The calendar badge is only a count; runners want the story | P1 | L | Garmin detail endpoint; chart in day view |
| C3 | **Dedupe / reconcile activities** | Re-sync must not duplicate | P1 | S | Unique activity id; upsert |
| C4 | **Strava as second source** (PoC1) | Some runners only use Strava | P2 | M | OAuth, mapping; unify with Garmin |
| C5 | **Manual activity entry** | Treadmill/commute not on Garmin | P2 | S | Form or coach "log my run" |
| C6 | **Backup / export SQLite** | A private plan should be recoverable | **P0** | S | Copy/export endpoint; documented backup |
| C7 | **Data migrations** | Schema will change | P1 | S | `PRAGMA user_version` + migration steps |

### D. Platform, security, operations

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| D1 | ~~Real auth / multi-user~~ | **Implemented** — signup/login/profile, signed cookie, per-user stores | — | — | Hardening still open: reset, verification, rate limit |
| D2 | **Admin/debug console** (PoC1) | Inspect messages, memories, sync runs | P2 | M | Read-only page; no secrets |
| D3 | **Structured logging / metrics** | Silent sync failures are invisible | P1 | S | JSON logs, `/health` details, error counters |
| D4 | **Docker Compose** | Reproducible run of POC3 | P1 | M | Container, volume for SQLite, env file |
| D5 | **E2E browser test** | The animation and bubble are DOM-heavy | P1 | M | Playwright: login → chat → grid update → animation |
| D6 | **Rate limit / request size limits** | Public endpoint abuse | P1 | S | Token bucket, body cap |
| D7 | **Timezone / DST correctness** | All-day events are local-midnight based | P1 | M | Store timezone; test DST boundaries |
| D8 | **Observability for model latency** | Replies take seconds | P2 | S | Timing spans; timeout/retry |

---

## 3. Recommended next slice (for review)

If the owner wants the highest value for the least risk:

1. **A1 — bubble conversation persistence** (P0, S). Makes the calendar surface feel like a real coach, not a one-shot widget.
2. **B1 — post-run feedback loop** (P0, M). Connects Garmin to the coach; the calendar becomes a feedback loop, not just a plan.
3. **B2 — deterministic fallback planner** (P0, M). Model outage or invalid JSON should not leave the runner with nothing.

A sensible second slice: **C1 auto-sync**, **A3 diff preview**, **B6 safety guardrails**, **A5 week/agenda view**.

---

## 4. Questions for the owner

1. Is the **calendar page** the only surface for the next slice?
2. For edits, do you want **immediate apply** (current) or a **diff + confirm** step?
3. Should the coach be allowed to **auto-sync Garmin** on a schedule, or only when the runner asks?
4. Is the current **append-only change history** enough, or do you need a visible audit viewer and selective revert?
5. How hard should accounts be for POC3: email verification/password reset next, or stay with username/password?
6. Which is more important next: **more calendar views** (week/agenda) or **more coach intelligence** (feedback/goals)?

---

## 5. Explicit non-goals for this review

- No Strava, payments, or human-coach marketplace.
- No external calendar sync (Google/Outlook/CalDAV).
- No production multi-tenant deployment.

**Waiting for owner review before implementing any remaining item above.**
