# POC3 ??training-log feature plan

**Status:** research + Slice 1 + Slice 2 + Slice 3 implemented 繚 **Scope:** the read-only training log and the run-detail
view 繚 **Updated:** 2026-11-18

The training log is the "what actually happened" projection of the calendar plan. The Week/Month/Year browser
answered the first question ??*when did I run?* This plan answers the next questions a runner asks of a log:

1. *How much did I load, and is the ramp sensible?*
2. *How hard was the week, and was it balanced?*
3. *How did each kilometre go?*
4. *Can the coach review the week without inventing data?*

## 1. Research summary

### What strong training logs show

| Product pattern | What runners use it for | POC3 decision |
|---|---|---|
| Garmin Connect training status / load focus | Acute load, load focus, training effect, recovery context | Use the **training-load** and **training-effect** fields the Personal API already returns; show a soft ramp signal, not a medical verdict |
| Garmin activity detail / laps | Pacing and interval execution | Compute **per-kilometre splits** from the activity-detail samples; show Garmin's own **lap/interval summaries** separately |
| Strava best efforts | Fastest 1 km / 1 mi / 5 km and personal records | Show per-run fastest efforts, **period best-efforts cards** and **PR badges** against stored history |
| TrainingPeaks-style load | Weekly load, ramp rate, hard/easy distribution | Show weekly load, 7/28-day ACWR, week-over-week change and hard/easy kilometres |
| Garmin HR-zone time | Time spent in each zone | Show the Garmin zone seconds as a stacked bar; zone boundaries stay in Garmin |
| Running logs with RPE / notes | How the run felt, not just what the watch measured | Later slice; it needs a write surface and a deliberate privacy decision |
| Personal heatmaps / routes | Where the training happened | Later slice; routes need polyline storage and privacy work |

### What the Garmin Personal API actually gives us

Verified against the live account on 2026-11-15:

- The activity list (`/activitylist-service/activities/search/activities`) returns more than the original five mapped
  fields: elevation gain/loss, calories, max HR, running cadence, stride length, ground-contact time, aerobic and
  anaerobic training effect, training load, training-effect label, fastest 1 km / 1 mi / 5 km, HR-zone times and more.
- The activity summary (`/activity-service/activity/{id}`) returns `summaryDTO` and `splitSummaries` (laps/intervals),
  not per-kilometre splits. A `/splits` endpoint returned 404 for the live activity.
- The activity details endpoint (`/activity-service/activity/{id}/details`) returns metric descriptors plus a per-sample
  stream. It includes `sumDistance`, `sumDuration`, `directHeartRate`, cadence and elevation. Per-kilometre splits can be
  computed by interpolating the cumulative distance and duration at each kilometre. This is on-demand data, not something
  to store for every sync.
- The list endpoint is capped at 100 activities per pull; the 90-day filter runs after that cap.
- Garmin may return 403 for some activity-detail requests; the UI must degrade to the stored list metrics.

### Load guidance used

The research on running load is not a single prescription. A widely used weekly-progression threshold is **30%**;
a week-over-week increase above that is treated as a significant jump. Acute:chronic workload ratio (ACWR) work uses a
**7-day acute** window against a **28-day chronic** window, with 0.8??.3 often described as a stable band and values
above **1.5** treated as a high-load signal. The methods (coupled, uncoupled, EWMA) disagree materially, so POC3 uses a
simple **coupled rolling average** and labels the result a soft signal, not an injury prediction.

Sources are listed at the end.

### What the Garmin Personal API gives us for training programs

Verified against the official Personal API Swagger and Garmin's official Python client on 2026-11-18:

- `GET /activity-service/activity/{activityId}/workouts` returns the **planned workout a completed activity followed**:
  steps, intensities, durations, targets and coach notes. The endpoint is official (the client wrapper is
  `get_activity_workouts`), but the field-level `ActivityWorkoutDTO` / `WorkoutStepDTO` properties are not published.
  POC3 parses the observed flat FIT-style payload and close variants defensively; an empty or unreadable payload is a
  confirmed "no planned workout".
- A repeat step closes the block it points back to (`REPEAT_UNTIL_STEPS_CMPLT`, `durationValue` = step to return to,
  `targetValue` = repeat count), so the workout reads as `3 ? (Run 7:00 @ 4:14??:33/km, Recovery 2:00)`. Pace targets
  arrive in metres per second.
- The Personal API has **no** scheduled-workout, training-plan or calendar service: it can say what a run did, not what the
  runner will do next. The official Connect Developer Program Training API is publish-only. A future full-plan import would
  need a Garmin SSO web session for `connectapi.garmin.com`; the evidence and endpoint list are in
  [GARMIN-TRAINING-PROGRAMS.md](GARMIN-TRAINING-PROGRAMS.md).
- The workout is a read-only overlay on the activity: a failed fetch must never fail activity sync, and the calendar must
  keep working with no workout at all.

## 2. Feature inventory and priority

| # | Feature | Priority | Slice | Notes |
|---|---|---|---|---|
| 1 | Enriched run metrics | P1 | **Slice 1** | Elevation, calories, max HR, cadence, stride, ground contact, training effect/load, fastest 1 km/1 mi/5 km |
| 2 | Weekly load, ACWR, week change | P1 | **Slice 1** | Garmin training load; coupled 7/28-day ratio; soft warning thresholds |
| 3 | Hard/easy balance | P1 | **Slice 1** | Training-effect labels; kilometres and minutes by intensity |
| 4 | Weekly coach review prompt | P1 | **Slice 1** | One tap; prompt contains the week's actual/planned/load data; no unsolicited model call |
| 5 | Per-kilometre splits | P1 | **Slice 1** | On-demand details endpoint; interpolated splits; partial final split |
| 6 | Lap/interval splits | P2 | **Slice 2** | Garmin `splitSummaries`; labelled separately from per-kilometre splits |
| 7 | Cross-history best efforts / PRs | P2 | **Slice 2** | Period best-efforts cards plus PR badges; a dedicated records page is still later |
| 8 | RPE / feel / notes | P2 | Later | Write surface; coach-authored notes need a product decision |
| 9 | HR-zone time and zone charts | P2 | **Slice 2 (time)** | `hrTimeInZone_*` as a stacked bar; zone charts/boundaries later |
| 10 | Gear / shoe mileage | P2 | Later | Gear endpoints are available; needs a gear mapping UI |
| 11 | Filters/search by source, match, distance | P2 | Later | Pure UI; no new data dependency |
| 12 | Route map / personal heatmap | P3 | Later | Polyline privacy and storage cost |
| 13 | Training status / VO2 max / readiness | P3 | Later | Garmin metrics endpoints; separate health surface |
| 14 | Background sync | P3 | Later | Session-start + page-load auto-sync is the current, honest boundary |
| 15 | Per-runner Garmin OAuth | P3 | Later | Per-runner keys are saved from the popup; OAuth is still later |
| 16 | **Single metric-selectable trend graph** | P1 | **Slice 3** | One card replaces the separate pace/HR cards; Pace, Heart rate, Cadence, Load, Distance, Time, Elevation; CSS-only switching with a no-`script` fallback |
| 17 | **Garmin activity workout overlay** | P1 | **Slice 3** | `/activity-service/activity/{id}/workouts`; stored per activity; paired run+workout row, integrated run+program peek, detail step card, week/day lines; the visible month is filled on render |
| 18 | **Garmin plan import (future sessions)** | P2 | **Blocked** | Needs a Garmin SSO web session (`calendar-service`, `trainingplan-service`, GraphQL); the Personal API key cannot mint it |

## 3. Slice 1 ??implemented scope

### 3.1 Enriched activity record

The activity payload gains optional fields, so old rows and chat-created activities keep working without a migration:

```
elevationGainM, elevationLossM, calories, maxHr,
cadenceSpm, strideLengthCm, groundContactMs,
aerobicTrainingEffect, anaerobicTrainingEffect,
trainingLoad, trainingEffectLabel,
fastest1kSec, fastest1miSec, fastest5kSec
```

The Garmin list mapping fills them when present. The week cards stay compact; the run detail shows the richer set.

### 3.2 Weekly load card

On the **Week** view, above the trends:

- **Load** ??sum of Garmin training load for the selected week.
- **ACWR** ??selected-week load 繩 (28-day load 繩 4); coupled rolling average, so the selected week is part of the
  chronic window.
- **vs last week** ??week-over-week load change.
- **Hard / easy** ??kilometres and minutes split by the training-effect label; hard labels include tempo, threshold,
  VO2 max, anaerobic, speed, race and interval; everything else is easy.
- **Signal** ??`Steady` (ACWR ??1.3 and change ??20%), `Watch` (ACWR > 1.3 or change > 20%), `High ramp` (ACWR > 1.5
  or change > 30%), `Not enough history` (no previous/4-week baseline) or `No load data`.
- A note explains that this is a soft signal and not medical advice.

The month and year views keep their volume summaries; the load card is deliberately a week-level decision surface.

### 3.3 Weekly coach review

A **Review my week with the coach** button in the load card. The prompt includes the selected week's actual runs,
distance/time, planned kilometres, load, ACWR, week change, hard/easy split and the key runs. The coach sees its usual
recent activity/session context. The button opens the bubble; it does not call the model by itself.

### 3.4 Per-kilometre splits and best efforts on run detail

- The detail page fetches the Garmin activity details only when the run is a Garmin activity and a client is configured.
- The parser finds `sumDistance`, `sumDuration` and `directHeartRate` in `metricDescriptors`, walks
  `activityDetailMetrics`, interpolates the crossing time at every 1,000 m and emits full-kilometre splits plus a
  partial final split. Pace is elapsed pace; average HR is the mean of the samples in the split.
- The page shows a splits table (split, time, pace, average HR) and a "Best efforts" strip with the fastest 1 km, 1 mi
  and 5 km when Garmin supplied them.
- If the detail request fails or has no usable samples, the page keeps the stored metrics and shows a muted
  "splits are not available" note.

### 3.5 Acceptance criteria

- A week with Garmin load values shows load, ACWR, week change and hard/easy values; the same week with no load values
  shows `No load data` and no misleading warning.
- A high-ramp fixture shows `High ramp`; a steady fixture shows `Steady`.
- The weekly review button produces a prompt containing the selected period and the load figures, and opens the bubble.
- A Garmin activity with detail samples shows per-kilometre splits and fastest efforts; a failed detail request still
  renders the page.
- All existing Week/Month/Year navigation, plan matching, auto-sync and coach behaviour remains intact.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` are green; the live app shows the new card and splits with real Garmin data.

## 4. Slice 2 ??implemented scope

### 4.1 Garmin laps / intervals

- The detail page fetches `/activity-service/activity/{id}` (the activity summary) on demand, separately from the
  per-kilometre detail samples.
- `mapGarminLaps` maps `splitSummaries` to lap type, distance, duration, pace, average HR, elevation and cadence.
- The **Garmin laps / intervals** card is shown when there is more than one lap or a non-run split; a single whole-run lap
  is hidden. It is labelled as Garmin's own lap/interval summary, not a per-kilometre split.
- A lap-summary failure and a detail-sample failure are independent: each section degrades on its own.

### 4.2 HR-zone time

- The activity list's `hrTimeInZone_1..5` seconds are stored as optional activity fields.
- The detail page renders a stacked zone bar and a legend with each zone's time. Zones are Garmin's; POC3 does not store
  the zone boundaries.
- Activities without zone data omit the card.

### 4.3 Best efforts and PR badges

- `personalBests` finds the fastest 1 km / 1 mi / 5 km across stored activities; ties go to the later day.
- Month and year views show a period **Best efforts** card with the time, date and activity title.
- Activity detail marks a fastest effort as **PR** when that activity holds the stored-history best.
- A dedicated records page, first-time-under badges and all-time PR history remain later slices.

### 4.4 Acceptance criteria

- An interval activity with `splitSummaries` shows Active/Recovery laps beside a separate per-kilometre table.
- An activity with zone seconds shows the zone bar and legend; one without zones omits the card.
- Month and year views show period bests; the activity holding the best shows PR badges; a slower run does not.
- A lap-summary failure leaves the detail page usable; a detail failure leaves the lap/zone/metrics cards usable.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` are green; the live re-sync shows zones and a real activity's laps.

## 5. Slice 3 ??implemented scope

### 5.1 One metric-selectable trend graph

The two separate line cards (**Pace trend**, **Average HR trend**) are replaced by one **Metric trend** card:

- A native radio-chip row (`role="radiogroup"`, `aria-label="Trend metric"`) selects **Pace, Heart rate, Cadence, Load,
  Distance, Time, Elevation**. Arrow keys move between chips; focus-visible styling is explicit.
- Every metric has a server-rendered SVG panel in the same card. The CSS `:has()` rules show exactly the checked panel, so
  switching is instant, keyboard accessible and needs no client script. A browser without `:has()` keeps the default panel
  visible instead of hiding all panels.
- The default metric is the first metric with at least two runs in the period (Pace when it has data, else Heart rate, and
  so on); `data-default` and the checked radio agree.
- Pace keeps the faster-is-higher axis; the other metrics plot high at top. Each metric has a minimum visual spread, so a
  flat series does not look dramatic, and a middle date label appears when there are at least four points.
- A metric with fewer than two runs keeps its honest note ("Need at least two runs with ??data in ??) instead of an empty
  chart. All chips stay available so the selector does not change shape between periods.
- The volume bar chart stays (daily/weekly/monthly volume); the Summary card adds **Average cadence** next to average pace,
  average HR and consistency.
- The selected metric is not persisted across period navigation: the card returns to the default on the next page load.
  That is deliberate for now (no client state) and is a candidate for a later slice.

### 5.2 Garmin activity workout overlay

- `src/garmin.ts` adds `getActivityWorkouts(activityId)` for
  `GET /activity-service/activity/{activityId}/workouts` (Bearer token, same error handling as the detail/summary calls).
- `src/garmin-workout.ts` maps the payload defensively. It accepts the observed flat FIT-style step array (`stepIndex`,
  `intensity`, `durationType`, `durationValue`, `targetType`, `targetValueLow`/`targetValueHigh`, repeat fields), object
  envelopes (`workoutName`, `workoutSteps`), the classic `workoutSegments` / `RepeatGroupDTO` shape and nested
  step-type/end-condition/target objects. It groups a repeat block into one phrase, converts metre-per-second pace targets
  to min/km, formats HR (bpm or % max), cadence, power and speed targets, and never throws. An empty or unreadable payload
  is a confirmed `none`.
- The normalized record (`activityId`, `userId`, `day`, `name`, `label`, `summary`, `steps`, `notes`, `status`, `attempts`,
  `fetchedAt`) is stored in the `activity_workouts` table, keyed `(user_id, activity_id)` and indexed by `(user_id, day)`.
  Status is `ok` / `none` / `unavailable`.
- Sync enrichment runs after the activity rows are committed: up to **3** lookups per sync for Garmin activities in the
  90-day window with no row or a retryable failure, at most **2** attempts. `404` ??`none`; another failure ??`unavailable`
  with the attempt count raised. Enrichment is best-effort and cannot fail the activity sync.
- The activity detail uses the stored workout; if nothing is stored or the stored attempt failed, it fetches once on demand
  and saves the result. The **Training program 繚 Garmin** card shows the name, the grouped summary, a step table (# / Step /
  Duration / Target) and the coach notes. A failed fetch is a muted note; a run with no planned workout has no card.
- The calendar pairs a run with its known workout into one **paired row**: a green run line (`✓` + title + amount) above a
  purple workout line (`◈` + workout label) inside one bordered item. The row is one click target: it opens the **run peek**,
  which carries the run's metrics and the full **Training program · Garmin** (name, summary, step table and notes) together.
  A run with no known workout stays a plain green row. `/calendar/data` returns the same typed pair item plus the rendered row
  fragment for the in-place refresh.
- A calendar render fills the visible month's missing workouts: up to **6** lookups, a 2.5 s budget and a 60 s per-runner
  throttle, so every run whose workout is known pairs on the grid without turning a page load into a Garmin crawl.
- The training-log week card adds a **Garmin workout** line, `/day/<day>` adds a **Garmin workouts** card, and the run peek
  carries the integrated **Training program · Garmin** section.
- The full-plan boundary (future scheduled workouts, Garmin Coach plan, publish-only official Training API) is documented in
  [GARMIN-TRAINING-PROGRAMS.md](GARMIN-TRAINING-PROGRAMS.md).

### 5.3 Acceptance criteria

- The training log renders one Metric trend card with seven chips and seven panels; the default panel is the first metric
  with at least two runs; selecting another chip shows its panel without a page reload.
- A metric without two runs shows its note; a period with no pace data but HR data defaults to Heart rate.
- The activity detail shows the workout card for a Garmin activity whose workout maps, and stays usable when the fetch
  fails; the fetched workout is stored and appears in the calendar data endpoint.
- The calendar renders a paired row for an `ok` workout and a plain record row for `none`/`unavailable`; the whole paired
  row is one click target and opens the run peek with the training program inside it.
- A month with a missing workout fetches it on render (capped and throttled) and pairs the run; a cached workout is reused.
- The integrated run peek shows the program summary, steps and notes; a run with no workout has no program section.
- Workout enrichment is capped, retried at most twice, records `none` for a 404, and leaves the activity sync green when
  the workout request throws.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` are green (337 tests in 15 files).

## 6. Later slices

1. **Dedicated records page**, all-time PR history and first-time-under badges.
2. **RPE, feel and notes**, with a clear write surface and privacy rule.
3. **HR-zone charts and zone boundaries/targets**; Slice 2 only shows Garmin's zone seconds.
4. **Gear / shoe mileage**, including retirement warnings.
5. **Filters/search** across source, plan-match and distance.
6. **Route map / personal heatmap**, only after a privacy decision.
7. **Training status / VO2 max / readiness**, as a separate health view.
8. **Background sync**, replacing session-start/page-load auto-sync.
9. **Garmin OAuth**; per-runner Personal API keys are now saved from the calendar popup.
10. **Garmin plan import** (future scheduled workouts / Garmin Coach plan), blocked on a Garmin SSO web session and a
    product/terms decision; see [GARMIN-TRAINING-PROGRAMS.md](GARMIN-TRAINING-PROGRAMS.md).
11. **Persisted trend metric** across week/month/year navigation (needs a query parameter or a small client state).

## 7. Risks and limits

- **Garmin training load is proprietary.** POC3 displays it; it does not recompute Garmin's algorithm.
- **ACWR is a soft signal.** The research disagrees on the best method; POC3 uses the coupled rolling average and
  presents the result as guidance, not a diagnosis.
- **Per-kilometre splits are computed, not Garmin's own lap splits.** The interpolation is explicit; the final split is
  partial; the detail request is on-demand and can be large for long runs. Garmin laps are a separate card.
- **Detail and summary access can be denied.** Some activities return 403; the page degrades to the stored list metrics.
- **Zone time has no boundaries.** POC3 shows Garmin's seconds per zone; it does not infer or edit zone thresholds.
- **PRs are scoped to stored history.** The 100-activity/90-day sync window means a "PR" is a stored-history best, not a
  complete lifetime record. A dedicated records page and longer history are later work.
- **The list is capped at 100 activities and the 90-day window.** A larger history needs a paging design.
- **The Garmin key is per-runner but stored plaintext.** Garmin OAuth is still later; use a trusted private server.
- **The activity-workout DTO is only partly documented.** The endpoint and schema names are official; the field-level
  properties are not. The mapper is defensive and treats an unreadable payload as "no planned workout", so a Garmin schema
  change degrades the overlay instead of breaking the activity log.
- **Workout enrichment is best-effort and capped.** Three lookups per sync, six more per calendar render (2.5 s budget,
  60 s throttle), two attempts, and an on-demand retry from the detail page. A permanently denied
  endpoint stops after the attempts are spent; it never blocks activity sync.
- **The paired row is a presentation, not a new record.** The run and the workout stay separate rows; pairing is computed
  from the stored workout for the run's day. A run whose workout is `none`/`unavailable` is a plain record row.
- **The workout is not a plan.** It describes the run that happened; POC3 cannot import future scheduled workouts or the
  Garmin Coach plan with a Personal API key.

## 8. Test plan

- Mapping: every new Garmin field maps only when finite; missing fields stay null; fastest splits map to seconds; HR zones
  map to seconds; laps map types, distance, pace, HR and cadence.
- Splits parser: synthetic descriptor/sample payload produces full and partial splits; missing descriptors return an empty
  list; invalid samples are ignored.
- Load summary: steady, watch, high-ramp, no-baseline and no-load cases; hard/easy classification.
- Best efforts: all-history and period bests, tie-breaking and missing fields.
- Web: week load card and review prompt; detail extra metrics, per-kilometre splits, laps, zones and PR badges; month/year
  best-efforts cards; detail and lap-summary failure fallbacks; existing period, plan-match, auto-sync and coach tests.
- Metric trend picker: seven chips and seven panels; the default is the first metric with two runs; a metric without data
  shows its note; the picker's CSS selectors are in the served stylesheet.
- Workout mapper: observed flat payload with a repeat group; named envelope; classic segments/RepeatGroupDTO; HR/cadence/
  power/speed targets; single pace target; open/lap/reps; millisecond times; empty and unreadable payloads; summary/label
  caps; the failure record.
- Workout sync: stores a found workout; caps lookups and backfills over later syncs; 404 ??`none`; 403 ??`unavailable` with
  attempts; retries once then stops; the activity sync stays green when the workout request throws; no endpoint ??no-op.
- Workout surfaces: activity detail card and stored row; failure note; paired run+program pill and `/calendar/data` pair
  item; no pair for `none`/`unavailable`; the program brief endpoint with steps/notes/links, on-demand fetch, 404 for no
  workout and owner scoping; the calendar fill of the visible month; training-log week line; day-page card; run-peek
  program row (and null when unknown).
- Live: re-sync enriches old rows with zones; the current week shows load; a real interval activity shows laps and
  per-kilometre splits; month/year best efforts render; a failed detail or summary request does not break the page; the
  metric trend card and a real workout (when the account has one) render in headless Chrome.

## 9. Sources

- [Garmin Connect Personal API ??Swagger documentation](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)
- [Garmin official Personal API Python client](https://github.com/garmin/connect-personal-api-python) ??activity,
  activity-workouts and activity-download wrappers.
- [Naming my Strava runs from Garmin with a Drupal webhook](https://mglaman.dev/blog/naming-my-strava-runs-garmin-drupal-webhook)
  ??an observed `/activity-service/activity/{id}/workouts` payload: step fields, repeat semantics and metre-per-second targets.
- [Garmin training programs ??what the API can and cannot give us](GARMIN-TRAINING-PROGRAMS.md) ??the endpoint, the plan
  boundary and the future SSO endpoint list.
- [Garmin Training Status / load focus](https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/training-status/)
- [Cloosterman et al., Comparison of weekly training load and ACWR methods in running (J Athl Train, 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11537214/)
- [Strava best efforts](https://support.strava.com/en-us/articles/15401646-what-are-best-efforts-on-strava)
- [Strava personal heatmaps](https://www.strava.com/maps/personal-heatmap)
- [Garmin training-load focus manual](https://www8.garmin.com/manuals-apac/webhelp/fenix7series/EN-SG/GUID-6F726699-0535-4A66-8F51-84A31CE81CD5-8601.html)
- [Running Log Lite ??effort levels and notes](https://apps.apple.com/us/app/running-log-lite/id340784610)
