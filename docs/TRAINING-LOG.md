# Training log
**Status:** current · **Owner:** training-log domain · **Updated:** 2026-11-22 · **Supersedes:** docs/TRAINING-LOG-PLAN.md, docs/MILEBOOK-CALENDAR.md §8

The training log is the read-only "what actually happened" projection of the calendar: runs from Garmin sync or a hand-logged form, matched to the day's plan, summarised by volume and load, and reviewable by the coach without inventing data. Every surface is server-rendered HTML built inside the router; the only log-specific client logic is the shared coach bubble and the tab URL sync.

## 1. Surfaces

| Surface | URL | Renders |
|---|---|---|
| Week (default) | `/history?view=week&period=YYYY-MM-DD` | Seven day cards Mon–Sun, load card, trends, review cards |
| Month | `/history?view=month&period=YYYY-MM` | Week rows clipped to the month, weekly volume, best efforts, trends |
| Year | `/history?view=year&period=YYYY` | Twelve month rows, monthly volume, best efforts, trends |
| Day | `/day/YYYY-MM-DD` | Plan, recorded runs, log-run form, Garmin workouts |
| Run detail | `/activity/<id>` | Plan comparison, rich metrics, splits, laps, zones, workout |

`/history` is one handler in the router `(src/web.ts · createWeb)`, and `historyHref` builds every link `(src/web.ts · historyHref)`. The week view normalises any picked day to its Monday `(src/web.ts · weekStartOf)`.

| Param | Route | Accepted | Fallback |
|---|---|---|---|
| `view` | `/history` | `week`, `month`, `year` | `week` |
| `period` | `/history` | ISO day (week), `YYYY-MM` (month), `YYYY` 2000–2100 (year) | current week / month / year |
| `tab` | `/history` | `review` | period panel |
| `newest` / `review` | `/history`, `/day`, `/calendar` | activity id | the auto-sync's newest created run / none |

The period bar carries Week/Month/Year links (the active one gets `aria-current`), previous/next arrows, a "This week/month/year" shortcut and a picker whose control follows the view: date input, month input, or a 101-option year select `(src/web.ts · createWeb)`. Mode links carry an equivalent period — a month maps to the current week when it is the current month, else to the week containing its first day; a year maps to the current month or week when it is the current year, else to January or the week containing 1 January.

The page is one tab strip: **Days / Weeks / Months** plus **Review** `(src/web.ts · createWeb)`. The first label is view-dependent (`history.tabDays`, `history.tabWeeks`, `history.tabMonths`); the second is always `history.tabReview` `(src/i18n.ts · history.tabReview)`. Both are native radios (`name="history-tab"`), so switching is CSS-only, and `?tab=review` decides which radio the server marks `checked` — which is how the load chip, a reload and back/forward land on the same panel. The client keeps the URL in step with `pushState`/`popstate` `(src/web.ts · renderChatBubble)`. The period panel holds the day/week/month rows; the review panel holds the manual review card, the synced review card, the load card, the trend section and the best-efforts card, in that order.

`/day/:day` rejects anything that is not an ISO day with the 404 page `(src/web.ts · createWeb)`. It shows the review card for `?newest=`/`?review=`, then **Booked by the coach**, **Recorded activities**, a `#log-run` disclosure with the manual form, and a **Garmin workouts** card; its inline script only opens the disclosure when the URL carries `#log-run`. The day page shows no match badges: plan and recorded runs stay two separate lists. The log and run-detail pages pass the `history` active view, so the **Log** tab is current, while the day page passes `calendar` `(src/web.ts · renderViewSwitch)`; a Garmin panel above the summary carries connect state and the `keyError` note `(src/web.ts · renderGarminPanel)`.

## 2. Plan matching

Recorded runs are matched to planned sessions per day. The rules are distance-only.

| Rule | Behaviour | Anchor |
|---|---|---|
| Same day | a run can only satisfy a session on its own day | `(src/training.ts · matchActivitiesToPlan)` |
| Plausible pair | gap ≤ max(2 km, 35% of planned); both sides null → gap 0 and still plausible | `(src/training.ts · withinTolerance)` |
| One-to-one | candidates sorted by gap, then activity id, then session id; each side used once | `(src/training.ts · matchActivitiesToPlan)` |
| State | delta = actual − planned; threshold = max(0.5 km, 10% of planned) | `(src/training.ts · statusOf)` |
| Deltas | km to 0.1, minutes to whole minutes, null when either side lacks the value | `(src/training.ts · matchActivitiesToPlan)` |

| State | Chip class | Copy key | English |
|---|---|---|---|
| `on-plan` | `match-on-plan` | `plan.badgeOnPlanDelta` / `plan.badgeOnPlan` | "Completed - on plan (+0.4 km)" / "Completed - on plan" |
| `short` | `match-short` | `plan.badgeShort` | "Completed - 1.2 km short" |
| `long` | `match-long` | `plan.badgeOver` | "Completed - 1.4 km over" |
| `unplanned` | `match-unplanned` | `plan.badgeUnplanned` | "Unplanned" |

Chips render through `matchLabel`, whose `title` names the planned session `(src/web.ts · matchLabel)`; the badge text comes from `planMatchBadge` `(src/web.ts · planMatchBadge)`; the keys live in `(src/i18n.ts · plan.badgeOnPlanDelta)`.

- **No title or kind heuristics.** Matching reads `day` and `distanceKm` only: a run titled "Tempo" does not prefer a tempo session, and a long-run session is not matched by kind. Title and kind are display-only.
- **Unplanned, never forced.** A run with no plausible session is returned as `unplanned` instead of being attached to a session `(src/training.ts · matchActivitiesToPlan)`; `unmatchedSessions` lists planned sessions with no run, and a day with runs prints them as "No matching run: …" `(src/training.ts · unmatchedSessions)`.
- **Week card.** Each day card shows the planned line, the unmatched line, the Garmin workout line, the run rows with their match chip, then the empty state `(src/web.ts · createWeb)`.
- **Run detail.** `matchActivity` matches one run against its day, and `planComparison` renders planned vs actual with both deltas and a distance bar `(src/web.ts · planComparison)`.

## 3. Volume and load math

### Volume

| Quantity | Rule | Anchor |
|---|---|---|
| Run distance | Garmin metres ÷ 1000, 1 dp | `(src/garmin.ts · mapGarminActivity)` |
| Period distance | sum of `distanceKm`, 1 dp | `(src/web.ts · sumDistance)` |
| Period time | sum of `durationMin`, formatted "42 min" / "1h 05m" | `(src/web.ts · formatMinutes)` |
| Planned distance and longest run | Σ planned km 1 dp; longest = max `distanceKm` | `(src/web.ts · createWeb)` |
| Buckets | week: 7 weekday bars; month: week bars; year: 12 month bars | `(src/web.ts · volumeChart)` |
| Consistency | active days ÷ 7, active weeks ÷ week buckets, active months ÷ 12, shown as "{pct}% of {unit}" | `(src/web.ts · trendSection)` `(src/i18n.ts · history.trend.ofUnit)` |

### Load

A run's load is Garmin's `trainingLoad` when it is positive, otherwise session-RPE, `durationMin × rpe` `(src/training.ts · activityLoad)`; RPE outside 0–10 is ignored. Every field below comes from `loadSummaryForWeek` `(src/training.ts · loadSummaryForWeek)`.

| Field | Rule |
|---|---|
| `weekLoad` | Σ run load Mon–Sun, 1 dp |
| `previousWeekLoad` | Σ the 7 days before the selected week |
| `fourWeekLoad` | Σ the 28 days ending on the selected Sunday — includes the selected week, so the ratio is coupled |
| `acwr` | `weekLoad ÷ (fourWeekLoad ÷ 4)`, 2 dp; null unless both baselines are above zero and the week has load |
| `weekChangePct` | `(weekLoad − previousWeekLoad) ÷ previousWeekLoad × 100`, rounded |
| `signal` | `high` if ACWR > 1.5 or change > 30; `watch` if ACWR > 1.3 or change > 20; else `steady` |
| `no-data` / `insufficient` | no run in the week carries load / previous-week or 4-week load is 0, so no ratio is invented |

Classification runs in this order `(src/training.ts · isHardActivity)`:

1. `trainingEffectLabel` matching `TEMPO|THRESHOLD|VO2|ANAEROBIC|SPEED|RACE|INTERVAL` → hard.
2. else, when a label or an anaerobic effect exists, hard iff `anaerobicTrainingEffect ≥ 2.5`.
3. else hard iff `rpe ≥ 7`.

The split sums distance (1 dp), minutes (whole) and run counts per side, and is only computed when at least one run in the week has a label, an anaerobic effect or an RPE `(src/training.ts · loadSummaryForWeek)`.

### Constants

| Constant | Value | Anchor |
|---|---|---|
| Match tolerance | floor 2 km, else 35% of planned distance | `(src/training.ts · withinTolerance)` |
| Match status | floor 0.5 km, else 10% of planned | `(src/training.ts · statusOf)` |
| ACWR bands | > 1.3 watch, > 1.5 high | `(src/training.ts · loadSummaryForWeek)` |
| Week-change bands | > 20% watch, > 30% high | `(src/training.ts · loadSummaryForWeek)` |
| Hard classification | label regex, else anaerobic ≥ 2.5, else RPE ≥ 7 | `(src/training.ts · isHardActivity)` |
| Chronic window | 28 days ending on the selected Sunday | `(src/training.ts · loadSummaryForWeek)` |
| Rounding | run load and week load 1 dp, ACWR 2 dp, change whole % | `(src/training.ts · loadSummaryForWeek)` |

Signal copy is `Steady`, `Watch the ramp`, `High ramp`, `Not enough history`, `No load data` `(src/i18n.ts · history.load.signal.high)`; each signal has a note under `history.load.note.*`, and a week whose load mixes in reported effort appends `history.load.reportedEffort` `(src/i18n.ts · history.load.reportedEffort)`. The card shows load / ACWR / vs-last-week / hard-easy stats, an intensity line, the hard-easy rule note, a warning line for `watch` and `high` from `loadWarningText`, the ACWR footnote and the review button `(src/web.ts · loadCard)`; a chip above the tabs links straight to `?tab=review#load-card` `(src/web.ts · createWeb)`.

## 4. Rich metrics

Garmin fields are optional on the activity record, so old rows and reported runs keep working `(src/types.ts · Activity)`.

| Field | Garmin key | Shown | Format |
|---|---|---|---|
| `distanceKm` | `distance` (m) | log rows, detail stats | 1 dp km |
| `durationMin` | `duration` (s) | log rows, detail stats | `formatMinutes` |
| `paceSecPerKm` | `averageSpeed` | log rows, detail stats | `formatPace` → `m:ss/km` |
| `avgHr` | `averageHR` | log rows, detail stats | `bpm` |
| `elevationGainM` / `elevationLossM` | `elevationGain` / `elevationLoss` | gain in detail grid, peek, elevation trend; loss stored only, never rendered | `+N m` |
| `calories` | `calories` | detail grid, peek | `kcal` |
| `maxHr` | `maxHR` | detail grid, peek | `bpm` |
| `cadenceSpm` | `averageRunningCadenceInStepsPerMinute` | detail grid, peek, cadence trend | `spm` |
| `strideLengthCm` / `groundContactMs` | `avgStrideLength` / `avgGroundContactTime` | detail grid | `cm` / `ms` |
| `aerobicTrainingEffect` / `anaerobicTrainingEffect` | same keys | detail grid | 1 dp |
| `trainingLoad` | `activityTrainingLoad` | detail, peek, load card, load trend | 1 dp |
| `trainingEffectLabel` | `trainingEffectLabel` | detail, peek | `humanizeEffect` |
| `rpe` | manual log form only | detail "Felt" | `feltText` / `rpeWord` |

- Mapping lives in `mapGarminActivity`: a value is rounded only when finite, and a missing field stays null; the label is humanised (`AEROBIC_BASE` → "Aerobic Base") `(src/garmin.ts · mapGarminActivity)` `(src/web.ts · humanizeEffect)`.
- `pushMetricItem` drops values that are not finite or not above zero, so a zero elevation or calorie count is omitted rather than shown as 0; the peek caps at six items with `PEEK_METRIC_LIMIT` `(src/web.ts · pushMetricItem)` `(src/web.ts · activityPeekMetrics)`.
- Log rows stay thin on purpose: distance, time, pace and average HR only `(src/web.ts · activityMetrics)`.

## 5. Splits, laps, zones

| Card | Source | Renders when |
|---|---|---|
| Per-kilometre splits | activity-detail sample stream | Garmin run with a configured client; empty or error note otherwise |
| Garmin laps / intervals | activity summary `splitSummaries` | more than one lap, or a lap type other than "Run"; error note on failure |
| HR zones | stored `hrZone1Sec`…`hrZone5Sec` | any zone time above zero |

- **Splits are computed on demand, never stored** `(src/garmin.ts · mapGarminSplits)`: descriptors supply `sumDistance` / `sumDuration` / `directHeartRate`, each 1,000 m crossing is interpolated, split duration is the elapsed time between crossings, pace is the rounded duration, average HR is the mean of the samples inside the split, a final partial kilometre is kept when at least 0.01 km remains, and the list stops at 100 splits. The card states that pace is elapsed pace and the last split may be partial `(src/i18n.ts · splits.note)`.
- **Garmin laps are a separate card** `(src/garmin.ts · mapGarminLaps)`: `splitSummaries` mapped to lap type, distance, duration, pace, average HR, elevation and cadence, capped at 50, type humanised with "Lap" as the fallback, labelled as Garmin's own summaries rather than per-kilometre splits `(src/i18n.ts · laps.note)`. A split failure sets `activity.splitError`, a lap failure sets `activity.lapError`, and either leaves the stored metrics and the other card intact `(src/web.ts · splitsSection)`.
- **Zones are Garmin's seconds, not boundaries** `(src/web.ts · hrZonesSection)`: five segments sized by each zone's share of total zone time, plus a legend with each zone's time. Milebook stores no zone boundaries, so the card cannot show thresholds; the copy says zones are defined in Garmin `(src/i18n.ts · hrzones.note)`.

## 6. Best efforts and PRs

| Item | Rule | Anchor |
|---|---|---|
| Distances | 1 km, 1 mi, 5 km from `fastestSplit_1000`, `fastestSplit_1609`, `fastestSplit_5000` | `(src/training.ts · BEST_EFFORT_DISTANCES)` `(src/garmin.ts · mapGarminActivity)` |
| Best of history | fastest seconds per distance; ties go to the later day | `(src/training.ts · personalBests)` |
| Period scoping | activities inside the selected period only | `(src/training.ts · personalBestsForPeriod)` |
| Period card | month and year views only, never the week view | `(src/web.ts · periodBestsCard)` |
| PR badge | the run holds the stored-history best for that distance | `(src/web.ts · prDistancesFor)` |

- The period card shows the time, the run's date and title, plus a scope footnote `(src/web.ts · periodBestsCard)`; the PR chip's tooltip states the limit, "Best within your stored history, not a lifetime record" `(src/web.ts · fastestEfforts)`.
- **Honest limit:** a PR is a stored-history best. There is no lifetime record, no first-time-under badge and no records page, and the Garmin sync itself imports only a 90-day window of at most 100 activities per pull, so a fast run outside that window never enters the comparison `(src/garmin-sync.ts · createGarminSync)`.
- **Copy vs code:** the `besteffort.scope` footnote says "the last 90 days, up to 100 activities", but the code scans the stored activities for the period — up to 1,000 rows — with no 90-day filter `(src/i18n.ts · besteffort.scope)`.

## 7. Metric trend graph

The seven metrics come from `TREND_METRICS` `(src/web.ts · TREND_METRICS)`.

| Chip | Metric | Field | Format | Min spread | Axis |
|---|---|---|---|---|---|
| Pace | `pace` | `paceSecPerKm` | `m:ss/km` | 30 s | faster at top |
| Heart rate | `hr` | `avgHr` | `bpm` | 10 | high at top |
| Cadence | `cadence` | `cadenceSpm` | `spm` | 4 | high at top |
| Load | `load` | `trainingLoad` | 1 dp | 10 | high at top |
| Distance | `distance` | `distanceKm` | km, 1 dp | 1 | high at top |
| Time | `duration` | `durationMin` | `42 min` | 5 | high at top |
| Elevation | `elevation` | `elevationGainM` | `+N m` | 10 | high at top |

- **Markup** comes from three functions: `trendSection` (heading, volume chart, summary card), `trendPicker` (chips plus one pre-rendered panel per metric) and `trendChart` (one SVG per metric) `(src/web.ts · trendSection)`.
- **CSS-only switch:** hidden radios `name="trend-metric"`, one label chip and one `data-metric` panel per metric; `:has()` rules show exactly the checked panel, and a browser without `:has()` keeps the `data-default` panel visible instead of hiding every panel `(src/styles.ts · .trend-picker)`. The default is the first metric with at least two points, else Pace, and the checked radio and `data-default` agree `(src/web.ts · trendPicker)`.
- **Window and scale:** the last 12 runs carrying the metric, oldest first, against the period label; the window note appears when the period holds more than 12 runs, a metric with fewer than two points keeps its "need two runs" note, a middle date label appears from four points up, and `spread = max(max − min, minSpread)` with 10% headroom keeps a flat series from looking dramatic `(src/web.ts · trendChart)`.
- **Summary card:** average pace is total seconds ÷ total km over runs with pace, distance and duration; average HR and average cadence are means; consistency is the period ratio `(src/web.ts · trendSection)`.
- The selected metric is not persisted across period navigation: no client state, no query parameter `(src/web.ts · trendPicker)`.

## 8. Weekly review and coach prompts

- **"Review my week with the coach"** sits in the load card `(src/i18n.ts · history.load.reviewWeek)`, and its message comes from `coachPromptForWeek`: period label, runs, km and time, planned km, load, ACWR, week change, signal, hard/easy split, up to four newest key runs, and an explicit instruction not to invent sessions or metrics `(src/web.ts · coachPromptForWeek)`. A ramp chip appears only for `watch` and `high`, carrying a fixed message and the same `review-week` intent `(src/web.ts · loadCard)`.
- **Auto-sync review prompt:** a sync that creates a run surfaces its newest run as a one-tap review card under the `review.eyebrowSynced` eyebrow `(src/web.ts · runReviewCard)`; a hand-logged run redirects with `?review=<id>` and gets the same card under `review.eyebrowLogged` `(src/web.ts · manualReviewCardFor)`.
- **Missed day:** the empty day card's Ask coach button sends `coachPromptForMissed`, naming the planned sessions and the day `(src/web.ts · coachPromptForMissed)`.
- **Comment-only intent:** each review button carries typed JSON in `data-coach-intent`, never hidden prose. `parseCoachIntent` validates it, and `buildDirectiveForIntent` turns it into a directive with `mode: "review"`, `allowCalendarWrites: false` and a background that says not to change the calendar for `review-activity`, `review-day` and `review-week` `(src/directives.ts · buildDirectiveForIntent)`. The directive never enters the visible chat; the contract is [COACH-CONTRACT.md](COACH-CONTRACT.md).
- **Client path:** the shared bubble reads `data-coach-message` and `data-coach-intent` from the clicked element and sends the intent with the message `(src/web.ts · renderChatBubble)`; the server re-parses the intent instead of trusting it `(src/directives.ts · parseCoachIntent)`.

## 9. Garmin workout overlay on the log

| Place | Markup | Condition |
|---|---|---|
| Week card | `history-program` line: chip "Garmin workout" + workout label + summary | stored workout with status `ok` that day |
| Day page | **Garmin workouts** card, one line per workout | any `ok` workout that day |
| Calendar grid | paired row: run line above workout line, one click target | `pairItem` for an `ok` workout |
| Run detail | workout card with name, summary, step table and notes | `ok` workout stored or fetched |

- The overlay is read-only: it never edits the activity, and a failed fetch is a muted note rather than a broken page `(src/web.ts · ensureActivityWorkout)`. The week-card chip text "Garmin workout" is a hardcoded English string, while the day card title uses the `day.garminWorkouts` key `(src/i18n.ts · day.garminWorkouts)`.
- The paired row is a presentation of two stored rows, not a new record `(src/calendar-items.ts · renderPairedItem)`. Client, endpoint, caps and retries: [GARMIN.md](GARMIN.md).

## 10. Empty and error states

| Situation | Condition | Copy |
|---|---|---|
| Period empty | no activities in the selected period | `history.periodEmptyWeek` / `history.periodEmptyMonth` / `history.periodEmptyYear` + Log a run + connect Garmin |
| Nothing planned or recorded | no sessions and no runs | `empty.none` |
| Rest day | every session kind is `rest` | `empty.rest` |
| Day not arrived | day is today or later | `empty.upcoming` |
| Awaiting sync | Garmin key saved and the day is after the last sync day | `empty.awaitingGarmin` |
| Missed run | past, imported day with a plan | `empty.noRunLogged` + Log a run + Ask coach |
| No load or no baseline | no run carries load, or previous-week / 4-week load is 0 | signal `no-data` / `insufficient`, chip `history.loadChipNoData` |
| Metric too short or value missing | fewer than two points, or no value for the row | `history.trend.needTwo` / `history.trend.noData` |
| No best efforts | no qualifying run in the period | `besteffort.empty` |
| No splits | no samples, or the fetch failed | `splits.empty` / `activity.splitError` |
| Lap or workout fetch failed | summary request failed / non-404 workout failure | `activity.lapError` / hardcoded "Garmin's workout for this run is not available right now." |
| Unknown run or invalid day | activity id not found, or `/day/:day` is not an ISO day | 404 `error.notFound` |

- The period-empty note renders inside the period panel above the rows; the review panel still renders its cards, and on the week view the load card reports its no-data or insufficient signal `(src/web.ts · createWeb)`. An unknown `view` or malformed `period` is not an error: the page falls back to the current week, month or year.
- The day-empty decision order matters: nothing planned, then rest, then future, then awaiting Garmin, then missed run `(src/web.ts · dayEmptyStateHtml)`.

## 11. Rules that must not regress

1. **Timezone correctness.** "Today" is the runner's local day, never the server's UTC day `(src/web.ts · createWeb)`; day arithmetic stays calendar-only `(src/time.ts · addDays)`; the awaiting-sync test converts the last sync instant to a local day before comparing `(src/time.ts · localDay)`. A UTC day would move runs across the week boundary and break every match and bucket.
2. **Today-first ordering.** Runs are read newest-first — `ORDER BY day DESC, created_at DESC, rowid DESC` `(src/store.ts · listActivities)`; the trend takes the newest 12 and reverses only for plotting `(src/web.ts · trendPoints)`; the weekly prompt quotes the newest four `(src/web.ts · coachPromptForWeek)`. The week card still renders Monday→Sunday `(src/web.ts · weekStartOf)`.
3. **One period summary line.** The page has exactly one `history-period-summary` line for the selected period `(src/web.ts · createWeb)`; month and year rows carry their own bucket line and never repeat the period totals.
4. **No client-side recomputation of load.** `loadSummaryForWeek` runs once per week view on the server `(src/training.ts · loadSummaryForWeek)`, and the card, the chip and the prompt all read that one `LoadSummary` `(src/web.ts · loadCard)`. The client script never computes load: it swaps server-rendered fragments and keeps `?tab=` in the URL `(src/web.ts · renderChatBubble)`.
5. **Same-day matching only.** The day guard is the first check in the matcher `(src/training.ts · matchActivitiesToPlan)`; a cross-day match would silently corrupt every plan-vs-actual badge and the unmatched-session line.
6. **Splits stay computed, not stored.** The run detail computes them per request `(src/garmin.ts · mapGarminSplits)`; nothing writes splits onto the activity row, so a re-sync cannot duplicate or stale them.

## Related documents

Related: [GARMIN.md](GARMIN.md) — client, sync window, workout fetch, caps and retries · [HTTP-API.md](HTTP-API.md) — routes, params and response shapes · [COACH-CONTRACT.md](COACH-CONTRACT.md) — directive validation and comment-only review mode · [UI-GRAMMAR.md](UI-GRAMMAR.md) — page grammar, tab strip, chips and empty-state voice · [LIMITS.md](LIMITS.md) — stored-history PRs, zone boundaries, ACWR as a soft signal.
