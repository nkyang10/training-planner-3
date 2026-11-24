# Coach contract
**Status:** current · **Owner:** coach/LLM gateway · **Updated:** 2026-11-22 · **Supersedes:** docs/MILEBOOK-CALENDAR.md §7, docs/analysis/09-coach-relationship-model.md, docs/analysis/15-coach-interaction-llm-plan.md

The model proposes; the server validates, enforces and writes. This page is the contract between the coach prompt,
the `propose_calendar_turn` tool and the gateway; every claim names the symbol that enforces it.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [HTTP-API.md](HTTP-API.md) · [COACHING-STATES.md](COACHING-STATES.md) · [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md) · [SECURITY.md](SECURITY.md) · [LIMITS.md](LIMITS.md)

## 1. Who calls what

| Hop | Call | Payload / headers | Failure surface |
|---|---|---|---|
| Browser → web | `POST /chat` | `{ message, intent? }` plus `x-milebook-request-id` | 400 message not 1..1000 chars, 400 bad intent, 404 activity not found, 503 upstream |
| Web → gateway | `POST /v1/chat/completions` | `x-milebook-user`, `x-milebook-internal-token` when configured, `x-milebook-request-id`; body `{ model, stream:false, messages:[{role:"user",content}], milebook:{directive}? }` | 130 s abort → 504 `the coach did not answer in time`; other failure → 502 `the coach service is unavailable` |
| Gateway → model | `POST {MILEBOOK_MODEL_BASE_URL}/chat/completions` | `temperature: 0.3`, `tools: [COACH_TOOL]`, `tool_choice: "auto"`, `parallel_tool_calls: false`, optional bearer `MILEBOOK_MODEL_API_KEY` | 120 s abort by default (`MILEBOOK_MODEL_TIMEOUT_SECONDS`); non-2xx or empty message → 502 `model-failed` |
| Gateway surfaces | `GET /health` (open), `GET /v1/models`, `POST /v1/chat/completions` | `x-milebook-internal-token` on everything except `/health` | 401 `unauthorized`, 404 `not-found` |

- The web surface is the only client: it validates the typed intent, builds the hidden directive and proxies one user
  message; the gateway is internal (no CORS grant). The answer comes from `choices[0].message` — a
  `propose_calendar_turn` tool call is preferred, JSON in `content` is accepted, plain text is a clarification.
  `(src/web.ts · createWeb)` `(src/gateway.ts · callModel)` `(src/gateway.ts · extractProposal)`
- Attempt budget `MILEBOOK_MAX_ATTEMPTS` (default `2`, minimum `1`) = initial proposal + one repair; boot fails closed
  without `MILEBOOK_AUTH_SECRET` (≥32 chars), and the `POC3_*` aliases are gone.
  `(src/index.ts · readEnv)` `(src/index.ts · requireEnv)` `(src/gateway.ts · createGateway)`

## 2. The turn contract

One answer = one JSON object. Unknown keys fail the turn. Required: `reply`, `memories`, `sessions`, `suggestions`,
`revertChangeSetId`; optional: `stateProposals`, `muscleProposals`, `profileUpdates`.
`(src/coach.ts · COACH_TOOL)` `(src/coach.ts · parseCoachTurn)`

| Key | Type and limits |
|---|---|
| `reply` | string, 1..480 chars after markdown stripping |
| `memories` | array, ≤8 items, each 1..200 chars |
| `sessions` | array, ≤14 items; `action` `add`/`update`/`remove` (default `add`); `sessionId` string\|null, non-empty for `update`/`remove`; `day` `YYYY-MM-DD`, required for `add`/`update`; `title` 1..80; `kind` `easy`/`long`/`interval`/`tempo`/`rest`/`cross`/`race`/`racewalk`; `distanceKm` 0..60\|null; `durationMin` 0..300\|null; `note` ≤280\|null |
| `suggestions` | array, 1..3 items, each 1..120 chars |
| `revertChangeSetId` | string ≤100 chars with no whitespace, or `null`; a change-set id or `"last"` |
| `stateProposals` / `muscleProposals` | arrays of ≤3 and ≤6 items, one proposal per muscle (§10) |
| `profileUpdates` | object with at most `language`, `tone`, `replyLength`, `nickname` |

Only `muscleProposals` needs a runner decision per card; `stateProposals` only for `requiresConfirmation` keys; every
other channel applies with the turn. `(src/coach.ts · CoachTurn)`

Valid turn (`today` = 2026-11-22):

```json
{"reply": "Your easy runs have held at 6:10 all month. I moved the long run to Saturday; Wednesday stays as it was.",
 "memories": ["Long runs work best on Saturday morning"], "suggestions": ["Book my long run for Sunday", "What if we moved it to Saturday?"],
 "sessions": [{"action": "update", "sessionId": "session:6f2c", "day": "2026-11-28", "title": "Long run", "kind": "long", "distanceKm": 18, "durationMin": null, "note": null}],
 "revertChangeSetId": null, "profileUpdates": {"nickname": "Sam"}}
```

Rejected turn — each field fails a different rule, so the first issue decides the repair policy:

```json
{"reply": "", "memories": [], "suggestions": [], "revertChangeSetId": null, "extra": true,
 "sessions": [{"action": "update", "sessionId": null, "day": "2026-11-20", "title": "", "kind": "tempo", "distanceKm": 72, "durationMin": null, "note": null}]}
```

Codes, in issue order: `extra-keys`, `invalid-reply`, `missing-session-id`, `past-session`,
`invalid-session-title`, `invalid-distance`, `invalid-suggestions`; nothing is written.
`(src/coach.ts · parseCoachTurn)`

## 3. Validation

Every rule below is server-side; the tool schema only mirrors it. `(src/coach.ts · parseCoachTurn)`

| Rule | Limit | Code |
|---|---|---|
| reply | 1..480 chars after stripping | `invalid-reply`, `reply-too-long` |
| memories | ≤8 × 1..200 chars | `invalid-memories`, `invalid-memory` |
| sessions | ≤14 per turn | `invalid-sessions` |
| action, target, title, kind | `add`/`update`/`remove`; id non-empty for `update`/`remove`; title 1..80; one of the 8 kinds | `invalid-action`, `missing-session-id`, `invalid-session-title`, `invalid-session-kind` |
| day | `YYYY-MM-DD`, and `today`..`today + 180` inclusive for `add`/`update` | `invalid-session-day`, `past-session`, `session-too-far` |
| numbers and note | distance 0..60 km, duration 0..300 min (each or null), note ≤280 or null | `invalid-distance`, `invalid-duration`, `invalid-note` |
| suggestions | 1..3 × 1..120 chars | `invalid-suggestions`, `invalid-suggestion` |
| revert id | null, `"last"`, or ≤100 chars without whitespace | `invalid-revert` |
| state proposals | ≤3; catalog key; `activate`/`resolve`; confidence 0.5..1; evidence 1..3 × 1..200; ttlDays null or integer 1..365; note ≤280 | `invalid-state-*` |
| muscle proposals | ≤6, one per muscle per turn; report needs integer soreness 0..10; conditions from 8 keys; side `both`/`left`/`right`; warmUp `eases`/`same`/`worse`/null; note ≤200; evidence 1..3 × 1..200; confidence 0.5..1 | `invalid-muscle-proposal*`, `duplicate-muscle-proposal` |
| profile updates | only `language` (`en`/`zh-Hant`), `tone`, `replyLength`, `nickname` 1..40 | `invalid-profile-*` |

- Horizon: `HORIZON_DAYS = 180`; a later day is refused and the model must say the limit out loud. `(src/coach.ts · HORIZON_DAYS)`
- Duplicates: an `add` id is derived from `userId:day:kind:title`, so re-adding one session upserts a single row while
  two different titles on one day coexist; a repeated muscle is rejected, an identical pending suggestion skipped, and
  a changed level supersedes the older card for that muscle (dismissed, not deleted). `(src/gateway.ts · applyParsedTurn)`
- Unknown ids are not validation errors: the item is skipped, the rest of the batch applies, and it returns in
  `failures` with `session-not-found` or `missing-session-id`. A revert cannot share a turn with `sessions`, and an
  unknown or already reverted change set is refused with zero writes. `(src/gateway.ts · applyParsedTurn)`

Policy per code — the first issue's code selects it:

| Code | Policy | Repair instruction |
|---|---|---|
| `comment-only-write` | `respect-directive` | reply with the comment, no sessions, no revert |
| `mode-guardrail` | `respect-state` | change the session to an allowed kind, never override the state |
| `session-too-far` | `explain-limit` | explain the 180-day limit, book nothing beyond it |
| `past-session`, `missing-session-id`, `invalid-action`, `invalid-session-kind` | `ask-user` | ask one short question instead of moving or rewriting |
| everything else | `repair-format` | correct the format only, invent no facts or dates |

`(src/coach.ts · policyForCode)` `(src/gateway.ts · repairInstruction)`

## 4. Repair loop and idempotency

`for attempt = 1..maxAttempts`: call the model, extract the proposal, validate. On failure the gateway appends
structured feedback and asks again; on the last attempt it replies with a deterministic fallback and writes no
calendar change. `(src/gateway.ts · createGateway)`

- Feedback payload:
  `{ ok:false, code, issues[], context{today, timezone, weekday, tomorrow, horizonEnd}, attempt, maxAttempts, policy }`.
  A tool call receives it as a `role:"tool"` message with the instruction inside; plain text receives an assistant turn
  plus a user instruction. `(src/coach.ts · buildValidationFeedbackForCode)` `(src/gateway.ts · appendRepair)`
- Transport failure is not repaired: the turn is marked failed, the gateway answers 502 `model-failed` and the browser sees 503 with stable copy, and the
  fallback text follows the surviving code. `(src/gateway.ts · fallbackFor)`

Idempotency, keyed by `x-milebook-request-id` (or body `request_id`), pattern `^[A-Za-z0-9._:-]{1,100}$`, disabled when
`stream: true`; the browser mints a 16-byte hex id per send and retries once with it when the fetch itself throws.
`(src/gateway.ts · requestIdFrom)` `(src/web.ts · createWeb)`

| Stored status | Repeat request | Result |
|---|---|---|
| `completed`, same directive hash | replay | 200 with the cached completion and `x-milebook-idempotent-replay: true`; no model call, no writes |
| `completed`, different directive hash | replay | 409 `directive-mismatch` |
| `in_progress`, claim younger than the 10-minute lease | duplicate | 409 `turn-in-progress` |
| `in_progress`, claim older than the lease | abandoned by a crash | the row is failed and reclaimed, then served like a first request | `(src/gateway.ts · TURN_LEASE_MS)` |
| `failed` | retry | the claim is re-taken and the turn runs again |
| absent | first request | claimed `in_progress` before the model call |

A completed row is never overwritten: the claim upsert re-claims only `failed` rows.
`(src/store.ts · claimCoachTurn)`

## 5. Hidden directives

Server-authored: the browser sends a typed intent, never hidden prose. Fields:
`(src/directives.ts · parseCoachDirective)` `(src/types.ts · CoachDirective)`

| Field | Allowed values |
|---|---|
| `mode` / `allowCalendarWrites` | mode `chat`, `review`, `plan`, `undo`; writes boolean, required, `false` = comment-only |
| `allowMemoryWrites` | boolean, optional; `false` drops memories and preference writes |
| `focus` | ≤4 of `schedule`, `pace`, `hr`, `load`, `race_execution`, `recovery`, `consistency` |
| `references` | `activityId`, `day`, `weekStart`, `sessionIds` (≤100), `changeSetId`, `stateId`, `muscleId` |
| `background` | server-authored string, 1..280 chars |
| `source` | 13 surfaces: `composer`, `run-peek`, `session-peek`, `day-menu`, `today-strip`, `history`, `load-card`, `auto-sync`, `activity-detail`, `recent-changes`, `states-page`, `state-card`, `muscle-tab` |
| `style` | `language` `auto`/`en`/`zh-Hant`, `tone` `supportive`/`direct`/`brief` |

Intent → directive (`chat` produces none): `(src/directives.ts · buildDirectiveForIntent)`

| Intent | Mode | Writes | Focus / references | Default source |
|---|---|---|---|---|
| `review-activity` | review | none | schedule, pace, hr, race_execution; `activityId` + its stored day | `run-peek` |
| `review-day` | review | none | schedule, load; `day` | `day-menu` |
| `review-week` | review | none | load, consistency, schedule; `weekStart` (Monday) | `load-card` |
| `plan` | plan | allowed | schedule; optional `day` | `day-menu` |
| `undo` | undo | allowed | none | `composer` |
| `discuss-change` | review | none | schedule; `changeSetId` | `recent-changes` |
| `discuss-state` | review | none | load, recovery; `stateId` | `state-card` |
| `review-muscles` | review | none | recovery; optional `muscleId` | `muscle-tab` |

Comment-only enforcement is layered:

1. The rendered directive says "This turn is comment-only: reply in plain text, write no sessions and no revert".
   `(src/directives.ts · renderCoachDirective)`
2. The gateway counts the attempt as blocked (`blockedWrites`), raises `comment-only-write` with policy
   `respect-directive` and spends a repair attempt. `(src/gateway.ts · createGateway)`
3. `applyParsedTurn` refuses again even if a caller skipped the check, answering "I kept this turn to a comment and did
   not change your calendar." with outcome `clarified`. `(src/gateway.ts · applyParsedTurn)`

References are resolved from the store, never trusted from the browser: a foreign or missing activity, session, change
set, state or muscle fails the turn with 404 `reference-not-found` before any model call, and a referenced activity
must belong to the referenced day. `(src/gateway.ts · resolveDirectiveReferences)`

The visible bubble never contains the directive: the stored user message is the visible text alone, while the rendered
suffix is persisted on the audit row and re-appended only at assembly, so `/chat/history` shows conversation only and
`/coach-audit` shows the directive to the owner. `(src/gateway.ts · persistDirective)` `(src/coach.ts · buildTurnSuffix)`

## 6. Prompt assembly and caching

| Segment | Built by | Changes when |
|---|---|---|
| system head | `COACH_RULES` (38 rules) + state catalog + running-thread note | the deploy changes `COACH_PROMPT_VERSION` |
| dated snapshot | profile, memories, facts, states, muscle status, pending suggestions | the epoch rule fires |
| conversation | stored messages, date-stamped, with stored suffixes | every turn appends |
| turn message | visible text + this turn's hidden suffix | always new bytes |

- The system head is byte-stable per deploy and names no turn; bumping `COACH_PROMPT_VERSION` gives every runner one
  fresh snapshot with reason `coach-updated`.
  `(src/coach.ts · buildCoachSystemPrompt)` `(src/coach.ts · COACH_PROMPT_VERSION)`
- A snapshot is deterministic for the same rows: `Runner profile (JSON)`, `Remembered (JSON)`, `Facts (JSON)`, active
  states, then optional `Muscle status` and `Pending muscle suggestions`; its header dates it and declares it newest.
  `(src/coach.ts · buildContextSnapshot)`
- The epoch is a sha256 over prompt version, today, latest change set, latest activity + count, latest muscle
  check-in, pending muscle-proposal ids, active state keys, memory ids, profile hash, preference hash; reasons come
  from diffing the parts: `first-turn`, `coach-updated`, `new-day`, `new-activities`, `new-muscle-check-in`,
  `muscle-suggestion-changed`, `calendar-changed`, `states-changed`, `memories-updated`, `profile-updated`. No reason
  = no snapshot = pure append. `(src/coach.ts · coachEpoch)` `(src/coach.ts · epochReasons)`
- Snapshots are byte-frozen rows, never rebuilt from mutated data, and the table keeps the newest 3 per runner.
  `(src/store.ts · appendPromptSnapshot)` `(src/store.ts · listPromptSnapshots)`
- Assembly interleaves snapshots and messages by creation time, stamps each message `[local date time]`, appends the
  stored suffix for directive turns, and always includes the newest snapshot even when it predates the history window;
  compaction estimates characters / 4 plus per-item overhead against an 8000-token budget, drops the oldest messages
  first, never goes below 10 messages and never drops a snapshot. `(src/coach.ts · assembleConversation)`
- `prefill` reports `epoch`, `refreshed[]`, `compacted`, `today`, `latestChangeSetId`, `latestActivityId`; compaction
  is a flag, not an epoch reason. Per-turn windows: 20 history messages, 3 snapshots, 50 directive suffixes, 10 change
  sets, 30 activities, 30 past days, 40 muscle check-ins, 12 memories rendered of 24 kept.
  `(src/gateway.ts · GatewayPrefill)` `(src/gateway.ts · createGateway)` `(src/coach.ts · COACH_MEMORY_WINDOW)`
  `(src/store.ts · appendMemory)`

The client predicts the re-prefill from local signals (sync, check-in, new day, calendar change, state change, first
turn) and names the reason in the typing line; the response's `prefill` block replaces the guess. `(src/web.ts · createWeb)`

## 7. Reply style contract

| Rule | Limit | Enforced by |
|---|---|---|
| spoken length | 2-4 short sentences, usually 2 | prompt only (`COACH_RULES`) |
| character cap | 480 | validator, `reply-too-long` |
| questions | at most one | prompt only |
| markdown | none: no headings, lists, bullets, bold, quotes | deterministic strip before validation |
| suggestions in the reply body | forbidden | prompt only |
| clarification | plain text, no tool call, ≤2000 chars | gateway, `invalid-clarification` |

`(src/coach.ts · MAX_REPLY_CHARS)` `(src/coach.ts · stripReplyStructure)` `(src/gateway.ts · extractProposal)`

The strip removes `**bold**`, `__underline__`, leading `#`, `-`/`*`/`+` bullets, `1.`/`1)` numbering, block quotes and
runs of three or more newlines, then trims; it never burns a repair attempt. An over-long reply is repairable:
`reply-too-long` carries "shorten it, keeping the answer and the day it refers to" with policy `repair-format`. `(src/coach.ts · parseCoachTurn)`

## 8. Silent preference profile

Four writable keys, nothing else: `language` (`en`/`zh-Hant`), `tone` (`supportive`/`direct`/`brief`), `replyLength`
(`short`/`standard`), `nickname` (1..40). `(src/coach.ts · ProfileUpdates)`

- Merge policy: each present key overwrites its column, absent keys keep their stored value; one row per runner.
  Applied inside the turn's transaction, never rendered, never announced, never confirmed, and skipped with memories
  when `allowMemoryWrites` is false. `(src/store.ts · patchCoachPreferences)` `(src/gateway.ts · applyParsedTurn)`
- Heuristic: while no language is stored, the previous stored user message and the new question both containing CJK
  persist `zh-Hant`; English is never auto-persisted, and an explicit switch in a message wins per turn. The profile
  renders inside snapshots, so a preference change bumps the epoch (`profile-updated`) and rides the next snapshot
  instead of rewriting cached bytes; transparency is owner-only, on `/coach-audit`.
  `(src/gateway.ts · detectLanguage)` `(src/coach.ts · buildContextSnapshot)` `(src/web-coach-states.ts · renderCoachAudit)`
- Memory window: the prompt renders the newest 12 memories, the store keeps 24, and a normalized duplicate is skipped
  on write. `(src/coach.ts · COACH_MEMORY_WINDOW)` `(src/store.ts · appendMemory)`

## 9. Suggestions

- Starters: three localized prompts (`coach.starter1..3`) shown when the bubble opens with no chips; a turn's
  suggestions replace them, and they return when a turn returns none.
  `(src/i18n.ts · createTranslator)` `(src/web.ts · createWeb)`
- Follow-ups: 1..3 chips, 1..120 chars, two legal forms — an action the runner voices or an invitation to discuss; a
  tap sends the chip text as a plain chat turn with no directive. `(src/coach.ts · COACH_RULES)`
- Failure card: only when `failures` is non-empty. Head "Could not apply"; each line is action, title, day and reason
  (`no session was specified` / `that session no longer exists`); actions "Show <day>" (a `review-day` intent) and
  "Try again" (same text and intent). The valid part of the batch stands, the change set is recorded, and the stored
  reply gains one note line in its own language.
  `(src/web.ts · createWeb)` `(src/gateway.ts · TurnFailure)` `(src/gateway.ts · failureNote)`
- Change set and undo: a committed batch returns `changeSetId` and `changes[]`, animated before the "Calendar updated"
  line; a blocked comment-only turn shows "Calendar unchanged"; a guardrail block names the state. Undo paths share one
  implementation: chat `revertChangeSetId` and the Recent-changes form `POST /calendar/changes/<changeSetId>/revert`
  both call the same inverse, which appends an audit change set and marks the original reverted; an already reverted
  set is a no-op reported as `undoError`. `(src/web.ts · createWeb)` `(src/history.ts · applyRevert)`

## 10. Muscle and state channels

| | Muscle proposals | State proposals |
|---|---|---|
| Max per turn | 6, one per muscle | 3 |
| Evidence | 1..3 quotes, ≤200 chars each | 1..3 lines, ≤200 chars each |
| TTL | fixed 7-day offer window | `ttlDays` null or 1..365, else the catalog default |
| Superseding | a changed level dismisses the older pending card for that muscle | one open row per key; a newer proposal updates it |
| Decision endpoint | `POST /muscle/proposals/<id>/confirm`, `/dismiss`, `/restore` | `POST /coach-states/<id>/confirm`, `/resolve` |
| Who writes the record | only the confirm path, after the tap | the gateway, in the turn's transaction |

- Muscle: the coach records pending rows only. `confirmMuscleProposal` is the sole writer of a check-in or status
  control, and it re-resolves the run link against the store, so a deleted or moved run downgrades to an unlinked
  report. A proposal is offered only inside 7 days of its day; `hold`/`release`/`resolve` also need an active status,
  and the honest failure is returned instead of writing a control with nothing behind it.
  `(src/muscle-proposals.ts · confirmMuscleProposal)` `(src/muscle-proposals.ts · partitionPendingMuscleProposals)`
  `(src/muscle-proposals.ts · MUSCLE_PROPOSAL_TTL_DAYS)`
- State: keys come from the 34-entry catalog; `requiresConfirmation` keys land as `observing` and their guardrails do
  not apply until confirmed; a runner-set state outranks a chat proposal; hard guardrails refuse a session even when
  the prompt said otherwise (`mode-guardrail`). At most 8 detected states per refresh, 180-day retention, a 7-day
  cooldown after the runner resolves a key, every transition in the state event journal.
  `(src/coach-states.ts · applyStateProposals)` `(src/coach-states.ts · stateGuardrailViolations)` `(src/coach-states.ts · syncCoachStates)`

Endpoints live in [HTTP-API.md](HTTP-API.md), the catalog in [COACHING-STATES.md](COACHING-STATES.md), muscle records in [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md).

## 11. Persona

The five consultant-friend clauses, each carried by shipped `COACH_RULES` text:

| Clause | Shipped rule (verbatim fragment) |
|---|---|
| Pull, not push | "The runner asks; you respond." — the coach never converts conversation into writes on its own initiative |
| Options, not orders | "name the alternatives in one breath - the tappable suggestions carry the menu, your reply carries the advice" |
| The runner decides | "Book sessions in the same turn only when the message itself explicitly asks to add, move, change or delete a session" |
| Evidence, not judgment | "never lecture, never moralize, never grade effort" |
| Safety is the one exception | "Never diagnose, prescribe calories or weight, or guarantee a result. Pain or medical topics end with a clinician referral." |

Tone book distilled from the same constant — banned register and shipped counter-rule:

| Banned | Shipped counter-rule |
|---|---|
| teacher / taskmaster voice | "You are the runner's consultant and training friend, not their teacher or taskmaster." |
| lecture, headings, lists, markdown | "Write like you speak: 2-4 short sentences, usually 2, and at most one question. No headings, no numbered lists, no bullet lists, no markdown" |
| plumbing talk ("record updated") | "Never announce plumbing ("suggestion recorded", "record updated", "entity saved")" |
| claiming a suggestion is saved | "say you suggested it, never that it is logged or saved" |
| re-proposing a pending card | "If the context lists one as not confirmed, do not re-propose it" |
| a colder reply when a card rides along | "A suggestion rides along; it never changes your voice." |

`(src/coach.ts · COACH_RULES)`

## 12. Invariants

1. Nothing is written unless `parseCoachTurn` returns `ok`, the whole turn commits in one transaction, and
   `allowCalendarWrites: false` is enforced twice — in the attempt loop and again in the apply step.
   `(src/coach.ts · parseCoachTurn)` `(src/gateway.ts · applyParsedTurn)` `(src/gateway.ts · createGateway)`
2. The system head stays byte-stable per deploy, snapshots stay append-only and byte-frozen, and any change to a
   rendered segment bumps `COACH_PROMPT_VERSION`.
   `(src/coach.ts · COACH_PROMPT_VERSION)` `(src/store.ts · appendPromptSnapshot)`
3. The directive never enters the visible chat or `/chat/history`; it lives on the audit row and is re-appended only at
   assembly. `(src/gateway.ts · persistDirective)`
4. The coach never writes a muscle record — proposals are rows, and only a runner's confirm writes a check-in or
   control — and a model-supplied `activityId` is resolved against the store (owned, same day) or stripped.
   `(src/muscle-proposals.ts · confirmMuscleProposal)` `(src/gateway.ts · applyParsedTurn)`
5. A revert and schedule edits never share a turn, and an already reverted change set is never reverted twice.
   `(src/gateway.ts · applyParsedTurn)` `(src/history.ts · applyRevert)`
6. Idempotency is server-side: a completed request id replays the cached completion, a different directive hash is
   409, and a completed row is never re-claimed. `(src/store.ts · claimCoachTurn)`
7. Prompt-borne evidence and notes are data, never instructions; active states are authoritative background that is
   never quoted to the runner. `(src/coach-states.ts · renderActiveCoachStates)`
