# Product
**Status:** current · **Owner:** product · **Updated:** 2026-11-22 · **Supersedes:** docs/MILEBOOK-CALENDAR.md §1-3, §5

Milebook is a private, calendar-first running coach. The product is the month grid: a signed-in runner opens it, sees what is
booked and what was actually run, and talks to a coach that lives in the same origin as the page. The coach is a bubble, not a
second app — it proposes a turn in plain language plus JSON, the server validates every field, and only a validated turn
becomes a change set with before/after snapshots. The runner owns the record: the plan, the log, the body check-ins and the
change history all leave the app as files. Every other screen is a projection of that same runner, not a separate feature.

## 1. Who it serves

| The runner the code assumes | Where it is enforced |
|---|---|
| **One runner per account.** One profile, one calendar, one conversation, one body record; there is no club, coach-athlete pair or spectator role. | `(src/store.ts · createStore)` — every method takes `userId`; `(src/auth.ts · SignupInput)` has no role field |
| **Their own Garmin key.** Saved per runner, verified before storage, replaceable and removable, never shared. | `(src/store.ts · saveGarminKey)`, `(POST /garmin/key)` calls `client.token()` before saving, `(POST /garmin/key/delete)` |
| **Their own goal.** One free-text goal (≤120 characters) that reaches the coach's facts and the first-hour greeting. | `(src/auth.ts · normalizeGoal)`, `(GET /chat/history)` welcome, `(src/coach.ts · COACH_RULES)` |
| **Their own language.** Two shipped locales; the coach replies in the language the runner writes in, not the UI locale. | `(src/i18n.ts · LOCALES)`, `(GET /language)`, `(src/coach.ts · COACH_RULES)` |
| **Their own clock.** A required IANA-like timezone; "today", every date and every freshness label renders in it. | `(src/auth.ts · normalizeTimezone)`, `(src/web.ts · timeMeta)`, `(src/time.ts · localDay)` |
| **A solo runner with a watch and a goal.** The plan uses running kinds only (easy, long, interval, tempo, rest, cross, race, racewalk); the log is a Garmin run or a hand-entered one. | `(src/coach.ts · SESSION_KINDS)`, `(src/coach-state-catalog.ts)` race-phase states, `(src/manual-activity.ts · buildManualActivity)` |

**Locales.** `en` and `zh-HK` only (`(src/i18n.ts · LOCALES)`); English is the source of truth and the fallback. The UI locale
is a **browser cookie** with an `Accept-Language` fallback (`(GET /language)`, `(src/i18n.ts · resolveLocale)`), so it is not
stored on the account; the coach's learned language preference is a separate per-runner fact
(`(src/web-coach-states.ts · renderCoachAudit)` preference profile). Catalog parity is a type contract and a test
(`test/i18n.test.ts` · "keeps the two catalogs key-identical").

## 2. Surfaces

Eleven pages plus three dock tabs. Routes are relative to the web surface (`:8091`). Every page is server-rendered HTML with a
no-script path.

| # | Surface | Route | Its one job | Primary action |
|---|---|---|---|---|
| 1 | Plan (calendar) | `GET /calendar?month=YYYY-MM` (`/` normalises here) | Show the month, with today's single answer above it | **Ask coach** (or **View day** when a session is booked; empty month: "Ask the coach to plan this month") |
| 2 | Day | `GET /day/YYYY-MM-DD` | What was booked and what was recorded on one day; log a run by hand | **Log a run** → `POST /activities` |
| 3 | Training log | `GET /history?view=week\|month\|year&period=…&tab=review` | Planned vs recorded for a period, with load, trend and bests | **Review my week with the coach** |
| 4 | Activity detail | `GET /activity/<activityId>` | One run: plan vs actual, splits, laps, HR zones, muscles worked | **Ask coach** (comment-only) |
| 5 | Muscle check-in | `GET /muscle?day=&activity=&proposal=&focus=` | Report and read the body: status, readings, drills, proposals | **Save check-in** → `POST /muscle/checkin` |
| 6 | Coaching states | `GET /coach-states?tab=current\|set\|history` | Durable context the coach must respect, and who set it | **Set a state** → `POST /coach-states` |
| 7 | All changes | `GET /changes?type=all\|schedule\|activity\|muscle` | Every schedule batch, logged run and muscle event, newest first | **Undo** one batch → `POST /calendar/changes/<id>/revert` |
| 8 | Profile | `GET /profile`, `POST /profile` | Display name, timezone, goal, password; links to the exports | **Save profile** |
| 9 | Coach audit | `GET /coach-audit` | Transparency for the signed-in runner: directives, blocked writes, prefs, snapshots, state log | none — read-only |
| 10 | Sign in | `GET /login`, `POST /login` | Return to your own calendar | **Sign in** |
| 11 | Create account | `GET /signup`, `POST /signup` | Start a private calendar with a goal and a timezone | **Create account** |
| 12 | Dock · Chat | every signed-in page; `POST /chat`, `GET /chat/history` | Talk to the coach and see the suggestions it offered | **Send** |
| 13 | Dock · States | `GET /chat/history` | The compact view of what the coach currently believes | **All coaching states** → `/coach-states` |
| 14 | Dock · Changes | `GET /chat/history` | The compact view of recent coach batches and their Undo | **Open all changes** → `/changes` |

**Not surfaces.** The notification bell (`GET /notifications`, `POST /notifications/read`), the account menu
(`(src/web.ts · renderAccountMenu)`), the language switch (`(GET /language)`), the month picker, the day-actions menu and the
run/session peeks (`GET /activity/:id/peek`, `GET /session/:id/peek`) are chrome or in-place data for the pages above.
`(GET /calendar/data)` returns the same month payload the grid renders, for an in-place refresh. The audit page has no nav
entry: open it by URL.

## 3. The three loops the product actually runs

### 3.1 Plan → run → match → review

The coach books: `(POST /chat)` → `(src/directives.ts · buildDirectiveForIntent)` → gateway validation → one change set →
`(src/calendar-items.ts · renderCalendarItems)` on the grid, or `(GET /calendar/data)` for the in-place refresh. The run
arrives by `(POST /sync)` for Garmin or `(POST /activities)` for a hand-logged run
(`(src/manual-activity.ts · buildManualActivity)`). The match is heuristic and day-scoped
(`(src/training.ts · matchActivitiesToPlan)`): a run carries a plan badge — *Completed - on plan*, *Completed - shorter than
plan*, *Completed - longer than plan*, or *Unplanned* (`(src/web.ts · planMatchBadge)`) — and the remaining sessions
surface as unmatched. The review is one tap, never an unsolicited message: `(src/web.ts · runReviewCard)` →
`(src/web.ts · coachPromptForActivity)` → a `review-activity` intent → a comment-only directive. See
[TRAINING-LOG.md](TRAINING-LOG.md).

### 3.2 Body check-in → reading → suggestion → decision

The runner reports: `(POST /muscle/checkin)` stores one day's per-muscle record, with the day validated against the 14-day
window the page offers (`(src/muscles.ts · validateCheckInDay)`). The reading is deterministic:
`(src/muscle-status.ts · computeMuscleStatuses)` turns check-ins and the runner's own controls into dated levels, which feed
the status card, the attention badge (`GET /muscle/attention.json`) and the calendar chip
(`(src/web-muscle.ts · muscleCalendarChip)`). Readings, drills and care come from the tags
(`(src/web-muscle.ts · readingsSection)`, `drillSection`, `careSection`). The coach may notice something in the runner's words
and emit a typed proposal; it is stored, not written: `(src/muscle-proposals.ts · partitionPendingMuscleProposals)` decides
what is still offerable (7-day window), `(src/web-muscle.ts · muscleProposalView)` renders it in the record's own vocabulary,
and only `POST /muscle/proposals/<id>/confirm` writes what the runner's own form would have written. Dismiss is undoable via
`/restore`; Adjust reopens the form on the proposal's values. See [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md).

### 3.3 Coach state → guardrail → plan adjustment

A state is set by the runner (`POST /coach-states` → `(src/coach-states.ts · setManualCoachState)`), detected from stored
facts (`POST /coach-states/refresh` → `refreshCoachStates`), or proposed in chat and left *observing* until confirmed
(`confirmCoachState`; `POST /coach-states/<id>/confirm|resolve`). Active states render into the prompt and are enforced as
guardrails over the effective post-turn calendar: `(src/coach-state-catalog.ts · COACH_STATE_DEFINITIONS)` declares blocked
kinds and windows, `(src/coach-states.ts · stateGuardrailViolations)` finds the violations, and
`(src/gateway.ts · createGateway)` rejects the turn and returns `blockedByStates` / `blockedWrites`. The runner sees the block
as a dock card and a calendar chip; `/coach-audit` counts it as a blocked write. The coach then re-plans inside the horizon.
See [COACHING-STATES.md](COACHING-STATES.md).

## 4. The coach's role contract, in product terms

- **It proposes; it never writes from the browser.** Every turn is a tool call (`(src/coach.ts · COACH_TOOL)`,
  `propose_calendar_turn`); the server validates each field (`(src/coach.ts · parseCoachTurn)`) and applies one change set. A
  rejected proposal writes nothing and comes back as a "Could not apply" card (`(src/web.ts · renderChatBubble)`).
- **There is no manual plan editor.** Planned sessions are read-only for the runner; the only hand-write into the calendar is
  a *recorded* run on the day page. Add, move and delete all open the composer with a `plan` intent (day-actions menu in
  `(src/web.ts · createWeb)` · `/calendar`).
- **Reviews are comment-only.** `review-activity`, `review-day`, `review-week`, `discuss-change`, `discuss-state` and
  `review-muscles` build `allowCalendarWrites: false` (`(src/directives.ts · buildDirectiveForIntent)`); the gateway refuses
  sessions or a revert on such a turn (`comment-only-write`).
- **Directives are hidden.** The visible message and the directive are separate: the chat shows the runner's words and the
  reply, the directive travels as `milebook.directive`, and `/coach-audit` lists its mode, source, focus, references and
  blocked writes. It is never quoted to the runner (`(src/coach.ts · COACH_RULES)`).
- **The horizon is 180 days.** `(src/coach.ts · HORIZON_DAYS)`; the dock header says "Books up to {days} days ahead"
  (`(src/i18n.ts)` · `coach.horizon`). A request beyond it is answered with the limit, not a booking; a past day is never
  booked; at most 14 actions per answer.
- **The voice is spoken.** ≤480 characters, 2–4 short sentences, at most one question, no headings, lists or markdown
  (`(src/coach.ts · MAX_REPLY_CHARS)`, `COACH_RULES`), and a deterministic strip removes structure the model was told not to
  use (`(src/coach.ts · stripReplyStructure)`). The reply carries the advice; the suggestions carry the menu.
- **What it deliberately does not do.** It does not write on a review turn, does not message the runner unsolicited (review
  and week prompts are one-tap cards), does not stream, does not diagnose, and does not book beyond the horizon.

## 5. Data ownership promises that are implemented

- **Per-runner isolation.** Every store read and write is keyed by `userId`; activities use the composite key
  `(user_id, activity_id)`, so two runners may store the same Garmin activity independently
  (`(src/store.ts · createStore)`). No page lists another runner's rows.
- **The record leaves with the runner.** `(GET /export.json)` returns the profile, sessions, activities, change sets, muscle
  check-ins, status controls and proposals as one bundle; the profile omits the password hash and the bundle never contains
  the Garmin key (`(src/export.ts · buildExportBundle)`). `(GET /export.ics)` returns the planned sessions as an all-day
  calendar any calendar app can import (`(src/export.ts · buildCalendarIcs)`) — an export, not a sync.
- **The Garmin key is verified, then masked.** It is checked with a real token call before storage and shown only as `••••`
  plus the last four characters afterwards (`(src/web.ts · maskKey)`; `GET /calendar?garmin=setup`), and can be replaced or
  deleted from the same dialog.
- **The audit is scoped to the signed-in runner.** `/coach-audit` reads directives, states, state events, preferences and
  snapshots through `userId` only (`(src/web.ts · createWeb)` · `/coach-audit`); there is no owner-wide view.
- **The gap: there is no account deletion.** No route, store method or cascade exists in the tree; a runner can take their
  data out but cannot erase the account. Tracked as PR-20 in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §2.

## 6. Explicit non-goals

| Non-goal | Why it is out of scope (evidence) |
|---|---|
| **No admin console** | No admin route, role or cross-runner page exists (`(src/web.ts · createWeb)`); the audit page is per-runner. |
| **No Strava** | The only ingestion paths are Garmin (`(src/garmin.ts)`) and the hand-logged run (`(src/manual-activity.ts)`). |
| **No payments** | No billing route, plan, entitlement or table. |
| **No external calendar sync** | `/export.ics` is one-way; there is no Google/Outlook/CalDAV client (`(src/export.ts)`). |
| **No Garmin future-plan import** | A Personal API key reads activities, not scheduled workouts or Garmin Coach plans (`(src/garmin.ts)`; [GARMIN.md](GARMIN.md)). |
| **No wellness or weather data** | Nothing ingests HRV, sleep, readiness or weather; "sleep debt" exists only as something the runner states (`(src/coach-state-catalog.ts · COACH_STATE_DEFINITIONS)`). |
| **No clinical decision support** | Warning and urgent readings hand off to a clinician instead of suggesting drills (`(src/web-muscle.ts · careSection)`); the page says the numbers are reference, not diagnosis (`(src/web-muscle.ts · safetySection)`). |
| **No streaming replies** | `(POST /chat)` proxies with `stream: false` and a 130 s budget; the dock shows an explained loading line instead. |

## 7. Product principles

1. **Calendar first.** `/` lands on the calendar; the log, the body tab and the audit are projections of the same runner.
2. **One primary action per screen.** The today strip has one `.btn` and one quiet link; the muscle form has Save plus a ghost
   Clear; the training log keeps its single coach prompt on the load card.
3. **Record-precise cards, caring sentences.** Cards state numbers (`(src/web.ts · activityMetrics)`, `planComparison`); the
   coach speaks in sentences and never prints structure (`(src/coach.ts · stripReplyStructure)`).
4. **Never invent a runner's body record.** A check-in is the runner's own report; a proposal is stored, shown in the record's
   vocabulary, and writes nothing until Confirm (`(src/web-muscle.ts · proposalCardHtml)`).
5. **Honest failure cards.** "Could not apply", comment-only, blocked-by-state and muted Garmin notes are all visible; nothing
   is silently dropped (`(src/web.ts · renderChatBubble)`, `(src/web.ts · workoutSection)`).
6. **No hidden writes.** Every batch is a change set with snapshots and an Undo; every directive is auditable.
7. **Locale parity.** One catalog, both locales, English as the fallback; a missing key falls back rather than breaking a page.
8. **Server-rendered first.** Every surface works without script: forms post, radios switch tabs, `<details>` hides the log
   form, and the 3D figure has a flat list fallback (`(src/web-muscle.ts · muscleListSection)`).

## 8. Glossary

| Term | Meaning |
|---|---|
| **Session** | A planned training entry; coach-written only (`(src/types.ts · TrainingSession)`). |
| **Run / activity** | A recorded run, from Garmin or logged by hand (`(src/types.ts · Activity)`). |
| **Pair** | A run and the Garmin workout it followed, rendered as one calendar row (`(src/web.ts · pairItem)`). |
| **Peek** | The anchored popup for a run or a session (`(src/web.ts · buildActivityPeek)`, `buildSessionPeek`). |
| **Change set** | One coach batch with before/after entries (`(src/types.ts · ChangeSet)`). |
| **Revert** | The audited undo of a change set (`(src/history.ts · applyRevert)`). |
| **Coaching state** | Durable context with guardrails, active until resolved or expired (`(src/coach-state-catalog.ts)`). |
| **Muscle check-in** | One day's per-muscle report: soreness, tags, side, warm-up (`(src/muscles.ts · MuscleCheckIn)`). |
| **Muscle proposal** | The coach's typed suggestion about a muscle, awaiting Confirm or Dismiss (`(src/muscle-proposals.ts)`). |
| **Directive** | The hidden per-turn instruction built from an intent (`(src/directives.ts · buildDirectiveForIntent)`). |
| **Snapshot / prefill epoch** | The dated context snapshot and the epoch that decides when it is re-read (`(src/coach.ts · buildContextSnapshot)`, `CoachEpochParts`). |
| **Horizon** | The 180-day booking window (`(src/coach.ts · HORIZON_DAYS)`). |

## 9. Related documents

[ARCHITECTURE.md](ARCHITECTURE.md) · [COACH-CONTRACT.md](COACH-CONTRACT.md) · [COACHING-STATES.md](COACHING-STATES.md) ·
[MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md) · [TRAINING-LOG.md](TRAINING-LOG.md) · [UI-GRAMMAR.md](UI-GRAMMAR.md) ·
[ROADMAP.md](ROADMAP.md) · [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)
