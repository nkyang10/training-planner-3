# Roadmap
**Status:** current · **Owner:** product · **Updated:** 2026-11-22 · **Supersedes:** docs/FEATURES-FOR-REVIEW.md

Product scope for the first production release and after. Engineering hardening (rate limiting, TLS, CSP, migrations,
client-script extraction, observability) is deliberately absent — it lives in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).
Context: [PRODUCT.md](PRODUCT.md) · [LIMITS.md](LIMITS.md) · [GARMIN.md](GARMIN.md) · [COACH-CONTRACT.md](COACH-CONTRACT.md).

## 1. How to use this page

One row per candidate; an id is stable for the item's life and is never reused. Sizes are relative effort for one
maintainer (S days · M weeks · L a month or more), not dates.

| Rule | Detail |
|---|---|
| Row fields | id · one-line outcome · why it matters · size · dependencies · blocked on a product decision |
| Placement | Every open candidate sits in exactly one of §3 Now or §4 Later; §5 lists what we will not pursue |
| Shipping | An item moves to §2 with the release version when it lands, and its id is retired — nothing disappears silently |
| Blocked rows | A row marked `yes — Qn` does not start until §6 answers that question; `partly` means one slice can start |
| Scope | Runner-facing product only. If the work is hardening, it is not on this page |

The PoC backlog (`FEATURES-FOR-REVIEW.md`, 45 candidate rows) closes here: 16 shipped as-is, 8 became engineering work,
1 was rejected, and the 20 rows still open are the RM items below.

## 2. Shipped (for context)

| Area | In the product today |
|---|---|
| Calendar | Month grid with typed plan / run / paired run+workout rows, day actions, session and run peeks, in-place refresh |
| Changes | Recent-changes card and the `/changes` page; undo reuses the audited revert path and is itself recorded as a change |
| Training log | Week / month / year views, plan-match badges, load and ACWR card, one metric-selectable trend graph, weekly review prompt |
| Activity detail | `/activity/<id>` with rich Garmin metrics, computed splits, laps, HR zones, best efforts and PR badges |
| Garmin | Per-runner Personal API key, session-start and page-load sync, dedupe/upsert, executed-workout overlay in the grid |
| Muscles | `/muscle` 3D real-anatomy figure plus flat map, check-ins, deterministic reading, drills, coach proposals confirmed by the runner |
| Coaching states | 34-state catalog, deterministic detection, chat proposals with confirmation, guardrail enforcement, manager and audit pages |
| Coach | Same-origin bubble and dock (Chat / States / Changes), history reload, typed intents with server-built directives, suggestion chips, failure cards, peer-voice cap |
| Accounts and data | Independent accounts with per-user isolation, `/export.json` and `/export.ics`, en/zh-HK UI, notification tray, `/coach-audit` |

## 3. Now / next (post-release, ordered)

| Id | Outcome | Why it matters | Size | Depends on | Blocked |
|---|---|---|---|---|---|
| RM-01 | Stream the coach reply into the bubble | Long answers sit behind a dead wait: the web proxy calls the gateway with `stream: false` although the gateway already emits chunks | M | gateway stream chunks, web `/chat` proxy, reply cap and turn replay | no |
| RM-02 | Deterministic planner fallback when the model is down or returns invalid JSON | One outage or a rejected turn leaves the runner with nothing; the calendar is the product and must still answer | M | plan template model, `parseCoachTurn` failure path, fallback copy | no |
| RM-03 | Week / agenda view for the plan calendar with a today control | The month grid is a planning tool; daily use needs a week or agenda, and the training log's week view is the proven pattern | M | `src/calendar-items.ts` renderer, calendar nav, `/calendar/data` | no |
| RM-04 | Account deletion plus a complete export | Deletion shipped in 1.2.0 (`/profile/delete`, all 19 tables); export still omits the coach conversation, memories and states, so the bundle is not yet a full copy of what is held |
| RM-05 | Installable PWA with offline read of the month | Calendar-first is a phone product; there is no manifest, service worker or offline shell, so the track case fails | L | manifest, service worker, cached month payload, Q3 | partly — Q3 |
| RM-06 | Coach memory manager: see and forget what the coach remembers | Memories are append-and-cap only; the runner cannot inspect or delete a fact, and the privacy story implies they can | S | memories store (exists), one list/delete route, Q4 | yes — Q4 |
| RM-07 | Notification centre depth | The tray is a Garmin-sync feed capped at 20 items, with no state, guardrail or muscle events and no per-item action; reminders have nowhere to land | M | notification source enum, notification page, Q5 | partly — Q5 |
| RM-08 | Import the future Garmin plan as a read-only layer | Garmin Coach and adaptive-plan runners cannot see the plan they follow, although the executed workout is already an overlay | L | Garmin SSO transport, read-only plan layer, Q1 | yes — Q1 |

## 4. Later / parked

| Id | Outcome | Why it is parked | Size | Depends on | Blocked |
|---|---|---|---|---|---|
| RM-09 | Reminders and delivery | Sits behind the notification centre, and the channel is undecided | M | RM-07, Q5 | yes — Q5 |
| RM-10 | Diff preview before a batch apply | Undo and the changes page already carry the trust story; friction is not wanted on a single explicit ask | M | two-phase turn, gateway propose mode | no |
| RM-11 | Drag-and-drop reschedule | Contradicts the shipped rule that the coach is the only writer of planned sessions | L | — | no |
| RM-12 | Goal race countdown and plan end date | Race-week states guard the last week, but a free-text goal cannot drive a countdown or a plan end | M | goal-race object, Q7 | yes — Q7 |
| RM-13 | Records page, zone charts, persisted trend metric | PRs are stored-history bests today; a records page needs a longer window than 100 activities | M | longer sync window | no |
| RM-14 | FIT parsing and richer ingestion | Garmin detail is fetched on demand and only partly documented; this is depth, not a new job | L | FIT decoder, detail budget | no |
| RM-15 | Year heatmap, multi-month consistency and month/year load summaries | The log already answers consistency at week level, so this is depth, not a gap in the daily loop | M | aggregate queries, load card | no |
| RM-16 | Plan templates (base 5k, 10k, half) | The template is the input the fallback planner needs; ship it there first | M | RM-02 template model | no |
| RM-17 | Conversation summarisation | A prompt-limit problem, not a runner problem; solve it when a real history hits the budget | M | prompt budget accounting | no |
| RM-18 | Coach tone setting (`direct` opt-in) | The peer voice is the product law; a second register is a preference nobody has asked for | S | profile preference | no |
| RM-19 | Conflict detection beyond guardrails | Race, injury and load conflicts are already enforced; same-day duplicates are rare and visible in the grid | M | session overlap rules | no |
| RM-20 | Background Garmin sync scheduler | Session-start and page-load sync cover the common case; a scheduler raises key-at-rest and cadence questions | M | scheduler, key storage, Q6 | yes — Q6 |
| RM-21 | Read-only admin/debug console | Maintainer tooling; the audit page, notifications and sync state already answer most read-only questions | M | admin route, no secrets | no |
| RM-22 | Wellness data (sleep, HRV, readiness) and sleep states | The Personal API ingests no wellness data; this needs a new source and a privacy review | L | new data source, Q8 | yes — Q8 |
| RM-23 | Weather, heat and air-quality states | No provider is wired in; those states work from chat and user input only | M | weather provider, location | no |
| RM-24 | Base/build/peak phase model | Needs a dated goal race and a phase model; race phase and taper are the useful subset we already ship | L | RM-12, Q7 | yes — Q7 |
| RM-25 | State outcome analytics | Owner-facing threshold tuning; no runner value before there is volume | M | state event log (exists) | no |
| RM-26 | Session revocation / sign out everywhere | The 24-hour signed cookie bounds the exposure; revisit when sessions get longer | S | token version, auth store | no |
| RM-27 | Unsolicited automatic post-run review | The coach contract says pull, not push; the one-tap review card is the shipped compromise | S | — | no |

## 5. Explicitly rejected

| Id | Idea | Why we do not pursue it |
|---|---|---|
| RM-28 | Clinical decision support, diagnosis or tissue classification | Not a medical device; a wrong auto-diagnosis is worse than no state, and pain ends with a clinician referral |
| RM-29 | External calendar sync (Google, Outlook, CalDAV) | The private calendar is the product; `/export.ics` already covers "take it elsewhere", read-only |
| RM-30 | Strava as a second source in v1 | A second OAuth and mapping surface for a device we do not own; Garmin plus manual runs cover the log |
| RM-31 | Human-coach portal or marketplace | No consent model, no coach has asked for one, and export-first covers the coach pack |
| RM-32 | Push Milebook sessions to Garmin | The official Training API is publish-only and business-tier; Milebook owns the plan |
| RM-33 | Social feed or share card | Relatedness is not the wedge, and a share card would need a weekly recap we do not have |
| RM-34 | Youth accounts | Safety and legal surface; staging youth training needs expertise the product does not have |
| RM-35 | Image-precise anatomy, EMG or HRV readiness scoring | Research-grade inputs; the 3D figure is educational, not a measurement device |
| RM-36 | Payments and subscriptions | No pricing decision and no billing surface; the release has no paid tier |

## 6. Open product questions

1. **Garmin future-plan import:** do we accept a Garmin SSO web session — and the terms that come with it — as a second transport? (RM-08)
2. **Account deletion:** hard delete or a grace period, and what happens to change history, the coach transcript and muscle records? (RM-04)
3. **PWA offline scope:** is a read-only cached month enough for v1, or must logging and check-ins work offline? (RM-05)
4. **Coach memory:** what may the runner see and delete — raw memory rows, the silently learned language preference, coaching states? (RM-06)
5. **Reminder channel:** in-app only, email, or browser push? (RM-07, RM-09)
6. **Background sync:** may Milebook pull Garmin on a schedule without the runner's action, and is a plaintext key at rest acceptable for that? (RM-20)
7. **Goal race:** does the free-text profile goal become a dated object with a distance, a countdown and a plan end date? (RM-12, RM-24)
8. **Wellness:** is sleep/HRV/readiness ingestion in v1, with the privacy review it requires? (RM-22)

## 7. Decision log

The PoC-era D1–D18 owner questions in `docs/analysis/` are recommendations, not decisions. Only the rows below are in
force, and each is verifiable in shipped code or docs.

| Id | Decision in force | Where it binds | Source |
|---|---|---|---|
| DL-1 | The model proposes; the server validates the whole turn before any write | RM-02, RM-10 | ADR-0001 |
| DL-2 | The calendar is the product; the coach is a same-origin bubble | RM-03, RM-05 | ADR-0002 |
| DL-3 | Turns are idempotent and the validation loop stays server-side | RM-01 (streaming must keep the cap and the replay) | ADR-0003 |
| DL-4 | The coach is the only writer of planned sessions; there is no manual session edit form | RM-11 | MILEBOOK-CALENDAR §13.4 |
| DL-5 | Undo is a visible control, and the revert is itself recorded as a change | RM-10 | MILEBOOK-CALENDAR §7 |
| DL-6 | Sensitive states are never inferred; the runner confirms them | RM-22, RM-23 | COACH-STATES |
| DL-7 | No diagnosis; pain and red flags end with a clinician referral | RM-28 | COACH-STATES safety copy; MUSCLE-TAB §10 |
| DL-8 | Pull, not push: the coach never writes or messages on its own initiative | RM-27 | COACH-CONTRACT §11 |
| DL-9 | Reply contract: 2–4 sentences, no markdown, at most one question, 480-character cap | RM-01, RM-18 | COACH-CONTRACT §7 |
| DL-10 | Garmin supplies the executed workout only; the future plan needs SSO | RM-08 | GARMIN-TRAINING-PROGRAMS §5 |
| DL-11 | One plaintext Personal API key per runner; no Garmin OAuth | RM-20 | GARMIN.md §6 |
| DL-12 | Export is read-only JSON plus ICS; there is no external calendar sync | RM-29 | `src/export.ts`; FEATURES-FOR-REVIEW §5 |
| DL-13 | A muscle suggestion writes nothing until the runner confirms it | RM-06 | COACH-CONTRACT §12 |
