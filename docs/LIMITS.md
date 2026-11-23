# Limits

**Status:** current · **Owner:** product + engineering · **Updated:** 2026-11-22 · **Supersedes:** the limits sections of the removed PoC docs

Every row is a limit the running system actually enforces, or a boundary the product deliberately accepts. Support
answers should quote this page. When you add a cap, add its row in the same change.

## 1. Coach and model

| Limit | Value | Enforced by | What the runner sees | Liftable? |
|---|---|---|---|---|
| Booking horizon | 180 days ahead | `(src/coach.ts · HORIZON_DAYS)` | A rejected far-future day in the failure card | Only by changing the constant and the prompt rule |
| Attempt budget | 1 call + 1 repair (default) | `(src/gateway.ts · createGateway)` | A clarification instead of a booking | `MILEBOOK_MAX_ATTEMPTS` |
| Reply length | 480 characters, markdown stripped | `(src/coach.ts · MAX_REPLY_CHARS)` | A shorter, spoken reply | Change the constant; longer replies read as reports |
| Streaming | none; the bubble waits for the full reply | `(src/web.ts · createWeb)` | A typing line that names why context is being re-read | SSE half-exists in the gateway; the client does not consume it |
| Upstream timeout | 120 s per model call; proxy aborts at 130 s | `(src/gateway.ts · createGateway)`, `(src/web.ts · createWeb)` | `504` with "the coach did not answer in time" | Raise both budgets together |
| Provider cache | external; the app only guarantees a byte-stable prefix | `(src/coach.ts · buildCoachSystemPrompt)` | A loading line naming the re-prefill reason | Needs a provider with a measurable cache-hit signal |
| Model key absent | no local check: the gateway sends an empty bearer and the provider decides | `(src/index.ts · readEnv)`, `(src/gateway.ts · callModel)` | A provider rejection surfaces as the gateway's "the model call failed" detail | Configure `MILEBOOK_MODEL_API_KEY` |
| Coach turns per runner | 40 per 5 minutes | `(src/rate-limit.ts · createRateLimiter)` | `429` JSON on the bubble | Raise the limit; it exists to bound model spend |

## 2. Calendar and changes

| Limit | Value | Enforced by | Notes |
|---|---|---|---|
| Booking horizon | 180 days | `(src/coach.ts · HORIZON_DAYS)` | Applies to coach writes; the day page has no horizon input |
| Rows shown per day cell | 4, then `+n more` | `(src/calendar-items.ts · CALENDAR_CELL_MAX_ITEMS)` | A busy day stays bounded without hiding data |
| Change history | coach prompt 10 batches · Recent changes 5 · All changes 20 · undo looks back 50 · export 500 | `(src/gateway.ts · MAX_REVERT_LOOKBACK)`, `(src/web.ts · createWeb)` | No selective revert and no redo |
| Undo | whole batch only | `(src/history.ts · applyRevert)` | An undo is itself recorded as a change |
| Planned-session writes | coach turns only | ADR-0001 | The day page's manual log writes an Activity, never a TrainingSession; the runner cannot drag sessions on the calendar |

## 3. Training log and math

| Limit | Value | Enforced by | Notes |
|---|---|---|---|
| Load model | Garmin `trainingLoad`, else duration × RPE | `(src/training.ts · loadSummaryForWeek)` | Session-RPE is a fallback, not a measurement |
| ACWR | coupled 7-day over 28-day rolling, ending on the selected Sunday | `(src/training.ts · loadSummaryForWeek)` | A soft signal, never medical advice |
| Hard/easy split | intensity label, else anaerobic effect ≥ 2.5, else RPE ≥ 7 | `(src/training.ts · isHardActivity)` | Mixed sources; the rule is documented in [TRAINING-LOG.md](TRAINING-LOG.md) |
| Splits | computed on demand from the detail stream, cap 100 | `(src/garmin.ts · mapGarminSplits)` | Not stored |
| Laps | Garmin's own, cap 50 | `(src/garmin.ts · mapGarminLaps)` | Separate from computed splits |
| HR zones | stored Garmin seconds only; no stored boundaries | `(src/garmin.ts · mapGarminActivity)` | A zone chart needs boundaries the API does not give |
| Best efforts / PRs | 1 km, 1 mi, 5 km within the stored history | `(src/training.ts · personalBestsForPeriod)` | Not a lifetime record; the sync window bounds it |
| Trend graph | 7 metrics, 12 runs per panel | `(src/web.ts · createWeb)` | CSS-only switch, no reload |

## 4. Garmin

| Limit | Value | Enforced by | Notes |
|---|---|---|---|
| Activities per pull | 100, no pagination | `(src/garmin-sync.ts · createGarminSync)` | The list endpoint's maximum |
| Sync window | last 90 days | `(src/garmin-sync.ts · createGarminSync)` | Older runs never arrive |
| Workout enrichment | 3 per sync, 2 attempts; 6 per calendar render, 2.5 s budget, 60 s throttle | `(src/garmin-sync.ts · DEFAULT_WORKOUT_FETCH_LIMIT)`, `(src/garmin-sync.ts · DEFAULT_MAX_WORKOUT_ATTEMPTS)`, `(src/web.ts · CALENDAR_WORKOUT_BUDGET)`, `(src/web.ts · CALENDAR_WORKOUT_TIME_MS)`, `(src/web.ts · CALENDAR_WORKOUT_THROTTLE_MS)` | Best effort; never fails the sync |
| Future plan import | impossible with a Personal API key | `(src/garmin.ts · createGarminClient)` | Needs a Garmin SSO web session and a terms decision |
| Key storage | sealed AES-256-GCM when `MILEBOOK_GARMIN_KEY` is set, plaintext otherwise | `(src/secrets.ts · createSecretBox)`, `(src/store.ts · saveGarminKey)` | Without the variable the key is protected by file permissions only; a copied database is unreadable with it |
| Auto sync on page load | at most once per 10 minutes | `(src/web.ts · createWeb)` | A manual sync is never throttled |

## 5. Muscles and states

| Limit | Value | Enforced by | Notes |
|---|---|---|---|
| Soreness scale | 0–10 anchored (0 nothing · 5 noticeable · 7 sore to touch · 9–10 severe) | `(src/muscles.ts · sorenessLabel)` | Self-reported, not a measurement |
| Muscles per check-in | the whole catalog (20) | `(src/muscles.ts · MAX_CHECKIN_MUSCLES)` | A quick set applies one severity to the selection |
| Note length | 200 characters | `(src/muscles.ts · MAX_CHECKIN_NOTE_CHARS)` | |
| Backfill window | 14 days | `(src/muscles.ts · CHECKIN_BACKFILL_DAYS)` | Older days are rejected |
| Status window | 10 days, 14-day recent window | `(src/muscle-status.ts · MUSCLE_STATUS_WINDOW_DAYS)` | A decay heuristic, not a prognosis |
| Coach proposals | 6 per turn, 8 in the prompt, 7-day TTL | `(src/muscle-proposals.ts · MUSCLE_PROPOSAL_TTL_DAYS)` | Expiry is computed at read time; rows are not rewritten |
| Reading ladder | deterministic: ok → sore → heavy → watch → warning → urgent | `(src/muscle-status.ts · statusLine)` | Red flags route to a clinician, never to a drill |
| Coaching states | 34 catalog keys; detection slice of 8 | `(src/coach-state-catalog.ts · COACH_STATE_DEFINITIONS)` | Signals, not diagnoses |
| Sensitive states | never inferred; confirmation required | `(src/coach-state-catalog.ts · sensitive)`, `(src/coach-states.ts · applyStateProposals)` | Pain, illness, medical flag, pregnancy/postpartum, menstrual support, low energy availability |
| Retention | resolved states and events pruned after 180 days; 100 resolved rows kept | `(src/store.ts · createStore)`, `(src/coach-states.ts · refreshCoachStates)` | |

## 6. Runtime and scale

| Limit | Value | Enforced by | Notes |
|---|---|---|---|
| Processes per database | one writer | `(src/store.ts · SqliteStore)` | WAL helps readers; it does not make two writers safe |
| Body size | 200 KB web, 2 MB gateway | `(src/web.ts · readJsonBody)` | Larger bodies are rejected, not truncated |
| Page sessions | 500 in memory, 24 h, lost on restart | `(src/web.ts · createWeb)` | Only gates the "sync on new session" decision |
| Session revocation | immediate, all devices | `(src/auth.ts · signOutEverywhere)` | Bumps `tokenVersion`; there is no per-device list, so revocation is all-or-nothing |
| Account erasure | immediate and complete, no restore | `(src/store.ts · deleteAccount)` | One transaction over all 19 tables; a host backup can still hold a copy until it is pruned (newest 14 kept) |
| Sign-in failures | 10 per client+route+username per 15 min | `(src/rate-limit.ts · createRateLimiter)` | In-process; a proxy makes every runner share one client address |
| Coach turns | 40 per runner per 5 min | `(src/rate-limit.ts · createRateLimiter)` | |
| Coach turn lease | 10 minutes | `(src/gateway.ts · TURN_LEASE_MS)` | An `in_progress` turn older than the lease is reclaimed on replay; the 120 s upstream abort makes a live turn that slow impossible |
| Static asset | 11 MB anatomy GLB, no compression | `(src/web.ts · sendAsset)` | ETag revalidation; first load is 11 MB |
| Horizontal scaling | none | — | Needs a shared session store, a migration to Postgres, and a real job runner |
| Locales | English, Traditional Chinese (Hong Kong) | `(src/i18n.ts · LOCALES)` | |

## 7. Product scope

Not in this release: admin console, Strava, payments, external calendar sync, Garmin future-plan import, wellness/HRV/
sleep data, weather or air-quality providers, clinical decision support, account deletion, and a records page. Each is
either in [ROADMAP.md](ROADMAP.md) or explicitly rejected there.

## 8. What lifting the top limits would take

| Limit | Work |
|---|---|
| One process per database | Shared session store, a migration runner safe for concurrent writers, then Postgres |
| Garmin 90 days / 100 activities | Pagination support in the API; the client already caps per call |
| Garmin future plan | A Garmin SSO web session, a terms review, and a scheduled-workout import path |
| No streaming | Consume the gateway's existing SSE chunks in the bubble; keep the reply cap |

## 9. Honesty rule

If a limit is not in this page, it is not a known limit — say so rather than guessing. If a limit here is wrong, the
code is the tiebreaker: fix the row in the same pull request as the code change.
