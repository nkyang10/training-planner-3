# Milebook — candidate features for owner review

**Status:** review list for the remaining work. The first Milebook slice is implemented: standalone accounts/profiles,
change history with LLM-driven undo, and coach suggestions. The training-log slices are implemented too, including the
single metric-selectable trend graph and the per-activity Garmin workout overlay (paired run+workout row, integrated
run+program peek, visible-month fill; 2026-11-18). Everything below is still a proposal; the owner reviews and picks the next slice.

This list pulls the useful parts of PoC1 and PoC2 into the calendar-first Milebook. Priorities are recommendations, not
commitments.

Legend: **P0** = next slice, high value/low risk · **P1** = strong follow-up · **P2** = later · **P3** = only with a clear
product reason.

---

## 1. Where the previous solutions left useful parts

| Source | Useful part | Milebook already has it? | What is missing / worth carrying over |
|---|---|---|---|
| **PoC1** | Deterministic planner + calendar | No (Milebook is LLM-first) | A deterministic fallback planner when the model is down or returns invalid JSON |
| PoC1 | Garmin + Strava sync | Garmin yes, Strava no | Strava as a second activity source; unified activity model |
| PoC1 | Admin console | No | A read-only admin/debug page: messages, memories, sessions, sync runs |
| PoC1 | Uploads (plan files) | No | Upload a race plan/PDF and let the coach import it |
| PoC1 | Auth / multi-user | **Yes** — signup/login/profile, per-user isolation | Email verification, password reset, SSO |
| PoC1 | Coach conversation | Bubble | **Yes** — reloads recent messages from SQLite; streaming still open |
| PoC2 | Self-implemented bubble | Yes | Streaming, history reload, retry, error states |
| PoC2 | CRUD + batch + animation | Yes | Diff preview, conflict detection |
| Milebook | Change history + undo | **Yes** — change_sets, before/after, LLM revert | Audit viewer, redo, selective revert |
| Milebook | Coach suggestions | **Yes** — starter prompts, 1–3 tappable follow-ups, structured "Could not apply" card | Suggestion ranking, feedback loop |
| PoC2 | Prompt history + memory | Yes | Memory management ("forget that"), summarisation |
| PoC2 | Garmin Personal API quirks | Yes | Background sync, dedupe, post-run feedback |
| **Milebook** | Calendar-first UX | Yes | Make it mobile/PWA, add week/agenda views, reminders |

---

## 2. Candidate feature table

### A. Calendar UX

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| A1 | ~~Bubble loads recent conversation~~ | **Implemented** — GET /chat/history + render on open | — | — | Streaming still open |
| A2 | ~~Undo last coach change~~ | **Implemented** — change journal + LLM revert (no history UI) | — | — | See change history section |
| A3 | **Diff preview / confirm before apply** | "Review original existing too" becomes visible: show add/move/delete diff before writing | **P1** | M | Two-phase turn: propose → confirm; gateway must not write on propose |
| A4 | Streaming reply in the bubble | Long coach answers feel dead; streaming would keep the reply alive | **P1** | M | SSE parsing in bubble; gateway already emits one chunk, extend to token chunks |
| A5 | Week / agenda view + "today" button | Month grid is good for planning; week/agenda is better for daily use | P1 | M | **Partially implemented** — Training log Week view + current-period shortcut; the Plan calendar is still month-only |
| A6 | Drag-and-drop reschedule with confirm | Direct manipulation is faster than typing "move Tuesday" | P2 | L | Needs drag targets, conflict rules, coach re-validation |
| A7 | Reminders / notifications | A plan is only useful if the runner is nudged | P1 | M | Browser notifications or email; per-session reminder time |
| A8 | Weekly load / volume summary | Runners care about weekly km and hard/easy balance | P1 | M | **Implemented (week view)** — Garmin load, coupled 7/28-day ACWR, week-over-week change, hard/easy split and a weekly coach review prompt; month/year load summaries still open |
| A9 | iCal export | The system calendar is private; runners may want it elsewhere | P2 | S | Read-only `.ics` endpoint; no external sync |
| A10 | Mobile PWA / installable | Calendar-first is a phone product | P1 | M | Manifest, service worker, offline shell |
| A11 | Reduced-motion / accessibility pass | The animation is intentionally loud; some users need it off | P1 | S | `prefers-reduced-motion`; keyboard focus, aria labels |
| A12 | Multi-month / year heatmap | Training history and consistency | P2 | M | Aggregate activities/sessions by month |
| A13 | ~~Training log / history view~~ | **Implemented (all training-log slices)** — Week/Month/Year selector with prev/next/current and pickers; week day cards, month week rows, year month rows; plan-match badges, load/ramp card, weekly review prompt, rich run metrics, per-kilometre splits, Garmin laps/intervals, HR zones, PR badges, period best efforts, one metric-selectable trend graph (pace/heart rate/cadence/load/distance/time/elevation), Garmin workout line, paired run+workout rows with one integrated run+program peek, Ask coach; `/activity/<id>` detail | — | — | Dedicated records page, zone charts and a persisted trend-metric choice still open |
| A14 | ~~Run execution depth~~ | Runners want more than distance and average pace | — | — | **Implemented** — Garmin laps/intervals, HR-zone time, period best efforts and PR badges; FIT parsing and all-time records page later |
| A15 | ~~Recorded-run peek from the calendar grid~~ | The grid should answer "what was this run?" without leaving the month | — | — | **Implemented** — click a recorded-run row, or anywhere on a paired run+workout row, for one popup with metrics, plan match, the integrated training program, training load/effect, fastest efforts with PR badges and actions (full detail, comment-only ask coach, view day, training-log week); the paired row is one click target and one keyboard target; Escape/focus restore, keyboard open and same-row toggle; stored metrics only, splits/laps/zones stay on the detail page |
| A16 | ~~Hidden coach directives / audit~~ | The visible chat should read naturally, while app actions still need to steer the coach | — | — | **Implemented** — typed intents (`review-activity`, `review-day`, `review-week`, `plan`, `undo`), server-built directives (mode, write permission, references, focus, style, background), gateway enforcement (`comment-only-write`, memory-write filtering), referenced-context resolution, directive hash on replay, owner-only `/coach-audit` with active states, immutable state events and legacy `mode:` memories; no client-supplied hidden prose |
| A17 | ~~Coaching-state engine~~ | The coach needs durable context and hard safety/race/load guardrails, not a one-shot prompt | — | — | **Implemented** — 34-state catalog in ten families; deterministic race day/week, taper, post-race, ACWR/load, hard-easy, day-aware consistency, plan/data staleness and no-key detection; chat `stateProposals` and user-set states with evidence, confidence and TTL; sensitive states `observing` → confirm; user precedence, exclusive groups, TTL expiry, seven-day dismissal cooldown and 180-day retention; gateway `mode-guardrail` enforcement over the effective post-turn calendar (reverts, moved races, day-aware windows, racewalk) with repair/fallback and fallback state cards; `/coach-states`, explicit Refresh, read-only GET pages, calendar chips, bubble cards, audit state activity; research and explicit skips in [COACH-STATES.md](COACH-STATES.md) |
| A18 | ~~Planned-session peek from the calendar grid~~ | The grid should answer "what is this session, and did it happen?" without leaving the month | — | — | **Implemented** — click a colored plan row for a popup with the kind, planned distance/duration, note and completed/not-matched/missed/upcoming/rest outcome plus the linked run; **View day**, comment-only **Ask coach**, **Open run** when a run is linked and **Training log week**; shares one dialog with the run peek, keyboard open, Escape/focus restore and same-row toggle; stored plan/day data only, no separate session detail page |
| A19 | ~~Muscle feedback, diagnosis guidance and drill suggestions~~ | The calendar and log say what the runner did; nothing said how the body absorbed it | — | — | **Implemented (2026-11-19)** — a third app-bar tab **Muscles** (`/muscle`): an interactive **3D anatomy figure** (three.js r170 vendored behind an import map, physically rendered, typed rig in `src/muscle-rig.ts`; orbit/zoom, raycast click-select, hover tooltips, pausable turntable + breathing, Front/Back/Reset camera tweens, WebGL failure falls back to the flat figure) plus the flat front/back muscle map (click/keyboard/checkbox-list alternative, heat ramp with a legend, dashed outlines for care-needed tags) — both surfaces share one selection state; a 0-10 anchored soreness slider with condition tags (tight/cramp/fatigued/dull ache/sharp pain/swelling/numbness/old-injury flare), side and "eases with warm-up?" modifiers; deterministic readings (ok → sore → heavy → watch → warning → urgent) with care-first copy; drill suggestions matched to the tags and the muscle's own drill library; per-muscle coach knowledge; one-tap `pain_injury`/`medical_red_flag` state offers that reuse the existing guardrails; muscles-worked on the activity detail with a deep-link prefill; run-review "Log muscle feel" link; the latest check-in rides in every coach prompt plus a comment-only `review-muscles` intent; export includes the check-ins; browser-verified `viewerReady` in headless Chrome with the demo screenshot; research and rules in [MUSCLE-TAB.md](MUSCLE-TAB.md). **Real anatomy shipped (2026-11-19, later the same day):** the 3D figure is now real BodyParts3D muscles-and-skeleton (CC BY 4.0) — 186 named meshes, one `RegionMuscle-<region>` material per region, hover/click/orbit/pause on the real muscles, procedural sculpt kept as the automatic fallback, all routes and the 11 MB asset live-verified; pipeline and licenses in [MUSCLE-ANATOMY-3D-RESEARCH.md](MUSCLE-ANATOMY-3D-RESEARCH.md). **Coach-managed condition (2026-11-22):** the coach may now suggest a muscle report, a hold, a release or an all-better claim from the runner's own words (`muscleProposals`, at most six per turn, with the runner's quotes as evidence); the suggestion is a pending `muscle_proposals` row, never a write, and one Confirm on the Muscle tab card or in the coach dock applies exactly what the runner's own form or one-tap control would have written. Dismiss changes nothing and offers Undo, Adjust opens the form prefilled with the coach's reading, pending suggestions ride into the next prompt (a `muscle-suggestion-changed` epoch reason), suggestions expire after 7 days, and sharp pain, swelling or numbness still route to the care path and the `pain_injury` state instead of a suggestion. The same day's UX pass (review [19](analysis/19-muscle-suggestion-ux-review.md), plan [20](analysis/20-muscle-suggestion-ux-plan.md)) shipped every finding: the record's own card vocabulary with the deterministic reading, one owner per record, pending badges, dead-ends filtered and counted, a validated run link, superseding, focus and target fixes. Details in [MUSCLE-TAB.md §8b](MUSCLE-TAB.md). |

### B. Coach and planning

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| B1 | **Post-run feedback loop** | After Garmin sync, the coach should say "you ran 5.2 km at easy pace; keep Sunday long" | **P0** | M | **Partially implemented** — Ask coach, last-30 context and post-sync review prompt; unsolicited automatic review still open |
| B2 | **Deterministic fallback planner** | Model outage or invalid JSON should not leave the runner with nothing | **P0** | M | Reuse PoC1 planner ideas; gateway fallback when `parseCoachTurn` fails |
| B3 | **Memory manager** | Let the runner see/delete what the coach remembers | P1 | S | `GET/DELETE /memories`; the coaching-state manager covers structured state management, but raw memories still need a list/delete UI |
| B4 | **Goal / race countdown** | "10k in 8 weeks" should become a visible target and a plan end date | P1 | M | Session kind `race`; race day/week/taper states are implemented; a countdown card and plan end date are still open |
| B5 | **Conflict detection** | Two sessions on one day, or a hard day after a race | P1 | M | State precedence and guardrails cover race/injury/load conflicts; same-day duplicate rules and rest-day spacing still open |
| B6 | ~~Injury / fatigue guardrails~~ | The coach should stop, not push, when the runner reports pain | — | — | **Implemented (state engine)** — `pain_injury`, `illness`, `return_to_run` and `medical_red_flag` states; sensitive proposals need confirmation; gateway blocks intensity/racing/racewalk/all training as appropriate; clinician-referral copy; no diagnosis |
| B7 | **Plan templates** | "Base 5k", "10k 8-week", "Half marathon" starting points | P2 | M | Template JSON; coach fills dates |
| B8 | **Conversation summarisation** | Long histories hit prompt limits | P2 | M | Summarise older turns into memories |
| B9 | **Language / locale** | Chinese/English mix is already real | P1 | S | Detect language; keep Traditional Chinese rule; date formats |
| B10 | **Coach persona / tone settings** | Some runners want blunt, some gentle | P2 | S | Prompt variant; store preference |

### C. Data and integrations

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| C1 | ~~Auto-sync Garmin after an activity~~ | **Implemented (session-start + page-load)** — per-runner key saved from the popup, account-menu **Sync Garmin now** beside the bell, one pull on login/resumed cookie, 10-minute page-load backoff, upsert by `(user_id, activity_id)`, bell feed with manual no-new confirmations, silent automatic no-change checks, and errors | — | — | Background scheduler still open |
| C2 | ~~Activity detail + metric trend graph~~ | **Implemented (aggregate + execution depth)** — `/activity/<id>` detail with rich Garmin metrics, fastest efforts with PR badges, computed per-kilometre splits, Garmin laps/intervals, HR-zone time, the Garmin workout step card, adaptive volume and one metric-selectable trend graph (pace/heart rate/cadence/load/distance/time/elevation) with CSS-only switching and a no-script fallback; the calendar pairs each run with its workout and opens one integrated run+program peek from the whole row | — | — | Zone charts, FIT parsing, a dedicated records page and a persisted metric choice still open |
| C3 | ~~Dedupe / reconcile activities~~ | **Implemented** — composite `(user_id, activity_id)` key + upsert; the same Garmin activity can be stored by multiple runners, and repeated sync updates instead of throwing | — | — | Garmin detail sync still open |
| C4 | **Garmin training-program import** | A runner on a Garmin Coach / adaptive plan wants the plan's upcoming sessions on the calendar, and wants each recorded run labeled with the program it came from | **P2** | L | **Partially implemented** — the executed workout is fetched from `/activity-service/activity/{id}/workouts`, stored, paired with its run in the grid and shown as a clickable brief (plus the detail card and week/day/peek lines); the calendar fills the visible month's missing workouts. Future scheduled workouts and the plan definition are not in the Personal API; importing them needs a Garmin SSO web session (`calendar-service`, `trainingplan-service`, GraphQL) and a product/terms decision. See [GARMIN-TRAINING-PROGRAMS.md](GARMIN-TRAINING-PROGRAMS.md) |
| C5 | **Strava as second source** (PoC1) | Some runners only use Strava | P2 | M | OAuth, mapping; unify with Garmin |
| C6 | **Manual activity entry** | Treadmill/commute not on Garmin | P2 | S | Form or coach "log my run" |
| C7 | **Backup / export SQLite** | A private plan should be recoverable | **P0** | S | Copy/export endpoint; documented backup |
| C8 | **Data migrations** | Schema will change | P1 | S | `PRAGMA user_version` + migration steps |

### D. Platform, security, operations

| ID | Feature | Why it matters | Priority | Effort | Risk / dependency |
|---|---|---|---|---|---|
| D1 | ~~Real auth / multi-user~~ | **Implemented** — signup/login/profile, signed cookie, per-user stores | — | — | Hardening still open: reset, verification, rate limit |
| D2 | **Admin/debug console** (PoC1) | Inspect messages, memories, sync runs | P2 | M | Read-only page; no secrets |
| D3 | **Structured logging / metrics** | Silent sync failures are invisible | P1 | S | JSON logs, `/health` details, error counters |
| D4 | **Docker Compose** | Reproducible run of Milebook | P1 | M | Container, volume for SQLite, env file |
| D5 | **E2E browser test** | The animation and bubble are DOM-heavy | P1 | M | Playwright: login → chat → grid update → animation |
| D6 | **Rate limit / request size limits** | Public endpoint abuse | P1 | S | Token bucket, body cap |
| D7 | **Timezone / DST correctness** | All-day events are local-midnight based | P1 | M | Store timezone; test DST boundaries |
| D8 | **Observability for model latency** | Replies take seconds | P2 | S | Timing spans; timeout/retry |

---

## 3. Recommended next slice (for review)

If the owner wants the highest value for the least risk:

1. **B1 — post-run feedback loop** (P0, M). Connects Garmin to the coach; the calendar becomes a feedback loop, not just a plan.
2. **B2 — deterministic fallback planner** (P0, M). Model outage or invalid JSON should not leave the runner with nothing.
3. **A4 — streaming reply in the bubble** (P1, M). The last missing chat-UX primitive.

A sensible second slice: **C1 auto-sync**, **A3 diff preview**, **B6 safety guardrails**, **A5 week/agenda view**.

---

## 4. Questions for the owner

1. Is the **calendar page** the only surface for the next slice?
2. For edits, do you want **immediate apply** (current) or a **diff + confirm** step?
3. Should the coach be allowed to **auto-sync Garmin** on a schedule, or only when the runner asks?
4. Is the current **append-only change history** enough, or do you need a visible audit viewer and selective revert?
5. How hard should accounts be for Milebook: email verification/password reset next, or stay with username/password?
6. Which is more important next: **more calendar views** (week/agenda) or **more coach intelligence** (feedback/goals)?

---

## 5. Explicit non-goals for this review

- No Strava, payments, or human-coach marketplace.
- No external calendar sync (Google/Outlook/CalDAV).
- No production multi-tenant deployment.

**Waiting for owner review before implementing any remaining item above.**
