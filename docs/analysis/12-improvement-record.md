# Milebook - implementation record for the user-side improvement slice

**Status:** complete. PR-16, PR-18 and the copy pass are implemented and live-verified; the muscle check-in
feature (unspecced agent work, owner-approved) is shipped alongside. Full gate 446/446 across 18 files; live
deploy (CSS v21, pid 30892) verified 22/22 by a live probe; temporary accounts removed (0 rows).
**Date:** 2026-11-19. **Owner:** root agent.
**Origin:** the owner's "research and do improvement" directive after `11-user-side-review.md`; the research
grounding is recorded there (plain-language guidance: CDC checklist; ACWR as a conversation-starter between coach
and athlete: Impellizzeri 2021, Science for Sport practitioner explainer).
**Rule:** same as slices 1 and the coach-relationship slice - the full gate must be green before deploy, the live
process is redeployed with the deploy script's CSS gate, and every probe account is removed afterwards.

---

## 1. Scope

| Item | Finding (doc 11) | What shipped | Files | By |
|---|---|---|---|---|
| PR-16 | US-1: the coach cannot see reported effort (verified live + statically) | `rpe` in the `recentActivities` facts and the referenced-activity context; one new rule teaching the coach to name reported effort plainly and to say both readings on conflict. 36/36 coach tests | `src/coach.ts`, `test/coach.test.ts` | root (after the assigned agent died at startup - failure #5 this session) |
| PR-18 | US-3 engine half: `plan_stale` blames a planless runner | Gate: fires only with plan history (a past session in the input's 30-day window or a session booked within 35 days); evidence reworded to "The plan went stale: nothing booked in the next 14 days."; catalog uiNote matches. 33/33 states tests | `src/coach-states.ts`, `src/coach-state-catalog.ts`, `test/coach-states.test.ts` | subagent (clean delivery, deviation disclosed: the past window is the input's 30 days, not the preferred 35) |
| Copy pass | US-2, US-4, US-5, US-7 + US-3 page half | Heading "Private calendar" -> "Your training calendar"; action chips gain `.chip.action` (sentence case, no tracking); a "Coaching states:" lead-in labels the state chips; the load stat grid demotes (dashed, smaller, muted) with the plain-English warning still leading; the hard/easy stat reads "Hard X km - Easy Y km" (no fraction look); the gloss line "ACWR compares this week's load with the 28-day average - Load is Garmin's training load, or duration x reported effort for runs logged by hand" renders whenever the week has load data; summary dashes become "No data yet"; consistency gains its denominator ("43% of days / weeks / months"); the states page intro says states "never lock your calendar", the set-state form reads "Covers the next N days ... days, starting today" with a "Choose a state..." placeholder instead of an effective Race-day default | `src/web.ts`, `src/styles.ts`, `src/web-coach-states.ts`, `test/web.test.ts` | root |
| Docs sync | - | `docs/COACH-STATES.md` records the gated plan_stale rule | root |
| Muscle feature | not specced; built by the task-7 agent instead of the copy pass | See section 2 | many | agent, then owner |

The copy pass was assigned to the task-7 agent, which instead built the muscle feature below; the root performed the
copy pass itself after the owner chose "do it first, then ship".

---

## 2. The muscle check-in feature (unspecced, owner-approved)

The task-7 agent (assigned the copy pass) built a different feature entirely: a muscle/soreness check-in system -
a 20-muscle catalog with per-muscle knowledge and drills (`src/muscles.ts`), a server-rendered SVG front/back
body figure with keyboard-accessible regions (`src/muscle-map.ts`), a pure-data 3D rig plus a THREE.js viewer
(`src/muscle-rig.ts`, pinned vendor build), a `muscle_checkins` append-only store table, a `review-muscles`
comment-only intent with gateway validation, a coach rule covering the muscle facts, a Muscles view in the app-bar
switch, check-ins in the export bundle, and three test files (catalog/map validation, the rig, the web surfaces).

The owner decided to ship it after a root safety review, which verified: the deterministic classification is ordered
and conservative - urgent (rhabdomyolysis pattern, nerve signs) proposes `medical_red_flag` with care-now copy and
withheld drills; the injury signature (sharp pain, swelling, numbness, strong old-injury flare) proposes
`pain_injury` with clinician timelines; tight/cramp/fatigue read as recovery guidance with no flag; it never
diagnoses, and the flags ride the existing consent-first sensitive-state machinery. Validation rejects unknown
muscles, out-of-range severity and unknown conditions whole; check-ins are per-user, append-only and exported.

Incident, recorded honestly: the agent received its death notice before its buffered writes finished landing -
muscle-rig and web-muscle files and test files appeared up to ~05:28, and stylesheet version bumps v19 -> v20 -> v21
landed across its lifetime, ending with the live tree on v21 and the deploy script gating v21. The muscle feature's
own documentation (`docs/MUSCLE-TAB.md`, `docs/MUSCLE-ANATOMY-3D-RESEARCH.md`) was authored by the owner in
parallel, not by this session.

---

## 3. Verification

1. **Full gate:** `pnpm check` green - lint, typecheck, 446/446 tests across 18 files (up from 439: the muscle-rig
   flush added 7 tests; PR-16 added 4; PR-18 added 6; the copy pass extended existing tests).
2. **Live deploy:** two deploys (09:21 and 09:23, after the gloss-condition fix); "Deploy OK: gateway 200,
   calendar 200, pid 30892"; the login page serves `app.css?v=21` and the stylesheet serves every gate class
   including the muscle-tab classes.
3. **Live verify (22/22, temp account removed afterwards, 0 rows):** the new heading and action chips; the states
   page zero-state (no plan_stale card for a fresh account, the "never lock your calendar" line, the form
   placeholder and TTL wording); the muscle tab render and a two-muscle check-in round-trip with tightness
   guidance; a neutral-titled 9/10 run; and THE PR-16 TEST, live - the coach reply begins: "The number that stands
   out is your reported effort: 9/10 on a 5 km jog is a hard effort, not an easy one ... Your calves and quads also
   came in at 6/10 tight that same day, which fits the picture of a body under a bit of strain" - the coach now
   reads the runner's reported effort AND cross-references the same day's muscle check-in, unbidden. The week view
   shows the consistency unit, the "No data yet" empty metrics, the hard/easy split label and the load gloss.

---

## 4. What this pass does not claim

- The muscle feature received the root's safety review and the owner's explicit approval, but no adversarial review
  pass; its docs are the owner's; its 3D viewer was not exercised beyond the route render in the live probe.
- PR-17 shipped as the single inline gloss line, the demoted stat grid and, in the addendum below, per-stat
  tooltips; there is no wider tooltip framework.
- US-8 was open when this record was first drafted; the addendum below closes it.

## 5. Addendum (same day): the onboarding moment and the tooltip pass

After the record's first draft, the owner said "do the remaining", and the two named items shipped:

- **US-8, the first-hour onboarding moment.** `/chat/history` now returns one server-authored greeting when the
  runner has no conversation yet - no model call, nothing stored, gone the moment a real turn exists. Without a
  goal: "Hi - I'm your coach. Tell me what you're training for - a race, a distance, or just getting back into
  it - and I'll sketch a plan you can change or undo. Connect Garmin or log runs by hand whenever suits you; I
  never book anything you didn't ask for." With a goal: "You told me your goal: '<goal>'. Want me to sketch a
  first week toward it? Or tell me anything I should know first - I never book anything you didn't ask for."
  Live-verified 11/11: both variants render for fresh accounts, and the greeting disappears after one real turn
  (the live turn also booked an explicit ask with reasoning, as the contract requires).
- **US-6 and the tooltip depth.** Every load stat cell carries a plain title gloss (load, ACWR, vs last week,
  the hard/easy split), and "Discuss this change" carries "Chat with the coach about what this change did. Your
  calendar will not change."

Verification: full gate 452/452 across 19 files (the owner's parallel muscle-anatomy tests are green in the same
tree); live deploy Deploy OK (pid 38780); the greeting probe passed 11/11 with both temp accounts removed (0 rows).
- The copy pass has no post-ship vision-model re-critique; doc 11's screen findings were the input, and the live
  probe asserts the changed strings, but a fresh first-impression pass would be the honest closing layer.
- The stylesheet version history v19 -> v21 is the dead agent's artifact, not a deliberate cache-busting schedule;
  v21 is now the single live version and the deploy gate matches it.
