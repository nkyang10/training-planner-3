# Milebook - the user-side review: a first-time runner on the live product

**Status:** complete review; findings ranked, follow-ups registered (PR-16..PR-20). **Date:** 2026-11-19.
**Lens:** the owner asked for a further review "as user side view". This document is that review: what a brand-new
runner actually experiences on the live deployed product (v18, consultant-friend rules active), not what the code
promises.
**Inputs:** (1) a live journey probe - a temporary runner (removed afterwards, 0 rows) signing up over real HTTP and
holding seven real coach conversations against the live model, every reply captured verbatim
(`tmp/user-journey/journey.log`, `tmp/user-journey/turns/`); (2) five headless-Chrome captures of the live surfaces for
a second seeded non-Garmin account (also removed, 0 rows), each critiqued by the vision model as a first-time runner
with no watch (`tmp/user-screens/critiques.md`, lane llm-main, 5/5 critiques); (3) static verification of the one
blindness the journey exposed (`src/coach.ts` - no `rpe` anywhere in the prompt build).
**Relation to 08-10:** this is the post-slice verification layer over docs 09/10 - the consultant-friend contract and
the honest load signal were *specified* there; here they are *experienced*. Probe artifacts are separated from real
findings in section 5. New ids continue the PR-xx numbering.

---

## 1. The verdict in one page

**The consultant-friend coach is real in production.** Seven live turns, seven passes. The old pusher behavior - a
goal statement becoming eight weeks of bookings - is gone; what the runner gets instead is honest data admissions,
options with tradeoffs, one recommendation, and the pen handed back. The pain report produced the consent-first
observing state, the clinician conditions, and not one scolding word. Every structural promise of the slice shows up
in the runner's actual path, including the quiet ones: the `plan_stale` state auto-resolved itself the moment a plan
existed, and every suggestion rail offered a way to keep talking rather than a way to be told what to do.

What remains from the user's seat is *words and zeros*: jargon the runner cannot decode (ACWR, LOAD, ramp,
consistency percentages on a half-finished week), zero-states that read as blame (three ACTIVE flags and "Plan is
stale" for a runner with no plan yet), label formats that read as fractions ("21 / 0 km HARD / EASY"), dashes that
look broken ("Average HR -"), and one genuine blindness: **the coach cannot see the effort the runner just reported**
- the RPE reaches the load card and the detail page but not the coach's prompt, verified both statically
(`src/coach.ts` builds `recentActivities` and the referenced-activity context without `rpe`) and live (asked about a
9/10 run with a neutral title, the coach hedged: "if the 17th felt similar").

The persona survived contact with a real model. The remaining work is a copy-and-mapping pass, not architecture.

---

## 2. The journey, step by step (all live, all verbatim-captured)

| # | Step | Expectation (docs 09/10) | Verdict | Evidence (short verbatim) |
|---|---|---|---|---|
| 1 | First landing, empty calendar | Obvious next steps; no jargon wall | **PASS** | Empty-state card offers exactly three doors: "Ask the coach for a plan, connect Garmin, or log a run by hand... you can undo a batch from the recent changes below." Legend + horizon line present. |
| 2 | "I want to run a 10k in about 8 weeks." (goal, no booking ask) | Consultant response, nothing booked | **PASS** | `sessions: 0, outcome: "clarified"`. "One honest note first: I have no recorded runs or saved Garmin key for you yet... Three ways to play it: (1)...(2)...(3)... I'd recommend (2)... Tell me your rough weekly mileage... or say the word and I'll lay out week one now." |
| 3 | "I can run 3 days a week. Book week one starting this Saturday." | Explicit ask -> booked, with reasoning | **PASS** | `sessions: 3, outcome: "committed"`; "deliberately modest, since I don't know your current base yet... if 4 km feels long, cut it short and walk the rest." Bonus: the stale-plan state resolved itself in the same turn. |
| 4 | "How does this plan look for someone at my level?" | Comment-only; honest limits | **PASS** | `sessions: 0`. "Honestly, I can't fully answer that yet - I don't know your level... The honest gap is that the plan can't get sharper until I know your base." |
| 5a | "Why did the plan change that way?" + `discuss-change` on the real change set | Comment-only discussion of that change | **PASS** | `mode: "review", writesAllowed: false`; even corrected the premise honestly: "that change set was the original booking, not an edit... The volume is low on purpose... Nothing has been moved or removed since." |
| 5b | Same message, `changeSetId: "change:does-not-exist"` | Reference rejected before the model call | **PASS (with a nuance)** | `{"detail":"change set not found: change:does-not-exist"}` - the gateway rejects correctly, but the web proxy surfaces it as a 502, so the bubble shows its generic failure line; the runner cannot tell a bad reference from a dead gateway (see US-6). |
| 6a | Log a 5 km / 30 min run with rpe 9 | Review card, felt line, calendar presence | **PASS** | Banner "Run logged. It is now part of your calendar and training log."; review card "Run logged - Hard effort run - Wed, 18 Nov 2026 - 5 km - 30 min - 6:00/km"; detail page shows "Felt 9/10 - hard". |
| 6b | "How did my run go?" on a **neutral-titled** 9/10 run | Does the coach see the reported effort? | **FAIL - the finding** | The coach discusses pace and distance only and hedges: "you called the 18 Nov run hard, and **if the 17th felt similar**, that's two hard-ish efforts." The 9/10 never reached the prompt (US-1). Its advice was still sound, and its data honesty ("No heart-rate data came through... reading pace and your own description") is exactly the right voice. |
| 7 | "My knee hurt a bit after that run." | Observing pain state, clinician copy, no intensity, compassion | **PASS** | `pain_injury` proposed `observing`, confidence 0.6, evidence quoted; "Thanks for telling me - knee pain after a run is worth respecting rather than running through. I'm not going to diagnose it; that's for a physio or clinician if it lingers..."; suggestion chip: "What signs mean I should see a physio?" |

**Pattern across all seven turns:** the reply always names what the coach does and does not know; every suggestion
rail mixes actions and invitations; not one turn moralized, graded, or pushed. The runner's pen was never taken away.

---

## 3. The persona in the runner's words

Three quotes a real new runner would remember:

1. *"One honest note first: I have no recorded runs or saved Garmin key for you yet, so I'm planning from scratch
   rather than from your current volume."* - the single best trust move in the product: admitting the blind spot
   before offering the advice.
2. *"if 4 km feels long, cut it short and walk the rest."* - permission, not prescription; this is the friend voice
   working under a training plan.
3. *"I'm not going to diagnose it; that's for a physio or clinician if it lingers, gets sharp, or comes with swelling
   or limping."* - the safety clause said like a person, not a disclaimer.

---

## 4. Screen findings (vision model, first-time runner, 5/5 screens)

What landed well, per the model's own reading: the honest "Garmin is not connected" admission; the transparent
Recent-changes card with Undo **and** the new "Discuss this change"; the translated ramp warning line ("This week's
load is high (+166% versus last week, ACWR 1.90) - want to talk it through?") - quoted approvingly; the
"Talk through this ramp" chip as "the friendliest-sounding escape hatch from a scary number"; the per-state "Ask
coach about this state" hatch; internally consistent numbers (it checked 8 km / 50 min = 6:15/km).

What confused a first-time runner, with exact labels:

| # | Screen | Confusion (quoted) | Kernel that survives the artifact filter |
|---|---|---|---|
| A | calendar | "PRIVATE CALENDAR - private from whom?"; state chips "HIGH RAMP / PLAN STATE / ALL STATES - filter jargon I can't decode"; "Discuss this change vs Undo this change - is discuss a chat or a comment thread?" | Real: heading copy, top-level state chips, and the discuss action need one line of subcopy each (US-7). |
| B | coach bubble | "Booking horizon - jargon I'd have to decode"; title "AI COACH CALENDAR - is this a calendar or a coach?" | Real but minor (US-7); the blank first-open re-raised the onboarding gap (US-8). |
| C | day page | "Booked by the coach - I just signed up. Who booked?"; the effort field's placeholder "7" read as a pre-filled value | Placeholder tweak (use "e.g. 7"); "Booked by the coach" is fine once a plan exists, odd at zero (US-8 zero-state ordering). |
| D | week view | "ACWR 1.90 - meaningless... no tooltip"; "1098 LOAD - in what unit?"; "21 / 0 km HARD / EASY - reads as 21 divided by 0"; "Consistency 43%" on a half-done week "reads as misleading"; "Average HR - - dashes look like errors" | **The strongest real finding set** (US-2, US-4, US-5): the new warning line translates the ramp, but the black-box stats beside it still lead with jargon; the hard/easy slash reads as a fraction; dashes and unscoped consistency read as broken/graded. |
| E | coach states | "three ACTIVE warnings before I've logged anything... a coach that flags me before coaching me hasn't earned belief"; "Plan is stale - reads like the app blaming me for not existing yet"; "Set a state - Race day, Days 7 - is this in 7 days or for 7 days?" | **Real** (US-3): zero-state ordering, plan_stale gating, set-state form wording. |

---

## 5. Probe-artifact ledger (what NOT to fix)

The seeded account produced confusions a real new user cannot have, and they are excluded from the findings: the
pre-filled month of runs ("Hard commute", "Tempo effort") and the "Screen Review" display name are the probe's own
seeding and temp-account name; the "pencil in" question the bubble showed was the real coach reply to the booking
turn - the model judging it "tentative vs real" is the held-back-intervals behavior working as designed; the "◈
paired runs" legend line describing a row the non-Garmin account can never see is correct copy for Garmin users.

---

## 6. Ranked findings and the follow-up register

| # | Severity | Finding | Fix (register) |
|---|---|---|---|
| US-1 | **should-fix** (verified live + statically) | The coach cannot see reported effort: `rpe` is absent from the `recentActivities` facts and the referenced-activity context (`src/coach.ts`), so "the body has a voice" stops at the load card. | **PR-16** - add `rpe` to both prompt mappings (+ the review-reply copy should name it: "you reported 9/10"); tests; hours, not days. |
| US-2 | **should-fix** | Load-card jargon leads: "1098 LOAD", "ACWR 1.90", "HIGH RAMP" sit above the plain-English warning line that already translates them; the states page repeats "ACWR 1.9 / week change 166%" unglossed. | **PR-17** - demote the raw stats behind the sentence, add an inline "What's this?" gloss (ACWR, load, ramp, state) on the load card and the states page. |
| US-3 | **should-fix** | States zero-state blames the planless runner: three ACTIVE flags greet a no-plan account, including "Plan is stale"; "Set a state" defaults to "Race day" with ambiguous "Days 7". | **PR-18** - gate `plan_stale` on "a plan existed and went stale" (not "no plan ever"); reorder the page for new users (setup first); reword the form ("Covers the next N days"), drop the Race-day default. |
| US-4 | nice-to-know | "21 / 0 km HARD / EASY" reads as a fraction. | **PR-19** - "Hard 21 km - Easy 0 km" (or a stacked bar). |
| US-5 | nice-to-know | Empty metrics render as dashes ("Average HR -") and consistency grades a half-finished week ("Consistency 43%"). | **PR-19** (same pass) - "No heart-rate data yet" and "so far this week" scoping. |
| US-6 | nice-to-know | A foreign discuss reference surfaces as a generic bubble failure (proxy maps the gateway's correct 404 to a 502); "Discuss this change" has no one-line subcopy of what it does. | Include in PR-17's gloss pass; the 404-vs-502 nuance is recorded in doc 10's limits. |
| US-7 | nice-to-know | Top-chrome copy: "PRIVATE CALENDAR" heading, state filter chips as top-level controls, "LOG A RUN BY HAND" all-caps, "AI COACH CALENDAR" title conflation. | **PR-20** - one copy pass over headings and chips. |
| US-8 | structural (known, re-confirmed) | The first-hour onboarding gap persists: the bubble opens blank, the coach has no identity/first message, and the zero-state ordering is backwards. The vision model independently re-proposed the same onboarding card + coach first-message that doc 08 found - the third independent discovery of this gap. | Already registered (08 roadmap: I-23 beginner onboarding; PR-07 heartbeat). Priority rises with each rediscovery. |

**What to protect (passed and must never regress):** the honest-data-admission voice; permission-giving training
copy; the observing pain flow with clinician conditions; invitational suggestion rails; visible Undo + Discuss on
every change; auto state resolution; the never-unsolicited rule (no coach turn happened without the runner asking).

---

## 7. Bottom line

From the runner's seat, the product now *is* what the owner directed: a consultant and friend who responds when
asked, discusses before deciding, and books only on the runner's word - verified turn by turn against the live
model, not just in the test suite. The user-side gap list is honest and small: one real blindness (the coach deaf to
reported effort, PR-16), two zero-state/jargon passes (PR-17/PR-18/PR-19), and the long-known onboarding moment that
three independent reviews have now asked for. Fix PR-16 and the two copy passes, and the first hour of this product
would read as clean as its architecture already is.
