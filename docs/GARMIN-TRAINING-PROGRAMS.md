# POC3 — Garmin training programs: what the API can and cannot give us

**Status:** research + implemented activity-workout overlay (2026-11-18) · **Scope:** the Garmin Personal API, the
activity-workout endpoint, and the honest boundary for importing a full training plan into the calendar grid.

## Short answer

| Question | Answer | Evidence |
|---|---|---|
| Can we get the training program a recorded activity followed? | **Yes.** `GET /activity-service/activity/{activityId}/workouts` returns the planned workout the completed activity followed: steps, intensities, durations, targets and coach notes. | Official Personal API Swagger + official Python client wrapper `get_activity_workouts` |
| Can we get the runner's future scheduled workouts / Garmin Coach plan from the Personal API? | **No.** `workout-service/*`, `trainingplan-service/*` and `calendar-service/*` are not in the Personal API's documented endpoint surface. | Official Personal API Swagger lists 24 GET endpoints, none of them a plan or schedule service |
| Can the official Training API read the plan? | **No.** It is publish-only: it pushes workouts and training plans **to** Garmin Connect. | Garmin Training API page |
| Can we import the executed workout into the calendar grid? | **Yes**, as a paired run+workout row on the run's day that opens one integrated run+program peek, plus a step card on the activity detail. POC3 stores it in `activity_workouts`. | Implemented in POC3 |
| Can we import the future Garmin plan into the calendar grid? | **Not with the current architecture.** It needs a Garmin account (SSO) session token for `connectapi.garmin.com`, which the personal API key cannot mint. | See [§3](#3-what-a-full-plan-import-would-require) |

The rest of this document separates what is officially verified, what was observed on a live payload, and what is
inferred, so a later slice can pick up the full-plan import without redoing the research.

---

## 1. What the Personal API exposes

### 1.1 Authentication

- A runner creates a Personal API key in Garmin Connect (Profile & Account → Settings → Personal API Key). The key is
  shown once and expires after 30/90/180 days or one year.
- The key is exchanged for a **Bearer JWT** with a `POST` to
  `/personalapitoken-service/personal-api/personal-api-key/token` and `Authorization: ApiKey <key>`. The token is valid
  for **24 hours**; refresh tokens are not supported, so the client re-exchanges the key.
- POC3 stores one key per runner (plaintext SQLite, private-server PoC) and caches the JWT for 20 minutes.

### 1.2 Documented endpoint surface

The Personal API Swagger ("Garmin Connect Personal API 1.0.0 OAS3") documents **24 GET endpoints only**; there are no
write endpoints. The relevant ones for POC3 are:

| Endpoint | What POC3 uses it for |
|---|---|
| `GET /activitylist-service/activities/search/activities` | The activity list (`start`/`limit`; 100 per pull is the practical maximum). |
| `GET /activity-service/activity/{activityId}` | Activity summary and `splitSummaries` (laps/intervals). |
| `GET /activity-service/activity/{activityId}/details` | Per-sample metric stream; per-kilometre splits are computed from it. |
| **`GET /activity-service/activity/{activityId}/workouts`** | **The planned workout the activity followed.** |

`workout-service/*`, `trainingplan-service/*`, `calendar-service/*`, `graphql-gateway/*` and `/training-api/*` do **not**
appear in the Personal API specification. The base host is also different from the Garmin web/app API:
`personal.connectapi.garmin.com` (Personal API) versus `connectapi.garmin.com` (the web/app API used by Garmin Connect
itself). A separate host normally means a separate allow-list.

### 1.3 The activity-workout endpoint

```
GET /activity-service/activity/{activityId}/workouts
Authorization: Bearer <jwt>
```

- The Swagger names the response types `ActivityWorkoutDTO[]` and `WorkoutStepDTO`; Garmin's official Python client wraps
  the same path as `get_activity_workouts(activity_id)` (CLI: `gc-personal activity-workouts <id>`).
- The endpoint describes **the planned workout that a completed activity followed**, as the workout exists in Garmin
  Connect — not a future session and not the whole multi-week plan. An empty list means the activity followed no planned
  workout.
- The field-level properties of the DTO are **not published** in the retrievable Swagger summary. A live payload reported
  by a community integration in November 2026 is a flat, FIT-style step array. POC3 therefore parses defensively: it
  accepts the observed fields and close variants, and treats an unreadable payload as "no planned workout" rather than
  throwing.

**Observed step fields** (community payload; treat the exact names as observed, not contractual):

| Field | Meaning | POC3 handling |
|---|---|---|
| `stepIndex` | 1-based position in the workout | Step table row number |
| `intensity` | `WARMUP`, `ACTIVE`, `RECOVERY`, `REST`, `COOLDOWN`, … | Human label: Warm-up, Run, Recovery, Rest, Cool-down |
| `durationType` | `TIME`, `DISTANCE`, `REPEAT_UNTIL_STEPS_CMPLT`, `LAP_BUTTON`, `OPEN`, … | `mm:ss`, km/m, "lap" or "open" |
| `durationValue` | Seconds (time), metres (distance), or the 1-based step to return to (repeat) | Duration text / repeat target |
| `targetType` | `PACE`, `HEART_RATE`, `CADENCE`, `POWER`, `SPEED`, or open | Target text |
| `targetValueLow` / `targetValueHigh` | Target range | Pace min/km, HR bpm or % max, cadence spm, power W, speed km/h |
| `targetValue` | Repeat count on a repeat step | `3 ×` |
| `notes` | Coach's note for the step | Joined into the workout notes |

A repeat step closes the block it points back to, so POC3 groups the preceding steps into one phrase. A real mapped
example:

```
Warm-up 10:00 @ 5:45–6:25/km · 3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00) · Cool-down 10:00 @ 5:45–6:25/km
```

Pace targets arrive in **metres per second**; POC3 converts them to min/km and orders the range fast-to-slow. Nested
repeats group correctly because grouping runs in step order: the inner repeat is already one entry when the outer repeat
closes.

---

## 2. What the Personal API does not expose

| Missing data | Why it matters | Where it actually lives |
|---|---|---|
| Future scheduled workouts | A plan import would need the dates, names and targets of the coming days | Garmin web API `calendar-service` / `workout-service/schedule` |
| Garmin Coach / adaptive plan definition | The plan name, weeks, phases, goal race and per-day sessions | Garmin web API `trainingplan-service` + GraphQL `trainingPlanScalar` |
| Plan ↔ activity reverse link | "Which plan did this run belong to?" | GraphQL `workoutScheduleSummariesScalar[].associatedActivityId` (web token) |
| A workout id inside the activity summary | Would make the per-run lookup one request | Not documented; Garmin ships the dedicated `/workouts` sub-resource instead |
| Write access | Pushing a POC3 plan to Garmin | No write endpoints in the Personal API; the official Training API is publish-only and business-tier |

The official **Connect Developer Program Training API** is explicitly described as a way to *publish* workouts and
training plans **to** the Garmin Connect calendar. It is not a read API and cannot tell us which plan an activity came
from. It is also not part of the Personal tier.

---

## 3. What a full plan import would require

A future slice that imports the *upcoming* Garmin plan would need a second transport: a Garmin account session (SSO /
OAuth Bearer) for `https://connectapi.garmin.com`. The endpoints used by maintained clients are:

| Purpose | Request | Notes |
|---|---|---|
| Month calendar feed | `GET /calendar-service/year/{year}/month/{monthIndex0}` | **Month is 0-indexed** (January = `0`); an off-by-one silently returns the wrong month. Response envelope: `{ "calendarItems": [...] }`; scheduled sessions are items with `itemType` `workout` or `fbtAdaptiveWorkout`. |
| Scheduled-workout range | `GET /workout-service/schedule/workoutScheduleByPeriod?startDate=&endDate=` | Preferred over by-id reads. |
| All plans | `GET /trainingplan-service/trainingplan/plans` | Returns `{ "trainingPlanList": [...] }`. |
| Active plans | `GET /trainingplan-service/trainingplan/active-plans?startDate=` | |
| Plan tasks | `GET /trainingplan-service/trainingplan/tasks/{planId}?localeKey=en` | |
| Plan detail (classic) | `GET /trainingplan-service/trainingplan/phased/{planId}` | |
| Plan detail (Coach/adaptive) | `GET /trainingplan-service/trainingplan/fbt-adaptive/{planId}` | |
| Reverse activity link | `POST /graphql-gateway/graphql` with `workoutScheduleSummariesScalar` | Rows carry `associatedActivityId`, `trainingPlanId`, `tpPlanName`, `fbtAdaptivePlanId`, `scheduledWorkoutId`. |
| Coach plan window | GraphQL `trainingPlanScalar(calendarDate, lang, firstDayOfWeek)` | All three arguments are required by Garmin. |

Known sharp edges for that future work:

- **Garmin Coach workouts are keyed by UUID, not numeric id.** `/workout-service/workout/{id}` returns 404 for Coach
  workouts; route by UUID to `/workout-service/fbt-adaptive/{uuid}`.
- **`scheduledWorkoutId` is null for both Coach and self-scheduled entries.** Do not use its nullability to infer "came
  from a plan"; use `fbtAdaptivePlanId` / `trainingPlanId`.
- **`associatedActivityId` is only populated after completion**, so the reverse link is a post-run reconciliation, not a
  pre-run plan read.
- **The GraphQL range read lags writes** by a few seconds; the month feed is immediate.
- **Plan start/end dates are not documented fields.** Derive them from the min/max scheduled dates plus workouts per week.
- **Terms:** the Personal API is intended for personal, non-commercial use, and the Developer Program Agreement restricts
  some AI uses of Garmin device data. A multi-user deployment would need a product/legal decision before adding SSO
  credentials.

A capability model keeps this honest: `official` (Personal API only, per-activity workouts), `webapi` (an SSO token was
provisioned, full plan reads possible) and `none` (hide plan widgets). A probe should run once and cache the verdict:
`403`/`404` means the family is not entitled (do not retry in a loop); `429`, `5xx` and network errors are transient.

---

## 4. What POC3 does with the available data

- **Fetch:** after the activity rows are stored, a sync enriches up to **3** workouts (`workoutFetchLimit`) for Garmin
  activities in the 90-day window that have no workout row or a retryable failure. A second attempt is allowed
  (`maxWorkoutAttempts = 2`); a `404` is stored as a confirmed "no workout", any other failure as `unavailable`.
  Enrichment is best-effort and can never turn a good activity sync into a failure. A calendar render also fills up to
  **6** missing workouts for the visible month (2.5 s budget, 60 s per-runner throttle), so the grid can pair the runs the
  runner is looking at without waiting for several syncs.
- **Store:** the `activity_workouts` table keeps `(user_id, activity_id)`, `day`, `status` (`ok` / `none` /
  `unavailable`), `attempts`, `fetched_at` and the normalized JSON payload. The calendar can group workouts by day without
  another Garmin call.
- **Activity detail:** a "Training program · Garmin" card with the workout name, the grouped one-line summary, a
  step table (# / Step / Duration / Target) and Garmin's coach notes. If nothing is stored (or the stored fetch failed),
  the detail page fetches once on demand, stores the result and renders it. A failed fetch shows a muted note; the run
  page stays usable. A run that followed no planned workout has no card.
- **Calendar grid:** the run and its known workout render as one **paired row**: a green run line (`✓` + title + amount) above
  a purple workout line (`◈` + workout label) inside one bordered item. The row is one click target: it opens the **run peek**,
  which carries the run's metrics and the full **Training program · Garmin** (name, summary, up to eight step rows with
  targets, notes and links) together. A run with no known workout stays a plain green row. `/calendar/data` and the in-place
  refresh after a coach turn return the same typed pair item and rendered rows.
- **Training log and day page:** the week card shows a "Garmin workout" line under the planned line, and `/day/<day>` has
  a "Garmin workouts" card.
- **Run peek:** a "Training program · Garmin" section with the name, summary, step table and notes when the workout is known.
- **Rate limiting:** Garmin publishes no Personal API quota, but `429` is possible (POC3 already turns 401/403/429/400 into
  actionable errors). The cap, the retry cap, the calendar budget/throttle and the on-demand fetch keep the extra calls
  bounded.

This is the honest scope: **the executed workout is imported; the future plan is not**, because the transport for it is not
part of the key model POC3 uses.

---

## 5. Decision table

| Need | Today | Next step if the owner wants it |
|---|---|---|
| Show what Garmin workout a run followed | **Done** (paired pill with a clickable brief, detail card, week card, day page, peek) | — |
| Show the Garmin Coach plan name for a run | Not available from the Personal API | SSO + GraphQL `workoutScheduleSummariesScalar.associatedActivityId` |
| Import upcoming Garmin sessions into the calendar grid | Not available from the Personal API | SSO + `calendar-service` month feed / `workoutScheduleByPeriod`, mapped to a read-only "Garmin plan" pill layer |
| Import the whole Garmin plan as POC3 sessions | Not available and would mix two owners of the plan | Keep imported sessions read-only and separate from coach-written sessions |
| Push POC3 sessions to Garmin | Not in the Personal API | Official Training API (publish-only, business tier) |
| Keep activity sync working when Garmin changes | Done: workout overlay is best-effort and optional | Probe once per endpoint family; cache the verdict |

---

## 6. Sources

**Official Garmin**

- [Garmin Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/) — key model and token exchange.
- [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/) — key expiry, 24 h tokens, no
  refresh tokens.
- [Personal API Swagger documentation](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) — the
  documented GET surface and the `ActivityWorkoutDTO` / `WorkoutStepDTO` schema names.
- [Official Personal API Python client](https://github.com/garmin/connect-personal-api-python) — `get_activity_workouts` →
  `/activity-service/activity/{id}/workouts`; token cache and error handling.
- [Garmin Connect Developer Program — Training API](https://developer.garmin.com/gc-developer-program/enterprise/training-api)
  — publish-only, not a read API.

**Observed payloads and maintained clients**

- [Naming my Strava runs from Garmin with a Drupal webhook](https://mglaman.dev/blog/naming-my-strava-runs-garmin-drupal-webhook)
  — a real `/activity-service/activity/{id}/workouts` payload: `stepIndex`, `intensity`, `durationType`, `durationValue`,
  `targetValue`, repeat semantics and metre-per-second targets.
- [Garmin Personal MCP — tools guide](https://github.com/indaco/garmin-personal-mcp/blob/main/guide/tools.md) — the
  activity-workouts semantics and which Garmin data sets the Personal API does not have.
- [python-garminconnect — API endpoints](https://github.com/cyberjunky/python-garminconnect/blob/master/docs/API_ENDPOINTS.md)
  — the web/app API endpoint surface, verified/unverified columns.
- [garminconnect-js — workouts](https://github.com/DynamicsNinja/garminconnect-js/blob/main/docs/api/workouts.md) — scheduled
  workouts, plan fields and Coach UUID routing.
- [garmin-connect-mcp — calendar API verification](https://github.com/xcbbc21/garmin-connect-mcp/blob/main/docs/calendar-api-verification.md)
  — GraphQL envelope and identifier semantics.
- [DC Rainmaker — Garmin revamps the Connect Developer API Program](https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html)
  — tier scope and the Training API's push-only role.
