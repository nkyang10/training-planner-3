# Milebook - the coach interaction, reviewed from the LLM architect's seat: reply style, cached prefill and the silent runner profile

**Status:** review + plan, waiting for owner decisions (D19-D22). **Date:** 2026-11-20.
**Implemented 2026-11-20:** LL-1..LL-6 shipped with the recommended decisions; see
[16-coach-interaction-implementation-record.md](16-coach-interaction-implementation-record.md) for what shipped,
the deviations, and the verification.
**Scope:** how the coach talks to the runner and how it is fueled: the prompt anatomy in `src/coach.ts`, the turn
loop in `src/gateway.ts`, the hidden-directive system in `src/directives.ts`, the bubble client in `src/web.ts`, and
the per-runner facts in `src/types.ts` / `src/i18n.ts`. The owner directive behind this document has four asks:
(1) less structural replies, (2) shorter, more to-the-point replies, (3) an LLM prefill cache that is actually
obeyed - the conversation keeps appending unless a rule decides the attached facts (activities, body condition) are
outdated, and a full re-prefill is announced in the bubble instead of a bare "..." - and (4) a friendly coach that
fits the runner's language and silently maintains a preference profile, refreshed only when a new prefill is
expected anyway.
**Producer:** the root agent, acting as the LLM architect. Nothing in this document has been implemented; it is the
plan the owner asked for. All code anchors were re-grepped at HEAD on 2026-11-20.

## 1. Method

Every claim below is anchored to `file:line` in the working tree, or measured. The one measurement worth stating
up front: a throwaway probe (`tmp/prompt-size-probe.ts`, gitignored, re-runnable with
`pnpm exec tsx tmp/prompt-size-probe.ts`) builds two consecutive coach prompts through the real
`buildCoachPrompt` with a mid-size synthetic runner (24 memories, 14 upcoming + 12 past sessions, 20 activities,
6 change sets, 10 history messages) and diffs them byte by byte. Numbers from that probe:

| Segment | Size (chars) | ~Tokens |
|---|---|---|
| `COACH_RULES` (31 rules) | 9,071 | 2,270 |
| state catalog (34 keys, rendered) | 4,246 | 1,060 |
| `COACH_TOOL` JSON schema | 2,393 | 600 |
| full prompt, that runner | 22,509 | 5,630 |
| byte-identical leading prefix, turn N vs N+1 | 13,636 (61%) | ~3,400 |
| divergence point | the facts JSON's `now` field | - |

61% is the *best* case: the probe held everything constant except `now`, the question and one appended history
message. In production the facts JSON (`memories`, `sessions`, `activities`, `recentChanges`) mutates with every
sync, booking and memory write, so the stable prefix is the rules + catalog only, and on action-originated turns
(a hidden directive is inserted right after the rules, `src/coach.ts:330`) the stable prefix shrinks to the rules
alone. Everything after it - including the whole conversation, sent twice - is re-prefilled every turn.

## 2. The interaction today, in one screen

The runner types (or taps an intent) in the bubble; `/chat` proxies to the gateway; the gateway rebuilds the
entire prompt from the store, calls the model once with `propose_calendar_turn`, validates, repairs once, applies
atomically and returns the reply plus `milebook` metadata; the bubble renders the reply as plain text, tappable
suggestions, state cards, guardrail and failure cards (`src/web.ts:2622-2691`, `/chat` proxy `src/web.ts:4236`,
meta flatten `src/web.ts:4319-4390`). The contract - server-validated proposals, idempotent replay, hidden typed
directives, durable states with guardrails, an audit page - is the strong half of this product and is not touched
by this plan. This plan changes only what the model is *fed* and how its *reply voice* is shaped.

## 3. Findings

- **CI-01 - the prompt is rebuilt per turn, so no provider prefix cache can survive it.**
  `buildCoachPrompt` (`src/coach.ts:279-397`) renders rules + turn directive + active states + muscle facts +
  the state catalog + a facts JSON + referenced context + the conversation + the question into ONE `system`
  message; the gateway then sends `[system, ...last 20 messages, question]` (`src/gateway.ts:963-967`). The
  conversation therefore rides twice (once date-stamped inside system, once as real messages), the question rides
  twice (inside system and as the final user message), and the system message mutates every turn. On any
  OpenAI-compatible backend with automatic prefix caching (vLLM block-level caching, OpenAI prompt caching at
  >=1024 shared tokens), turn N+1 can reuse at most the rules+catalog head (~3.4K tokens of a ~5.6K-token prompt
  for a mid-size runner), and on directive turns only the rules (~2.3K). The expensive tail is re-prefilled every
  time. This is the direct opposite of the owner's ask: nothing "keeps appending".
- **CI-02 - a wall-clock instant sits inside the volatile facts.** `now: input.now ?? null`
  (`src/coach.ts:284`, filled at `src/gateway.ts:907`/`936`) changes every second, so even a runner who changes
  nothing gets a new prompt every turn. Day granularity is all the model needs; the instant busts the cache for
  free.
- **CI-03 - memories are unbounded prompt ballast.** The prompt embeds up to 100 memories
  (`src/store.listMemories(userId, 100)`, `src/gateway.ts:937`; rendered at `src/coach.ts:291`), appended up to 8
  per turn forever, never merged or deduplicated. A chatty runner grows their cache-busting payload with every
  turn. The probe's 24 memories alone were ~1.6K chars of the facts JSON.
- **CI-04 - the reply voice is structurally unconstrained.** The cap is 2,000 characters
  (`MAX_REPLY_CHARS`, `src/coach.ts:29`); no rule bans headings, numbered lists, bullets or markdown; one rule
  even prescribes structure ("offer 2-3 concrete ways ... with the tradeoff of each in one sentence",
  `src/coach.ts:252`). The bubble renders plain `textContent` (`src/web.ts:2119-2126`), so markdown arrives as
  literal `**` and `-` noise; and because tappable suggestions already carry the next steps
  (`src/coach.ts:270-271`), a long structured reply duplicates the rail below it. The fallbacks add their own
  second paragraphs (`src/gateway.ts:316-330`). Result: the coach sounds like a report, not a friend - the exact
  complaint behind asks (1) and (2).
- **CI-05 - the wait is a bare "..." with no story.** The typing line is a literal ellipsis
  (`src/web.ts:2629`), no streaming (README honest limits), so the runner cannot tell a fast cached-prefix turn
  from a full re-prefill. The owner asks for a reason line when the whole prompt must be re-read; today there is
  no mechanism to even know it at the client.
- **CI-06 - language is a per-message heuristic, not a runner fact.** Rule 1 guesses from the latest message's
  Chinese characters (`src/coach.ts:246`); the UI locale is a cookie (`resolveLocale`, `src/i18n.ts:2548-2551`),
  not stored on the profile; the directive schema already knows `language: auto|en|zh-Hant` and
  `tone: supportive|direct|brief` (`src/directives.ts:45-46`) but only action buttons ever set it, and nothing
  persists it. A bilingual runner (persona P8 in 01) gets language roulette every turn.
- **CI-07 - there is no silent preference profile.** The profile is `displayName/timezone/goal`
  (`src/types.ts:14-26`). The coach's only self-updating knowledge is the CI-03 memories channel, whose silent
  write rule already exists ("Do not ask the runner to curate or approve memories", `src/coach.ts:247`) - the
  mechanism is half-built, but no durable, typed slot records language, tone, reply-length or nickname
  preferences, and the prompt has no stable place to put them.
- **CI-08 - what already works and must be kept.** The repair loop is append-only
  (`appendRepair`, `src/gateway.ts:298-314`), so a repair attempt already reuses the failed attempt's prefix -
  the exact pattern this plan extends to whole turns. `temperature` and the tool schema are stable per deploy
  (`src/gateway.ts:220-227`). Message rows are stored clean of directives (directives live in their own audited
  table), so a restructured prompt does not leak anything into the visible chat.
- **CI-09 - the prompt tells the model nothing about snapshot freshness.** The muscle block already carries a
  time story ("fading window or held constant", `src/coach.ts:264` rule), but the facts JSON as a whole has no
  as-of stamp and no "trust the newest report over the snapshot" clause - so a stale activity list is presented
  with the same authority as a fresh one. The owner's "rule to determine that old info is outdated" needs this
  contract made explicit.

## 4. Target architecture

### 4.1 The five-segment message layout

```text
[system]  segment A: identity, rules, state catalog, tool contract          (changes only on deploy)
[system]  segment B: the runner profile block: name, goal, timezone,
          language, tone, nickname, reply-length preference, curated
          memories (<=12, merged)                                           (changes only on profile epoch)
[user]    segment C: snapshot #k - dated facts: today, weekday, horizon,
          upcoming + past sessions, recent activities, recent changes,
          active states, muscle status, "as of <day>"                        (appended, never rewritten)
[conv]    segment D: real messages, append-only, date-stamped at write time  (append-only)
[user]    segment E: the latest message + hidden turn suffix
          (rendered directive + referenced context), never stored in D       (new bytes every turn, by design)
```

The two invariants the owner's ask (3) translates to:

1. **Nothing before segment E is ever rewritten.** Volatile facts leave `system` entirely and live in
   snapshot messages that are *appended* when they change, never edited. The conversation appends. The model
   reads one stable, cached prefix and a small fresh tail.
2. **A snapshot is appended only when an epoch rule fires.** Between snapshots the model is told to treat the
   newest snapshot as authoritative - and to trust the runner's own newer words over it (CI-09's contract).

### 4.2 The epoch rule (when old attached info is "outdated")

A per-runner `promptEpoch` is a small structured value, recomputed per turn from store facts:

```text
epoch = hash(promptVersion, today, latestChangeSetId, latestActivityDay+count,
             latestMuscleCheckInId, activeStateKeySet, memorySetHash, preferenceHash)
```

A new snapshot message (segment C) is appended before the new question only when the epoch differs from the last
snapshot's epoch. Reasons are recorded as a list for the UI (LL-4): `new-day`, `new-activities`,
`new-muscle-check-in`, `calendar-changed`, `states-changed`, `profile-updated`, `coach-updated`,
`first-turn`. No rule fires -> no snapshot -> the turn is pure append, and the provider's prefix cache is hit
from byte 0 through segment D. This is the owner's "conversation keeps appending unless a rule determines the
old attached info is outdated", made mechanical.

**Byte-exactness across turns and reloads.** Snapshot bodies are persisted per runner (a small
`prompt_snapshots` table: `userId, epoch, reason, body, createdAt`, pruned to the last 2-3), because a snapshot
re-derived later from mutated store rows would not reproduce the bytes the provider already cached. The same
rule applies to segment E of *past* turns: the rendered directive suffix for a historical turn is persisted
alongside the existing directive audit row (add one `renderedPromptSuffix` column) so the next turn reproduces
exactly what the previous turn sent. History reload then rebuilds the identical message sequence; `/chat/history`
still shows only segment D - snapshots and suffixes never enter the visible chat.

**Conversation budget and compaction.** The assembly keeps segments B + C + D under a token budget (default
~8K tokens, on top of segment A's ~3.4K). When a long conversation exceeds it, the gateway compacts to
`[profile block][latest snapshot][last 10 messages]` in one deliberate rewrite. Compaction is cache-busting by
design, so it counts as an epoch reason of its own (`conversation-compacted`) and the bubble says so - the third
case where a full re-prefill is honest UX rather than a defect.

### 4.3 The staleness contract inside the prompt

Segment C carries `as of <today, weekday>` and one rule in segment A replaces three paragraphs of today-logic:

> The newest snapshot is authoritative for dates, sessions, activities, states and muscle status. Older
> snapshots and older conversation lines are history. If the runner's message reports something newer than the
> snapshot (a run they just did, soreness, a change they made by hand), trust their message over the snapshot
> and say so in one short clause.

The existing per-message date-stamp rules (`src/coach.ts:257`) and the muscle time-story rule (CI-09) already
point this way; the restructure just gives the model one consistent frame instead of a rebuilt "today" block.

### 4.4 The reply style contract (asks 1 and 2)

- **Prompt rules (segment A), replacing today's structural prompts:** talk like a peer in 2-4 sentences,
  typically 2; no headings, no numbered lists, no bullet lists, no markdown; one question at most; name the day
  and the number that matters; greet with the runner's name occasionally, not every turn; keep the
  consultant-friend protocol from 09 (discuss -> feedback -> propose -> decide) but deliver each step as
  spoken sentences, and let the suggestion chips - not the reply body - carry the menu of next steps.
- **Cap:** `MAX_REPLY_CHARS` 2000 -> 480 (about four short sentences in English or Traditional Chinese). The
  validator gains a `reply-too-long` code with the existing one-repair loop; the repair instruction says "shorten
  the reply, keep the answer and the day it refers to".
- **Deterministic strip pass (defense, not style):** after `parseCoachTurn` and before persisting, one cheap
  pass removes markdown structure the model ignored: leading `#`/`-`/`*`/`1.` glyphs, `**bold**` wrappers, more
  than one blank line. This never burns a repair attempt for cosmetics and guarantees the bubble (plain
  `textContent`, CI-04) never shows literal markdown.
- **Fallbacks and validation cards** get the same diet: one sentence plus the one actionable clause
  (`src/gateway.ts:316-330` today runs 2-3 sentences of apology).

### 4.5 The silent runner profile (ask 4)

- **Storage:** a per-runner `coach_preferences` slot set - `language` (`auto|en|zh-Hant`, reusing
  `CoachLanguage`, `src/directives.ts:45`), `tone` (`supportive|direct|brief`, `src/directives.ts:46`),
  `replyLength`, `nickname`, plus the curated memory set (CI-03 hygiene: <=12 rendered, merged on write).
- **Silent updates, two channels:**
  1. *Model channel:* the tool schema gains an optional `profileUpdates` object (same pattern as the optional
     `stateProposals`, `src/coach.ts:217-238`) - the model sets `language`/`tone`/`nickname` when the runner
     reveals them, validated against the same enums, written in the same transaction, never rendered in the
     chat, never requiring runner approval - exactly like the existing silent memory rule (CI-07).
  2. *Server heuristic (fallback, no model cost):* after >=2 consecutive user messages in Traditional Chinese,
     persist `language: zh-Hant`; the per-message rule stays only as the tie-breaker while
     `language: auto`.
- **Refreshed only when a new prefill is expected (the owner's constraint, verbatim):** the profile block is
  segment B, inside the cached prefix. A preference change therefore does NOT rewrite segment B mid-conversation;
  it bumps the epoch (`preferenceHash`), and the new profile renders inside the *next appended snapshot boundary*.
  The immediate turn - the one where the runner revealed the preference - is handled by segment E, which already
  supports `style.language`/`style.tone` today (`src/directives.ts:501-505`). Result: preference changes never
  bust the cache by themselves; they ride the re-prefill that is already happening, and the model obeys them from
  that turn anyway via the trailing suffix.
- **Visibility for the owner, not the runner:** the values appear on `/coach-audit` (one small table), and the
  runner's own language is visible where it already is - the UI locale switch.

### 4.6 The loading line with a reason (ask 3, client half)

- The client *predicts* the re-prefill from signals it already has locally: a Garmin sync just completed, a
  muscle check-in was just submitted, the day rolled over since the last turn, a change batch or state change
  happened since the last turn, first turn after opening the bubble, or the previous response's
  `prefill.refreshed` said the next turn would likely re-read. While waiting, the typing line becomes a localized
  status sentence instead of "..." (`src/web.ts:2629`), e.g. en "Pulling in your latest runs..." / zh-HK
  「拿緊你最新嘅跑步紀錄…」, "Refreshing how your body feels..." / 「更新緊你嘅身體狀況…」, "New day - checking your
  plan..." / 「新嘅一日，睇緊你嘅計劃…」. Plain "..." remains the indicator for cached-append turns - the
  difference is itself the feedback loop: fast turns look fast, slow turns explain themselves.
- The server is the source of truth: the gateway returns `milebook.prefill: { epoch, refreshed: [...reasons],
  snapshotTokens }` computed from the epoch rule (4.2), the `/chat` proxy forwards it
  (`src/web.ts:4319-4390` pattern), and the client stores the epoch for its next prediction. A wrong prediction
  (rare, e.g. an out-of-band sync) silently self-corrects on the next turn.
- Copy rides the existing `tx.t`/`clientStrings` i18n channels, so both locales ship complete (`src/i18n.ts`).

### 4.7 Provider-facing knobs

Byte-stability is the whole game on an unknown OpenAI-compatible backend; nothing here depends on a specific
vendor feature. Two optional niceties when the backend proves support: pass `prompt_cache_key: userId` (OpenAI
prompt-caching hint) so the provider groups this runner's turns, and log prompt token usage per turn
(`usage` is currently stubbed to zeros in the gateway completion, `src/gateway.ts:339`) so cache hits become a
measured number instead of an inference. Streaming is deliberately out of scope; the reason line is the chosen
mitigation for full-reply latency, and a future streaming slice can reuse `prefill.refreshed` as the first
chunk's story.

## 5. The owner's four asks, mapped

| Ask | Findings | Slices |
|---|---|---|
| 1. Less structural reply | CI-04 | LL-1 |
| 2. Shorter, to the point | CI-04 (+ CI-03 ballast) | LL-1, LL-6 |
| 3. Prefill cache: append-only conversation, outdated-data rule, explained re-prefill | CI-01, CI-02, CI-05, CI-09 | LL-2, LL-3, LL-4 |
| 4. Friendly, language-fit, silent preference profile refreshed only at new prefill | CI-06, CI-07 (+ 09's tone book) | LL-5 |

## 6. Implementation slices

Each slice is independently shippable behind `pnpm check` (516 tests today); each states its acceptance.

- **LL-1 - the reply style contract.** Rewrite the voice rules in `src/coach.ts:245-277` (segment A wording),
  `MAX_REPLY_CHARS` -> 480, add the `reply-too-long` validation code, add the deterministic strip pass in
  `src/gateway.ts` before `applyParsedTurn`, slim the `fallbackFor` replies. Tests: `test/coach.test.ts`
  (cap, code, policy), `test/gateway.test.ts` (strip pass, fallback length). Acceptance: fixture replies over
  the cap fail validation and repair; a model reply with markdown structure lands in the store stripped; no
  fallback exceeds two sentences.
- **LL-2 - the prompt restructure.** Split `buildCoachPrompt` into `buildCoachStaticPrompt` (A),
  `buildRunnerProfileBlock` (B) and `buildTurnSuffix` (E); remove the conversation embed and the question embed
  from system (`src/coach.ts:323-397`); kill `now` (CI-02); move the directive and referenced context into E;
  date-stamp conversation at assembly from stored `createdAt` (stable per epoch); persist each historical turn's
  rendered suffix on the directive audit row. Tests: two consecutive `buildCoachPrompt`-equivalent assemblies
  with unchanged data are byte-identical through segment D; a directive turn differs from the previous turn only
  from segment E onward. Acceptance: the probe's twin-turn diff reports 100% identical prefix when the epoch
  does not fire.
- **LL-3 - epochs and snapshots.** `promptEpoch` computation, the `prompt_snapshots` table (store + store tests),
  snapshot body = today's compact facts JSON + active states + muscle facts, append-on-epoch, prune to last 3,
  the staleness contract wording in segment A, `milebook.prefill` in the completion meta, conversation-budget
  compaction with its own reason. Tests: `test/store.test.ts`, `test/gateway.test.ts` (epoch fires exactly on
  the rule list; no snapshot when nothing changed; compaction at the budget). Acceptance: a turn with no epoch
  bump sends zero snapshot bytes; every epoch reason maps to a string in the meta.
- **LL-4 - the loading line.** Client prediction signals, the status line in `send()` (`src/web.ts:2622-2691`),
  `prefill` passthrough in the `/chat` proxy, `clientStrings` additions for both locales, `first-turn` and
  `conversation-compacted` copy. Tests: `test/web.test.ts` (proxy passthrough; the typing node carries the
  predicted reason class; i18n test covers the new keys). Acceptance: on an epoch-bumping turn the waiting line
  names the reason in the runner's locale; on a cached turn it stays the bare ellipsis.
- **LL-5 - the silent preference profile.** `coach_preferences` storage + `profileUpdates` in the tool schema +
  gateway validation/apply (enum checks, silent, transactional) + server language heuristic + profile rendering
  in segment B + epoch piggyback via `preferenceHash` + one audit table row on `/coach-audit`. Tests: schema
  validation (unknown key rejected, over-length nickname rejected), heuristic (two zh-Hant messages ->
  persisted), epoch (a preference change appends the next snapshot rather than rewriting B mid-cache).
  Acceptance: a runner who writes two turns in Traditional Chinese gets `language: zh-Hant` persisted silently,
  and the change is visible only on the audit page.
- **LL-6 - memory hygiene (folds into LL-5's segment B).** Render <=12 merged memories (dedupe by normalized
  text, keep newest), cap the store read from 100 (`src/gateway.ts:937`) to the merge window, and write-time
  merge so the memory set stays small. Tests: merge/dedupe in `test/store.test.ts` or `test/coach.test.ts`.
  Acceptance: a 24-memory runner's prompt shrinks by the probe's ~1.6K chars; repeated identical facts do not
  accumulate.

Suggested order: LL-1 (voice, immediately felt), LL-2 + LL-3 (one coherent gateway change, reviewable together),
LL-4 (needs LL-3's meta), LL-5 + LL-6. LL-2 without LL-3 is safe (the facts JSON merely moves into one
per-turn user message; the epoch rule then makes it append-only).

## 7. Measurement and acceptance

- **Prefix reuse:** the probe graduates into a fixture test - two assemblies, unchanged data, byte-identical
  through segment D; on the live backend, log `usage.prompt_tokens` per turn (LL-3's meta addition) and expect
  cached turns to report the provider's cached-token field rather than full prompt tokens, once the backend
  fills usage (today stubbed, `src/gateway.ts:339`).
- **Voice:** p95 reply length before/after from stored `messages` (a one-off SQL over the last 100 assistant
  rows), plus a live probe: three fixture turns (plan request, review request, chit-chat) read by the owner -
  no headings, no lists, <=4 sentences, suggestions doing the menu work.
- **Loading line:** fixture-verified reason strings for each epoch cause; a wrong client prediction
  self-corrects on the next turn (store epoch wins).
- **Gates:** `pnpm check` green at every slice; `/coach-audit` still shows directives, blocked writes and now
  preferences and snapshot history.

## 8. Owner decisions

- **D19 - reply cap and enforcement.** 480 characters with one repair + a deterministic strip pass
  (recommended), or a softer 600/repair-only, or a harder truncate-and-ship.
- **D20 - language persistence.** Two consecutive zh-Hant messages auto-persist `language: zh-Hant`
  (recommended), or require three, or model-channel only (no server heuristic). Also confirm zh-Hant replies
  target the zh-HK copy register the UI already uses.
- **D21 - snapshot persistence.** Persist snapshot bodies for byte-exact reloads (recommended, small table) vs
  re-derive and accept divergence after a page refresh.
- **D22 - preference write scope.** Allow the model channel to set `language/tone/replyLength/nickname` only
  (recommended - medical, injury and goal facts stay in memories/states where guardrails already apply), or
  widen it.

## 9. Honest limits

- This plan does not add streaming, does not change the validation/guardrail/undo architecture, and does not
  touch multi-tenant trust boundaries. The provider's cache behavior remains an external property: the plan makes
  the prefix byte-stable and measures the result; it cannot force a particular backend to cache.
- The epoch rule is heuristic in one direction only: it never drops a needed snapshot (any relevant change
  fires it), but a runner can always report something the snapshot does not know - the staleness contract
  (4.3) covers that class, and the muscle block's fading-window rules continue to do the body-condition half.
- Preference inference is silent by design (the owner's ask); the audit page is the owner's transparency
  surface, and a future slice could add a runner-visible "what the coach knows about me" card if the owner
  decides the silence should have a visible counterpart.
- The probe's token counts are chars/4 estimates, not a tokenizer's output; the relative sizes and the
  divergence point are what matter, and they are byte-measured, not estimated.
