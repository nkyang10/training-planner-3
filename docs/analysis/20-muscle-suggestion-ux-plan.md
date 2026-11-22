# Muscle-suggestion UX: deeper plan and implementation record

**Status:** the deeper plan drawn from [19-muscle-suggestion-ux-review.md](19-muscle-suggestion-ux-review.md), then
implemented in this slice. **Date:** 2026-11-22. **Scope:** every finding F1-F16, the copy audit, the measurement
plan, and a decision on each of the six open product questions. **Gate:** `pnpm check` green after the slice; the exact
count is in section 5.

## 1. Decisions on the six open questions

| Q | Question | Decision | Why |
|---|---|---|---|
| Q1 | Direct report vs confirm-first | **Keep confirm-first** for every action, including reports | A check-in is append-only and cannot be edited, only superseded; a misparse would leave a wrong health row. The card is one tap, so the cost of confirmation is small and the review's evidence supports the model. |
| Q2 | Where pending suggestions live in the dock | **Cards stay in the chat log** (they are conversational), each with its age; a **launcher badge + Chat-tab count** make pending decisions visible; on `/muscle` the dock **defers to the page card** | A fourth dock tab was already rejected for states; badges reuse the existing count grammar; one owner per record removes the duplicate-Confirm state (F3/F4). |
| Q3 | Inline edit or Adjust link | **Adjust link** into the check-in form, prefilled with the proposal's level, tags, side, warm-up, note and linked run | Reuses one editing surface (the form's script path and its no-script quick set), keeps the card honest, and gives the no-script path the same prefill via selected options. |
| Q4 | Run linking | **Optional `activityId` on a report proposal**, validated server-side: kept only when the run exists, is the runner's, and is on the proposal's day; otherwise stripped, never rejected | The context already carries run ids; validation means a hallucinated id silently downgrades to an unlinked report instead of burning the turn; the card shows the run so the runner can audit it (F11). |
| Q5 | Supersede or stack | **Newest wins per muscle**: recording a proposal auto-dismisses other pending proposals for the same muscle | Two live cards for one muscle invite two confirms of contradictory records; the dismissed rows stay in the journal for honesty. |
| Q6 | Multi-muscle reports | **One card per muscle, cap raised 3 → 6**, and the prompt rule tells the model to say when it capped | One card maps to one confirmable record; 6 covers the realistic "legs are trashed" case; the honest remainder line replaces silent truncation (F12). |

## 2. Workstreams and acceptance criteria

Each row states the finding(s) it closes and what "done" means.

| W | Closes | Work | Acceptance |
|---|---|---|---|
| A | F1, F10, F13, F16 | Card speaks the record's own vocabulary: noun-phrase headline, action chip, **deterministic reading chip** (Watch/Needs care…), "Suggested {day} · about {day}" meta line, a "Now:" context line when a status exists, localized side labels (右側 not 右) | The card and the status card it creates show the same reading; zh-HK line matches the audit; `1 muscle needs attention` grammar fixed |
| B | F2, Q3 | **Adjust** link on the card → `/muscle?proposal=<id>#check-in`; the form opens with the muscle selected and the proposal's level, tags, side, warm-up, note and run prefilled (script path applies per-muscle values; no-script path renders the quick set with the proposal's values selected) | Confirming the adjusted form writes the record directly; the suggestion is left pending until separately decided; the no-script page shows the prefilled values |
| C | F3 | On `/muscle` the dock renders **one system line linking to the page card** instead of its own Confirm buttons; a decided id answers `409 not-pending` and the dock says "already confirmed or dismissed" and re-syncs | Exactly one live Confirm per suggestion at all times |
| D | F4 | Dock cards show **"Suggested {date}"**; the launcher gains a **pending-suggestion badge** and the Chat tab a count, both hidden at zero | After a reload the runner can see that a decision is waiting without opening the log |
| E | F5, F14 | `partitionPendingMuscleProposals` filters expired and dead-end (hold/release/resolve with no active status) proposals from every surface; `/muscle` shows "1 coach suggestion expired — check in again if it still applies" | No card can fail on tap; the prompt block lists only offerable suggestions |
| F | F6, F7 | Dock success card links to the Muscle tab and **refreshes the app-bar attention badge**; Dismiss gains **Undo** (restore endpoint flips dismissed → proposed within the window) on both surfaces | Confirm and Dismiss both close their loop; a mis-tap costs one tap, not a re-entry |
| G | F8, F9 | Dock card becomes a labelled group (`aria-labelledby`) announced once by the log; after a turn with suggestions the first card's Confirm **receives focus**; dock buttons raised to a ≥36 px target | Keyboard path to Confirm is one Tab, not Shift+Tab past the chips |
| H | F11, Q4 | `activityId` through schema → draft → proposal → card → confirm; the card shows "about {run title}" with a link | A validated same-day run rides into the confirmed check-in; an unknown or wrong-day id is stripped |
| I | F12, Q5, Q6 | Cap 3 → 6; supersede per muscle; prompt rules name the cap and the run rule | Four sore muscles produce four cards; a newer suggestion for the same muscle replaces the older pending one |
| J | Measurement plan | `milebook:track` events: `muscle-suggestion-shown` / `-confirmed` / `-dismissed` / `-failed` / `-adjust`, values are enums only (surface, action, reason) | No health text leaves the page; the hook stays the measurement seam |
| K | F15 | The pending card **moves into the status rail** (inside the muscle-layout's status slot, above the status card), so the two-column geometry and the figure's fold are untouched by a decision card | The card never sits above the page head; capture at 320/390/1024 remains open evidence and is recorded as such |
| L | owner's friend-coach concern | **Voice guard.** The persona and reply rules stay untouched; a dedicated rule pins the friend voice on suggestion turns ("a friend passing a note", never announcing plumbing, never reading the card's fields back); the day and cap rules are de-jargoned; the status lines around the card speak warm ("Noted — {name} is on your record now", "Dropped — nothing changed") in en and zh | The card stays record-precise on purpose (it is the record preview the runner confirms); the coach's own sentence stays a friend's; the tone-guard test pins all of it |

Not implemented on purpose: Q1 stays confirm-first (no code change); the pixel captures of F15 need a browser session
and are recorded as open evidence, mitigated by the rail placement.

## 3. Implementation notes

- `muscleProposalView` gains `statuses` so the headline can carry the hold level and a "Now:" context line, and the view
  carries `reading` (level key), `readingLabel`, `suggestedDayLabel`, `aboutDayLabel`, `linkedRun` fields for both
  surfaces.
- The decision endpoint gains `restore` (dismissed → proposed, window-checked) and returns typed JSON details
  (`not-found` / `not-pending` / `expired`) so the dock can answer the already-decided case in plain words.
- `listPendingMuscleProposals` becomes the offered-only view; `partitionPendingMuscleProposals` is the honest
  partition behind it (expired + dead-end counts for the page's muted line).
- `COACH_PROMPT_VERSION` bumps to `2026-11-22.2` (new rules text); the stylesheet bumps to `v32` (new CSS) and the
  deploy gate follows.

## 4. Verification

- Every workstream has tests: domain (partition, restore, activityId), coach (schema, cap, rules), gateway (supersede,
  activityId validation), web (card copy en/zh, adjust prefill, restore endpoint, expired line, rail placement, dock
  deferral and focus, badge, track attributes, undo banner) — the exact files and the final count are in section 5.
- The simulated conversation from 19 is the acceptance script: re-running it after the slice shows the new card
  vocabulary, the single-owner rule, the dead-end cards gone, and the undo path.

## 5. What shipped

Recorded after the implementation pass, with the gate numbers from that run:

- Shipped: workstreams A-L as specced; Q1-Q6 decisions as above. The simulated conversation from 19 was re-run as
  the acceptance script and confirms each behaviour: the card now reads "Calves · 6/10 · Tight / stiff · Right" with a
  **Watch** chip and "Suggested Thu, 5 Nov 2026 · about today"; a hold names its level ("Hamstrings (back thighs) ·
  hold at 4/10"); an all-better card carries "Now: 6/10 · fading since Thu, 5 Nov 2026"; the zh-HK card matches the
  audited copy ("小腿 · 6/10 · 緊繃／僵硬 · 右側 · 需留意"); the dead-end hold is no longer offered on the page; the
  banner offers Undo after a dismissal; the red-flag turn still produces no muscle card.
- L, added after the owner asked "will the coach's wording become machine again?": the persona and peer-voice rules
  (`src/coach.ts` "consultant and training friend", "Write like you speak") were never touched, and workstream L
  pins the voice against the new rule mass - a suggestion turn is "a friend passing a note", the day and cap rules
  lost their jargon, and the status lines around the card were re-warmed ("Noted — {name} is on your record now",
  "Dropped — nothing changed", "That one's already settled — catching up…") in both locales. The card headline stays
  record-precise on purpose: it is the record preview the runner confirms, the same way the calendar pill shows data;
  the coach's own sentence is where the friend lives, and the tone-guard test keeps it there.
- Gate: `pnpm check` **619/619** in 22 files (lint and typecheck clean), on branch
  `dsh-coach-ability-muscle`.
- Not shipped: the browser captures of F15 (no browser in this environment); the rail placement is the mitigation and
  the capture stays on the layout-review todo.
