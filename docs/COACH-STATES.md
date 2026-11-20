# Coaching states

A **coaching state** is durable context that the coach applies to every turn until the situation changes or the state
expires. It is not a turn intent (review / plan / undo) and it is not a free-text memory. The calendar grid already
knows the plan and the recorded runs; the state engine turns that knowledge into explicit, auditable, enforceable
context.

The previous POC used memories prefixed `mode:` for race week, taper, injury recovery and travel. That convention was
useful but weak: no detector, no expiry, no precedence, no confirmation, and no server-side guardrail. This engine
replaces it with a typed record, a catalog, deterministic detection, chat/user proposals and gateway enforcement.
Legacy `mode:` memories are still visible on the audit page and remain in the coach's facts; new durable context uses
states.

## The record

```ts
interface CoachStateRecord {
  stateId: string;
  userId: string;
  key: CoachStateKey;              // one of the catalog keys
  status: "observing" | "active" | "resolved";
  source: "auto" | "chat" | "user";
  confidence: number;              // 0..1
  evidence: string[];              // short, human-readable; never a diagnosis
  activatedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  resolvedAt: string | null;
}
```

- **auto** states come from the plan, activities and data freshness.
- **chat** states are proposed by the model inside the same JSON turn (`stateProposals`), then validated by the server.
- **user** states are set explicitly on `/coach-states`; they win over auto detection and over a chat proposal for the same
  key.
- **observing** states are proposed but not yet confirmed. Sensitive/medical states always start here.
- **active** states are applied to the prompt and enforced by the gateway.
- **resolved** states are history. The engine keeps them for audit, for the seven-day user-dismissal cooldown and for a
  180-day retention window; every transition also appends an immutable row to `coach_state_events`.

## Catalog

The catalog is intentionally broader than the first detector set. Deterministic detection only covers signals the app
actually has; the rest can be proposed by the coach or set by the runner.

| Key | Family | Source | Default TTL | Guardrail |
| --- | --- | --- | --- | --- |
| `race_day` | race phase | auto | 1 day | no interval/tempo **on race day**; the race is the session |
| `race_week` | race phase | auto | 7 days | no interval/tempo on race day-3 through race day |
| `taper` | race phase | auto | 21 days | no new long run on race day-14 through race day |
| `post_race` | race phase | auto | 14 days | no interval/tempo/race/racewalk from race day through +7 days |
| `load_spike` | load | auto | 7 days | no interval/tempo while the ramp is rising |
| `high_risk` | load | auto | 7 days | no interval/tempo while the ramp is steep |
| `under_load` | load | auto | 7 days | none; rebuild gradually |
| `hard_easy_imbalance` | load | auto | 7 days | no interval/tempo until easy days are added |
| `consistency_guard` | consistency | auto | 7 days | none; rebuild the habit before load |
| `plan_stale` | consistency | auto | 14 days | none; offer a fresh block |
| `data_stale` | data | auto | 14 days | none; coach from the plan and ask for a sync |
| `no_key` | setup | auto | 30 days | none; setup state, coach from the plan |
| `pain_injury` | safety | chat/user | 21 days | no interval/tempo/race/racewalk; easy, cross or rest |
| `illness` | safety | chat/user | 10 days | no training except rest |
| `return_to_run` | safety | chat/user | 21 days | no interval/tempo/race/racewalk; run/walk only |
| `medical_red_flag` | safety | chat/user | 7 days | no booking; urgent clinical care |
| `travel` | life | chat/user | 14 days | none; hotel/treadmill, shorter sessions |
| `time_crunch` | life | chat/user | 14 days | none; shorter or split sessions |
| `heat` | environment | chat/user | 7 days | none; pace/HR and hydration guidance |
| `altitude` | environment | chat/user | 14 days | none; expect an easier pace |
| `air_quality` | environment | chat/user | 3 days | none; indoor/easy or rest |
| `cold_ice` | environment | chat/user | 7 days | none; traction and easy pace |
| `indoor_treadmill` | environment | chat/user | 14 days | none; adjust incline and pace |
| `sleep_debt` | wellbeing | chat/user | 7 days | none; reduce load and prioritize sleep |
| `high_stress` | wellbeing | chat/user | 7 days | none; keep training easy |
| `motivation_dip` | wellbeing | chat/user | 14 days | none; short and enjoyable sessions |
| `menstrual_cycle_support` | wellbeing | chat/user | 28 days | none; individual, never inferred |
| `beginner` | runner | chat/user | 56 days | none; gradual progression |
| `returning` | runner | chat/user | 42 days | none; rebuild gradually |
| `masters` | runner | chat/user | 365 days | none; more recovery |
| `strength_focus` | runner | chat/user | 28 days | none; keep run volume steady |
| `speed_focus` | runner | chat/user | 28 days | none; one quality session |
| `pregnancy_postpartum` | safety | chat/user | 365 days | none; follow clinician guidance |
| `low_energy_availability` | safety | chat/user | 28 days | none; clinician/sports dietitian referral |

The four sensitive states (`medical_red_flag`, `pregnancy_postpartum`, `menstrual_cycle_support`,
`low_energy_availability`) are **never inferred**. They are user-set or proposed with a confirmation prompt, and the UI
carries a clinician disclaimer.

## Deterministic detection

Detection is pure and testable (`detectCoachStates` in `src/coach-states.ts`); the catalog lives in
`src/coach-state-catalog.ts`, the state/audit page render in `src/web-coach-states.ts`, and shared HTML helpers in
`src/web-html.ts`. The sync/lifecycle is separate (`syncCoachStates`). The gateway refreshes states before building the
prompt. Pages read stored states; auto detection is persisted only by a gateway turn or the explicit **Refresh**
action on `/coach-states`, so a GET never mutates state. The sync runs in one `BEGIN IMMEDIATE` transaction, which
prevents two concurrent refreshes from appending the same open key twice.

### Race phase

- Next planned `race` or `racewalk` session:
  - today ??`race_day` (0.95)
  - 1?? days ??`race_week` (0.90)
  - 8??1 days ??`taper` (0.80)
- Latest race-like activity within 14 days ??`post_race` (0.90 when the day had a planned race, 0.70 for a
  conservative title match such as `Half marathon` or `??收 2026`). Titles containing `race pace`, `tempo`,
  `interval` or `training` are excluded to avoid false positives.
- The state TTL is tied to the race: race week expires after the race, taper expires on race day, post-race expires
  after the 14-day window.

Why these windows: taper reviews consistently show volume reductions in the range of roughly 41??0% while intensity
and frequency are largely maintained, with progressive rather than abrupt reductions and a taper of about two weeks or
less for many race distances ([Wang 2023, taper systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/)).
Race-week advice commonly removes hard sessions in the final three days and prioritizes sleep, fuel and logistics
([Runners Connect race-week guide](https://runnersconnect.net/how-to-taper-for-a-marathon/),
[The Running Channel race-week guide](https://therunningchannel.com/what-to-do-week-before-running-marathon/)). The
engine encodes a conservative version of that advice; it is not a periodization plan.

### Load and recovery signals

`loadSummaryForWeek` already computes the acute:chronic workload ratio (ACWR) and the week-over-week change from
Garmin training load. The state engine maps:

- `high_risk` when ACWR > 1.5 or week change > 30%.
- `load_spike` when ACWR > 1.3 or week change > 20%.
- `under_load` when ACWR < 0.8 and a baseline exists, unless a race phase is active.
- `hard_easy_imbalance` when at least three hard runs are present and hard minutes exceed 30% of the week's running
  minutes.
- No load state when there is no baseline (`insufficient`); the engine does not invent a ratio.

ACWR is a soft signal, not an injury prediction. A 2016 BJSM review found a lower injury-risk window around 0.8??.3
and higher risk above 1.5, but the method is contested and sensitive to how load is measured
([Gabbett 2016, BJSM](https://bjsm.bmj.com/content/50/5/273),
[ACWR critique, PMC8138569](https://pmc.ncbi.nlm.nih.gov/articles/PMC8138569/)). The UI and prompt call it a signal,
not a diagnosis, and the state can be resolved by the runner.

### Consistency and data

- `consistency_guard`: at least two planned running sessions in the last seven days have no same-day matched activity.
  Plan-vs-actual matching is day-aware, so a Thursday run cannot satisfy Tuesday's plan.
- `plan_stale`: nothing booked in the next 14 days, the runner has a goal, and the runner has plan history - at least
  one past session in the recent window or one booked within the next 35 days. A brand-new account with no sessions
  never fires it: an empty calendar is an onboarding state, not a stale plan. (Gated 2026-11-19 after the user-side
  review found the zero-session case read as blame; evidence: "The plan went stale: nothing booked in the next 14
  days.")
- `no_key`: no Garmin Personal API key is saved. This is a setup state: the manager and audit keep it out of the coaching
  list and the calendar chips omit it; the manager shows a Setup card with a Profile link instead.
- `data_stale`: a Garmin key is saved but there is no activity in the last 14 days.

## Chat proposals and user states

The model's tool schema now includes an optional `stateProposals` array (maximum three). Each item is validated by
`parseCoachTurn`:

```json
{
  "key": "travel",
  "action": "activate",
  "confidence": 0.8,
  "evidence": ["Travelling to Tokyo 20-24 Nov"],
  "ttlDays": 10,
  "note": "Hotel has a treadmill"
}
```

Rules:

- Exact catalog key only; unknown keys are rejected with `invalid-state-key`.
- `action` is `activate` or `resolve`; confidence is 0.5??; evidence is 1?? strings of 1??00 characters; TTL is null
  (use the catalog default) or an integer 1??65 days; note is null or at most 280 characters. `ttlDays: 0` is rejected
  rather than silently treated as a default.
- A `requiresConfirmation` state becomes `observing`; it is shown as a card in the chat bubble and on the states page
  with **Confirm** and **Dismiss**.
- An ordinary state becomes `active` immediately and can be resolved by the runner.
- A proposal never downgrades an already active state, and a **user-set** state outranks a chat proposal: its source,
  confidence and evidence are preserved.
- A comment-only directive suppresses calendar writes and memories, not durable state context: a review turn can still
  store a travel/pain proposal (subject to the same validation and guardrails) because it does not edit the calendar.
- If a guardrail forces a fallback, the proposed states are still stored (sensitive ones as `observing`) so the runner
  gets a confirmation card instead of silently losing the context.
- The model is told: never diagnose; for pain, illness, pregnancy, a medical red flag or low energy availability, use a
  low-confidence proposal and tell the runner to confirm and, where relevant, see a clinician.
- The prompt catalog and the tool schema both list the exact keys, so the model cannot silently invent a new one.

The user can set any catalog state on `/coach-states`, with a TTL and an optional evidence note. A user-set state is
`active` immediately, source `user`, confidence 1. This is the escape hatch for situations the app cannot detect.

## Precedence, coexistence and lifecycle

States are sorted by priority (safety > race phase > load > consistency > life/wellbeing/environment > setup/data/runner)
and then confidence. The prompt shows the highest-priority active state for each exclusive family first, labels
lower-priority same-family states as secondary, and tells the model that safety wins and the strictest guardrail applies
on conflict. The UI can show more; `no_key` is a setup state and is not listed as a coaching state.

Lifecycle rules:

- An auto state is created when its detector fires, updated while it continues to fire, and resolved when the trigger
  disappears.
- TTL expiry resolves a state even if its detector is not run.
- User/chat states are never auto-resolved by a detector; they expire or are resolved explicitly.
- If the runner resolves an auto state, the engine honors a **seven-day dismissal cooldown** before reactivating the
  same auto key.
- Sensitive proposals start as `observing` and do not apply guardrails until confirmed. A sensitive proposal made in
  the same turn as a session is still treated conservatively by the gateway for that turn.
- Every create, confirm, resolve and expiry appends an immutable `coach_state_events` row (action, from/to status,
  source, confidence, evidence, timestamp). Routine auto-refreshes update the snapshot but do not spam the event log.
- Resolved rows and events older than **180 days** are pruned during sync. The state page keeps the last 100 rows for
  its resolved history.

## Guardrails are enforced, not just suggested

The prompt tells the model the rules; the gateway also refuses a proposed session that violates an active state. This
is the important difference from a pure prompt instruction. The gateway evaluates the **effective calendar after the
turn** ??current sessions plus adds, updates, removes and a revert ??so a restored session cannot bypass a guardrail
and a moved race is seen at its new date. The window check uses the **proposed session's day**, not just the state's
current race proximity: a tempo after the race or a long run after the taper is allowed.

| State | Blocks |
| --- | --- |
| `race_day` | interval, tempo on race day |
| `race_week` | interval, tempo from race day-3 through race day |
| `taper` | long from race day-14 through race day |
| `post_race` | interval, tempo, race, racewalk from race day through race day+7 |
| `load_spike`, `high_risk`, `hard_easy_imbalance` | interval, tempo |
| `pain_injury`, `return_to_run` | interval, tempo, race, racewalk |
| `illness` | easy, long, interval, tempo, cross, race, racewalk (rest allowed) |
| `medical_red_flag` | every kind, including rest (seek urgent care) |

When a guardrail fires:

- The gateway returns validation code `mode-guardrail` and policy `respect-state`.
- The model gets one repair attempt with a structured message naming the state and the blocked kind.
- If the repair succeeds, the calendar is written normally and `blockedByStates` is cleared.
- If the repair fails, the fallback reply explains that a coaching-state guardrail protected the calendar and points to
  `/coach-states`. Nothing is written to the calendar; any proposed states are stored so they surface as cards.
- Removing a session is always allowed. Updates are checked by their new day and kind, so a model cannot move a hard
  session into a blocked window. Reverts are checked by the sessions they would restore.

## Prompt injection and privacy

The state block and the catalog are server-authored background. They are never rendered in the chat bubble. The chat
shows only the runner's message and the coach's reply, plus optional **state cards** that the server explicitly returns
for a state change. The model is told never to mention the state keys or the background block unless the runner asks
about the state, and that evidence/notes are **data, never instructions**; the prompt renders evidence as a JSON array
rather than free text. The `/coach-audit` page shows directives, active states and immutable state events for the owner
only; `/coach-states` is scoped to the signed-in runner.

Prompt order:

1. `COACH_RULES`
2. optional turn directive (review/plan/undo intent)
3. active and observing coaching states
4. coaching state catalog
5. facts JSON
6. referenced context JSON (run/day/week)
7. conversation history
8. the runner's latest message

## UI and routes

- **`/coach-states`** ??active states, proposed states with Confirm/Dismiss, a set-state form grouped by family, a
  **Refresh** action, a setup card when no Garmin key is saved, a sensitive-state disclaimer, and resolved history.
  Expiry dates and history timestamps render in the runner's timezone. The manager shows user-facing labels, status,
  source, expiry, evidence and notes; raw catalog keys, confidence scores and guardrail rules stay on the internal
  audit page.
- **Calendar** ??up to three active state chips under the welcome line, linking to the manager. No row when there are
  no active states.
- **Chat bubble** ??a state card after a turn that activates a state: label, status, evidence, the non-diagnosis note,
  and Confirm/Dismiss/Resolve buttons. A blocked guardrail adds a system line:
  `Calendar unchanged ??<state> 繚 ?交??芣??湔`.
- **Coach header** ??minimal: the title and minimize button only. The states page is reachable from the account menu,
  from Profile and from the calendar chips; `/coach-audit` is an owner-only internal page and is not linked in the
  end-user UI.
- **`/coach-audit`** ??active coaching states, an immutable **State activity** log, legacy `mode:` memories if any,
  hidden directives, and an active-state count in the audit metrics.
- **`/profile`** ??links to the coaching states page; the audit page is internal.

Screenshots: [manager page](design/coach-states-demo.png) 繚 [chat state card](design/coach-state-bubble-demo.png).

Routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/coach-states` | render stored states (no auto refresh; read-only) |
| POST | `/coach-states` | set a state (`key`, `ttlDays`, `note`) |
| POST | `/coach-states/refresh` | run auto detection, then redirect to the manager |
| POST | `/coach-states/<id>/confirm` | observing ??active |
| POST | `/coach-states/<id>/resolve` | active/observing ??resolved, source user |
| GET | `/coach-audit` | directives, active states, state events and legacy modes |

All state POSTs are same-origin checked (Origin vs Host) in addition to the SameSite=Lax session cookie. Invalid form
input redirects with a fixed error code (`invalid-key`, `invalid-ttl`, `invalid-note`, `not-found`); the page maps the
code to a message, so a crafted `error=` query cannot inject copy. The gateway response adds `milebook.states` (state
changes) and `milebook.blockedByStates` (keys blocked on a fallback). The web layer enriches those with labels and the stored
record for the bubble; the keys themselves are never hidden directives.

## What is needed now

Implemented in this pass:

1. Typed state record, SQLite table and store CRUD/history, plus an immutable `coach_state_events` transition log.
2. Catalog with 34 states across ten families (including the `setup` family).
3. Deterministic race-phase, load, hard/easy, day-aware consistency, plan-stale, data-stale and no-key detection.
4. Chat `stateProposals` with strict parsing, exact-key validation and a 1??65-day TTL.
5. Sensitive-state confirmation, user-set states and user precedence over chat proposals.
6. TTL expiry, auto resolution, exclusive priority, seven-day user-dismissal cooldown and 180-day retention.
7. Server-side guardrails over the effective post-turn calendar: reverts, moved/added races, day-aware windows and
   racewalk protection, with repair and fallback.
8. Prompt background and catalog injection with privacy and evidence-as-data rules.
9. Manager page, calendar chips, bubble cards, audit integration, state activity log and links.
10. Read-only GET pages plus an explicit refresh action; serialized sync; same-origin state POSTs; fixed error codes.
11. Auto-detection kill switch (`MILEBOOK_AUTO_STATES=false`), `pnpm check` and CI workflow.
12. Tests: **337 across 15 files**, including 27 state-engine tests and gateway guardrail/revert/fallback tests.
13. CSS v11, deploy checks for state styles, live verification.

## What can be skipped, and why

### Skipped deliberately

| Area | Why skipped |
| --- | --- |
| Automatic injury diagnosis or tissue classification | Not a medical device; pain is user-reported and a clinician decides. A wrong auto-diagnosis is worse than no state. |
| Pregnancy, postpartum and menstrual-cycle inference | Highly sensitive and individual; the app must not infer. These are user-set only. |
| Diet, weight, calorie or low-energy-availability advice | Safety-critical; the state only refers to a clinician or sports dietitian. |
| HRV, sleep, readiness, body-battery auto states | The current Garmin Personal API integration does not ingest wellness data. Adding it needs a new data source and privacy review. |
| Weather, heat, air-quality and altitude auto states | No location/weather provider is wired in. The states exist for chat/user use; auto detection would be a separate integration. |
| Auto base/build/peak periodization | Needs an explicit goal race date and phase model. The current plan is session-based; race phase/taper is the useful subset. |
| Auto deload/test week/speed-strength focus | High false-positive risk; these are better proposed by the coach or set by the runner. |
| Push notifications for state changes | The bubble card and the manager are enough for a POC; a notification source would need new event plumbing. |
| Strava/Apple/calendar sync, FIT parsing | Out of scope for the current Garmin-only data path. |
| Multi-race series or automatic race-goal parsing | The detector uses planned race sessions and a conservative title heuristic; a full race calendar is a later feature. |
| Clinician export / medical record integration | No clinical workflow, consent model or regulatory review. |
| Full mode-manager drag/drop, filters and analytics | The manager is intentionally a simple list; state counts, history and the immutable event log are enough for the POC. |

### Needed next, in rough order

1. **Wellness data** (sleep, HRV, readiness) if the Garmin integration is extended; then `sleep_debt` and a readiness
   guardrail can be auto-detected.
2. **Weather/location** for heat, air quality and altitude; then those states can move from chat/user to auto with a
   confidence and a short TTL.
3. **Goal-race parser and phase model** for base/build/peak and a real taper plan, not just a race-week guardrail.
4. **State-aware notifications** for a newly proposed sensitive state or a guardrail fallback.
5. **Outcome analytics dashboard** over the new event log (how often states fire, confirm/dismiss rates, guardrail
   repair rate) to tune thresholds and reduce false positives.
6. **A small clinician-facing summary** only after consent/privacy design.

## Research notes

These sources informed the catalog and the conservative guardrails. They are not a substitute for clinical advice.

- **Taper**: volume down roughly 41??0%, intensity/frequency maintained, progressive reduction, about two weeks or
  less ([Wang 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/)).
- **Heat**: acclimation takes about 5??4 days; finish heat training at least two days before the race; re-acclimatize
  for 2?? days after travel ([Pryor 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6422510/)).
- **ACWR**: 0.8??.3 lower-risk window, >1.5 higher risk, method debated
  ([Gabbett 2016](https://bjsm.bmj.com/content/50/5/273),
  [critique](https://pmc.ncbi.nlm.nih.gov/articles/PMC8138569/)).
- **Return to run**: pain during and 24??8 hours after, weekly volume and long-run progression of about 10%
  ([CU Sports Medicine return-to-running protocol](https://www.rachelfrankmd.com/pdf/cu-sports-medicine-return-running-protocol.pdf),
  [Sanford Health return-to-running](https://www.sanfordhealth.org/-/media/org/files/medical-professionals/resources-and-education/return-to-running.pdf)).
- **Overtraining**: mood, sleep and behaviour disruption; needs medical evaluation rather than an app diagnosis
  ([PMC3435910](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435910/)).
- **Menstrual cycle**: highly individual, at least three cycles of tracking, user-set
  ([PMC8170151](https://pmc.ncbi.nlm.nih.gov/articles/PMC8170151/)).
- **Sleep and travel**: sleep is a recovery input; travel fatigue is individual
  ([USOPC sleep](https://www.usopc.org/sleep),
  [travel fatigue review](https://pubmed.ncbi.nlm.nih.gov/30217831/)).
- **Training monotony**: Foster's monotony concept supports looking at hard/easy distribution, not just weekly volume
  ([PMC8200417](https://pmc.ncbi.nlm.nih.gov/articles/PMC8200417/)).
- **Race week**: no hard sessions in the final three days; sleep, fuel and logistics
  ([Runners Connect](https://runnersconnect.net/how-to-taper-for-a-marathon/),
  [The Running Channel](https://therunningchannel.com/what-to-do-week-before-running-marathon/)).
- **Periodization phases**: commercial systems such as COROS expose base/build/peak phases; this POC does not have an
  explicit phase model, so it encodes race phase rather than a full periodization plan
  ([COROS periodization](https://coros.com/stories/coros-coaches/c/periodization-how-coros-uses-phases-to-build-training-plans)).
- **Time-crunched HIIT**: short quality sessions can maintain fitness when time is limited, which is why `time_crunch`
  shortens sessions rather than deleting the key workout
  ([PMC6188912](https://pmc.ncbi.nlm.nih.gov/articles/PMC6188912/)).

## Limitations

- Detection is heuristic. The UI calls states signals, not diagnoses; the runner can resolve any state.
- ACWR depends on Garmin training load being present; without it the engine reports `insufficient` rather than guessing.
- Race detection is based on planned race sessions plus a conservative activity-title fallback; a race recorded under
  an unusual title may not create `post_race`.
- State precedence is advisory in the prompt but hard in the gateway only for the guardrails in the table above. A state
  without a guardrail changes the coach's guidance, not the calendar API.
- Guardrail windows are day-level, not time-of-day: a session on the race day is treated as race day even after the
  race has finished. The race-day state expires after the day.
- Serialized sync relies on SQLite `BEGIN IMMEDIATE` plus `busy_timeout`; a future multi-process writer would need a
  partial unique index on open `(user_id, state_key)` as well.
- The engine does not replace a clinician, physiotherapist, dietitian or coach.

## Safety copy

> Coaching states are context, not medical advice. For chest pain, fainting, severe breathlessness, pregnancy or
> postpartum concerns, or an injury that worsens, seek a clinician. The coach will not diagnose.

## Test map

| File | Focus |
| --- | --- |
| `test/coach-states.test.ts` | catalog, detection, day-aware consistency, lifecycle, events, retention, proposals, guardrails, prompt rendering |
| `test/coach.test.ts` | state proposal parsing, TTL bounds, tool schema, prompt block, repair policy |
| `test/store.test.ts` | state CRUD, event append/list/prune, scoping, active/expired filtering, ordering |
| `test/training.test.ts` | same-day plan-vs-actual matching |
| `test/gateway.test.ts` | auto detection in the prompt, effective-calendar guardrails, revert/race-move blocking, fallback state cards, proposal application, claim cleanup |
| `test/web.test.ts` | manager page, read-only GET plus refresh action, set/confirm/resolve routes, CSRF origin rejection, calendar chips, bubble forwarding, audit events |

Full suite: **337 tests across 15 files**.
