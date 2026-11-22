# Garmin integration
**Status:** current · **Owner:** Garmin sync · **Updated:** 2026-11-22 · **Supersedes:** docs/GARMIN-TRAINING-PROGRAMS.md, docs/MILEBOOK-CALENDAR.md §9

Garmin is Milebook's **completion** source: a runner's own Garmin account supplies finished activities, plus the workout each activity followed, into the calendar-first log. The coach stays the **booking** source. Four modules implement it — the HTTP client (`src/garmin.ts`), the sync service (`src/garmin-sync.ts`), the workout mapper (`src/garmin-workout.ts`) and the runner-facing copy (`src/garmin-errors.ts`) — and the routes, popup and surfaces live in `src/web.ts`. The integration is read-only: one token exchange plus GETs, no writes back to Garmin.

## 1. Credential model

| Concern | Behaviour | Source |
|---|---|---|
| Scope | One Garmin Personal API key per Milebook runner, saved against that runner's user id. Production wiring builds the real client from the saved key and passes no shared client. | `(src/web.ts · createWeb)` |
| Getting a key | The popup walks the runner through Garmin Connect → Profile & Account → Settings → Personal API Key → Create Key, then paste; it links Garmin's own how-to. | `(src/web.ts · renderGarminModal)` |
| Verified before storage | The route trims the pasted value, rejects empty, rejects anything outside 10–512 printable ASCII characters, builds a client and exchanges the key for a token. Only a successful exchange is saved — a plausible-looking but rejected key never reaches the database. | `(src/web.ts · isPlausibleGarminKey)` `(src/garmin.ts · createGarminClient)` |
| Stored plaintext | Table `garmin_keys(user_id PRIMARY KEY, saved_at, api_key TEXT)`; the key is written verbatim. **No encryption, no hash, no KMS** — a saved key is replaced in place. | `(src/store.ts · saveGarminKey)` |
| Masked in the UI | `••••` plus the last four characters, rendered only in replace mode; the field is a password input with a Show/Hide toggle. After saving, the full key is never rendered again. | `(src/web.ts · maskKey)` `(src/web.ts · renderGarminModal)` |
| Token cache | The JWT from the token endpoint is cached per client instance for 20 minutes; after that the saved key is exchanged again. | `(src/garmin.ts · createGarminClient)` |
| Removal | `POST /garmin/key/delete` deletes the row and drops the cached client, so every later pull finds no client (production configures no fallback) and returns an empty outcome: sync stops until a key is saved again. | `(src/web.ts · createWeb)` |
| Removal does not | Revoke the key at Garmin, or delete already-synced activities and workouts. | `(src/store.ts · deleteGarminKey)` |
| Fallback client | A deployment may inject a fallback client used only when a runner has no saved key; the production entry point passes none. | `(src/web.ts · clientFor)` |

## 2. Sync semantics

The same caps appear in [LIMITS.md](LIMITS.md); restart and backfill behaviour is in [OPERATIONS.md](OPERATIONS.md).

| Trigger | What happens | Source |
|---|---|---|
| Manual — "Sync Garmin now" | The account-menu form POSTs `/sync`; the route redirects back with `synced` / `syncError`. `notifyWhenUnchanged` is on, so a pull that finds nothing new still records a bell entry. | `(src/web.ts · renderSyncItem)` |
| New browser session | Login, signup, or any authenticated request whose cookie has no live in-process session (including the first request after a restart) starts one background pull, fire-and-forget. | `(src/web.ts · startSession)` |
| Page load | `/calendar` and `/history` **await** `autoSync`, which pulls only when the stored last sync is at least 10 minutes old; the page waits for that pull. | `(src/web.ts · autoSync)` |
| Skip on sync POSTs | `/sync`, `/garmin/key` and `/garmin/key/delete` pass `syncOnStart: false`, so a manual action never doubles as a session pull. | `(src/web.ts · resolveSession)` |
| Concurrent requests | A second sync for the same runner joins the in-flight promise instead of pulling twice. | `(src/garmin-sync.ts · createGarminSync)` |
| Failure backoff | `sync_state.last_synced_at` is written on success **and** on failure, so a failed pull also earns the 10-minute floor. | `(src/garmin-sync.ts · createGarminSync)` |

The pipeline, in order:

| Step | Behaviour | Source |
|---|---|---|
| Pull | One page: `start=0&limit=100` with a Bearer JWT. No pagination — a runner with more than 100 activities since the last pull is only seen up to that page. | `(src/garmin.ts · createGarminClient)` |
| Window | Keep activities whose local start day is inside today − 89 days … today; older or future-dated rows are skipped, never deleted. | `(src/garmin-sync.ts · createGarminSync)` |
| Map | Raw activity → `Activity`: day from `startTimeLocal`, id prefixed `garmin:`, distance rounded to 0.1 km, pace from `averageSpeed` (m/s), HR from `averageHR`. | `(src/garmin.ts · mapGarminActivity)` |
| Upsert | `PRIMARY KEY (user_id, activity_id)` with `ON CONFLICT DO UPDATE` on day / created_at / payload, so a re-sync rewrites the row and `created_at` becomes the latest sync time. | `(src/store.ts · appendActivity)` |
| Count | `imported` = in-window rows processed; `created` = rows that did not exist before; `newest` = newest created row by day, then `createdAt`. | `(src/garmin-sync.ts · GarminSyncOutcome)` |
| Workouts | After the activity rows are committed, one bounded batch (§3). A workout failure can never turn a good activity sync into a failed one. | `(src/garmin-sync.ts · createGarminSync)` |
| Record | `sync_state` is updated and a notification appended: success only when `created > 0`, error always. | `(src/garmin-sync.ts · createGarminSync)` |

**Enriched fields stored when present:** `elevationGainM`, `elevationLossM`, `calories`, `maxHr`, `cadenceSpm`, `strideLengthCm`, `groundContactMs`, `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `trainingLoad`, `trainingEffectLabel`, `fastest1kSec`, `fastest1miSec`, `fastest5kSec`, `hrZone1Sec`–`hrZone5Sec` `(src/garmin.ts · mapGarminActivity)`.

| Thin payload | Result | Source |
|---|---|---|
| No usable `startTimeLocal` day, or no `activityId` | Activity dropped entirely — no row, no error. | `(src/garmin.ts · mapGarminActivity)` |
| `distance` missing | Stored as 0 km. | `(src/garmin.ts · mapGarminActivity)` |
| `duration` / `averageSpeed` / `averageHR` missing (or speed and HR ≤ 0) | `durationMin`, `paceSecPerKm`, `avgHr` become `null` and render as "—". | `(src/garmin.ts · mapGarminActivity)` |
| `activityName` missing | Title falls back to "Garmin activity". | `(src/garmin.ts · mapGarminActivity)` |
| Any optional metric missing or non-finite | That field is `null`; the rest of the row is kept. | `(src/garmin.ts · mapGarminActivity)` |
| Detail samples without `sumDistance` / `sumDuration` descriptors | No per-kilometre splits (empty list). | `(src/garmin.ts · mapGarminSplits)` |
| Summary without `splitSummaries`, or a lap with non-positive distance/duration | No laps, or that lap skipped. | `(src/garmin.ts · mapGarminLaps)` |

Splits and laps are fetched live on each activity-detail view and never stored; only the workout overlay is persisted `(src/web.ts · createWeb)`.

**Copy caveat.** The manual banner's count is `imported` (processed), while its copy reads "N new activities"; `created` — which drives the bell notification — is the accurate new-activity signal `(src/web.ts · syncResultParams)`.

## 3. Workout overlay

The endpoint is `/activity-service/activity/{id}/workouts`; the DTO's field-level properties are not published, so the mapper accepts the observed shape plus close variants. Stored rows are documented in [DATA-MODEL.md](DATA-MODEL.md).

| Field (observed) | Meaning | Handling |
|---|---|---|
| `stepIndex` | 1-based step position | Step-table row number; unindexed steps are numbered in order. |
| `intensity` | Step role, matched by substring (`WARM`, `COOL`, `RECOVER`, `REST`, `INTERVAL`/`ACTIVE`/`RUN`, `REPEAT`, `OTHER`) | Warm-up, Cool-down, Recovery, Rest, Run, Repeat, Step. |
| `durationType` | How the step ends: time, distance, calories, lap button, open, or repeat | Clock, km/m, kcal, "lap", "open", or "N ×". |
| `durationValue` | Seconds, metres, calories, or the step a repeat returns to | Duration text; repeat target. |
| `targetType` | `PACE`, `HEART_RATE`, `CADENCE`, `POWER`, `SPEED`, or open | Target text. |
| `targetValueLow` / `targetValueHigh` | Target range | Pace min/km, bpm or % max HR, spm, W, km/h. |
| `targetValue` | Repeat count on a repeat step | `N ×`. |
| `notes` / `coachNotes` | Coach note for the step | Joined into the workout notes. |

Source for the whole table: `(src/garmin-workout.ts · mapGarminWorkout)`.

| Defence | Behaviour | Source |
|---|---|---|
| Field-name variants | Each field is read through a first-match list (`intensity` / `intensityType` / `intensityKey`, `durationValue` / `endConditionValue` / `duration`, `targetValueLow` / `customTargetValueLow` / …). | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Envelopes | Accepts a bare step array, `workoutSteps` / `steps` / `workoutStepList` / `stepList`, `workoutSegments[]`, and a nested `workout` object. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Repeat groups | A group with child steps and `numberOfIterations`, or a type containing "repeat", is flattened into its children plus one repeat marker. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Unit heuristics | Pace below 30 is metres per second (else seconds per km); distance ≥ 100 is formatted as km; duration above 86 400 is milliseconds; a range topping out at ≤ 100 is % max HR, else bpm. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Never throws | An empty or unreadable payload is a confirmed **none** (the run followed no planned workout), not an error. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Failure row | A failed fetch is stored as **unavailable** with the attempt count raised. | `(src/garmin-workout.ts · failedGarminWorkout)` |
| Size caps | 60 steps, 320-character summary, 64-character pill/peek label. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Record | Status `ok` / `none` / `unavailable`, plus `attempts` and `fetchedAt`. | `(src/types.ts · ActivityWorkout)` |

| Cap / throttle | Value | Source |
|---|---|---|
| Workout lookups per sync | 3 | `(src/garmin-sync.ts · createGarminSync)` |
| Failed attempts before sync and calendar stop retrying | 2 | `(src/garmin-sync.ts · createGarminSync)` |
| Workouts per calendar render | 6 | `(src/web.ts · enrichCalendarWorkouts)` |
| Calendar render time budget | 2 500 ms | `(src/web.ts · enrichCalendarWorkouts)` |
| Calendar fill throttle | 60 s per runner, in memory; stamped even when nothing is pending | `(src/web.ts · enrichCalendarWorkouts)` |
| On-demand detail retry | **uncapped** — every detail view retries an `unavailable` row | `(src/web.ts · ensureActivityWorkout)` |

| Persistence | Behaviour | Source |
|---|---|---|
| Table | `activity_workouts(user_id, activity_id, day, status, attempts, fetched_at, payload)`, PK `(user_id, activity_id)`, upsert on conflict. | `(src/store.ts · saveActivityWorkout)` |
| Candidates | Garmin activities in the window with no row, or `unavailable` and `attempts < 2`; newest day first, capped. | `(src/store.ts · listWorkoutCandidates)` |
| 404 | Confirmed **none** — retries end. | `(src/garmin-sync.ts · createGarminSync)` |
| Any other failure | **unavailable** with attempts + 1; the activity row is untouched. | `(src/garmin-sync.ts · createGarminSync)` |

The week card and the review flow around it are described in [TRAINING-LOG.md](TRAINING-LOG.md).

| Surface | What the runner sees | Source |
|---|---|---|
| Calendar row | A run with a stored `ok` workout renders as one **paired row**: green run line (✓ title + amount) above a purple workout line (◈ label); the whole row is one click target. Runs without a workout stay plain. | `(src/web.ts · pairItem)` `(src/calendar-items.ts · renderCalendarItem)` |
| Run peek | `/activity/{id}/peek` returns the run plus a "Training program · Garmin" card: name, one-line summary, the first 8 steps, "+N more steps in the activity detail", and notes. | `(src/web.ts · buildActivityPeekProgram)` |
| Activity detail | A "Garmin workout" card with step table (# / Step / Duration / Target), step count, name, summary and coach notes. A failed fetch is a muted note; a **none** workout shows no card. | `(src/web.ts · workoutSection)` |
| Training-log week card | A "Garmin workout" line under the planned line — label · summary — only for `ok` rows. | `(src/web.ts · renderDay)` |
| Day page | A "Garmin workouts" card for the day's `ok` rows. | `(src/web.ts · createWeb)` |
| Calendar fragment | `/calendar/data` reuses the same pairing from stored rows only; it makes no Garmin call. | `(src/web.ts · pairItem)` |

The month grid fills missing workouts before rendering, so a run is paired on the grid as soon as its workout is known `(src/web.ts · enrichCalendarWorkouts)`.

## 4. What is impossible

| Capability | Why it is out of reach | Product consequence | Source |
|---|---|---|---|
| Future scheduled workouts | The client's only workout read is per activity, and the mapper header records the boundary: the Personal API exposes no scheduled workouts or plan definitions, so the payload describes only the workout a **completed** activity followed. | The calendar's planned layer stays coach-written; tomorrow's Garmin session never appears. | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Garmin Coach / adaptive plans | No plan-definition endpoint; the client exposes five calls and none reads a plan. | No plan name, phase, weekly progression or Coach badge in Milebook. | `(src/garmin.ts · GarminClient)` |
| The Garmin calendar | No calendar call exists: the client's five members are token, activities, activity detail, activity summary and per-activity workouts, and the mapper header records that scheduled workouts are not exposed. | The runner keeps planning in Garmin Connect; Milebook cannot mirror or reconcile that calendar. | `(src/garmin.ts · GarminClient)` |
| Plan ↔ activity link | The payload is keyed by activity, not by plan. | Milebook can say "this run followed this workout", never "this run was week 3 of plan X". | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Write access | The client has no write call. | Milebook cannot push coach sessions to Garmin; export is JSON/ICS only. | `(src/garmin.ts · GarminClient)` |

**Product consequence.** The integration is deliberately one-way and past-only: Garmin completes, the coach books. A runner who wants Garmin's plan inside Milebook must keep two calendars, and the paired row is the honest maximum — the executed program beside the run, never the future one.

**A full-plan import would require** a second transport (the per-runner personal key authorises only the personal host), a credential able to read the web/app API, new client methods plus mappers for scheduled sessions and plan metadata, a read-only "Garmin plan" calendar layer that never mixes with coach-written sessions, and a capability probe so an unentitled account degrades quietly. None of that exists here: `GarminClient` has five members `(src/garmin.ts · GarminClient)`.

## 5. Error taxonomy

The routes and redirects involved are listed in [HTTP-API.md](HTTP-API.md).

If the response body parses as JSON with a numeric `retryInSeconds`, the rate-limit/block copy wins over the status code `(src/garmin-errors.ts · describeGarminError)`.

| Condition | Copy (English) | Source |
|---|---|---|
| Token block, `retryInSeconds < 0` | "Garmin has blocked Personal API token requests for this account/key (count/limit requests). Wait for Garmin to lift the block, or contact Garmin support." | `(src/garmin-errors.ts · describeGarminError)` |
| Block, `retryInSeconds = 0` | "Garmin is rate-limiting Personal API requests. Try again shortly." | `(src/garmin-errors.ts · describeGarminError)` |
| Block, `retryInSeconds > 0` | "Garmin is rate-limiting Personal API requests. Try again in N seconds." (≥ 120 s is shown as minutes) | `(src/garmin-errors.ts · describeGarminError)` |
| 401 while saving a key | "Garmin rejected that key (401). It may be invalid, expired, revoked, or created under a different Garmin account. Check that the full key was copied (it is long and usually starts with GCDC_)…" | `(src/garmin-errors.ts · describeGarminError)` |
| 401 during sync | "Garmin rejected the saved key (401)… Open the Garmin key popup to create a fresh Personal API key." | `(src/garmin-errors.ts · describeGarminError)` |
| 403 | "Garmin denied access to that key / the saved key (403). Check that the key is active and belongs to the same Garmin account." | `(src/garmin-errors.ts · describeGarminError)` |
| 429 | "Garmin is rate-limiting Personal API requests. Try again in a minute." | `(src/garmin-errors.ts · describeGarminError)` |
| Status 0 (fetch threw) | "Could not reach Garmin. Check this server's connection and try again." | `(src/garmin-errors.ts · describeGarminError)` |
| 5xx | "Garmin is unavailable right now (HTTP N). Try again later." | `(src/garmin-errors.ts · describeGarminError)` |
| Other 4xx, and malformed 2xx JSON | "Garmin request failed (HTTP N): <body snippet ≤ 160 chars>", or without the snippet when the body is empty. There is no dedicated malformed-payload copy — a 200 with unparseable JSON lands here as `HTTP 200`. | `(src/garmin-errors.ts · describeGarminError)` |
| Non-Garmin throwable | The error's own message, trimmed; "Garmin request failed." when empty. | `(src/garmin-errors.ts · describeGarminError)` |

A 404 on the workout endpoint never reaches this copy: it is stored as a confirmed **none** `(src/garmin-sync.ts · createGarminSync)`.

| Path | Page | Bell |
|---|---|---|
| Manual sync (`/sync`, or save-and-sync) | 303 redirect with `syncError` → banner "Garmin sync failed: {detail}" on the returned page; success → "Garmin sync finished: N new activities." (or "…no new activities.") | Also appended by the sync service: error, or the created / unchanged result. |
| Key verification failure | 303 redirect with `keyError` → the popup reopens showing the copy. Nothing is saved. | Nothing — no key, no sync. |
| Sync failure right after a successful save | Both the banner and a bell entry. | Error notification, href `/calendar?garmin=setup` for 401/403 and `/history` otherwise. |
| Automatic page-load / session sync | Nothing. | Error or "new activities" notification; unchanged checks stay silent. |
| Workout fetch failure | Muted note on the activity detail; the peek omits the program card. | Nothing. |

Sources: `(src/web.ts · syncFlash)` `(src/web.ts · syncResultParams)` `(src/garmin-sync.ts · createGarminSync)` `(src/web.ts · ensureActivityWorkout)`.

Bell mechanics: `/notifications` returns the newest 20 with the unread count, opening the panel POSTs `/notifications/read`, and the badge caps at `99+` with the count echoed in the document title `(src/web.ts · renderNotificationBell)`.

## 6. Data ownership and privacy

The wider threat model, cookie policy and deployment secrets are in [SECURITY.md](SECURITY.md).

- **The key is the runner's own.** It is pasted by that runner, stored against their user id and used only for their pulls; production wiring has no deployment-wide Garmin key `(src/web.ts · createWeb)`.
- **Plaintext at rest.** `garmin_keys.api_key` is unencrypted: anyone who can read the SQLite file or a backup can read the key and use it against Garmin. Treat the database file as a secret `(src/store.ts · saveGarminKey)`.
- **One Garmin account per key.** Every activity is stored under the Milebook user, and nothing records which Garmin account produced it; replacing the key with another account's key merges both accounts' runs under one Milebook user, and old rows are neither reconciled nor removed `(src/garmin.ts · mapGarminActivity)`.
- **The same activity can live in several accounts.** `activities` is keyed `(user_id, activity_id)`, so two runners each store `garmin:<id>` independently; the older schema keyed by activity id alone is migrated on startup `(src/store.ts · migrateActivitiesTable)`.
- **Export excludes the key.** `/export.json` builds profile, sessions, activities, change sets and muscle data — no key, and no workouts either; `/export.ics` contains planned sessions only `(src/export.ts · buildExportBundle)` `(src/export.ts · buildCalendarIcs)`.
- **Removal is local.** Deleting the key stops future pulls and drops the cached client; it does not revoke the key at Garmin or delete anything already synced `(src/store.ts · deleteGarminKey)`.

## 7. Operational caps

| Cap / throttle | Value | Source |
|---|---|---|
| Activities per pull | 100 (`start=0&limit=100`, one page, no pagination) | `(src/garmin.ts · createGarminClient)` |
| Sync window | 90 days (today − 89 … today) | `(src/garmin-sync.ts · createGarminSync)` |
| Workout lookups per sync | 3 | `(src/garmin-sync.ts · createGarminSync)` |
| Failed workout attempts (sync + calendar) | 2 | `(src/garmin-sync.ts · createGarminSync)` |
| Workouts per calendar render | 6 | `(src/web.ts · enrichCalendarWorkouts)` |
| Calendar render time budget | 2 500 ms | `(src/web.ts · enrichCalendarWorkouts)` |
| Calendar fill throttle | 60 s per runner | `(src/web.ts · enrichCalendarWorkouts)` |
| Automatic page-load pull floor | 10 minutes | `(src/web.ts · autoSync)` |
| App-level throttle on manual sync | **none** — every `/sync` POST pulls; only the in-flight join and Garmin's own 429/block bound it | `(src/web.ts · createWeb)` |
| JWT cache | 20 minutes | `(src/garmin.ts · createGarminClient)` |
| Workout steps kept | 60 | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Workout summary / label | 320 / 64 characters | `(src/garmin-workout.ts · mapGarminWorkout)` |
| Peek steps | 8 (+N more in the detail) | `(src/web.ts · buildActivityPeekProgram)` |
| Per-kilometre splits | 100 | `(src/garmin.ts · mapGarminSplits)` |
| Laps | 50 | `(src/garmin.ts · mapGarminLaps)` |
| Key length / charset | 10–512 printable ASCII | `(src/web.ts · isPlausibleGarminKey)` |
| Error body snippet | 160 characters | `(src/garmin-errors.ts · describeGarminError)` |
| Bell entries per poll | 20 | `(src/web.ts · renderNotificationBell)` |
| Calendar rows per day cell | 4 (a paired run+workout counts as one row) | `(src/calendar-items.ts · CALENDAR_CELL_MAX_ITEMS)` |

## When sync misbehaves

1. **Key validity.** Open the Garmin key popup (`?garmin=setup`); the intro shows the mask (`••••1234`). Re-paste the full key — the save path re-verifies it against the token endpoint before storing. A 401/403 copy means rejected or denied; nothing is saved until the exchange succeeds `(src/web.ts · renderGarminModal)`.
2. **Rate limit.** Look for "rate-limiting" or "blocked Personal API token requests" copy and honour `retryInSeconds`; a negative value is an account/key block only Garmin can lift. The block body wins over the HTTP status `(src/garmin-errors.ts · describeGarminError)`.
3. **Window.** Confirm the run is inside the last 90 days and that the runner has fewer than 100 activities since the last pull; older runs and anything past the first page are never fetched `(src/garmin-sync.ts · createGarminSync)`.
4. **DB row.** Check `garmin_keys` (one row per runner), `activities` for `(user_id, garmin:<id>)`, `activity_workouts` status and attempts, and `sync_state.last_synced_at`. A row at `unavailable` with `attempts = 2` is deliberately parked — only a detail-page view retries it — and the calendar fill is throttled for 60 s, so a new pair can lag a page view `(src/store.ts · listWorkoutCandidates)` `(src/web.ts · enrichCalendarWorkouts)`.
5. **Logs.** There is no Garmin-specific log line; the durable trace is the stored notification (title, body, href), `sync_state` and the rows above. Reproduce with a manual sync to get the mapped copy into the banner `(src/garmin-sync.ts · createGarminSync)`.

Adjacent convention, not Garmin: `/static/anatomy-muscles.glb` (11 MB) is served with a startup-computed ETag, so a revalidating request costs a 304 with no body `(src/web.ts · sendAsset)`.

## See also

- [TRAINING-LOG.md](TRAINING-LOG.md) — the week card, run metrics and review flow that consume synced runs.
- [HTTP-API.md](HTTP-API.md) — `/sync`, `/garmin/key`, `/garmin/key/delete`, `/activity/{id}/peek`, `/notifications`.
- [SECURITY.md](SECURITY.md) — plaintext key storage, session cookies and the threat model.
- [DATA-MODEL.md](DATA-MODEL.md) — `activities`, `activity_workouts`, `garmin_keys`, `sync_state`.
- [LIMITS.md](LIMITS.md) — the caps above in the product-wide context.
- [OPERATIONS.md](OPERATIONS.md) — running the process, restarts and backfill behaviour.
