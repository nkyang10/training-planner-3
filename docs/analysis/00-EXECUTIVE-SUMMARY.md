# POC3 - executive summary: runner workflow, runner needs and the next slice

**Status:** decision document; first slice implemented. **Date:** 2026-11-18.
**Audience:** the POC3 owner and anyone deciding what to build next.
**Inputs:** `01-user-workflow-map.md`, `02-runner-needs-research.md`, `03-competitive-benchmark.md`,
`04-gap-analysis.md`, `05-improvement-backlog.md`, `06-review-report.md`; code at HEAD; 46 runner-research sources and
68 competitive-benchmark sources, all accessed 2026-11-18.
**Method:** five producer agents (workflow map, runner-needs research, competitive benchmark, gap analysis, improvement
backlog) plus one adversarial reviewer, coordinated by the root agent. The analysis was read-only. A later implementation
pass changed code and is recorded in `07-implementation-plan.md`.

**Implementation status (2026-11-18).** The first slice is implemented: reported-run logging, goal in the coach prompt,
visible recent changes with an Undo button, pending-state replay after refresh, Garmin connect repair and key deletion,
session intent, neutral missed copy, PR/trend/month labels, timezone-aware bell timestamps, JSON/ICS export and reduced
motion. `pnpm check` passes with 331 tests in 14 files; the live process is redeployed. The analysis below remains the
evidence; the change log is 07.

---

## 1. The answer in one page

POC3 is not a thin demo. The loop that matters -- a runner talks to a coach, the coach edits a visible calendar, the
server validates the write, and the runner can undo it -- is real, enforced and unusually well built. The training-log
and run-detail depth is at parity with paid products. The coaching-state engine is a genuine safety and trust asset.

But as a **daily runner product**, the workflow is incomplete in five structural ways, and two of them are blockers:

| # | Structural gap | Why it is structural | Evidence |
|---|---|---|---|
| 1 | **The completion half is Garmin-only** | `appendActivity` has exactly one caller, the Garmin sync. A treadmill, commute, phone-only or cautious return-to-run session cannot be recorded. The "Reported" chip and the `"chat"` activity source exist but nothing creates one. | WF-02, CN-01/02, G-02, `src/garmin-sync.ts:165` |
| 2 | **Coach-only writes make one model the availability of the whole planner** | There is no edit form, no direct move and no deterministic fallback. If the model is down or returns invalid JSON, add/move/delete freeze. The coach is the only writer by design, which is a product decision that now has an availability cost. | WF-16, CN-03, G-09, Q-03, `src/gateway.ts:1074-1081` |
| 3 | **There is no mobile story** | No manifest, no service worker, no installable app, and a fixed seven-column month grid under 640 px. Calendar-first is phone-first; this is the largest table-stakes gap versus every competitor except Intervals.icu. | WF-22, CN-16, G-11, `src/web.ts:1609-1610`, `src/styles.ts:38` |
| 4 | **The trust machinery is invisible** | Undo exists but only through chat; there is no change-history panel, no diff before a multi-session write, and the audit page is unlinked and not role-gated. POC3's strongest differentiator currently feels like opacity. | WF-07/20, CN-04/11, G-05/G-06, ST-06, O1/O4 |
| 5 | **Race week and the account lifecycle have no artefacts** | Race day/week/taper/post-race exist as guardrails, not as a countdown, briefing, pacing plan or return block. There is no export, no backup, no account deletion, no password reset, no cookie revocation and no Garmin-key deletion. | WF-21/27, CN-10/12/13/14/15, G-13/G-21/G-22 |

Three smaller but high-leverage findings sit on top of these:

- **Onboarding drops the goal.** The runner types a training goal at signup/profile; `buildCoachPrompt` has no goal
  field. The only consumer is `plan_stale` detection. The product asks for the one fact that would personalise the coach
  and then ignores it. (WF-01, G-01)
- **Sensitive-state confirmation is DOM-only.** A proposed pain state lives in the bubble; refresh and it is gone, so
  the safety path depends on not reloading. (WF-13, G-07)
- **Four documentation drifts.** The 180-day horizon is not in the bubble header; the audit page is described as
  "owner-only" but is per-runner, not role-gated; reduced motion is not implemented; the bell is more than a sync feed.
  These are documentation drift, not code regressions, but they matter before a demo. (04 section 1.1, 06 F-04..F-10)

---

## 2. What was analyzed

| Dimension | Scale |
|---|---|
| Code surface | `src/` at HEAD: 3,903-line `web.ts` (routes + inline client script), 1,160-line gateway, coach, directives, states, training, Garmin, store, auth |
| User-facing surfaces | 23 (calendar, three peeks, day page, three log views, trend/load cards, activity detail, coach bubble, states page, audit page, notifications, Garmin key/sync, auth/profile, errors, empty states, keyboard/aria, responsive, performance) |
| Journey stages | 12, from signup to data/account management |
| Personas | 8 (beginner, race-focused, Garmin power user, non-Garmin, returning from injury, time-crunched, masters, bilingual) |
| Runner needs | 43, in 13 families, from 46 public sources |
| Competitors | 12 products plus adjacent behaviours (Google Calendar, Sheets, paper plans, WhatsApp coaching groups) |
| Verified cannot-do tasks | 30 |
| Workflow frictions | 27 |
| Gaps | 28 |
| Ranked improvements | 24, plus 8 sub-one-day quick wins |
| Reviewer checks | code anchors, cited URLs, id traceability, consistency and coverage (06) |

The evidence hierarchy is: code anchors > product docs > runner-research sources > competitor marketing. Where the docs
and the code disagree, the code wins and the disagreement is recorded.

---

## 3. Workflow health scorecard

Ratings: **strong** = better than the market and hard to lose; **workable** = the job gets done with friction;
**partial** = only part of the job is possible; **weak** = a dead end or a promise without a mechanism.

| Stage | Rating | Strongest part | Biggest gap |
|---|---|---|---|
| S1 Landing / signup | workable | Standalone accounts, scrypt, signed cookie, per-user isolation | No verification, no reset, no onboarding after signup |
| S2 Profile, timezone, goal | workable | Timezone is used consistently end to end | Goal is stored but never reaches the coach; no goal-race object |
| S3 Connect Garmin | partial | Personal-key verification and upsert sync | Three dead ends around the only data connection; manual sync result discarded |
| S4 First plan creation | workable | Natural-language batch booking with validation | No templates, no plan import, no fallback when the model fails |
| S5 Daily calendar use | strong | Month grid, pills, three peeks, in-place refresh, keyboard support | No direct edit, no week/agenda view, no phone layout |
| S6 Pre-run check | partial | Session peek shows kind, distance, duration, note | No intent, effort target, steps or pre-run brief |
| S7 Run review | strong | Peek, detail, splits, laps, HR zones, PRs, executed-workout overlay | Garmin-only; the new-run review card is ephemeral |
| S8 Plan adjustment / undo | workable | Validated add/move/delete/revert with before/after change sets | Undo has no button, no history, no diff; guardrails explained only after refusal |
| S9 Training-log review | strong | Week/month/year, load/ACWR, hard-easy, metric trend, best efforts | Planned chips are inert outside the grid; trend silently truncates |
| S10 Race week | partial | Race-week/taper states and hard guardrails | No countdown, goal time, briefing, pacing or logistics |
| S11 Post-race | weak | Post-race state blocks hard sessions | No race report, no return block, no link between race and plan |
| S12 Data and account management | weak | Profile, key replacement, states, sign out | No export, backup, deletion, reset, revocation or key deletion |

The pattern: **the middle of the journey is strong, the edges are weak**. POC3 is excellent at "I have a plan and I ran;
show me both", and weak at "I am new", "I am on my phone", "I am in race week", "I want my data out" and "something
went wrong".

---

## 4. Runner needs: the top ten and how POC3 fits

Ranking from 02 section 10 (frequency x severity x strategic fit x evidence strength, out of 20).

| Rank | Need | What it means | POC3 fit | Verdict |
|---|---|---|---|---|
| 1 | N4 Re-plan without rebuilding | A changed week must not force a new block | Move/delete/batch primitives exist | partial: UX and diff missing |
| 2 | N29 Reschedule a week in seconds | The most common calendar interaction | Chat-only; no direct manipulation | partial |
| 3 | N8 Frictionless completion and matching | The calendar must agree with reality | Strong for Garmin runs and programs | partial: no manual entry, no match correction |
| 4 | N1 Goal-to-calendar plan | Commit to a race, see the block | Core bet, already calendar-first | partial: goal dropped, no templates/import |
| 5 | N24 One source of truth | No second spreadsheet or app | Garmin upsert and pairing are solid | partial: single source, no manual data |
| 6 | N37 AI memory, evidence and limits | The coach must not forget or invent | States, directives, audit and validation exist | partial: memories invisible, audit unlinked |
| 7 | N13 Missed-run guilt and make-up miles | Let a missed run go | Missed outcome exists | partial: copy and defaults not designed for it |
| 8 | N6 Effort and pace guidance in conditions | Convert intent into a realistic target today | Heat/travel states exist | missing: no effort target in the peek |
| 9 | N16 Pain: modify or stop | Back off with a way back | Pain/illness/return states with guardrails | partial: confirmation does not survive refresh |
| 10 | N9 Plan-versus-actual feedback | Was the session's intent met? | Same-day matcher is honest | partial: no judgement sentence, no correction |

Outside the top ten but decision-relevant: N20 race-week execution (seasonal, urgent once race goals ship), N27
fit-around-work-and-kids (critical for time-poor parents), N38 beginner permission to repeat, N36 approve-before-apply
(needed before any destructive multi-session write), N42/N43 body image and burnout (safety copy is the minimum).

The research is explicit that these are evidence-volume signals, not prevalence. Forum participants self-select,
English-language sources dominate, and watch owners are over-represented. A quota survey and a handful of interviews
would be needed before treating the ranking as market sizing.

---

## 5. Competitive position

| Position | Capabilities |
|---|---|
| **Alone (or nearly)** | AI that edits the calendar with proof: validated writes, before/after change sets, undo, hidden directives, comment-only enforcement, audit. Executed-workout overlay (the Garmin workout a run followed). Guardrailed coaching states with consent semantics. No benchmark product ships this combination natively. |
| **Parity** | Training log depth, load/ACWR, hard/easy, splits, laps, HR zones, PRs, metric trends. This is good enough to be credible and not enough to differentiate. |
| **Behind / absent** | Mobile/PWA, reminders, plan templates and plan import, export/backup, wearable breadth, strength sessions, social/community, coach view, race-day logistics, onboarding, business model. |

The market context matters: free plans (Garmin, Nike, COROS), free logs (Strava, TrainingPeaks Basic, Intervals.icu) and
cheap AI summaries (Garmin Connect+, Strava) set the floor. "AI insights" is not a differentiator. **Conversational
control with proof** is. The competitive risk is not that someone copies the calendar; it is that Strava+Runna or Garmin
makes AI plan-writing ordinary while POC3 is still web-only and Garmin-only.

---

## 6. The top ten improvements

From 05 section 2. Score = runner impact x evidence strength x strategic fit; effort S = one day or less, M = 2-4 days,
L = 1-2 weeks.

| Rank | ID | Improvement | Effort | Slice | Why it matters |
|---|---|---|---|---|---|
| 1 | I-01 | Log a run without a watch | M | 1 | Removes the completion blocker; opens P1/P4/P5/P6 |
| 2 | I-03 | "What changed" card plus a real undo button | M | 1 | Makes the strongest differentiator visible; the journal already exists |
| 3 | I-05 | Sensitive confirmation that survives refresh | S | 1 | Safety path must not depend on not reloading |
| 4 | I-02 | Goal reaches the coach and becomes a goal object | S | 1 | Fixes the onboarding promise; enables race week |
| 5 | I-09 | Week/agenda view under 640 px plus a manifest | M | 2 | Closes the mobile table-stakes gap |
| 6 | I-06 | Deterministic fallback planner | L | 3 | Removes the single-model availability blocker |
| 7 | I-04 | Diff preview and approve before a multi-session write | L | 2 | Makes destructive coach writes reviewable |
| 8 | I-08 | Open, move and edit a session from every surface | M | 2 | Blocks needs N4 and N29; the calendar becomes direct |
| 9 | I-07 | Session intent and effort target in the peek | S | 1 | Answers "what is this for?" at the point of running |
| 10 | I-12 | Garmin connect: one working path and a visible result | S | 1 | First-run task of a data product currently fails silently |

The top four are all slice 1 and all defect-or-trust work. They are cheap because the hard parts already ship:
validation, change sets, state guardrails, the calendar projection.

---

## 7. Three delivery slices

| Slice | Goal | Contents | Exit criteria | Effort |
|---|---|---|---|---|
| **1 - Make the demo honest** | A new runner can state a goal, connect Garmin or log a run by hand, see what changed, undo it, and trust a pain confirmation after reload | I-01, I-02 (facts half), I-03, I-05, I-07, I-12, I-18, I-19, I-20 plus the 8 quick wins | Reported run appears and matches; goal in the prompt; undo reachable without chat; pending sensitive proposal survives reload; peek states intent; Garmin connect has one path and an inline result; PR scope and trend window labelled; no dead CTA | 6-8 days |
| **2 - Phone and race week** | Usable on a phone; race season has a visible artefact; destructive writes reviewable; data can leave | I-09, I-08, I-10, I-11, I-04, I-13, I-15, I-17, I-22 | Week view complete at 360 px and installable; sessions open/move everywhere; one reminder; race week as seven dated entries with pace range; multi-session turn writes nothing before approval; JSON/CSV/ICS export; key deletable | 9-11 days |
| **3 - Lifecycle and segments** | Account can be closed and secured; coach still plans when the model is down; beginner and zh-Hant runners have a starting point; calendar never blocks on Garmin | I-06, I-14, I-16, I-21, I-23, I-24 | Fallback planner validates a week with the model down; reset/revoke/delete cascade; one named template with provenance; consistent language; beginner mode can repeat a week; HTML sent before Garmin enrichment | 12-15 days |

The eight quick wins are one focused day: goal in prompt facts, render the horizon, fix the Garmin setup link and dead
binding, render sync result params, add `prefers-reduced-motion`, caption the trend window, format bell timestamps in the
profile timezone, and add a PR scope note plus `?month=` validation.

---

## 8. What not to build (for now)

- **Strava, social, payments, wellness/HRV, clinical advice, native apps, route maps, external two-way calendar sync.**
  Explicit non-goals or safety liabilities. Export is the cheap hedge for data ownership; a read-only source is the only
  defensible future Strava move.
- **Drag-and-drop rescheduling.** A move action plus diff/approve captures the need at a fraction of the risk.
- **PDF/Sheets plan import.** High value, but parse errors place wrong dates silently; it needs diff/approve and a
  provenance schema first.
- **Streaming coach replies.** Real but expensive; a client abort and a visible progress state cover the perceived
  problem first.
- **Conversation summarisation.** A prompt-limit problem, not a runner problem; solve it when a real history hits the
  limit.
- **A full accessibility audit or screen-reader certification.** Do the cheap pass now; commission the audit when a real
  assistive-technology user is in the validation set.

---

## 9. Decisions needed from the owner

| # | Decision | Recommendation | Cost of delay |
|---|---|---|---|
| D1 | Is manual activity entry in scope, or is Garmin-only the product? | Build it in slice 1. The vocabulary already exists; the gap excludes four personas. | The completion half stays device-only; the log is not honest. |
| D2 | Coach-only writes or a deterministic fallback planner? | Keep the coach as the default writer, add a validated fallback in slice 3, and add direct edit/move in slice 2. | One model outage freezes the planner. |
| D3 | Is mobile a PWA now or a native app later? | PWA in slice 2; native only after the wedge is validated. | The product is unusable at the track. |
| D4 | Is undo a chat instruction or a visible control? | Visible "what changed" card plus undo in slice 1; keep chat undo as well. | The differentiator stays invisible. |
| D5 | Does the profile goal become a goal-race object? | Yes: a date, a distance, a countdown, a plan end date. Text alone cannot drive race week. | Race week remains a guardrail, not a product. |
| D6 | What is the account-lifecycle bar for this PoC? | Export and key deletion in slice 2; reset/revoke/delete in slice 3. | "Your data is yours" is not literally true. |
| D7 | Should sensitive-state confirmation persist? | Yes, slice 1. It is a safety path, not a feature. | A reload can silently drop a pain confirmation. |

These map to Q-01..Q-12 in 01 section 9 and the recommended answers in 04 section 10.

---

## 10. Evidence quality: what to trust

**Decision-grade:**
- The workflow map (01). Every claim has a code anchor; 22 anchors were independently spot-checked in 04 and more in 06.
- The gap analysis (04) and backlog (05) for scope and sequence. Acceptance criteria are testable and code touchpoints
  are real.
- The competitive position on features and pricing (03), with the caveat that vendor pages overstate and prices change.

**Directional, not decision-grade:**
- The need ranking (02). It is desk research, not a survey. Frequency is an evidence-volume judgement, not prevalence.
  Willingness to pay, Chinese-language runners, phone-only runners, ultra/trail and clinical thresholds are not covered.
- Market size and business model. The package explicitly does not size the market.

**Known documentation drift (fix before demo):**
- M1: README says the 180-day horizon is shown in the bubble header; it is not rendered.
- M3: README calls `/coach-audit` "owner-only"; it is scoped to the signed-in runner, not a role.
- M4: docs promise reduced-motion support; no media query exists.
- M5: 03's "bell is sync feed only" understates manual no-new and error items.

The reviewer withdrew a fifth candidate mismatch (manual sync double-pull): `/sync` passes `syncOnStart=false`, so the
product doc is correct. 01's WF-12 remains a low-severity edge case, not a contradiction: the second pull needs the
redirect GET to create a new session (server restart or a cookie older than 24 h). See 06 F-07.

---

## 11. Bottom line

POC3's differentiated core is already built: the coach can edit the calendar, the server can prove what changed, the
states can say no, and the log can show what actually happened. The product's problem is not invention; it is
**exposure and completion**. Slice 1 makes the demo honest and trustworthy. Slice 2 makes it usable on a phone and
credible in race week. Slice 3 makes it safe to operate for real accounts. The highest-leverage work is to make what
already exists visible, correctable and portable -- not to add another dashboard.

---

*Package index and reading paths: [README.md](README.md). Evidence documents: [01](01-user-workflow-map.md),
[02](02-runner-needs-research.md), [03](03-competitive-benchmark.md), [04](04-gap-analysis.md),
[05](05-improvement-backlog.md), [06](06-review-report.md).*
