# POC3 - coach-interaction implementation record: the peer voice, the cached prefill and the silent profile

**Status:** implemented and fixture-verified on 2026-11-20. **Scope:** what actually shipped from
[15-coach-interaction-llm-plan.md](15-coach-interaction-llm-plan.md) (LL-1..LL-6), in which files, with which
owner decisions, and with what verification. The plan's findings (CI-01..CI-09) are the "before"; this is the
"after". The deployment note at the end records what went live.

## 1. Owner decisions taken (per "go with your professional knowledge")

| Decision | Taken as | Where |
|---|---|---|
| D19 reply cap + enforcement | 480 characters, one repair attempt, plus a deterministic markdown strip pass before validation | `src/coach.ts` (`MAX_REPLY_CHARS`, `reply-too-long`, `stripReplyStructure`) |
| D20 language persistence | Two consecutive Chinese user messages persist `language: zh-Hant` silently. English is the default and is never auto-persisted; a message that clearly switches language always beats the stored value, so bilingual runners keep their per-message choice | `src/gateway.ts` (`detectLanguage`), language rule in `src/coach.ts` |
| D21 snapshot persistence | Snapshot bodies are persisted byte-frozen (`prompt_snapshots` table, newest 3 kept), so reloads and later turns reproduce the exact bytes the provider cached | `src/store.ts`, `src/gateway.ts` |
| D22 preference write scope | The model channel writes only `language`, `tone`, `replyLength`, `nickname`; medical and training facts stay in memories and coaching states | `src/coach.ts` (tool schema + `ProfileUpdates`), `src/gateway.ts` |

## 2. What shipped, slice by slice

- **LL-1 - the reply style contract.** `COACH_RULES` rewritten as the peer voice: 2-4 short sentences, usually 2,
  at most one question, no headings/lists/markdown, the runner's name at most once in a while, the suggestion
  chips carry the menu. The cap dropped 2000 -> 480 with a `reply-too-long` repair code; a deterministic
  `stripReplyStructure` pass runs before validation, so markdown cosmetics never burn the one repair attempt and
  the plain-text bubble never shows literal `**` noise. The gateway fallbacks were slimmed to one sentence plus
  one actionable clause. `src/coach.ts`, `src/gateway.ts` (`FALLBACK_REPLY`, `fallbackFor`).
- **LL-2 - the prompt restructure.** The old monolithic `buildCoachPrompt` (rebuilt per turn, conversation and
  question embedded inside `system`, a wall-clock `now` busting the cache every second) is replaced by four
  pure builders: `buildCoachSystemPrompt` (rules + catalog, byte-stable per deploy), `buildContextSnapshot`
  (the dated profile block + facts), `buildTurnSuffix` (the directive block plus referenced context riding the
  trailing turn's user message), and `assembleConversation` (snapshots interleaved with date-stamped history,
  ending with the turn message). History is sent once, not twice; the conversation date-stamps come from
  stored `createdAt`, deterministic per timezone. Each historical directive turn's rendered suffix is persisted
  on its audit row (`renderedPromptSuffix`), so the next turn reproduces the exact bytes. `src/coach.ts`.
- **LL-3 - epochs and snapshots.** A per-runner epoch (prompt version, day, latest change set, latest activity,
  latest muscle check-in, active state keys, memory ids, profile hash, preference hash) decides when the
  attached facts are outdated: a new dated snapshot is appended only when the epoch differs, and the diff names
  the reasons (`first-turn`, `coach-updated`, `new-day`, `new-activities`, `new-muscle-check-in`,
  `calendar-changed`, `states-changed`, `memories-updated`, `profile-updated`). Between fires the conversation
  purely appends. Snapshots are byte-frozen rows (`prompt_snapshots`, newest 3); the assembly compacts only past
  a ~8K-token budget, dropping oldest messages first and never below ten. The staleness contract is a rule: the
  newest snapshot is authoritative, older ones are history, and the runner's newer words beat the snapshot. The
  completion meta gains `poc3.prefill` (`epoch`, `refreshed`, `compacted`, `today`, `latestChangeSetId`,
  `latestActivityId`). `src/coach.ts` (`coachEpoch`, `epochReasons`), `src/gateway.ts`, `src/store.ts`,
  `src/types.ts`.
- **LL-4 - the loading line with a reason.** The typing line keeps the bare ellipsis for cached-append turns and
  becomes a localized status sentence when a re-prefill is expected: fresh Garmin import
  ("Pulling in your latest runs..."), saved muscle check-in ("Refreshing how your body feels..."), a confirmed
  or resolved state ("Noting your coaching states..."), a new day ("New day - checking your plan..."), a new
  calendar batch ("Your calendar changed - re-reading it..."), first turn ("Getting to know you and your
  plan..."). The client predicts from signals it already has (`?synced=N`, `?saved=1`, a state action, the stored
  prefill block, the changes tab) and the response's `prefill` replaces the guess with the server's truth, kept
  in `localStorage` for the next prediction. Copy ships complete in en and zh-HK through the existing `js.*`
  client-string channel. `src/web.ts` (dock script, `/chat` proxy passthrough), `src/i18n.ts`.
- **LL-5 - the silent preference profile.** A per-runner `coach_preferences` row (language, tone, replyLength,
  nickname) is updated silently: the model sets them through an optional `profileUpdates` tool field validated
  against the same enums (never rendered, never announced, transactional, skipped on memory-write-forbidden
  turns), and the server heuristic persists `zh-Hant` after two consecutive Chinese messages. The prompt obeys
  the hierarchy: the message's script wins, the learned profile fills bare follow-ups, English is the default.
  The profile rides inside the snapshot's Runner profile block, so a preference change refreshes only at the
  next epoch boundary - it never busts the cache by itself. The audit page (`/coach-audit`) shows the values and
  the snapshot window; the runner never sees the profile. `src/coach.ts`, `src/gateway.ts`, `src/store.ts`,
  `src/web-coach-states.ts`.
- **LL-6 - memory hygiene.** Memories merge on write: a normalized duplicate (case and spacing insensitive) is
  skipped, and the table keeps the newest 24 per runner; the prompt renders the 12-memory window instead of the
  old 100. `src/store.ts` (`appendMemory`), `src/gateway.ts`.

## 3. Verification

- **Gates:** `pnpm check` green - lint (51 files, no console/TODO/any/secrets), typecheck, and the full Vitest
  suite **556/556** (21 files; 516 before this slice, +40 new). New coverage: the strip pass and the 480 cap;
  the reply-too-long repair path; profileUpdates parsing and tool schema; epoch hashing and every reason diff;
  snapshot rendering (profile/memories/facts/states/muscle, determinism); turn-suffix rendering for every
  directive kind; assembly stamping, snapshot interleaving, suffix byte-reproduction, prefix identity across a
  growing conversation, and budget compaction (fixture level); gateway-level - one snapshot on the first turn,
  pure append with a byte-identical prompt prefix when nothing changed (the queued prompts' prefix assertion),
  `calendar-changed` and `new-day` epoch bumps, `poc3.prefill` contents, silent preference application, the
  two-message zh-Hant heuristic (and no single-message false positive), the comment-only memory-write gate, and
  directive-suffix persistence reproduced in the next turn's prompt; store-level - snapshot append/prune/oldest
  first, preferences patch semantics, memory dedupe and the 24-cap, directive-suffix listing; web-level - the
  `/chat` prefill passthrough (and a null degrade for a gateway without it), the audit page's preference and
  snapshot sections, and both locales' wait-line strings.
- **Byte-stability probe** (`tmp/prompt-size-probe.ts`, gitignored, re-runnable with
  `pnpm exec tsx tmp/prompt-size-probe.ts`), on the same mid-size synthetic runner as the plan's "before"
  numbers: rules 10,084 chars (~2.5K tok), system prompt 14,635 chars (~3.7K tok, cached per deploy), snapshot
  body 8,075 chars (~2.0K tok, cached per epoch), turn N message bytes 8,249 chars (~2.1K tok). The headline:
  **with no epoch bump, turn N+1 reuses turn N's entire message prefix byte-identically; the fresh bytes are the
  trailing message only (41 chars in the probe)**, and a directive turn adds only its suffix (507 chars) to the
  same cached prefix. The plan's "before" state re-prefilled the whole ~5.6K-token prompt tail plus a duplicated
  conversation every turn.
- **Not yet live-verified:** the provider-side cache-hit effect (the gateway's `usage` passthrough is still
  stubbed to zeros, `src/gateway.ts` `completionBody`) - the byte-stability is proven, the backend's cache is an
  external property. A live model turn is below.

## 4. Honest deviations from the plan

- The plan's reason list included `conversation-compacted` as a predicted line; compaction is reported in
  `poc3.prefill.compacted` and on the audit page, but the typing line does not predict it (the client cannot
  know the token budget ahead of the turn). The plan's `memories-updated` reason exists but is likewise not
  client-predictable; the server meta still records both.
- The plan sketched segment B (profile) and segment C (facts) as separate messages; they ship as one snapshot
  body, which is what makes preference changes ride the epoch rule instead of rewriting a cached segment.
- English is not auto-persisted (D20 taken narrowly): with the script-wins hierarchy the stored "en" would add
  nothing, and auto-persisting it would have bumped every runner's epoch on their first two turns.

## 5. Deployment and live verification

Deployed with `tools/deploy-task.ps1` (the scheduled `\POC3-Live-Deploy` task, so the live process tree belongs
to Task Scheduler): gateway **:8092** and calendar **:8093** healthy, `app.css?v=28`, pid recorded in
`data/poc3-deploy.log` (2026-11-20). One operational note for future deploys: launching `pnpm deploy:live`
inside a harness background job is fine, but killing that job reaps the freshly started live process with it -
use the scheduled task instead.

**Live-verified (a temporary account, removed afterwards with all 14 rows it produced):**

- A real model turn through the live gateway (`dgx/general`): the first Chinese message answered in
  conversational Traditional Chinese at **99 characters**, one question, three tappable Chinese suggestion
  chips, no markdown; the second at **68 characters**. The 480-character voice contract visibly shaped the
  replies.
- `poc3.prefill` end to end: turn 1 reported `refreshed: ["first-turn"]`; turn 2 reported
  `["memories-updated", "profile-updated"]` - the model's silent memory write plus the two-message zh-Hant
  heuristic, each named in the loading-line vocabulary.
- The silently learned profile: `/coach-audit` shows **zh-Hant** under "What the coach has learned about you"
  and the snapshot window with its epoch reason chips. The runner's own chat never mentioned any of it.
- The dock script ships the wait-line strings and the `poc3.coachPrefill` prediction hook on the live calendar
  page, in both locales.
- Not yet live-measured: the provider's own cache-hit effect (the gateway's `usage` passthrough is still
  stubbed to zeros); the byte-stability that makes caching possible is proven at the fixture and probe level.
