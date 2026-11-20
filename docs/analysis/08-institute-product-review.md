# Milebook - institute product review: effort, happiness, structure

**Status:** decision document for the owner; review only, no code changed. **Date:** 2026-11-18.
**Lens:** whole-product review written from the seat of a senior product designer at an international professional
sport institute for runner management and coaching - the disciplines that view a training product as an athlete
system (periodization, load monitoring, athlete monitoring, coach operations), not a feature list.
**Inputs:** the analysis package 00-07 (workflow map, 43 runner needs from 46 sources, 12-product competitive
benchmark, gap analysis, ranked backlog, adversarial review, implementation record); `MILEBOOK-CALENDAR.md`,
`TRAINING-LOG-PLAN.md`, `COACH-STATES.md`, `FEATURES-FOR-REVIEW.md`; code at HEAD with spot-verification of the two
claims this review leans on hardest (training-load computation in `src/training.ts:207-216` and `:231-266`, reported-
run fields in `src/manual-activity.ts:81-95`); and an independent vision-model first-impression critique of the eight
design screenshots (DeepSeek-V4.1-Flash-TF, lane llm-main), distilled in section 11.
**Relation to 00-07:** this document accepts their evidence and their verdict ("exposure and completion, not
invention") and does not re-litigate it. It adds the layer the workflow analysis deliberately did not cover: product
thesis, the coaching loop as a system, inbound/outbound architecture, emotional design, business hypotheses, metrics,
and a design constitution. Existing ids (I-xx, N-xx, G-xx, D1-D7) are reused; new items carry `PR-xx`; new owner
decisions continue the numbering (D8-D14).
**Owner directive (2026-11-18, after this review):** the coach's persona is a consultant and friend - pull-based,
option-offering, evidence-giving, never a pusher or teacher - with involve-the-coach actions at every decision
point. It is specified, anchored to `COACH_RULES`, and given its own decisions (PR-15, D15-D18) in
[`09-coach-relationship-model.md`](09-coach-relationship-model.md); section 8's I-04 rises to the decision
primitive of that relationship.

---

## 1. The verdict in one page

Milebook has already built the part most products fake: **a coach whose edits are validated, auditable, reversible and
guardrailed, and a log that tells the truth about what happened**. The coaching-state engine (34 states, consent
semantics, hard guardrails) is ahead of anything in the 12-product benchmark, and the executed-Garmin-workout overlay
is unique in the market. The middle of the journey - "I have a plan and I ran; show me both" - is strong.

Judged against the owner's three words, the product is a different class of thing at the session level than at the
season level:

| The owner's ask | Honest verdict | The binding constraint |
|---|---|---|
| **Effort** - every unit of work converts into fitness | Partial: intelligent sessions, blind season | The plan has no macro structure: no goal-race object, no training block, no progression verdict, no testing. And the load signal is source-biased: a run logged by hand contributes **zero** to load, ACWR and hard/easy (verified: `src/training.ts:207-216` reads only Garmin `trainingLoad`; `src/manual-activity.ts:81-95` sets none), so the runner who trains hardest off-Garmin sees "No load data". |
| **Happiness** - the runner stays in love with the sport | Partial: trust without joy | Autonomy is excellent (undo, user-set states win, honesty labels), competence is partial (stored-history PRs, no progress narrative), and **relatedness is zero by design** (no recap to feel proud of, nothing shareable, no human in the loop). The emotional surface is two compassionate copy lines, not an emotional design. |
| **Structured** - the plan is legible and lives over time | Strong at the week, absent at the season | Calendar-first is the right structure bet, and the state engine encodes lifecycle (race week, taper, post-race) as guardrails - but they produce no artifacts (no countdown, no brief, no return block), and month/year views are log aggregations, not planning units. The product structures weeks; an institute structures seasons. |

**The three objects that would change the product's class**, in order:

1. **The season arc** - a goal-race object that spawns dated training blocks (base / build / peak / recover), which
   own the weeks. This is the single biggest structural investment and it gates the most value (race brief,
   templates, block verdicts, season recap all become instances of it).
2. **The runner's subjective voice** - one-tap RPE on every run plus a ten-second daily check-in. This fixes the load
   honesty defect (session-RPE load covers every source), gives the state engine real evidence (sleep debt,
   motivation dip, soreness), and is the institute-standard athlete-monitoring inbound.
3. **The weekly heartbeat** - the existing one-tap weekly review, closed by an artifact: a recap card the runner
   feels, one coach verdict sentence, and the next week's proposed shape. The loop today ends at "prompt"; it should
   end at "ritual".

**Positioning sentence.** From *a coach that writes a calendar* to *an athlete's season operating system*: structure
you can see, effort that provably converts, and a sport the runner stays in - with proof, not vibes, at every step.

---

## 2. Product thesis and the three pillars

**Thesis.** Every runner deserves the two things an institute athlete gets: a program with reasons, and a coach who
manages the whole person. Milebook's architecture (validated writes, states, honest log) is the right chassis for that;
what is missing is the content of the promise above the week.

| Pillar | Definition (testable) | Today | Target state | First metric |
|---|---|---|---|---|
| **Effort** | Every session has a purpose; load is managed, not just displayed; adaptation is provable; plateaus get diagnosed | Purpose: done (`sessionIntent`). Load: soft signal, Garmin-only. Adaptation evidence: PRs within stored history. Diagnosis: none | Session -> block -> season progression; testing protocol per block; a block verdict ("this block raised your 5k best by 12 s"); load honest for every run source | % of active weeks with load in the steady band; testing-delta achieved per block |
| **Happiness** | Autonomy, competence, relatedness - the three needs that keep humans in sport (Self-Determination Theory: [Ryan & Deci 2000](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf), applied to physical activity in [Ryan et al. 2009](https://selfdeterminationtheory.org/SDT/documents/2009_RyanWilliamsPatrickDeci_HJOP.pdf)) | Autonomy: excellent. Competence: partial. Relatedness: zero | The runner feels progress (recaps, deltas, verdicts), feels ownership (approve-before-apply, states they set), and can bring one other person in (share a recap, hand a coach pack) | Return-after-missed-week rate (resilience, not streaks); weekly pulse; share rate later |
| **Structure** | Goal -> season -> block -> week -> session is visible in one glance on every surface; every lifecycle phase has an artifact | Week/session: strong. Lifecycle: states only. Glance: month grid shows days, not arcs | A named block band on the calendar; a countdown on every page in race season; a brief on race week; a return block after the race | % of runners with a goal-race object; % of blocks completed with a verdict |

**The coaching loop.** An institute runs one loop, weekly, for years: **plan -> execute -> observe -> review -> adapt**.

| Stage | Milebook today | Missing |
|---|---|---|
| Plan | Coach books validated sessions; batch CRUD; guardrails | Block-level planning (a week is never planned as part of a block); templates |
| Execute | Garmin sync, manual logging, workout overlay, peeks | The runner's feeling of the session (RPE); reminders (I-10) |
| Observe | Deep log: load/ACWR, hard/easy, splits, laps, zones, PRs, trends | Subjective wellness; environment (weather auto); testing observations |
| Review | One-tap review prompts (run, week) - and never unsolicited, a real trust choice | The review produces no artifact; no block or season review exists |
| Adapt | States adapt guardrails automatically; the plan changes only when asked | The coach should *propose* the next adaptation (one tap to accept) - the plan as a living block, not a static booking |

**Institute practices this maps onto** (all standard, none exotic): session-RPE load monitoring
([Haddad et al. 2017](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full));
acute:chronic workload bands ([Gabbett 2016](https://bjsm.bmj.com/content/50/5/273) - the 0.8-1.3 / >1.5 thresholds
Milebook already encodes);
daily wellness questionnaires; taper windows (already encoded and cited: Wang 2023 in `COACH-STATES.md`); and
long-term athlete development for the lifecycle view ([LTAD](https://athletics.ca/wp-content/uploads/2015/01/LTAD_EN.pdf)).
Milebook has quietly implemented the elite-adjacent half of this list. The unimplemented half - subjective monitoring and
season structure - is exactly what sections 3-4 cover.

---

## 3. Inbound audit - what flows into the product

| # | Input | Today | Institute standard | Verdict | Move |
|---|---|---|---|---|---|
| 1 | Objective training data | Garmin deep: list metrics, laps, HR zones, executed-workout overlay, on-demand splits | One trusted source, enriched, deduped | **Strong** (overlay is unique in the benchmark) | Keep; Strava read-only later (C5); nothing urgent |
| 2 | Self-reported execution | Manual run form (slice 1): day, distance, duration, title | Logging must carry effort, not just meters | **Defect-adjacent**: no RPE, and the run counts zero toward load/hard-easy (verified) | **PR-01** one-tap post-run RPE; sRPE load = duration x RPE for any run without Garmin load |
| 3 | Subjective wellness (daily) | Absent; `sleep_debt`, `motivation_dip`, `high_stress` states exist but only via chat/user form | 10-second morning check-in: sleep, soreness, mood, energy, stress | **Missing** | **PR-02** daily check-in feeding state evidence (states get real proof, not chat guesses) |
| 4 | Goals and races | Goal text reaches the coach prompt (slice 1); no dated object | A goal is an object: race, date, distance, goal time, priority | **Partial** | **I-02 full / D5**: goal-race object; then I-11 race brief |
| 5 | Athlete profile | Display name, timezone, goal | Experience level, injury history, weekly availability, preferred long-run day drive defaults | **Thin** | **PR-04** profile v2 -> segment defaults (I-23); `beginner`/`masters` stop being chat-only |
| 6 | Environment | Heat/altitude/air/cold states, chat-set | Conditions auto-observed, plan auto-adjusted | **Missing automation** | **PR-05** opt-in weather fetch on plan days (city-level, privacy-safe) |
| 7 | External plans | Garmin plan import blocked by API (verified, `GARMIN-TRAINING-PROGRAMS.md`); templates pending (I-16) | Templates with provenance; coach-authored import | **Blocked/pending** | Templates as block instances, after PR-13 (the block object, section 8); PDF import only after I-04 |
| 8 | Testing and benchmarks | Absent: no time-trial protocol, no race-result intake, no fitness trend (Garmin VO2max endpoint deferred in their P3) | A block ends with a test; a season ends with a measured result | **Missing** | **PR-06** time-trial session kind + protocol (e.g. 3k TT every build block) + block verdict |

**Inbound sequence judgment.** The highest-value order is (1) **PR-01 RPE** - one tap, fixes a verified honesty defect,
gives every run a load value regardless of source; (2) **goal-race object** (I-02 full) - the smallest object with
the largest unlock; (3) **PR-02 daily check-in** - the full athlete-monitoring inbound. Weather and testing follow;
Strava and PDF import are later still.

---

## 4. Outbound audit - what flows out

### To the runner

| Output | Today | Move |
|---|---|---|
| The plan (calendar, peeks, session intent) | Strong on desktop web | I-09 phone/PWA week view; I-10 reminders ("today: 6 x 3 min @ 5k effort, and why") |
| The brief (race week) | Guardrails only; no artifact | **I-11** race-week brief + countdown: seven dated entries, fuel/logistics, goal pace **computed from stored efforts, never invented** |
| The review | One-tap prompt, comment-only | **PR-07** weekly recap card: plan vs actual, load signal, one best effort, one coach verdict sentence, next week's proposed shape - the review should end in an artifact |
| The season story | Nothing | **PR-08** block and season recaps: what the block built (deltas, consistency), one lesson, next block's focus |

### To the runner's world

| Output | Today | Move |
|---|---|---|
| Data out | JSON + ICS export, key deletion (slice 1) | CSV later; a subscribable read-only ICS feed (A9) later |
| A person | Nothing leaves the runner's account | **PR-09** share a recap card (consent-first, one card, no feed, no leaderboard); **PR-10** printable coach pack (plan + log + load + states) - the institute play: **AI as assistant to human coaches, never their replacement** |
| Channels | In-app bell only | I-10 reminders first; an optional weekly email digest much later |

### To the business (hypotheses to validate, not commitments)

- **Free core, forever:** coach chat, calendar, log, states, safety. **Safety features are never paywalled.**
- **Pro:** the season engine - goal-race object, blocks, templates, testing, verdicts, advanced load, coach pack.
- **Club / institute edition (later, after the solo product is proven):** a coach console over the same validated
  write architecture - this is where an international sport institute would actually deploy it, and Milebook's audit and
  guardrail spine is precisely what team software lacks.
- **Never:** ads, data sale, engagement-maximizing dark patterns.

The brand story writes itself and is already true today: **the coach with proof** - every edit validated, audited,
reversible; every number labeled with its scope. That is the differentiator to tell; section 5 of 00 confirms no
benchmark product ships it.

---

## 5. "Everyone" - segments and inclusivity

The state catalog is already unusually inclusive (34 keys: `beginner`, `returning`, `masters`, `racewalk` as a
first-class session kind, `menstrual_cycle_support` / `pregnancy_postpartum` consent-first and never inferred,
`low_energy_availability` with dietitian referral). The gap is that **inclusivity exists in the engine but not in the
experience**: every segment gets the same blank calendar and the same blank chat.

| Segment | Effort needs | Happiness needs | Structure needs | Today | First move |
|---|---|---|---|---|---|
| Beginner | Ramp, run/walk, **permission to repeat a week** (N38) | Early wins, no jargon | A visible first block, not a blank grid | `beginner` state; blank onboarding | I-23 + PR-13 (a named 8-week start block); C25K-style ramp template |
| Race-focused (core) | Periodized build to the date | Race-week confidence, post-race closure | Countdown, brief, return block | Strong states; no artifacts | I-02 full + I-11 |
| Time-crunched | Short/split sessions | Relief, not guilt | Week-shaped plans around fixed windows | `time_crunch` state exists | I-10 reminders + PR-07 recap |
| Returning from injury | Graded return, run/walk only | Trust in the comeback | A dated return block with exit criteria | `return_to_run` state + guardrails | **PR-11** return-to-run block template (the institute's return-to-play protocol, consumerized) |
| Masters | More recovery, longer warm-ups | Longevity identity | Recovery weeks named, not hidden | `masters` state | I-23 defaults; PR-13 recovery blocks |
| Women's health | Load aware of cycle where self-reported | Being asked, never guessed | Consent-first states (already right) | States ahead of market | PR-02 check-in as the opt-in symptom input |
| Non-Garmin / phone-only | Runs count | Not being a second-class user | Full plan without a device | Manual logging (slice 1); **load blind** | **PR-01 RPE closes this**; C5 Strava later |
| Racewalk / walkers | Specific kinds | Recognition | Kind-colored rows | `racewalk` kind - rare, protect it | Keep; strength kinds later (I-22) |
| Youth | Out of scope | - | - | Not addressed | **Keep out** (D14): legal/safety surface not worth it for a PoC |

---

## 6. Trust, safety and ethics - the institute bar

**Already at or above the bar; protect it as the moat:** server-validated writes (ADR-0001), append-only change sets
with before/after, undo, comment-only enforcement, consent semantics for sensitive states, non-diagnosis stance,
honesty labels ("within stored history"), idempotent turns, per-runner data isolation, and the never-unsolicited
coach-turn rule.

**Raise to reach the bar:**

| Item | Today | Move |
|---|---|---|
| Garmin key stored plaintext | Known limit | Encrypt at rest (I-15 leftover); rate-limit endpoints (D6) |
| Account lifecycle | Export + key deletion done | Reset, revoke sessions, delete cascade (I-14) - "your data is yours" must be literally true |
| Red-flag escalation | `medical_red_flag` blocks booking + clinician copy | Verify the copy names urgent care explicitly and is reachable from the bubble in one tap (PR-12 audit) |
| Gamification ethics | No streaks (good) | When streaks/recaps arrive: **forgiving by design** - a missed day never breaks the streak visibly; the anti-metric is return-after-miss, not streak length |
| Hallucination containment | "Must not invent splits/HR/sessions" rule exists | Extend the rule to every new outbound artifact: pace ranges in race briefs and verdicts must be **computed** from stored efforts, with the source labeled |
| Data governance | 180-day state-event retention | Retention preferences for chat/memories (PR-12); no third-party analytics ever |

---

## 7. Metrics - one north star and a tree

**North star candidate: completed structured weeks.** Per runner per week: has a plan, executed >= 70% on-plan (or
coach-adjusted), load in the steady band *or actively managed*, and closed by a review. It fuses all three pillars,
resists vanity, and is impossible to fake with a burst of activity.

| Pillar | Metrics | Anti-metrics |
|---|---|---|
| Activation | First session booked < 5 min; goal object set day one; first review completed day seven | Signup counts |
| Structure | % runners with a goal-race object; % weeks inside a named block; block completion with verdict | Features shipped |
| Effort | % active weeks load-in-band (steady/watch/high); testing-delta achieved per block; PR rate among actives | Total km (volume is not progress) |
| Happiness | Weekly 1-tap pulse (proud / ok / struggled); **return-after-missed-week rate**; churn after a first missed week; share rate later | Streak days; message volume |
| Safety | Pain reports confirmed -> load reduced within 48 h; high-ramp weeks followed by de-load | Guardrail block counts (blocking is success, not failure) |
| Trust | Undo usage; diff-approval rate (once I-04 ships); audit-page visits | - |

---

## 8. Roadmap - the same backlog, re-sequenced around the pillars

This keeps every existing item and adds the strategic layer. Ordering arguments follow the table.

| Horizon | Goal | Existing items | New items (PR) |
|---|---|---|---|
| **H1 - Complete the season** (structure + effort) | The product plans in arcs, not islands | I-02 full (goal-race object, D5), I-11 race brief, I-16 templates, I-06 fallback planner, I-04 diff/approve | **PR-13** block/mesocycle object: goal-race spawns dated blocks (base/build/peak/recover, default 3+1 rhythm), blocks own weeks, visible as a named band on the calendar; **PR-06** time-trial protocol + block verdict |
| **H2 - Give the body a voice, put it in the pocket** (effort + happiness + platform) | Every run counts; the app lives on the phone | I-09 PWA/week view, I-10 reminders, I-17 load sentence + per-run exclusion | **PR-01** post-run RPE (sRPE load for all sources - fixes the verified blindness), **PR-02** daily check-in, **PR-05** weather inbound, **PR-07** weekly recap, **PR-14** surface grammar pass (section 11: legend, deltas, day states, guardrail styling, delete toast) |
| **H3 - The runner's world** (happiness + outbound + lifecycle) | Progress is felt, shareable, and coach-visible; every segment has an on-ramp | I-22 strength kinds, I-23 segment defaults/beginner mode, I-21 locale pass, I-14 account lifecycle, C5 Strava read | **PR-08** season recap, **PR-09** share card, **PR-10** coach pack export, **PR-11** return-to-run template, **PR-12** safety/retention audit |

**Ordering arguments.**

1. **PR-13 before I-16.** A template is an instance of a block; building templates first would freeze the wrong
   schema.
2. **I-04 before PR-13's coach-written blocks.** A block write is the largest multi-session batch the product will
   ever see; it must be previewable and refusable before it exists.
3. **PR-01 as the first H2 item, possibly earlier.** It is small, it repairs a verified honesty defect, and it makes
   every later analytics feature (load, ACWR, block verdicts) honest for all run sources. It also converts
   `motivation_dip`/`sleep_debt` states from chat-guessed to evidence-backed.
4. **PR-07 before PR-09.** Sharing needs an artifact worth sharing; the recap is the artifact.
5. **I-09/I-10 stay in H2** per 00's slice-2 logic: the phone gap is table stakes, and reminders are the plan's only
   outbound nudge today.

**If only three things can be built next:** PR-13 (goal-race + block object), PR-01 (RPE), PR-07 (weekly recap).
They are the class change, the honesty fix, and the heartbeat - and together they make every other feature more
valuable rather than wider. Outside that trio, PR-14 is the cheapest trust win in the product (section 11: copy and
CSS, no schema, no gateway change) and can ride along with any slice.

---

## 9. What not to build (extends 00 section 8)

Keep 00's list (Strava social, payments, wellness-platform sprawl, clinical advice, native apps, route AI,
two-way calendar sync, drag-and-drop, PDF import before diff/approve, streaming, summarization, full a11y audit
before real AT users). Add, from the institute seat:

- **No feed, no leaderboard.** Relatedness arrives via *artifacts* (recap, coach pack), not via social comparison -
   comparison is the single best-researched way to kill intrinsic motivation.
- **No HRV/gadget ingestion** until there is a consumption story (a decision it changes); a number without a decision
   is dashboard noise.
- **No autonomous coach turns.** The one-tap consent model is a trust differentiator; the coach may *propose* the
   next week/block, but a human tap applies it. Keep this line bright as the product gets smarter.
- **No coach marketplace, no ads, no data sale, no youth edition.**

---

## 10. The design constitution (ten principles)

1. **Every session carries its why.** Intent line exists; every new surface repeats it.
2. **Recovery is training, not absence.** Rest is a session kind; recovery weeks are named; under-load is coached
   like overload (`under_load` state exists - give it a plan shape).
3. **Proof over vibes.** Validated writes, honesty labels, no invented numbers - extend to every future artifact.
4. **The runner holds the pen.** Approve-before-apply for big writes; undo everywhere; user-set states win.
5. **Compassion by default.** Missed runs are data, not debts (already done - keep it); forgiving streaks; no
   make-up-miles dogma.
6. **Structure you can see.** Goal -> block -> week -> session legible in one glance on every surface.
7. **One heartbeat a week.** The review closes the loop; every block ends with a verdict; every season with a story.
8. **The body has a voice.** RPE and check-in are first-class inbound; subjective evidence renders beside objective.
9. **An assistant, never a clinician.** Non-diagnosis, consent-first sensitive states, clinician referral copy.
10. **The runner's data leaves when they do.** Export, delete, retention choices - begun in slice 1, finish in I-14.

---

## 11. Screen-level findings (vision-model critique, distilled)

The eight design screenshots were shown to a vision-capable model (DeepSeek-V4.1-Flash-TF, lane llm-main) with the
same institute brief and **no captions**, producing first-impression critiques the docs' own captions cannot give.
Below are the cross-screen repeats and the sharpest singles, each reconciled against the engine's real behavior:
the model saw pixels, not code, so where the engine already handles something the finding is a **presentation gap**,
and that is said explicitly. Most fixes collapse into one item, **PR-14 - the surface grammar pass** (legend, delta
chips, status-vs-kind colors, sync-aware day states, guardrail styling, animation-end toast): copy and CSS, no
schema, no gateway change.

| # | Finding | Seen on | Reconciliation | Move |
|---|---|---|---|---|
| 1 | The 6am question - "what do I do today?" - has no answer surface: the month grid must be scanned, the bubble opens blank, the week view leads with a warning | calendar, starter, week | Real. The session peek answers it only after a hunt | "Today / next session" card above the grid; contextual bubble starters (I-09, I-10, PR-07) |
| 2 | Planned / recorded / prescription rows are not visually separable; `✓`/`◈` have no legend; a paired day reads as three near-duplicate entries ("Easy 6 km" + "✓ Morning easy 6.1 km" + "◈ Easy 6 km") | calendar, CRUD, starter | The typed union exists (`calendar-items.ts`); this is encoding, not data | **PR-14**: one legend; delta chips ("Garmin 6.1 km · +0.1"); make the pair read as one thing |
| 3 | "ON PLAN 0 KM" reads as "zero km done" - the single biggest misread risk found | week | Copy defect: the badge means distance delta, and the engine computed it correctly | **PR-14**: "Completed · on plan (+0.0 km)" |
| 4 | Day cards cannot distinguish Rest / Missed / Upcoming / Awaiting sync; "No activity recorded" on a Saturday after a Thursday "Last import" reads as a missed long run | week | The engine knows all four states; `data_stale` exists | **PR-14**: sync-aware day states + last-import chip on day cards |
| 5 | The load card shows numbers without meaning or action: "1.95 ACWR" beside "-5% VS LAST WEEK" reads contradictory; no target band; no concrete recommendation | week | ACWR is 7-day vs 28-day average, not week-over-week - the definitions exist but the surface does not teach them | I-17 load sentence + **PR-07**: plain phrasing ("7-day load 273 vs 28-day average 140 - high") plus one action ("cap Sunday at 14 km") |
| 6 | Guardrail notices render in success green ("Calendar unchanged - Race week guardrail") while they are blocks | state bubble | Styling only; the enforcement itself is correct and audited | **PR-14**: warning styling + one-line rationale + "what would be allowed instead" |
| 7 | Sensitive states look one-tap dismissable: "Pain / injury" Confirm/Dismiss with no consequence copy; "Resolve" on race week looks accident-prone | coach states | The engine is stricter than the pixels (observing status, 7-day dismissal cooldown, never-inferred sensitive keys); the gap is presentation | **PR-12**: consequence copy; Dismiss demoted with undo; resolving a safety-family state requires a reason |
| 8 | One session wears three names ("Threshold blocks" vs "Tempo 8 km" vs "Threshold 3 × 7:00"); "Repeat 3x back to step 2" forces mental reconstruction; no per-rep target-vs-actual | run peek, activity detail | Garmin laps exist on the detail page; the match story is never assembled | Grouped Actual / Planned / Match blocks and a rep table (target vs actual) with one session name - the effort pillar made visible |
| 9 | The CRUD delete moment delights but panics: a pill flies into a global bin with no named target and no undo at that moment | CRUD | The Recent changes card + Undo exists (slice 1); the animation ends without pointing at it | **PR-14**: end-of-animation toast naming the session with an Undo link |
| 10 | Bilingual inline labels double scan time under time pressure | states, starter, bubble | The Traditional Chinese rule is deliberate; I-21 is pending | I-21: one language at a time, explicit toggle |
| 11 | The bubble's first-open panel is blank with generic, transactional starters ("Book a 5 km run") | starter | The suggestion rail exists and is good; it is context-blind | Contextual starters ("Adjust today's tempo · Review yesterday's run") + today's session in the closed state |
| 12 | No surface shows Garmin freshness except the log's "Last import" line | all | Auto-sync and the bell exist | **PR-14**: "Garmin synced 17:00" chip in the calendar header |

**Convergent validation.** Asked what a professional athlete-management tool would do, the vision model -
independently and without seeing the roadmap - asked for exactly four things the backlog already contains: plan
diffs with accept/reject before writes (I-04), a week/agenda default view (I-09), RPE on every run (PR-01), and bpm
boundaries on HR zones (known limit 19). An unbiased reader arriving at the same four moves is the cheapest possible
confirmation of the roadmap's direction.

---

## 12. Decisions for the owner (D8-D14, continuing D1-D7)

| # | Decision | Recommendation | Cost of delay |
|---|---|---|---|
| D8 | Build the season object (PR-13) next? | Yes, as H1, after I-04. It gates briefs, templates, verdicts, recaps and the pro tier | Every feature above the week keeps re-implementing ad-hoc structure |
| D9 | Subjective inbound (RPE + daily check-in) in scope? | Yes; RPE first. It is the standard institute inbound and fixes a verified defect | Load stays source-biased; states keep guessing |
| D10 | Should reported runs feed load via sRPE? | Yes, labeled "reported effort" in the load card footnote | The log stays dishonest for non-Garmin runners - the exact users slice 1 opened the door to |
| D11 | Weekly recap + share card direction? | Recap now (PR-07), share after (PR-09), no feed ever | The loop stays prompt-shaped; relatedness stays zero |
| D12 | Human-coach direction? | Export-first (PR-10 coach pack); no coach portal until a real coach asks for one | Misses the institute wedge; a portal now would be speculative surface area |
| D13 | Adopt the north star? | "Completed structured weeks" - or reject with a better one | Analytics will drift toward vanity metrics by default |
| D14 | Youth in or out? | Out, explicitly (safety/legal surface; LTAD staging needs expertise the PoC lacks) | Ambiguity invites an accidental minor user |

---

## 13. Bottom line

The spine is built: a coach that cannot lie about what it changed, states that can say no, and a log that tells the
truth. The next work is to give that spine **length** (seasons and blocks, PR-13), a **nervous system** (the runner's
own voice, PR-01/PR-02), and an **outward life** (the recap, PR-07/PR-08/PR-09). Do those three and the product stops
being a well-guarded weekly planner and becomes what the owner asked for: an app where everyone's effort converts,
the structure is visible, and the happiness survives the missed Tuesday.
