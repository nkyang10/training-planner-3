# POC3 - implementation record for the coach-relationship slice

**Status:** complete: three workstreams implemented and verified (107/107, 30/30, 103/103 targeted), adversarially
reviewed (verdict: safe after should-fixes, both triaged), full gate green (375/375, 15 files), live redeploy OK
(CSS v18) and smoke-tested (19/19; temporary account removed afterwards). The first-agent failure and one deploy
incident are recorded in sections 5 and 6.
**Date:** 2026-11-18, completed 2026-11-19. **Owner:** root agent.
**Origin:** the owner's directive of 2026-11-18, after the institute product review: the coach should be "like a
consultant or friends of user rather than a pusher or teacher. User ask coach, coach response. In the application
different locations, put action available for coach to get involve. Discuss with user. Feedback and make decision."
**Basis:** `09-coach-relationship-model.md` (the directive as the approved spec) and `08-institute-product-review.md`
sections 1 and 3 (PR-01: a hand-logged run previously contributed zero to load, ACWR and hard/easy because
`src/training.ts` read only Garmin `trainingLoad`; 08's verified anchors were `src/training.ts:207-216` and
`src/manual-activity.ts:81-95`).
**Rule:** this is a private PoC. Every change must keep lint, typecheck and the affected suites green, stay inside the
existing architecture, and not add infrastructure the PoC does not have. The slice ran as three parallel workstreams
with disjoint write scopes on the shared task board; the root re-runs the full gate at integration.

## 1. My opinion

The directive changes the coach's words, not its machinery. The spine already knows how to say no to the coach
(comment-only turns, validated writes, undo, user-set states); this slice makes the coach's voice match that humility
and stops the log from ignoring runs the runner logged by hand. The work splits along the code's own seams:

1. The **contract** - the persona and rules in `src/coach.ts`, the typed intents that make discussion a first-class
   turn, and the gateway resolution that feeds the referenced row to the prompt.
2. The **honest load signal** - one field, one validation, one pure function chain. Folded in from 08 because a
   consultant who discusses your training while its load chart counts your hardest runs as zero would be speaking
   from a broken ledger.
3. The **surfaces** that put "involve the coach" next to the data - the widest and most brittle scope.

Workstreams 1 and 2 are prompt text, pure functions and additive types: independently verifiable, and both were
complete and suite-green when this record was first drafted. Workstream 3 is the web layer; its first attempt failed
before writing any code, the relaunch completed it, and the integration results are recorded in sections 5 and 6.

## 2. Scope

### A. Implemented in this pass (workstreams 1 and 2, complete)

| # | Item | Spec id | Files |
|---|---|---|---|
| 1 | Persona rule: consultant and training friend, never teacher or taskmaster | 09 section 2 | `src/coach.ts` |
| 2 | Pusher rule replaced by discuss-first booking discipline | 09 section 2 | `src/coach.ts` |
| 3 | Suggestion chips: actions and invitations both legal; lecture and duplicates banned; "No questions" dropped | 09 section 2 (D17) | `src/coach.ts` |
| 4 | Reply rule extended to "speaks as a peer" | 09 section 2 | `src/coach.ts` |
| 5 | `discuss-change` and `discuss-state` comment-only intents plus three sources | 09 sections 3-4 (PR-15) | `src/directives.ts` |
| 6 | Referenced-context resolution for change sets and states; 404 before the model call and turn claim | 09 section 3 | `src/gateway.ts` |
| 7 | Additive type hunks for the intents (disclosed deviation; file owned by workstream 2) | - | `src/types.ts` |
| 8 | `Activity.rpe`: undefined / null / number semantics, no migration | PR-01 | `src/types.ts` |
| 9 | RPE form validation: 0-10 in half steps, exact error string | PR-01 | `src/manual-activity.ts` |
| 10 | sRPE load for runs without Garmin load; hard/easy and ACWR baselines honest | PR-01 | `src/training.ts` |

### B. In this slice, completed on relaunch (workstream 3; first attempt failed before writing code)

Scope: `src/web.ts`, `src/styles.ts`, `src/web-coach-states.ts`, `test/web.test.ts`. Contents: the involve-the-coach
call sites from 09 section 4 (Recent-changes "Discuss this change" -> `discuss-change`; the states page "Ask coach
about this state" and the bubble state card "Discuss this state" -> `discuss-state`; the load card "Talk through this
ramp" chip on a watch/high signal, reusing the review-week intent; profile "Tell the coach about your new goal"; the
manual-run review card mirroring the Garmin one), the tone pass from 09 section 5, the surface-grammar subset from
08 section 11 ("Completed - on plan" badge copy, calendar legend, sync-aware day states, delete toast, Garmin-synced
chip), the RPE form field (`name="rpe"`, 0-10 half steps, wired into the `POST /activities` whitelist), and the CSS
link bump v17 -> v18.

**Incident, recorded honestly:** the first agent assigned to this workstream failed before writing any code. Verified:
no marker strings in any scoped file; the web suite still passed 93/93; the task claim was released. The workstream
was relaunched.

### C. Deliberately deferred (and why)

| Item | Why not in this pass |
|---|---|
| I-04 diff/approve | The decision primitive for big writes; it touches the gateway contract and needs its own design and test budget. Next slice. |
| PR-07 weekly recap, PR-13 block objects | Not built here; the consultant phrasing from 09 section 6 applies when they ship. |
| Structural duplicate/lecture chip detection | Chip validation stays 1-3 items, 1..120 chars; lecture and duplicate detection remains prompt-level. |
| B10 tone settings UI | Consultant-friend is the default meaning of `supportive`; `direct` remains an explicit opt-in. |
| Store/schema changes | Unnecessary: the store persists the full payload JSON; the `rpe` round-trip was verified with zero store changes. |

## 3. Acceptance criteria

1. `COACH_RULES` opens with the persona - "You are the runner's consultant and training friend, not their teacher or
   taskmaster. The runner asks; you respond." - explains the why behind every recommendation in one short sentence,
   never lectures, never moralizes, never grades effort, and keeps the bilingual clause verbatim. Exactly four rules
   are touched; every other rule is byte-identical.
2. A goal or training wish gets a consultant response first: what recent facts show (volume, load, consistency), 2-3
   concrete options with the tradeoff of each in one sentence, one recommendation, and an invitation to sketch or
   apply. Sessions are booked in the same turn only when the message itself explicitly asks to add, move, change or
   delete; anything bigger than a single unambiguous action is offered as a sketch; chit-chat noticing is kept.
3. Suggestion chips have two legal forms - a runner-voiced action ("Book my long run for Sunday") or an invitation
   ("What if we moved the long run to Saturday?"); lecture-style chips and duplicates are banned; 1-3 items, 1..120
   chars, the runner's language, never numbered; the old "No questions" clause is gone, pinned by a negative
   assertion.
4. The reply rule asks for a reply that is "warm, specific, and it speaks as a peer".
5. `discuss-change` requires a `changeSetId` (non-empty, <=200 chars, default source "recent-changes") and
   `discuss-state` requires a `stateId` (default source "state-card"); both build comment-only directives (mode
   "review", `allowCalendarWrites` false, `allowMemoryWrites` true, matching the existing review-* intents) with
   references and background lines; the sources "recent-changes" / "states-page" / "state-card" join the shared
   allowlist.
6. A missing or foreign `changeSetId`/`stateId` returns 404 `{"error":{"code":"reference-not-found"}}` before the
   model call and before the turn claim; the resolved row reaches the prompt as referenced context (change set:
   changeSetId, createdAt, summary, revertedAt, entries; state: stateId, key, status, source, confidence, evidence,
   timestamps); directive hash and idempotent replay are unchanged; a discuss turn that proposes a session write is
   still blocked (`blockedWrites` counted, one repair to comment).
7. `Activity.rpe` is optional: undefined = never set, null = form shown but skipped, number = reported effort; the
   store persists the full payload JSON and no migration was needed (round-trip verified, zero store changes).
8. The manual form accepts `rpe` 0-10 in half steps only (7.5 valid, 7.25 rejected); non-numeric is rejected; absent
   or blank is stored as null; rpe 0 is valid; the error string is exactly "RPE must be between 0 and 10 in half
   steps."; all pre-existing validation is untouched (no future days, bounded distance/duration, idempotent
   deterministic id).
9. `activityLoad` is the Garmin `trainingLoad` when present, else sRPE = durationMin x rpe, else 0; `isHardActivity`
   keeps the Garmin label/anaerobic rule first and counts rpe >= 7 as hard only when no Garmin intensity data exists;
   `hasIntensity` is true when any week activity has Garmin labels or an rpe; `previousWeekLoad` and `fourWeekLoad`
   also count sRPE, so the ACWR baselines are honest; ACWR thresholds, signal bands and the Garmin hard/easy regex
   are unchanged; a defensive guard ignores stale out-of-range stored rpe values.
10. The load note gains exactly "Reported effort (duration x RPE) is included for runs without Garmin load." appended
    only when the selected week has at least one positive sRPE contribution, and never co-occurring with the no-data
    signal.
11. Done: every involve-the-coach call site renders (recent-changes "Discuss this change", states page "Ask coach
    about this state", bubble "Discuss this state", load card "Talk through this ramp" on watch/high, profile goal
    offer, manual-run review card); the tone pass and surface-grammar subset landed; the RPE field is wired into the
    `POST /activities` whitelist; the CSS link moved v17 -> v18. Verified by 103/103 web tests and the live smoke.
12. Done: the full cross-suite run passed (375/375, 15 files); the live process was redeployed (`tools/deploy.ps1`
    CSS gate on v18) and the changed pages were verified by a live smoke test (19/19; temporary account deleted
    afterwards, 0 rows remaining).

## 4. Risks and mitigations

- **Three parallel workstreams could collide on shared files.** Mitigation: disjoint write scopes on the shared task
  board. The one cross-scope need was type safety in `src/types.ts`, satisfied by exactly two additive hunks (the
  `CoachSource` union and optional `changeSetId`/`stateId` on `CoachDirectiveReferences`), disclosed in section 6;
  nothing was renamed or narrowed.
- **Prompt rewrites could quietly drift the enforcement contract.** Mitigation: the suites assert the new language; a
  negative assertion pins the dropped "No questions" clause; a discuss turn that proposes a session write is tested
  through the real comment-only enforcement (`blockedWrites` counted, one repair to comment).
- **sRPE could double-count or distort ACWR.** Mitigation: Garmin `trainingLoad` keeps precedence whenever present;
  rpe >= 7 counts as hard only when no Garmin intensity data exists; the ACWR baselines also count sRPE so the ratio
  stays honest; a defensive guard ignores stale out-of-range stored values.
- **Historical rows have no rpe.** Mitigation: the undefined/null/number semantics; the store already persists the
  full payload JSON, so no migration was needed.
- **A workstream can fail mid-slice.** Mitigation: it did. Workstream 3's first agent wrote no code; verification
  found no marker strings in any scoped file and the web suite still passed 93/93; the claim was released and the
  workstream relaunched.
- **Live deployment restarts the running process.** Mitigation: same as slice 1 - full gate green before deploy; the
  deploy CSS gate moved to v18; changed pages verified afterwards by the live smoke. One incident: cancelling the
  stuck wrapper job after the first deploy also killed the just-deployed server (the harness job object spanned the
  orphaned deploy tree), so the deploy was re-run and verified cleanly; recorded in section 6.

## 5. Progress log

| Batch | State |
|---|---|
| Spec (09) written and approved | done |
| Workstream split, disjoint write scopes on the shared task board | done |
| W1: four COACH_RULES rewrites, all other rules byte-identical | done |
| W1: discuss-change / discuss-state intents + three sources | done |
| W1: gateway referenced context, 404 gate, comment-only enforcement intact | done |
| W1: two additive type hunks in src/types.ts (disclosed deviation) | done |
| W1 verification | done (107/107: coach 32, directives 11, gateway 64; lint + typecheck clean) |
| W2: Activity.rpe semantics, zero store changes | done |
| W2: rpe form validation (0-10, half steps) | done |
| W2: training.ts sRPE load, hard/easy, ACWR baselines, load note | done |
| W2 verification | done (30/30: training 20, manual-activity 10; lint + typecheck clean) |
| Adversarial review of W1+W2 (read-only) | done (272/272 scoped tests; pnpm lint OK; tsc --noEmit exit 0; zero code defects; verdict SAFE AFTER SHOULD-FIXES, both should-fixes triaged by the root as process items) |
| W3 first attempt | failed before writing any code (no markers; web suite 93/93; claim released) |
| W3 relaunch | done (103/103 web tests: 93 pre-existing + 10 new, plus 6 extended; lint + typecheck clean) |
| Doc 10 drafted; review addendum and PR-01 citation fix applied | done |
| Full cross-suite run + integration | done (375/375, 15 files: lint + typecheck + vitest) |
| Live redeploy (CSS gate v18) | done (deploy OK; first server was killed by a cancelled wrapper job, re-run cleanly; gateway 200, login 200 v18) |
| Live smoke test + cleanup | done (19/19 checks; temporary account deleted, 0 rows remaining) |

## 6. Implemented in this pass

| Area | What changed | Files |
|---|---|---|
| Persona | `COACH_RULES` opens with "You are the runner's consultant and training friend, not their teacher or taskmaster. The runner asks; you respond." - explain the why behind every recommendation in one short sentence; never lecture, never moralize, never grade effort; the bilingual clause kept verbatim | `src/coach.ts` |
| Discuss-first | The pusher rule is replaced. A goal or wish gets the consultant response first: what recent facts show (volume, load, consistency), 2-3 concrete options with the tradeoff of each in one sentence, one recommendation, an invitation to sketch or apply. Sessions are booked in the same turn only when the message itself explicitly asks to add, move, change or delete; anything bigger than a single unambiguous action is offered as a sketch; chit-chat noticing kept | `src/coach.ts` |
| Suggestion chips | Two legal forms - a runner-voiced action ("Book my long run for Sunday") or an invitation ("What if we moved the long run to Saturday?"); lecture-style chips and duplicates banned; 1-3 items, 1..120 chars, the runner's language, never numbered; the old "No questions" clause deliberately dropped, pinned by a negative assertion | `src/coach.ts` |
| Reply rule | Extended to "warm, specific, and it speaks as a peer" | `src/coach.ts` |
| Typed intents | `discuss-change` (required `changeSetId`, non-empty <=200 chars, default source "recent-changes") and `discuss-state` (required `stateId`, default source "state-card"); the sources "recent-changes" / "states-page" / "state-card" join the shared allowlist; built directives carry mode "review", `allowCalendarWrites` false, `allowMemoryWrites` true (matching the existing review-* intents), references, and background lines telling the coach what to discuss - comment-only | `src/directives.ts` |
| Gateway | Missing or foreign `changeSetId`/`stateId` returns 404 `{"error":{"code":"reference-not-found"}}` before the model call and before the turn claim; the resolved row reaches the prompt as referenced context (change set: changeSetId, createdAt, summary, revertedAt, entries; state: stateId, key, status, source, confidence, evidence, timestamps); directive hash + idempotent replay unchanged; comment-only enforcement still blocks a proposed session write on a discuss turn (`blockedWrites` counted, one repair to comment) | `src/gateway.ts` |
| Types (disclosed deviation) | `src/types.ts` (owned by workstream 2) gained exactly two additive hunks for type safety: the `CoachSource` union and optional `changeSetId?: string` / `stateId?: string` on `CoachDirectiveReferences`. Nothing renamed or narrowed | `src/types.ts` |
| RPE field | `Activity` gains optional `rpe`: undefined = never set, null = form shown but skipped, number = reported effort; no schema migration - the store persists the full payload JSON (round-trip verified, zero store changes) | `src/types.ts` |
| RPE form | Form input key exactly "rpe"; validated 0-10 in half steps only (7.5 valid, 7.25 rejected); non-numeric rejected; absent/blank stored as null; rpe 0 valid; error string "RPE must be between 0 and 10 in half steps."; all pre-existing validation untouched (no future days, bounded distance/duration, idempotent deterministic id) | `src/manual-activity.ts` |
| Load honesty | `activityLoad` = Garmin `trainingLoad` when present, else sRPE = durationMin x rpe, else 0; `isHardActivity` = Garmin label/anaerobic rule first, rpe >= 7 counts as hard only when no Garmin intensity data exists; `hasIntensity` true when any week activity has Garmin labels or an rpe; the load note gains exactly "Reported effort (duration x RPE) is included for runs without Garmin load." appended only when the selected week has at least one positive sRPE contribution, never co-occurring with the no-data signal; `previousWeekLoad` and `fourWeekLoad` also count sRPE so the ACWR baselines are honest; ACWR thresholds, signal bands and the Garmin hard/easy regex unchanged; a defensive guard ignores stale out-of-range stored rpe values | `src/training.ts` |
| Tests | Workstream-targeted suites green: 107/107 (`test/coach.test.ts` 32, `test/directives.test.ts` 11, `test/gateway.test.ts` 64) and 30/30 (`test/training.test.ts` 20, `test/manual-activity.test.ts` 10); lint and typecheck clean in both workstreams | `test/coach.test.ts`, `test/directives.test.ts`, `test/gateway.test.ts`, `test/training.test.ts`, `test/manual-activity.test.ts` |

**Documented consequences of the load change.** Two intended behaviors follow from the sRPE wiring and are recorded
as design, not accidents. First, a hand-logged run with an rpe can now auto-trigger the load-based coaching states
(`load_spike`, `high_risk`, `under_load`, `hard_easy_imbalance`) that were previously impossible for manual runs -
the PR-01/D10 design intent. Second, when Garmin intensity data exists it always wins over a contradicting RPE: a
Garmin-easy run rated 9/10 stays easy and its sRPE is ignored - spec-literal and test-locked.

**Workstream 3 - web surfaces (completed on relaunch).** All six involve-the-coach call sites render: the
recent-changes card's "Discuss this change" (visible message "Why did the plan change on <day>? (<summary>)" plus the
hidden `discuss-change` intent), the states page's "Ask coach about this state" and the bubble state card's "Discuss
this state" (both `discuss-state`), the load card's "Talk through this ramp" chip on watch/high (reusing the
`review-week` intent with a friend-voiced message), the profile goal offer after a goal change (plain chat, prefilled
"My new goal is <goal>...") and the manual-run "Review this run with the coach" card (mirroring the Garmin card,
`review-activity`). The tone pass replaced the starters with invitations ("Can we plan my week together?", "Where
could a 5 km run fit this week?", "How did last week go?"), made the guardrail line consultative ("... <state> is
protecting the plan - want to talk through what would work instead?") with warning styling, and added a data-accurate
load warning ("This week's load is high (+200% versus last week, ACWR 2.00) - want to talk it through?"). Surface
grammar: the week badge reads "Completed - on plan (+0.0 km)" / short / over; a calendar legend line explains plan
rows, check rows and paired workout rows; day cards distinguish "No session or activity." / "Planned rest." /
"Upcoming." / "No run logged - the plan does not change." / "Awaiting Garmin sync."; a delete toast names the session
and links to Recent changes; the calendar header carries a "Garmin synced <local time>" chip. The RPE form field
(name "rpe", 0-10, step 0.5, optional) is wired into the `POST /activities` whitelist, and the run peek and activity
detail show "Felt <rpe>/10 - hard|moderate|easy". CSS moved to v18 with every deploy-gate class kept. Files:
`src/web.ts`, `src/styles.ts`, `src/web-coach-states.ts`, `test/web.test.ts`.

**Verification (done at write time).** Workstream-targeted suites green: 107/107 for the coach contract (coach 32,
directives 11, gateway 64) and 30/30 for load honesty (training 20, manual-activity 10), each with lint and typecheck
clean.

**Adversarial review of workstreams 1 and 2 (read-only, completed).** 272/272 scoped tests green - 107/107
coach+directives+gateway, 30/30 training+manual-activity, and 135/135 across the other nine files (coach-states, store,
garmin, garmin-sync, garmin-workout, calendar-items, auth, export, garmin-errors); pnpm lint OK; tsc --noEmit exit 0;
claim-by-claim verification found zero code defects. Verdict "SAFE AFTER SHOULD-FIXES": both should-fixes were process
items, and both were triaged by the root - (1) the goal rule in `COACH_RULES` pre-dates this slice (it is the
goal-in-prompt work recorded in the 07 implementation record, already live-deployed, and was verified present in the
file before this slice's workstreams started); (2) the rpe/discuss UI wiring was precisely the then-pending workstream
3, which the relaunch completed and the integration verified (103/103 web tests, live smoke 19/19).

**Integration verification (completed by the root).** The full gate passed: `pnpm check` = lint + typecheck + 375/375
tests across all 15 files (up from 331 pre-slice). The live process was redeployed (deploy log 2026-11-19T01:00,
"Deploy OK: gateway 200, calendar 200"; `tools/deploy.ps1` now gates on `app.css?v=18`). A live smoke test through
real HTTP passed 19/19: signup with a temporary account, the calendar legend and invitation starters, the day-page
RPE control, an invalid rpe 7.25 rejected with the exact banner copy, a valid manual run with rpe 7 producing the
review card and the "Felt 7/10 - hard" detail line, the week view's reported-effort note and hard-effort legend, and
the v18 stylesheet. The temporary account and all its rows were then deleted from the live database (verified 0
remaining). Deploy incident, recorded honestly: the first deploy's wrapper job hung on an inherited pipe after the
script had already finished (the server was up and serving v18); cancelling that job also killed the just-deployed
server because the harness job object spanned the orphaned deploy tree, so the deploy was re-run - its wrapper
completed cleanly ("Deploy OK") and the final server (pid 24796, listeners 8092/8093) is verified healthy.

## 7. What this pass does not claim

- The workstream-3 web wiring and the integration were completed after this record's first draft; both are claimed
  above with their verification (103/103 web tests, 375/375 full gate, live smoke 19/19). The first attempt's failure
  and the deploy incident are recorded in sections 5 and 6.
- It does not claim reference-specific bubble error copy: the client shows the existing "That run could not be
  found." line for gateway 404s on discuss intents, because the client cannot tell which reference failed (an
  existing test forbids reading `data.error.detail`).
- It does not implement I-04 diff/approve (the decision primitive for big writes; next slice), PR-07 weekly recap or
  PR-13 block objects; the consultant phrasing applies when they ship.
- It does not add structural duplicate/lecture chip detection; that stays prompt-level, and chip validation is
  unchanged (1-3 items, 1..120 chars).
- It does not ship the B10 tone settings UI; consultant-friend is the default meaning of "supportive" and "direct"
  remains an explicit opt-in.
- It does not change the store or the schema; none was needed (the store persists the full payload JSON).
- It does not claim RPE-based load equals Garmin `trainingLoad`: Garmin load keeps precedence whenever it exists, and
  the load note labels reported effort as an inclusion for runs without Garmin load.
- It does not claim RPE overrides Garmin intensity data: when Garmin intensity exists it always wins over a
  contradicting RPE - a Garmin-easy run rated 9/10 stays easy and its sRPE is ignored. Spec-literal and test-locked.
