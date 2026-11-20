# Milebook - gap analysis: runner needs versus what the product does today

**Status:** complete, read-only analysis. **Date:** 2026-11-18. **Owner:** product gap analyst (Milebook).
**Inputs:** `docs/analysis/01-user-workflow-map.md` (P1-P8, S1-S12, SF-01..23, X1-X10, WF-01..27, CN-01..30, ST-01..12, Q-01..12);
`docs/analysis/02-runner-needs-research.md` (S1-S55, J1-J11, N1-N43, C1-C8, ranked top 15, research gaps G1-G10);
`docs/analysis/03-competitive-benchmark.md` (12 competitors, matrix, O1-O6, table stakes, non-goals, 90-day list);
product docs (`README.md`, `docs/MILEBOOK-CALENDAR.md`, `docs/COACH-STATES.md`, `docs/FEATURES-FOR-REVIEW.md`,
`docs/TRAINING-LOG-PLAN.md`, `docs/GARMIN-TRAINING-PROGRAMS.md`, ADR-0001..0003) and `src/` at HEAD.

**Method.** Read 01 sections 2.1/6/7/8/9, 02 sections 5/6/10/11, 03 sections 0.6/2.2/2.5/6/7; skimmed the rest only to
check a claim. Spot-checked 22 code anchors against `src/` (list in section 1.1); every code claim below carries
`file:line`. Ran no server, test or deploy; wrote only this file and `05-improvement-backlog.md`.

**Confidence legend.** `high` = read in code or stated in two independent inputs; `medium` = one doc anchor plus inference;
`low` = inference only. Severity: `blocker` = a named segment cannot complete the core loop; `high` = main path is
misleading, lost or unrecoverable; `medium` = costs a step or trust; `low` = polish.

**Out of scope here.** No re-derivation of the research, no new competitor research, no estimates of market size or
willingness to pay (02 G1/G2 stand), no clinical thresholds, no code changes. Feature *proposals* live in 05 only.

### 1.1 Code anchors spot-checked (doc claim -> code)

| # | Claim from 01/03 | Code result | Verdict |
|---|---|---|---|
| 1 | `appendActivity` has one caller (WF-02/CN-01) | only `src/garmin-sync.ts:165`; `Store.appendActivity` at `src/types.ts:414` | confirmed |
| 2 | Profile goal never reaches the prompt (WF-01) | `goal` exists in `UserProfilePatch` `src/types.ts:24`; `facts` in `src/coach.ts:265-302` has no goal field | confirmed |
| 3 | Eight session kinds, no strength (CN-09/WF-27) | `src/coach.ts:26`, `src/types.ts:42` | confirmed (kinds: easy, long, interval, tempo, rest, cross, race, racewalk) |
| 4 | `/coach-audit` not role-gated (WF-20) | route scopes by `user.userId`, no role check: `src/web.ts:3060-3070` | confirmed |
| 5 | No manifest / service worker (WF-22/CN-16) | head is charset+viewport+title+css only: `src/web.ts:1609-1610`; no `manifest`/`serviceWorker` match in `src/` | confirmed |
| 6 | No reduced motion (WF-10) | no `prefers-reduced-motion` or `matchMedia` match in `src/`; animation at `src/web.ts:1790-1846` | confirmed |
| 7 | Gateway enforces write permission (ST-04) | `comment-only-write` block at `src/gateway.ts:963-970` | confirmed |
| 8 | Plan matching is same-day only (ST-07) | `if (activity.day !== session.day) continue` `src/training.ts:64-65` | confirmed |
| 9 | Garmin key stored plaintext (CN-26) | `api_key TEXT NOT NULL` `src/store.ts:110-113`, upsert `:230-232` | confirmed |
| 10 | Cookie stateless, 30 days (WF-21) | HMAC payload+exp, no server list: `src/auth.ts:240-246`, max age `:14` | confirmed |
| 11 | Only model call has a timeout (WF-05/WF-25) | `AbortController` + 120 s at `src/gateway.ts:212-213`; no signal in `src/garmin.ts` | confirmed |
| 12 | Bell is sync-only (03 section 7.1) | `NotificationSource = "garmin"` `src/types.ts:142`; also success/error `:143` | mostly confirmed; "sync feed only" understates manual no-new and error items |
| 13 | 180-day horizon "shown in the bubble header" (README:313) | header holds title + minimize only `src/web.ts:1617-1618`; `HORIZON_DAYS` `src/coach.ts:40` | **doc/code mismatch (WF-09)** |
| 14 | Manual sync "cannot double-pull" (`docs/MILEBOOK-CALENDAR.md:787-789`) | `/sync` and `/garmin/key` pass `syncOnStart=false` to `resolveSession` (`src/web.ts:2932-2935` -> `:2886-2901`), so `startSession` does not auto-sync | confirmed (M2 withdrawn) |
| 15 | `/coach-audit` is "owner-only" (`README.md:133`) | route is scoped by `user.userId` (`src/web.ts:3060-3070`); there is no admin role, so "owner-only" means per-data-owner and is accurate | confirmed (M3 reworded) |
| 16 | Docs promise reduced-motion users skip the flourish (`docs/MILEBOOK-CALENDAR.md:968`) | no media query in `src/` | **mismatch (WF-10)** |
| 17 | zh-Hant/en copy mix (02 P8) | inline bilingual string `src/web.ts:3561`; `CoachLanguage = auto/en/zh-Hant` `src/types.ts:223` | confirmed |
| 18 | Emoji in runner-facing chrome | `src/web.ts:1616` bubble label; also minimize glyph `:1618` | confirmed (relevant to i18n/ASCII policy) |
| 19 | Training log trend truncates to 12 (WF-18) | `.slice(0, 12)` at `src/web.ts:1184-1189` (re-checked in review 06 F-20) | confirmed |
| 20 | New-run review card ephemeral (WF-06) | card driven by `auto.newest` / `?newest=`: `src/web.ts:3569-3573` | confirmed |
| 21 | No export / no user delete route | no `/export`, `deleteUser` or `DELETE FROM users` match in `src/` | confirmed |
| 22 | Sessions inert outside the grid (WF-08) | `sessionChip` is a span with tooltip `src/web.ts:231-234`; day page renders plain `<p>` rows `:3446-3460` (the old `:2182-2185` anchor was the day-menu click handler) | confirmed |

**Doc/code mismatches (review 06 F-07/F-08/F-09).** M1 horizon claim (README:313 vs `src/web.ts:1617-1618`), M4
reduced-motion claim (`docs/MILEBOOK-CALENDAR.md:968` vs no media query) and M5 "bell is sync feed only" (03 section 7.1 vs
`src/types.ts:142-143`) are real doc defects. M3 is a wording overreach: "owner-only" means per-data-owner; there is no
admin role. M2 (manual sync double-pull) was withdrawn: `/sync` passes `syncOnStart=false` to `resolveSession`
(`src/web.ts:2932-2935`). None is a code regression; all four are documentation drift and should be fixed in the product
docs before a demo.

---

## 2. Executive gap summary (ordered by runner impact x strategic cost)

1. **G-02 No way to record a run without Garmin** -- the completion half of a calendar-first product is device-only; P4 is excluded and P1/P5/P6 cannot log treadmill, commute or cautious return runs (WF-02, CN-01/02, `src/garmin-sync.ts:165`).
2. **G-09 Coach-only writes make one model the availability of the whole planner** -- no edit form, no fallback planner, so a 502 freezes add/move/delete (WF-16, `src/gateway.ts:1074-1081`, Q-03).
3. **G-11 No mobile story: no PWA/offline and a fixed seven-column grid** -- "calendar-first is phone-first" while the phone view truncates pills to a few characters (WF-22, CN-16, 03 section 7.1 table stakes).
4. **G-01 The goal the runner types never reaches the coach and there is no goal-race object** -- onboarding asks, then drops it; race phase starts from a conversation the runner must repeat (WF-01, CN-10, `src/coach.ts:265-302`).
5. **G-05/G-06 The trust machinery is invisible: undo is chat-only, there is no change history and no diff before apply** -- Milebook's strongest differentiator is felt as opacity (WF-07, CN-04/11, O1/O4, ST-06).
6. **G-07 No durable consent surface for state proposals** -- sensitive confirm cards die on refresh and ordinary states activate silently, so the safety path depends on not reloading (WF-13/14, Q-04, ST-10).
7. **G-10 No direct manipulation or re-flow: sessions cannot be moved, opened or edited outside chat** -- blocks the two highest-ranked needs N4 and N29 (WF-08, CN-03, 02 section 10 ranks 1-2).
8. **G-03 Garmin connect is three dead ends and the sync result is discarded** -- the first-run task of a data product fails silently (WF-03/04/23, CN-26).
9. **G-13 Race week and post-race exist only as guardrails, not as calendar artefacts** -- no countdown, goal time, briefing, pacing or return block, so O5 cannot be claimed (WF-27, CN-10, Q-02).
10. **G-21/G-22 The "your data is yours" story has no export, backup, deletion or revocation** -- ownership is the stated advantage over TrainingPeaks/Runna and it is not literally true (CN-12/13/14/15, C7, WF-21).

**If you fix nothing else, fix these:** G-02, G-09, G-01, G-05+G-06, G-11, G-07. They cover one blocker in
completion, one blocker in writing, the broken onboarding promise, the invisible differentiator, the table-stakes
platform gap and the safety path. Everything else is either polish or a segment bet.

---

## 3. Core traceability matrix (N1-N43 -> current support -> gap)

Support: `strong` = the need is met on the main path; `partial` = a real capability exists but the end-to-end task
fails; `weak` = only an ingredient exists; `absent` = nothing in `src/`. Severity is 02 section 5. Gap type:
feature / workflow / trust / data / platform / safety / i18n.

### F1 Planning and periodization

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N1 goal-to-calendar dated block | High | partial | ST-01/ST-02, SF-03/14, `src/coach.ts:392-609` | feature | G-01, G-04 | The block exists but is not derived from the stated goal and has no intake or template |
| N2 see the block shape (build/cutback/taper) | Med-High | weak | SF-12, `src/training.ts:222-307` | feature | G-13 | Load exists per week; phase and "why this week is hard" have no surface |
| N3 plan provenance (named approach) | High | weak | SF-14, ADR-0003 | trust | G-04 | Nothing states what the plan is built on; LLM output is the provenance |
| N4 re-plan without rebuilding | High | partial | ST-02/ST-06, X5, `src/gateway.ts:596-763` | workflow | G-09, G-10 | Batch+revert exist, but the runner can only reach them by chat and cannot see the batch |

### F2 Daily execution and session intent

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N5 today's purpose and how hard | High | weak | SF-05, `src/web.ts:1020-1060` | feature | G-17 | Peek shows kind/distance/duration/note; no intent, effort target or "why" |
| N6 effort converted to today's pace/HR | High | absent | SF-05, states (heat/travel) | feature | G-17, G-28 | No pace/HR range anywhere; heat/travel states change chat text only |
| N7 steps, warm-up, fuel in one glance | Medium | partial | SF-06, ST-08, `src/web.ts:648-675` | feature | G-17 | Workout brief exists for Garmin programs, not for coach-authored sessions |
| N8 run attaches to the planned session | High | partial | ST-07, ST-08, `src/training.ts:57-125` | workflow | G-02, G-18 | Same-day match works; no manual link/unlink, and a missed run cannot be corrected |

### F3 Feedback and interpretation

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N9 did the run do what the plan intended | High | partial | ST-07, SF-04/13, `src/web.ts:952-1003` | trust | G-18 | A badge plus a chat you must ask for; no sentence at the point of review |
| N10 believable improvement read | High | partial | SF-11/12, `src/training.ts:147-176` | trust | G-20 | Trend and best efforts exist; no interpretation, no exclusion of a bad point |
| N11 load/ACWR explained with one action | High | partial | SF-12, `src/training.ts:178-307` | trust | G-28 | Numbers and a band, no decision sentence, no "hold volume this week" |

### F4 Motivation, accountability and adherence

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N12 smallest gap between deciding and running | High | weak | SF-03, WF-22 | workflow | G-11, G-12 | No today card, no reminder, phone view weak; the plan is passive |
| N13 missed run explicitly let go | Critical (subset) | weak | SF-05, `src/web.ts:3473` | trust | G-15, G-19 | "No activity recorded" plus a red-ish outcome; no permission-to-skip copy |
| N14 something notices | Med-High | weak | SF-17, SF-12 | feature | G-12 | Bell is sync-only (`src/types.ts:142`); weekly review is one button |
| N15 reward without pressure | Medium | partial | SF-11, ST-11 | feature | G-20 | PR badges exist; scope unlabelled and speed is the only reward |

### F5 Injury, recovery and load

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N16 pain taken seriously, session changed | Critical | partial | ST-09/ST-10, SF-15, `src/coach-states.ts:631-685` | safety | G-07 | Guardrails are real; the confirm control is DOM-only and dies on refresh |
| N17 how much is too much for me | High | partial | SF-12, `src/training.ts:178-307` | trust | G-28 | ACWR computed, never translated into a rule of thumb or an action |
| N18 sane way back after a break | High | weak | `src/coach-state-catalog.ts` return_to_run, SF-15 | workflow | G-07, G-10 | A state exists; nothing shifts or repeats the block, and no re-flow primitive |
| N19 strength/prehab that fits the calendar | Medium | absent | `src/coach.ts:26` | feature | G-14 | Eight kinds, none strength/mobility; `strength_focus` promises what the model cannot store |

### F6 Race preparation and execution

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N20 race-week day-by-day plan | High | weak | states (race week), SF-03 | feature | G-13 | The week is guarded, not planned; no briefing surface |
| N21 pacing plan I believe in | High | absent | CN-10 | feature | G-13 | No goal time, split plan or course note |
| N22 taper madness reassurance | High | weak | taper state, SF-15 | trust | G-13, G-08 | The state knows; the runner is not told unless they open `/coach-states` |
| N23 post-race recovery and return point | Med-High | weak | post-race state, SF-15 | feature | G-13 | Detected, not scheduled; no reverse taper block |

### F7 Data, devices and sync

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N24 one authoritative, visibly reconciled place | High | partial | ST-08, SF-17/18, X1/X2 | trust | G-03, G-18, G-25 | One source is a defensible promise; last-sync time, matched/ignored and staleness are not on screen |
| N25 add or fix a run where the plan lives | High | absent | CN-01, `src/types.ts:67` | feature | G-02 | The vocabulary (`"chat"` source, "Reported" chip) exists with no writer |
| N26 correct zones or exclude a bad data point | Med-High | absent | CN-21, SF-11 | data | G-28 | No zone boundaries, no per-run exclude/flag |

### F8 Time and life constraints

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N27 sessions that fit the time I have | Critical (segment) | absent | SF-03, `src/types.ts:44-55` | feature | G-16 | No time budget, no short variant, no time-of-day; session has distance/duration only |
| N28 plan adapts to travel/heat/treadmill | Medium | weak | states, SF-05 | workflow | G-17, G-28 | States change text, not the displayed target |
| N29 move sessions in seconds, week re-flows | High | weak | WF-08, `src/web.ts:231-234` | workflow | G-10 | No drag, no move button; the only path is a sentence to the coach |

### F9 Learning and confidence

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N30 reasoning in plain language | Medium | weak | SF-14/16, `src/directives.ts:383` | trust | G-08 | Reasons are enforced server-side and surfaced after the fact, not at the control |
| N31 evidence that an easy run works | High | weak | SF-04/11, ST-11 | trust | G-17 | Pace trend without an easy-pace interpretation; no praise for slow-at-low-HR |

### F10 Social, community and coaching relationship

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N32 shared effort and belonging | Medium | absent (by design) | README:308-309 | - | none (non-goal NB-2) | Deliberate; the honest move is to encourage a club run as a calendar entry, not build a feed |
| N33 a referee who says back off or you can | High | partial | ST-09, SF-15, medical_red_flag | trust | G-08, G-19 | Guardrails push back; there is no explicit permission-to-back-off copy |
| N34 control over what is shared and exposed | Critical (affected) | strong (privacy) / weak (control) | README:308-309, SF-01 | trust | G-21, G-22, G-23 | Private by architecture, but no export, deletion, revocation or key removal |

### F11 Trust, transparency and control

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N35 see why it changed, and undo | High | partial | ST-06, X5, `src/history.ts:37-93` | trust | G-05, G-24 | Revert exists; no history UI, no reason at the point of change, audit unlinked |
| N36 review the diff before a rewrite | High | absent | CN-11, `docs/FEATURES-FOR-REVIEW.md:44` | trust | G-06 | Single-phase turn: propose and commit are the same call |
| N37 memory, evidence, and stated limits | Critical | partial | ST-02/ST-09, SF-16, CN-25 | trust | G-24, G-22, G-26 | Structured state is right; raw memories are invisible and the audit page is unfindable |

### F12 Beginners, returners, masters, women

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N38 permission to repeat a week, walk-run | Critical (beginners) | absent | CN-09, `src/coach.ts:26` | feature | G-15 | No repeat action, no walk-run kind, no beginner mode |
| N39 masters: slower recovery, fewer hard days | High | absent | SF-02, `src/types.ts:9-24` | feature | G-15 | No age band or segment setting reaches plan generation |
| N40 cycle/iron flex without deterministic syncing | High (affected) | weak | SF-15, COACH-STATES sensitive set | safety | G-07 | Sensitive states exist; no voluntary daily adjustment and no note field |

### F13 Safety, body image and mental health

| Need | Severity | Support | Evidence anchors | Type | Gap | Verdict |
|---|---|---|---|---|---|---|
| N41 location and routine kept private | Critical | strong | README:308-309, no routes/maps in `src/` | trust | G-23 | Genuine strength; keep it and state it in runner-facing copy |
| N42 no weight/calorie targets | Critical | strong (by omission) | `src/types.ts:9-24` profile has no body fields | safety | G-07 | Nothing to break today; needs a written policy so a future feature cannot add one |
| N43 notice burnout, respond with rest | Critical | weak | SF-15, G-19 | safety | G-07, G-19 | No non-clinical ease-off path; copy is performance-neutral but not wellbeing-aware |

**Matrix roll-up.** strong 2 (N41, N42) plus N34's privacy half, partial 15, weak 16, absent 10
(N6, N19, N21, N25, N26, N27, N32, N36, N38, N39 -> 9 excluding N32, a deliberate non-goal). The absent set is not random: it is exactly
"input" (manual entry, time budget, beginner mode) and "output" (race artefact, intent, exclusions) around a strong
middle (plan, guardrails, log, audit data).

---

## 4. Gap register G-01..G-28

Type: `D` = defect (code contradicts a documented or promised behaviour), `F` = missing feature, `P` = product decision
needed. Every row names the competitive baseline from 03 (who already does it).

| ID | Gap and why it matters to a runner | Personas / stages | Evidence | Type | Sev / Conf | Baseline in 03 | Related |
|---|---|---|---|---|---|---|---|
| G-01 | Goal text is stored but absent from prompt facts and there is no goal-race object (date, distance, target time, countdown); onboarding promises personalisation and silently drops the only input it asked for | P1 P2 P7 / S2 S4 S10 | WF-01; `src/types.ts:24`; `src/coach.ts:265-302`; CN-10 | D+F | high / high | Runna, Garmin Coach and COROS all derive the block from race date and goal time (03 section 1.5-1.6) | N1 N2 N3; Q-02 |
| G-02 | No route, form or coach action creates an activity; `appendActivity` has one caller, so the "Reported" chip and `"chat"` source are dead vocabulary and P4 cannot use the product at all | P1 P4 P5 P6 / S7 S9 | WF-02, CN-01/02; `src/garmin-sync.ts:165`; `src/types.ts:67` | D | blocker / high | Manual entry exists in Strava, TrainingPeaks, Final Surge, Intervals.icu, Runkeeper (03 section 7.1) | N25 N8 N12; Q-01 |
| G-03 | Three dead ends around the only data connection (setup card points at a profile control that does not exist, `[data-open-garmin]` binding is dead, modal only on two pages) and `/sync` results are stripped before render | P1 P3 P5 / S3 | WF-03, WF-04, WF-23, CN-26; `src/web-coach-states.ts:194`; `src/web.ts:2749-2771`, `:3866` | D | high / high | Garmin/Runna onboarding is a single OAuth flow with an in-place result (03 section 3.1) | N24; Q-10 |
| G-04 | No plan template, import or provenance: the runner cannot start from "10k in 8 weeks", a PDF/Sheets plan or a named approach, so the first screen is a blank chat | P1 P2 P7 / S1 S4 | CN-07; `docs/FEATURES-FOR-REVIEW.md:71`; O2 | F | high / high | Garmin Coach free plans, Nike, COROS, TrainingPeaks Basic, Intervals.icu (03 section 7.1) | N1 N3; Q-11 |
| G-05 | Undo is chat-only, the change journal has no runner-facing view and the revert animation cannot show a revert of an add, so recovery is real but invisible | P2 P3 P6 / S8 | WF-07; `src/history.ts:37-93`; `src/web.ts:1816`, `:1833`; CN-04 | D+F | high / high | No competitor shows an AI before/after change set (03 O4) - this is a protect-and-expose gap, not catch-up | N35; Q-08 |
| G-06 | A multi-session coach write commits in one phase; there is no diff and no approve step, so a plausible but wrong rewrite silently becomes the plan | P2 P3 P7 / S4 S8 | CN-11; `src/gateway.ts:596-763`; `docs/FEATURES-FOR-REVIEW.md:44` | F | high / high | Intervals.icu plan editor and TrainingPeaks show edits before save; no AI diff anywhere (03 O4) | N36 N4 |
| G-07 | State proposals have no durable consent surface: sensitive confirm cards are DOM-only and vanish on refresh, ordinary states activate silently and change guardrails for weeks | P5 P2 P7 / S10 S11 | WF-13, WF-14; `src/web.ts:1878-1959`; `src/coach-states.ts:527`; ST-10 | D | high / high | No competitor documents consent semantics; Garmin silently swaps sessions after poor sleep (03 O3) | N16 N40 N42 N43; Q-04 |
| G-08 | Read-only turns and state guardrails are enforced server-side and explained only in the reply, so "Ask coach" looks like an edit button and a refusal arrives after the fact | all / S4 S8 | WF-15; `src/directives.ts:219-256`; `src/gateway.ts:963-995`; CN-03 | P | medium / high | No competitor has comment-only turns; the cost of the capability is an affordance debt unique to Milebook | N30 N33 N35 |
| G-09 | The only writer is a validated model turn: during a model outage nothing can be added, moved or deleted, so planner availability equals model availability | all / S4 S8 | WF-16; `src/gateway.ts:1074-1081`; `docs/FEATURES-FOR-REVIEW.md:66` | P | blocker / high | Every competitor has a deterministic plan editor or fixed plan; none can be frozen by a model outage (03 O1 risk) | N1 N4 N29; Q-03 |
| G-10 | Planned sessions cannot be opened, moved or edited outside chat: `sessionChip` is a span, `/day` lists plain items, no drag, no move button, no re-flow of the remaining week | P2 P6 P7 / S5 S6 S9 | WF-08; `src/web.ts:231-234`, `:2182-2185`; CN-03/08 | F | high / high | Runna praised for "really easy to change dates"; TrainingPeaks paywalls basic moves (03 O1) | N4 N18 N29; Q-06 |
| G-11 | No manifest, service worker or offline shell and the month grid stays seven columns at 360 px, so the phone-first promise fails on the phone | P6 P1 P8 / S5 | WF-22; `src/web.ts:1609-1610`; `src/styles.ts:38`, `:70`; CN-16 | F | high / high | Every competitor except Intervals.icu ships mobile (03 section 7.1) | N5 N12 N27; Q-06 |
| G-12 | No per-session reminder or notification channel; the bell only carries sync outcomes, so the plan never nudges the runner | P6 P1 P2 / S5 S6 | CN-05; `src/types.ts:142`; `docs/FEATURES-FOR-REVIEW.md:48` | F | high / high | Garmin, Runna, NRC, COROS all notify (03 section 7.1) | N12 N14 |
| G-13 | Race week and post-race are guardrails without an artefact: no countdown, goal time, briefing, pacing note, result capture or return block, and taper is a state the runner must go find | P2 P7 / S10 S11 | WF-27; CN-10; `src/coach.ts:26`; O5 | F | high / high | Runna race-day guidance, Garmin race widget, COROS predictor (03 O5) | N20 N21 N22 N23; Q-02 |
| G-14 | The plan model cannot express strength, mobility or cycling as their own kind, yet `strength_focus` tells the coach to prescribe one or two strength sessions | P2 P5 P7 / S4 S10 | WF-27; `src/coach.ts:26`; `src/coach-state-catalog.ts:551-559` | D+F | medium / high | TrainingPeaks, Runna, Garmin, COROS, Intervals.icu all hold strength (03 section 7.1) | N19; Q-12 |
| G-15 | No beginner/returner/masters mode: no repeat-this-week, no walk-run kind, no age band or segment setting in plan generation, and no pace targets withheld for a runner without a baseline | P1 P5 P7 / S4 S5 | CN-09; `src/types.ts:9-24`; C1; 02 N38/N39 | F | high / high | Runna "idiot-proof" onboarding, Garmin beginner plans (03 section 1.5) | N38 N39 N13; Q-06 |
| G-16 | No time budget or short-session variant: a session has distance/duration but no time-of-day, no "I have 35 minutes on Tuesday", no minimum viable version | P6 P1 P5 / S2 S4 S5 | 02 N27; `src/types.ts:44-55` | F | high / medium | Runna seven-day plans and Holiday Mode; TrainingPeaks session time fields (03 section 0.6 finding 5) | N27 N12 |
| G-17 | The session peek cannot answer "what is this for?": no intent, effort target, pace/HR range, steps or fuel, and coach-authored sessions have no workout brief at all | P1 P2 P3 / S5 S6 | SF-05, SF-06; `src/web.ts:1020-1060`; 02 N5/N6/N7/N31 | F | high / high | Garmin DSW pushes structured steps to the watch; Runna pushes workouts (03 section 3.1) | N5 N6 N7 N28 N31 |
| G-18 | Plan-versus-actual is a badge plus an optional chat: no judgement sentence at review time, no one-tap link/unlink when the match is wrong, and no correction path for a run that happened without a watch | P1 P2 P4 / S7 S9 | ST-07; `src/training.ts:57-125`; CN-02; WF-06 | F | high / high | Runna's Workout Insights already compares planned with actual post-run (03 section 1.5, S28), so the gap is the missing judgement on Milebook's own review surface, not competitor absence | N8 N9 N24 |
| G-19 | Missing a session reads as a failure: "No activity recorded", a missed outcome and no explicit "let it go, the block does not change" copy or coach line | P1 P5 P6 / S7 S8 | WF-08; `src/web.ts:3473`; 02 N13 rank 7 | D | medium / high | No competitor is evidenced to do this well; cheap differentiator for wellbeing (C8) | N13 N33 N43 |
| G-20 | PR/best-effort scope is unstated on screen while badges are computed over stored history only (100 activities / 90 days), and the trend graph silently plots the last 12 runs | P2 P3 / S9 | WF-17, WF-18; `README.md:344`; `src/training.ts:147-176` | D | medium / high | Strava segments and Garmin PRs are lifetime and labelled (03 section 1.3) | N10 N15; Q-07 |
| G-21 | No export, backup or ICS route: the ownership story ("private, SQLite, no lock-in") is not literally true, and a lost volume loses the plan | P3 P7 / S12 | CN-15; `docs/FEATURES-FOR-REVIEW.md:86`; C7 | F | high / high | Export exists in TrainingPeaks, Strava, Final Surge, COROS, Intervals.icu (03 section 7.1) | N34 N37; Q-11 |
| G-22 | No password reset, email verification, rate limit, account deletion or session revocation list; the signed cookie stays valid 30 days if copied | P3 P7 / S1 S12 | WF-21; CN-12/13/14; `src/auth.ts:240-246` | F | high / high | Table stakes for any account product; none of the 12 ships without reset (03 section 7.1) | N34 N37; Q-09 |
| G-23 | The Garmin API key is stored plaintext and cannot be disconnected or deleted; there is no way to withdraw a credential from a shared or lost device | P3 / S3 S12 | CN-26; `src/store.ts:110-113`, `:230-232`; `README.md:332` | D | high / high | OAuth with revocable tokens in Garmin/Runna/Strava; Milebook has no revoke path | N34 N41; Q-10 |
| G-24 | `/coach-audit` is unlinked and not role-gated, and raw memories cannot be listed or deleted, so the transparency machinery is unreachable and "owner-only" overstates control | P3 P7 / S12 | WF-20, CN-25; `src/web.ts:3060-3070`; `README.md:133` | D+P | medium / high | No competitor has an audit page; the gap is legibility, not capability (03 O4) | N35 N37; Q-08 |
| G-25 | Page render blocks on Garmin I/O with no client or server timeout for Garmin calls, and there is no streaming, cancel or fetch timeout in the bubble | all / S5 S7 S9 | WF-05, WF-25; `src/gateway.ts:212-213`; `src/garmin.ts:75-180`; CN-29 | D | high / high | Mobile-first competitors never block the calendar on a third party (03 section 3.6) | N12 N24 |
| G-26 | Bilingual copy is mixed inline with no locale switch and no date-format rule; the coach language field exists but the chrome is neither consistently zh-Hant nor consistently English | P8 / all | `src/web.ts:3561`, `:1616`; `src/types.ts:223`; `docs/FEATURES-FOR-REVIEW.md:73` | i18n | medium / high | Runna/NRC localise UI; Milebook has no locale at all (03 section 7.1) | N30 N37 |
| G-27 | Accessibility: no reduced-motion path, no dialog focus trap, no roving focus in the day menu, buttons nested inside links, no `aria-modal` on the peek (the Garmin modal at `src/web.ts:1482` does set it) | P6 P7 P8 / S5 S8 | WF-10, WF-11; `src/web.ts:2299-2304`, `:2022-2146`; `docs/FEATURES-FOR-REVIEW.md:52` | platform | medium / medium | Table stakes; competitors ship OS-level motion settings for free | N5 N12 |
| G-28 | Load/ACWR is a number with a band and no action sentence, and a run cannot be excluded from the trend, so a hot or trail run silently corrupts the read | P2 P3 P7 / S9 | SF-12; `src/training.ts:178-307`; 02 N11/N17/N26 | trust | high / medium | Intervals.icu and Runalyze offer exclusions and custom zones (03 section 1.10) | N11 N17 N26 |

**Counts.** Primary type: D 11, F 12, P 2 (G-08, G-09), i18n 1, platform 1, trust 1; G-01/G-05/G-14 are D+F and
G-24 is D+P. Severity: blockers 2 (G-02, G-09); high 19; medium 7.
The two blockers are structural, not cosmetic: one is missing input, one is a single point of failure in writing.

---

## 5. Journey-stage coverage heatmap (S1-S12)

Rating: `strong` / `partial` / `weak` / `absent`. "Biggest missing step" is the single change that would move the stage
one level, not the whole backlog.

| Stage | Rating | What works | Biggest missing step | Gaps |
|---|---|---|---|---|
| S1 landing / signup | partial | signup/login/profile, per-user store, signed cookie (`src/auth.ts:258-300`) | no first-run path from "I want a half marathon" to a dated block; no reset/verify | G-04, G-22 |
| S2 profile, timezone, goal | weak | timezone end to end (ST-12); goal stored (`src/types.ts:24`) | goal never reaches the prompt and has no date/target; no segment settings | G-01, G-15, G-16 |
| S3 connect Garmin | weak | key save, sync, bell item, enrichment | one working connect path plus an in-place result and a disconnect button | G-03, G-23 |
| S4 first plan | partial | validated batch write, 180-day horizon, repair loop (ST-02/ST-03) | template/import with provenance, a visible horizon and a diff before commit | G-04, G-06, G-09 |
| S5 daily calendar | partial | grid, peeks, month picker, in-place refresh (ST-01) | a today/week surface that works at 360 px, plus a reminder | G-10, G-11, G-12, G-27 |
| S6 pre-run check | weak | session peek with kind/distance/duration/note | intent, effort target, steps, fuel, "why this session" | G-17, G-13 |
| S7 run review | partial | run peek, plan match, program overlay, Ask coach | a judgement sentence and a manual/reported run path | G-18, G-02, G-19 |
| S8 plan adjustment / undo | weak | chat move/delete/batch, audited revert (ST-06) | move/undo buttons plus a "what changed" card | G-05, G-06, G-10 |
| S9 log review | partial | week/month/year, load, splits, PRs, trend (ST-11) | interpretation sentence, exclusions, labelled PR scope, notes/RPE | G-20, G-28, G-18 |
| S10 race week | weak | race-day/week and taper states, interval blocking | a race-week brief, countdown and pacing note on the calendar | G-13, G-01 |
| S11 post-race | weak | post-race state detection | a scheduled reverse taper and a first-week-back rule | G-13, G-19 |
| S12 data and account | absent | read-only pages, audit data exists | export/backup, account deletion, key deletion, revocation, a linked audit | G-21, G-22, G-23, G-24 |

**Coverage shape.** The middle of the funnel (S4-S9) is where the product is real; both ends (S1-S3, S10-S12) are where a
runner decides whether this is a product or a demo. That is the opposite of a normal MVP trade-off and it is the single
most important structural finding in this document.

### 5.1 Missing journeys in detail

1. **Onboarding -> first plan.** Today: signup, profile, then an empty month grid and a bubble. Missing: a goal object
   (date, distance, target time), a template or import, a preview of the block, a horizon note. Exit test: a new account
   reaches a dated 8-week block in under three minutes without typing a free-form prompt. Gaps G-01, G-04, G-06.
2. **First week.** Today: the grid explains pill colours; there is no today card, no reminder, no "what is this for".
   Missing: a today surface, session intent, one nudge. Exit test: on day 3 the runner knows what to run and why without
   opening the month view. Gaps G-12, G-17, G-11.
3. **Race week.** Today: states block intervals; nothing shows the week. Missing: seven dated entries (shakeout, carb
   days, rest, race), goal pace range, logistics note, countdown. Exit test: the race-week plan is readable as a week and
   the coach refuses a long run with an explanation the runner sees. Gaps G-13, G-08.
4. **Post-race.** Today: a state is detected; no artefact, no result capture. Missing: result entry, reverse taper, first
   week back marked easy with no pace targets. Exit test: seven days after the race the calendar holds a return block.
   Gaps G-13, G-19.
5. **Injury return.** Today: pain/return_to_run states, clinician copy, guardrails (a real strength, ST-09/ST-10).
   Missing: a conservative return path expressed as sessions, a "better" definition (pain back to baseline next morning)
   and a way to repeat a week. Exit test: reporting pain changes today's session and the next two weeks, visibly.
   Gaps G-07, G-15.
6. **Data export / delete.** Today: nothing. Missing: JSON/CSV export, ICS, a documented backup, account and key
   deletion. Exit test: a runner can leave with their plan and log in one action. Gaps G-21, G-22, G-23.
7. **Account lifecycle.** Today: signup/login/logout; no reset, verify, revoke or delete. Missing: reset token, session
   list with revoke, delete-with-confirm. Exit test: a stolen cookie can be invalidated from another device. G-22.
8. **Mobile daily use.** Today: responsive panel and bottom-sheet peek; seven-column grid, no manifest, no offline.
   Missing: a week/agenda default under 640 px, a today view, installability. Exit test: 360 px width shows full session
   titles and one tap reaches today's session. Gaps G-11, G-10.

---

## 6. Broken or risky workflows (WF register grouped)

**(a) Bugs and UX traps - mostly one-day fixes unless marked.**
- WF-01 goal dropped (one-day: add facts field + goal row) - G-01.
- WF-03 connect dead ends (one-day: fix the card link, remove the dead binding, mount the modal once) - G-03.
- WF-04 sync result discarded (one-day: render `synced`/`syncError` as an inline banner) - G-03.
- WF-06/WF-24 ephemeral review card and false "New run synced" (one-day: persist the card by activity id and check recency) - G-18.
- WF-08 inert sessions (structural: needs a session page or peek from every surface) - G-10.
- WF-09 invisible horizon (one-day: put `HORIZON_DAYS` in the bubble header, which is what README already claims) - G-04.
- WF-11 nested interactive elements (one to two days: flatten the cell markup, add focus trap) - G-27.
- WF-12 double pull after manual sync (one-day: call `resolveSession` in both routes) - G-03.
- WF-18 trend truncation (one-day: caption "last 12 runs" or plot the period) - G-20.
- WF-19 device-timezone timestamps (one-day: format in profile timezone) - G-26.
- WF-22 seven-column phone grid (structural: layout mode) - G-11.
- WF-26 malformed `month` returns 500 (one-day: validate like `/calendar/data`) - G-03.

**(b) Trust debt - the machinery exists, the runner cannot see it.**
- WF-07 undo with no history or affordance (structural-ish: history panel plus button; one day for the button alone) - G-05.
- WF-13 sensitive confirm vanishes on refresh (structural: persisted card or bell item; the safety half is not optional) - G-07.
- WF-14 ordinary states activate silently (one-day: show a non-blocking "state changed" chip with an undo link) - G-07.
- WF-15 guardrails explained after the fact (one to two days: label read-only turns on the control and show the blocking state in the composer) - G-08.
- WF-17 PR scope unstated (one-day: a scope note next to the badge) - G-20.
- WF-20 audit unlinked and ungated (one-day: link it, add an explicit operator flag or rename the page) - G-24.
- WF-05 silent sync plus blocking render (structural: decouple render from Garmin, add timeout and stale-cache fallback) - G-25.
- WF-02 no manual entry: trust debt in the strict sense - the UI claims "reported runs" that cannot exist (structural) - G-02.

**(c) Dead ends - the runner has no next step at all.**
- WF-16 model outage freezes writing (structural: deterministic fallback planner or a direct edit path) - G-09.
- WF-21 no reset/delete/revoke (structural, but reset alone is one to two days) - G-22.
- WF-23 empty states with no CTA (one-day, once G-03 and G-02 exist to link to) - G-03.
- WF-25 no streaming/cancel/timeout (structural: SSE plus abort; the client timeout alone is one day) - G-25.
- WF-27 plan model cannot express strength or race support (structural: schema plus kinds) - G-14, G-13.
- WF-10 no reduced motion (one-day: media query plus a class toggle) - G-27.

**Tally.** 12 one-day fixes, 5 one-to-two-day, 10 structural. The cheap set (WF-01/03/04/09/12/18/19/26/24/17/10) is
worth roughly a week and removes most of the "demo smell" without touching architecture. That is the single best
return-on-effort in this analysis, and it is only cheap because the underlying capabilities already ship (ST-01..ST-12).

---

## 7. Non-functional coverage

**Mobile / responsive.** No manifest, no theme-color, no service worker, no offline shell (`src/web.ts:1609-1610`); grid
is `repeat(7, ...)` with 104 px min cell height at all widths (`src/styles.ts:38`, `:70`); only the coach panel and the
peek adapt below 640 px. At 360 px a cell is about 45 px, so pills truncate and the tooltip is the only full text
(WF-22). Rating: weak. This is the highest-urgency table stake in 03 section 7.2.

**Accessibility.** No `prefers-reduced-motion` or `matchMedia` in `src/` while the grid animation is the loudest feature
(`src/web.ts:1790-1846`); peek is `role="dialog"` with `tabIndex=-1` but no `aria-modal` and no focus trap, and its
`aria-labelledby` target does exist (`src/web.ts:2299-2304`); day menu is `role="menu"` with plain buttons and no roving focus
(`src/web.ts:2022-2146`); day cell is an `<a>` containing `role="button"` spans (`src/web.ts:3628`, `:367-380`). Keyboard
users can Tab behind an open dialog. Rating: weak, medium severity, and the fix is small (WF-10/WF-11).

**Performance.** `/calendar` awaits `autoSync` and `enrichCalendarWorkouts` before sending HTML; `/history` awaits
`autoSync`; `/activity/<id>` awaits up to three serial Garmin calls; Garmin requests carry no `AbortSignal` or timeout
(`src/garmin.ts:75-180`); the only timeout in the system is the 120 s model abort (`src/gateway.ts:212-213`). No
skeleton, spinner or stale-cache fallback. On a slow link the front door reads as broken (WF-05). The bubble has no
streaming, cancel or client fetch timeout (WF-25). Rating: weak, high severity for perceived reliability.

**Privacy / security.** Real strengths: private by design, no feed, no segments, per-user rows, HMAC-signed cookie
(`src/auth.ts:240-246`), same-origin state POST checks, gateway bound to loopback (`README.md:326-327`). Real debt:
Garmin key plaintext in SQLite (`src/store.ts:110-113`) with no delete statement; no cookie revocation, so a copied
cookie works for 30 days; `/coach-audit` is not role-gated (`src/web.ts:3060-3070`); no rate limit or reset flow; error
page leaks the raw exception (`src/web.ts:3891`, JSON detail at `:3312`; the old `:3330-3334` anchor was the `?month=` validator). Rating: mixed. The architecture is good; the lifecycle is not.

**Safety / ethics.** Sensitive states are never inferred (ST-10), guardrails are hard-enforced over the post-turn
calendar (ST-09) and clinician copy exists. But the consent control is DOM-only (WF-13), ordinary states change
guardrails silently (WF-14), and there is no written no-weight/no-calorie policy even though the data model currently has
no body fields (`src/types.ts:9-24`) - that omission is a strength to protect, not an accident to build on. No
non-clinical ease-off path exists (N43, C8). Rating: strong mechanism, weak consent surface.

**Data lifecycle.** No export or backup (CN-15); PR/best-effort scope is stored-history-only (100 activities / 90 days,
`README.md:344`) and unlabelled on screen (WF-17); no user delete; no Garmin key delete; change sets are append-only and
audited (ST-06) but invisible to the runner; 180-day state retention is documented. Rating: weak. For a product whose
pitch is ownership, this is the most ironic gap in the set.

**i18n.** Inline zh-Hant strings beside English ones (`src/web.ts:3561`), an emoji in the primary chrome
(`src/web.ts:1616`), `CoachLanguage = auto | en | zh-Hant` in types (`src/types.ts:223`) with no locale switch, no date
format rule, no pluralisation and no `lang` change (`<html lang="en">` at `src/web.ts:1609`). Rating: weak, medium
severity, cheap to improve because the coach already has a language field.

**Performance measurement gap (review 06 F-22).** This audit is static: it reads code structure and absences (no
manifest, no client fetch timeout, serial Garmin calls before HTML), not measured page weight, TTFB or 360 px layout.
Before claiming a fix works, measure: HTML and CSS bytes per route, server response time with Garmin healthy and stalled,
main-thread cost of the CRUD animation, and the grid at 360/390/768 px. No such numbers exist in this package.

---

## 8. What Milebook already does better - protect list

| Protect | Why it is rare (03) | What must not break |
|---|---|---|
| ST-01 calendar-first bubble edits in place | No competitor writes the calendar from chat (O1) | Never split into a separate chat thread; never let a change land off-calendar |
| ST-02 server validation before an atomic write | Competitors either generate or host, not validate writes | A new edit path (G-09/G-10) must reuse the same validator, not bypass it |
| ST-03 one bounded repair with structured feedback | Unique; keeps failure honest instead of dead | Do not add an unbounded agent loop while adding tools |
| ST-04 typed intents and enforced write permission | Unique; prevents prompt-smuggled writes | New surfaces must send intents, never hidden prose |
| ST-05 idempotent turns with directive-hash binding | Unique; makes retry safe | Diff/approve (G-06) must keep the same idempotency key |
| ST-06 every batch reversible and audited | Differentiator, currently invisible | A history UI must read the journal, not duplicate it |
| ST-07 day-scoped plan matching | Honest "unplanned"/"not matched" | Manual entry (G-02) must not relax same-day matching |
| ST-08 executed-workout overlay, best-effort | Unique pairing of run and program | Decoupling render from Garmin (G-25) must not drop the overlay |
| ST-09/ST-10 durable states, hard guardrails, never-inferred sensitive states | No competitor documents consent semantics (O3) | Persisting confirm cards (G-07) must not auto-confirm or infer |
| ST-11 honest missing-data copy | Trust asset, cheap to keep | New metrics must ship with an honest empty state |
| ST-12 timezone-correct "today" | Rare and easy to lose | New reminder/today surfaces must use `src/time.ts`, not device time |
| Read-only past | Prevents the coach rewriting history | Race/post-race artefacts (G-13) must not write into past days |

**One-line rule for every improvement in 05:** if a change makes a write path less validated, less reversible or less
auditable, it is wrong even if it is faster.

---

## 9. What not to build

| ID | Not now | Why |
|---|---|---|
| NB-1 | Strava or a second activity source | Explicit non-goal (`README.md:308-309`); conflicts with the privacy niche (O6); 02 G3/G4 show no demand evidence strong enough; manual entry (G-02) captures most of the value at 1% of the cost |
| NB-2 | Social feed, segments, leaderboards, kudos | Direct contradiction of the private positioning and a safety liability (N41, C5); 03 calls O6 a positioning option, not a proven opportunity |
| NB-3 | Payments, subscriptions, coach marketplace | Non-goal; 02 G2 shows no decision-grade willingness-to-pay evidence; adding billing before the wedge is validated spends the scarcest effort on the least-evidenced bet |
| NB-4 | Wellness/HRV/sleep ingestion | Non-goal and a data-rights surface; states already accept self-report; 03 section 7.2 says integrate only if it changes a decision - it currently would not |
| NB-5 | Clinical advice, injury diagnosis, RED-S screening, calorie or weight targets | Safety and legal risk with no clinical evidence base (02 G6/G8/G9); signpost to a clinician instead. Keep the current absence of body fields (`src/types.ts:9-24`) as policy |
| NB-6 | Two-way external calendar sync (Google/Outlook) | Non-goal; 02 G3 has one thread of evidence. Read-only ICS export (part of G-21) captures the ownership benefit without a sync engine |
| NB-7 | Native iOS/Android apps | A PWA closes the table-stakes gap (G-11) at a fraction of the cost; native is a distribution bet, not a runner need |
| NB-8 | AI route generation, maps, live location sharing | Creates exactly the privacy/safety exposure N41 and C5 warn about, with no training benefit |
| NB-9 | Open-ended agent loop / autonomous background replanning | Breaks ST-03's bounded repair and ST-04's write permission; the audit story depends on one bounded turn |
| NB-10 | Coach/multi-tenant view | Non-goal (`README.md:308`); 02 G10 shows no coach research; export (G-21) is the cheap hedge |

---

## 10. Owner decisions required (Q-01..Q-12 -> recommended answer)

| Q | Decision | Recommendation (1-2 lines) |
|---|---|---|
| Q-01 | Manual entry: decision or oversight? | **Product decision, and the wrong one.** The `"chat"` source and "Reported" chip are intent; ship a minimal "log my run" path in slice 1 and keep same-day matching (G-02). |
| Q-02 | Goal -> prompt facts, goal-race object, or both? | **Both, in that order.** Facts first (one field, one day), then a goal object with date/distance/target time because a countdown needs a date, not text (G-01, G-13). |
| Q-03 | Is coach-only writing acceptable during model downtime? | **No.** Add a deterministic fallback planner or a validated direct-edit path; a planner that stops when a model stops is not a planner (G-09). |
| Q-04 | Must sensitive confirmation survive refresh? | **Yes, non-negotiable.** Persist as a bell item plus a bubble card; a safety control that a reload removes is a defect, not a UX choice (G-07). |
| Q-05 | Is the 180-day horizon a constraint to surface or an implementation detail? | **Surface it.** README already claims it is in the bubble header; either render it or correct the doc. Surfacing is one line (G-04). |
| Q-06 | Mobile story: responsive grid, week/agenda, or PWA? | **Week/agenda default under 640 px plus a manifest; PWA shell after.** The grid is a planning tool, not a daily-use tool (G-11, G-10). |
| Q-07 | Label PR scope or extend history? | **Label now, extend later.** A one-line scope note costs nothing; a lifetime records page is a separate slice (G-20). |
| Q-08 | Is `/coach-audit` an operator tool or a runner page? | **Both, split.** Keep an operator view behind a flag and add a runner-facing "what changed" card in the calendar; do not call the current page owner-only (G-24). |
| Q-09 | Account-lifecycle bar for this PoC? | **Reset plus delete plus revoke, minimum.** Documented PoC-grade is not enough once a real runner's data is on the box (G-22). |
| Q-10 | Should Garmin be disconnectable without OAuth? | **Yes.** A delete-key action plus at-rest encryption or an env-held key; a plaintext credential with no revoke is the worst combination (G-23). |
| Q-11 | Which missing surfaces are deliberate non-goals? | **Export/backup is in scope; external sync, payments, social, wellness are not.** The current backlog mixes "later slice" with "not in scope" and that ambiguity is the problem (G-21, section 9). |
| Q-12 | Does the plan need non-running kinds? | **Yes, minimally.** Add `strength` and `mobility` as kinds with no distance target, or stop promising strength sessions in `strength_focus` (G-14). |

---

## 11. Traceability appendix

**N -> G.** N1 G-01/G-04/G-09; N2 G-13; N3 G-04; N4 G-09/G-10; N5 G-11/G-17/G-27; N6 G-17/G-28; N7 G-17;
N8 G-02/G-18; N9 G-18; N10 G-20; N11 G-28; N12 G-11/G-12; N13 G-15/G-19; N14 G-12; N15 G-20; N16 G-07; N17 G-28;
N18 G-07/G-10; N19 G-14; N20 G-13; N21 G-13; N22 G-13/G-08; N23 G-13; N24 G-03/G-18/G-25; N25 G-02; N26 G-28;
N27 G-16; N28 G-17/G-28; N29 G-10; N30 G-08; N31 G-17; N32 none (NB-2); N33 G-08/G-19; N34 G-21/G-22/G-23;
N35 G-05/G-24; N36 G-06; N37 G-22/G-24/G-26; N38 G-15; N39 G-15; N40 G-07; N41 G-23; N42 G-07; N43 G-07/G-19.

**G -> N / WF / CN.** G-01 N1 N2 N3 / WF-01 / CN-10. G-02 N8 N12 N25 / WF-02 WF-23 / CN-01 CN-02.
G-03 N24 / WF-03 WF-04 WF-12 WF-26 / CN-26. G-04 N1 N3 / WF-09 WF-23 / CN-07 CN-08.
G-05 N35 / WF-07 / CN-04. G-06 N36 N4 / WF-07 / CN-11. G-07 N16 N18 N40 N42 N43 / WF-13 WF-14 / CN-25.
G-08 N30 N33 N35 / WF-15 / CN-03. G-09 N1 N4 N29 / WF-16 / CN-03. G-10 N4 N18 N29 / WF-08 / CN-03 CN-08.
G-11 N5 N12 N27 / WF-22 / CN-16. G-12 N12 N14 / none / CN-05. G-13 N2 N20 N21 N22 N23 / WF-27 / CN-10.
G-14 N19 / WF-27 / CN-09. G-15 N13 N38 N39 / none / CN-09. G-16 N27 N12 / WF-22 / none.
G-17 N5 N6 N7 N28 N31 / WF-08 / CN-17. G-18 N8 N9 N24 / WF-06 WF-24 / CN-02. G-19 N13 N33 N43 / WF-08 / none.
G-20 N10 N15 / WF-17 WF-18 / CN-22. G-21 N34 N37 / none / CN-15. G-22 N34 N37 / WF-21 / CN-12 CN-13 CN-14.
G-23 N34 N41 / none / CN-26. G-24 N35 N37 / WF-20 / CN-25. G-25 N12 N24 / WF-05 WF-25 / CN-29.
G-26 N30 N37 / WF-19 / none. G-27 N5 N12 / WF-10 WF-11 / none. G-28 N11 N17 N26 / WF-17 / CN-21.

**Orphan check.** Every G has at least one N and at least one WF or CN except G-12 (CN-05), G-15 (CN-09), G-21 (CN-15),
G-26/G-27/G-28 (WF-19/WF-10/WF-17). Every N except N32 (deliberate non-goal) maps to at least one G. Every WF except
WF-23 (empty-state dead end, folded into G-03/G-04) maps to a G. Every CN except CN-18/19/20/23/24/27/28/30 maps to a G;
those seven are deferred log depth or explicit non-goals (section 9) and are recorded here as "known and accepted" rather
than as gaps.
