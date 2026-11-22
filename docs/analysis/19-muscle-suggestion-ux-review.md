# Muscle-suggestion UX review - simulated conversation and findings

**Status:** review of the coach-managed muscle-condition slice (`b6a22f8`), written after the implementation, before
runner exposure. **Date:** 2026-11-22. **Scope:** the runner-facing flow of a coach muscle suggestion from the first
sentence to the record it writes - the dock card, the Muscle-tab card, the decision endpoint, the success/failure copy
and the next turn. **Producer:** root agent; the simulation ran the real web shell, gateway, store and endpoint with a
scripted model.

**What this is not.** Not a usability study and not a visual review: no real runner, no browser session, no
screen-reader run and no capture at 320/390/1024. The model replies are scripted to the coach contract (2-4 sentences,
1-3 suggestions, no claim that a suggestion is saved); every card string, banner and error below is captured from the
real renderer, not retyped. Findings marked **adjacent** predate this slice and are listed because the new card sits on
the same screen.

## 1. The flow under review

```
runner says "my right calf is 6/10 and tight after today's run"
        |
        v
coach turn (one JSON answer) -- muscleProposals: report calves 6/10 tight right
        |                        evidence: the runner's own words
        v
gateway: pending muscle_proposals row, never a check-in / never a control
        |
        +--> dock: chat card under the reply (from turn meta, then /chat/history)
        +--> /muscle: "Coach suggestions" card above the status rail (server-rendered)
        |
        v
runner taps Confirm or Dismiss (one POST; JSON for the dock, redirect for no-JS)
        |
        +--> Confirm: check-in or hold/release/resolve control, then proposal = confirmed
        +--> Dismiss: proposal = dismissed, record untouched
        |
        v
feedback: dock card becomes "Muscle record updated"; page shows a banner + the new status
        |
        v
next turn: the newest context snapshot carries the confirmed status (and any still-pending suggestion)
```

Two surfaces own the same decision, and the record only changes on the runner's tap. That is the design under test.

## 2. Simulated sessions

Setup: one runner (`Asia/Hong_Kong`, goal "Half marathon in January"), today 2026-11-05, English UI unless noted. The
model answers are scripted; the app is real.

### SIM-1 - a report after a run, confirmed from the dock

**Runner:** "My right calf is 6/10 and tight after today's run - should I still do tomorrow's tempo?"

**Coach (scripted):** "Right calf at 6/10 and tight after today's run fits normal soreness, so I'd keep tomorrow easy
and keep Thursday's tempo only if it eases on the warm-up. I've suggested logging it as 6/10 tight on the right -
confirm the card below if that matches."

**Chips:** "Swap Thursday's tempo for 30 easy minutes" / "Show me calf mobility drills" / "What should tomorrow's easy
run be?"

**Card (dock and page, identical line):**

> **Muscle suggestion**
> Report Calves: 6/10 clear doms · Tight / stiff · Right
> You said: "My right calf is 6/10 and tight after today's run"
> Waiting for your confirm - nothing is saved yet. **[Confirm] [Dismiss]**

**After Confirm:** dock card becomes "Muscle record updated"; `/muscle` (via `?saved=proposal`) shows "Suggestion
confirmed - your muscle record is updated" and the status card:

> **Muscle status** (1)
> Calves · 6/10 Clear DOMS · Tight / stiff, right · **Watch**
> Reported Thu, 5 Nov 2026 · fades on its own from here, expected clear by Sun, 15 Nov 2026.
> [Update] [Hold constant] [All better]

**Observations.** The evidence quote does its job: the runner can check the coach's reading against their own sentence.
But the headline is an imperative ("Report Calves: ...") that reads like an instruction, and it says "clear doms" while
the status chip one tap later says **Watch** - two different verdicts for the same tag. The runner has no way to correct
the level, side or condition in the card; the only alternatives are Confirm as-is or Dismiss and re-enter everything.

### SIM-2 - the next turn sees the record

**Runner:** "What does that mean for Thursday?"

**Coach (scripted):** "With the calf reported at 6/10 today, Thursday's tempo is fine if it eases on the warm-up; if it
is still tight, swap it for 30 easy minutes. I would check it again on Thursday morning before deciding."

The prompt for this turn contains:

> Muscle status today (2026-11-05) ... 1 muscle need attention:
> - Calves: 6/10 clear doms (reported on 2026-11-05) tight, right, eases with warm-up
> - 1 check-in in the last 14 days

**Observations.** The loop closes: the confirmed report is the coach's fact on the very next turn, with no re-asking.
This is the strongest argument for the feature.

### SIM-3 - all better, confirmed from the no-JS form

**Runner:** "Calves feel fine now - you can clear that."

**Coach:** "Good to hear - I've suggested marking the calves all better, so the status clears once you confirm.
Nothing else in the week changes."

**Card:** "Mark Calves all better" / evidence: "Calves feel fine now" · "you can clear that".

**After Confirm (form POST, no script):** `303 -> /muscle?saved=proposal`; the status card becomes **All perfect** with
"Every muscle is in perfect condition, and that is what the coach is told."

**Observations.** The no-script path is complete and honest. The headline again reads as an instruction rather than a
description of a pending suggestion.

### SIM-4 - hold a level that is not settling

**Runner:** "My hamstring is still a 4 and it's not settling. Keep it on the list until I say otherwise."

**Coach:** "A 4/10 hamstring that is not settling is worth holding rather than fading, so I've suggested keeping it at
4/10 until you tell me it has changed. Keep Thursday easy and skip strides while it stays like this."

**Card:** "Hold Hamstrings (back thighs) at its current level" / evidence: "My hamstring is still a 4" · "Keep it on
the list until I say otherwise".

**After Confirm:** "Hamstrings (back thighs) · 4/10 Noticeable · Normal soreness" / "Held constant since Thu, 5 Nov
2026 - it stays 4/10 until you change it." The action row flips to [Update] [Let it fade] [All better].

**Observations.** "its current level" is wrong for a plural muscle, the catalog name is long enough to wrap, and the
card never shows the level it will hold (4/10) - the runner has to infer it from the reply or the quote.

### SIM-5 - dismiss, then change your mind

**Runner:** "My left quad is 5/10 after the hills." -> card "Report Quads (front thighs): 5/10 noticeable · Left".

**Dismiss:** dock returns `{ ok: true, decision: "dismiss" }` and the dock card becomes "Suggestion dismissed"; the page
reloads to `/muscle?saved=dismissed` with "Suggestion dismissed. Nothing about your muscles changed." The suggestion
leaves both surfaces; no check-in exists.

**Runner:** "Actually log it - left quad 5/10." -> a new card is proposed (the dismissed row no longer blocks it) and
Confirm writes the check-in.

**Observations.** Recovery works, but Dismiss is one irreversible tap with no undo and no confirmation; a mis-tap costs
the runner a full re-entry. The app's calendar changes have Undo - muscle suggestions do not. The headline also shows
the long-name problem: "Report Quads (front thighs): ..." reads as a sentence fragment with a colon, not a record.

### SIM-6 - red-flag words take the care path, not a report

**Runner:** "Sharp pain in my right calf when I push off, and it's swollen."

**Coach:** "Sharp pain with swelling is not normal soreness, so take direct loading off that calf and get it looked at
if it is not clearly better in a few days. I've proposed a pain/injury state for you to confirm; I'm not logging a
soreness level for this one."

**No muscle card.** A state proposal is stored as `observing`: "Pain / injury", confidence 0.6, expiry 2026-11-19,
with the clinician note.

**Observations.** The safety split holds under pressure: the model is not allowed to lower a level or log a soreness
number here, and the runner gets the familiar state card instead. Adjacent: the state card lists the model's note as a
third "evidence" bullet and repeats it as the UI note - the evidence list should be the runner's words only.

### SIM-7 - the same flow in Chinese

**Runner:** "我右小腿跑完之後 6/10，仲有啲緊，聽日仲跑唔跑得？"

**Coach:** "右小腿 6/10 和緊繃，跑後很常見，明天輕鬆跑就好，不必硬做質量課。我建議記錄為 6/10、緊繃、右側——確認下面的卡片即可。"

**Card (zh-HK page):** "回報 小腿：6/10 明顯延遲性酸痛 · 緊繃／僵硬 · 右" / "你講過：「我右小腿跑完之後 6/10」 · 「仲有啲緊」" /
[確認] [略過].

**Observations.** Localization is complete (heading, chip, evidence, buttons, errors). But the line is dense and still
opens with the imperative "回報", the side is a bare "右", and the coach's reply is Mandarin-flavoured Traditional
Chinese while the UI is Cantonese - a register mismatch that is app-wide, not new here.

### SIM-8 - the same suggestion on two surfaces

On `/muscle` with the dock open, the same pending suggestion is rendered twice: the page card at the top and the dock
chat card in the log. Simulation check: `{ pageCardPresent: true, dockHistoryPresent: true }`.

If the runner confirms on the page, the page reloads and both copies disappear. If the runner confirms in the dock, the
dock card becomes "Muscle record updated" but the page card stays until a reload; its Confirm then lands on
`/muscle?error=proposal-missing` ("That suggestion is no longer available"), while a second dock click returns `409` and
the dock's catch-all copy ("That suggestion could not be applied. Open the Muscle tab to check in.").

**Observations.** Two Confirm buttons for one record, and a stale copy that fails generically. This is the most
confusing state in the flow.

### SIM-9 - a stale suggestion

A suggestion dated 2026-10-27 (9 days old) is not offered: `pageCardPresent: false`. A direct confirm still answers
`303 -> /muscle?error=proposal-expired` with "That suggestion has expired - check in again on the Muscle tab."

**Observations.** Expiry is safe but silent on the page: after 7 days the card simply vanishes, with no trace of what
happened. A runner who remembers "the coach was going to log my calf" gets no closure.

### SIM-10 - a dead-end hold

A `hold` suggestion for a muscle with no active status is offered (`pageCardPresent: true`); Confirm answers
`303 -> /muscle?error=proposal-status` with "That muscle no longer has an active status to change."

**Observations.** The card invites an action that cannot succeed, and the error is written in system language. The
runner cannot tell what to do next from the card.

## 3. Findings

Severity: **P1** = confusion or friction in the common path, fix before runner exposure; **P2** = polish or an
important edge; **P3** = nice-to-have. Effort: S (< half a day), M (about a day), L (needs design work).

| ID | Sev | Surface | Finding | Recommendation | Effort |
|---|---|---|---|---|---|
| F1 | P1 | card headline | Imperative headline ("Report Calves: ...") reads as an instruction, and its bucket label ("clear doms") contradicts the deterministic reading ("Watch") shown after Confirm | Noun phrase + the reading: "Calves · 6/10 · tight, right · **Watch**", chip "Suggested report"; hold "Hamstrings · hold at 4/10"; resolve "Calves · all better" | S |
| F2 | P1 | both cards | No edit-before-confirm: a wrong level, side or tag forces Confirm-as-is or Dismiss + full re-entry; the form's `?focus=` link selects the muscle but starts at 0/10 | Inline edit, or "Adjust" -> the check-in form prefilled with the proposal's level, tags, side and warm-up | M |
| F3 | P1 | `/muscle` + dock | The same suggestion is shown twice on `/muscle`; after a dock confirm the page copy is stale and its Confirm fails with a generic message | One owner per surface: suppress dock pending cards on `/muscle` (or collapse them to a link), and answer a decided id with "This was already confirmed" + refresh | S-M |
| F4 | P1 | dock | After a reload, pending cards are appended after all messages, out of context, and neither card shows when it was suggested - a 6-day-old suggestion looks new; no badge counts pending suggestions | Show "Suggested 3 days ago" (or the date), group pending cards in one place, and badge the Chat tab or launcher with the pending count | S-M |
| F5 | P1 | both cards | A hold/release/resolve can be offered when nothing is active; the tap then fails with system language | Filter such proposals at read time, or render them disabled with "That soreness has already faded - check in again" and a link | S |
| F6 | P2 | dock | Success is a dead end: "Muscle record updated" has no link to the record, and the Muscles tab badge (status count) does not refresh until reload | Add "View on the Muscle tab" and refresh the badge after a decision | S |
| F7 | P2 | both cards | Dismiss is irreversible and silent; no undo, no confirmation step | Undo toast (like calendar changes) or keep the row visible as "Dismissed - confirm instead" | M |
| F8 | P2 | dock a11y | The card is a `role="status"` inside an `aria-live` log; its buttons sit before the composer in DOM, and focus stays in the textarea after sending, so reaching Confirm needs Shift+Tab | Announce once, move focus to a "Review suggestion" action (or the card) after a turn that produced suggestions, and give the card `aria-labelledby` instead of nested live regions | M |
| F9 | P2 | dock | Dock buttons are ~28 px tall (`.proposal-actions .btn` 6/10 px); page buttons are ~42 px | Raise the dock target to at least 36 px (44 px on touch) | S |
| F10 | P2 | both cards | The report day is invisible; the check-in is dated today even when the runner talks about yesterday's run | Show "for today" (or the actual day) on the card and in the coach rule | S |
| F11 | P2 | record | No run link: "after today's run" still writes `activityId: null`, although the Muscle tab supports linking | Optional `activityId` in the proposal (validated, owned, same day) or a post-confirm "link to run" action | M |
| F12 | P2 | coach turn | At most 3 suggestions per turn; a runner reporting four sore muscles gets three cards and must use the form for the fourth, and the reply does not say so | Raise the cap or add a "3 of 4 - the rest need a check-in" line | S-M |
| F13 | P2 | copy | Grammar and register: "at its current level" (plural), long catalog names, "clear doms" lowercase jargon, "1 muscle need attention" (adjacent, pre-existing), bare "右" | See the copy audit below | S |
| F14 | P2 | `/muscle` | Expiry is silent; the card disappears with no trace | One line "1 suggestion expired" or keep it visible as expired with "Check in again" | S |
| F15 | P2 | layout | The new card sits above the two-column muscle layout; no capture yet proves the figure/status rail stays above the fold at 1280/1024 | Capture 320/390/1024/1280 with 0 and 2 pending cards; move the card into the status rail if the fold regresses | S |
| F16 | P3 | card | The card shows no current status context ("now 6/10 fading"), so the runner cannot judge the proposal against what the app already believes | Add one muted line: "Now: 6/10, fading since Tue" | S |

**P1 detail.**

- **F1** is the highest-leverage fix: one line of copy plus a chip removes both the imperative ambiguity and the
  "clear doms vs Watch" contradiction. The card should speak the same vocabulary as the status card it will create.
- **F2** is the trust valve. A confirmation step without correction assumes the coach parsed the sentence perfectly;
  the simulation's SIM-1 is the easy case, but side and condition are exactly where a model errs. Inline edit is the
  strongest fix; a prefilled "Adjust" link is cheaper and reuses the existing form.
- **F3** is the only state in the flow where the same record has two live Confirm buttons. Either surface alone is
  fine; both at once is not. The page card should own `/muscle`, the dock card should own every other page.
- **F4** is about the suggestion's lifetime. Pending cards are durable rows, but the UI presents them as if they just
  arrived. Age + a pending badge are small changes that make the durable model visible.
- **F5** is a read-time filter, not a data problem: the status layer already knows there is nothing to hold.

## 4. Copy audit

| Current (en) | Proposed (en) | Why |
|---|---|---|
| Report Calves: 6/10 clear doms · Tight / stiff · Right | Calves · 6/10 · tight, right · **Watch** | Noun phrase; the reading the app will show, not the soreness bucket |
| Mark Calves all better | Calves · all better | No imperative; matches the card's "Suggested" frame |
| Hold Hamstrings (back thighs) at its current level | Hamstrings · hold at 4/10 | Grammar, length, and the level the runner is holding |
| Let Calves fade again | Calves · let it fade | Same |
| Waiting for your confirm - nothing is saved yet. | Suggested - nothing is saved until you confirm. | One wording across both surfaces |
| That muscle no longer has an active status to change. | That soreness has already faded. Check in again if it is back. | Plain language + next step |
| Muscle record updated | Muscle record updated · View on the Muscle tab | Close the loop |
| Suggestion dismissed. Nothing about your muscles changed. | Keep | Already honest and clear |
| 1 muscle need attention (adjacent) | 1 muscle needs attention | Pre-existing grammar |

| Current (zh-HK) | Proposed (zh-HK) | Why |
|---|---|---|
| 回報 小腿：6/10 明顯延遲性酸痛 · 緊繃／僵硬 · 右 | 小腿 · 6/10 · 緊繃、右側 · **需留意** | Noun phrase; reading; "右側" reads better than "右" |
| 將 小腿 標為全部好轉 | 小腿 · 全部好轉 | Same |
| 將 小腿 維持喺目前程度 | 小腿 · 維持 4/10 | Same, with the level |
| 呢條肌肉已經冇可以改動嘅狀態。 | 呢個酸痛已經退咗。如果返嚟，請再回報一次。 | Plain language + next step |

## 5. What works

- **Evidence-first.** The runner's own quote on the card is the trust move; it lets them audit the coach's reading
  without opening the chat history.
- **Confirm-first is explained.** "Nothing is written until you confirm it" is on the page card, and the dock card says
  "nothing is saved yet". The append-only record is never at the model's mercy.
- **Durable rows.** Pending suggestions survive a refresh and are not DOM-only cards - the same lesson the state cards
  learned.
- **Honest failure paths.** Expired, already-decided and no-active-status cases all fail without a partial write.
- **Red-flag routing.** SIM-6 shows the split working: no report, no lowered level, the existing pain/injury state and the
  clinician line.
- **The loop closes.** SIM-2 shows the confirmed report in the very next prompt; the calendar chip and the Muscles badge
  read the same status layer (on the next page load - see F6).
- **No-script path.** The page card is a real form; the dock is the fast path, not the only path.
- **Prompt discipline.** The pending list and the identical-suggestion dedupe stop the model from stacking cards or
  claiming a suggestion is saved.

## 6. Accessibility and mobile checks

Code-level only (no screen reader, no device):

- **Target size.** Page card buttons use `.btn` (12/18 px -> ~42 px tall); dock buttons use `.proposal-actions .btn`
  (6/10 px -> ~28 px). 28 px passes WCAG 2.2 AA (24 px) but is below the 44 px comfort target; on a phone sheet the
  dock is the primary surface (F9).
- **Focus order.** The dock DOM is log -> suggestion chips -> composer; a new card appends to the log, so it sits
  before the composer in tab order. After sending, focus stays in the textarea; a keyboard runner must Shift+Tab past
  the chips to reach Confirm (F8).
- **Live regions.** `#coach-log` is `role="log" aria-live="polite"` and the card is `role="status"`; the card may be
  announced twice, and the buttons inside a live region are announced as part of the status text.
- **Announcements.** The page banners and the dock card replacements are live regions, so success and failure are
  announced; the error page also uses `role="alert"` for the banner.
- **No motion.** The card adds no animation; `prefers-reduced-motion` is unaffected.
- **Contrast.** The "Suggested" chip (#7a5a1f on #fdf3df) and the dock card border are decorative; the text uses the
  standard ink/muted tokens. No contrast regression was measured (not re-measured here).
- **No-JS.** The page card works with forms and redirects; the dock is script-only by design.
- **Missing evidence.** No 320/390/1024/1280 capture with the card, no touch-emulated tap, no screen-reader pass, no
  zoom/reflow check. F15 is the layout risk; the a11y items are code-read, not tested with assistive tech.

## 7. Measurement plan

The existing `milebook:track` hook is page-local and carries no health text; keep that rule.

| Event | Value | Question |
|---|---|---|
| `muscle-suggestion-shown` | surface (`dock` / `muscle-page`) | Where do runners meet the card? |
| `muscle-suggestion-confirmed` | surface, action (`report`/`hold`/`release`/`resolve`) | Does the coach's notice get accepted? |
| `muscle-suggestion-dismissed` | surface, action | Which suggestions miss? |
| `muscle-suggestion-failed` | reason (`expired`/`no-status`/`already-decided`) | How often do dead ends occur? |
| `muscle-suggestion-adjust` | action (only if F2 ships) | How often does the runner need to correct? |

Hypotheses: (H1) confirm rate at least 60% and time-to-record under 15 s for a report; (H2) adjust rate under 10% after
F2 ships; (H3) duplicate/stale-card complaints disappear after F3; (H4) a pending badge raises confirm rate without
raising dismiss rate.

Five-task usability script (5 runners, think-aloud): report a sore calf from chat; clear a muscle that feels fine;
hold a level that is not settling; dismiss a suggestion and then log it anyway; describe sharp pain with swelling.
Success = the runner reaches the intended record without asking what the card means, and can say what changed.

## 8. Open product questions

1. **Direct report vs confirm-first.** If the runner's statement is explicit ("my calf is 6/10"), should the coach write
   the check-in directly and keep confirmation only for hold/release/resolve? Confirm-first protects the append-only
   record; direct write removes a tap. The current slice deliberately chose confirm-first.
2. **Where should pending suggestions live in the dock?** A fourth tab was rejected for the states slice; a badge on
   Chat, a pinned "Pending" block, or a compact strip above the composer are the options.
3. **Inline edit or Adjust link?** Inline edit is the stronger UX; the link reuses the form but needs level/tag prefill
   (today `?focus=` selects the muscle at 0/10).
4. **Run linking.** Should a report proposal carry the run it followed? The form supports it; the coach currently
   cannot.
5. **Supersede or stack?** When a newer proposal for the same muscle arrives, should it replace the older pending one?
   Today identical suggestions dedupe, but a changed level stacks two cards.
6. **Multi-muscle reports.** One card per muscle (today, max 3) or one card with several tags, matching the form?

## 9. Recommendation

Ship the P1 set before exposing the feature to runners: **F1** (copy + reading), **F2** (adjust), **F3** (single
surface), **F4** (age + pending badge), **F5** (dead-end filter). They are all small, and together they remove the
confusion states the simulation actually produced. Then take F6-F9 as the next polish pass, and F10-F12 as product
decisions.

Keep the trust model: the coach notices, the runner decides, and only the runner's tap writes the body's record. The
simulation supports that model; its problems are in how the suggestion is presented, not in whether it should be
confirmed.

## 10. Reproduction

The simulation is a throwaway probe (not committed, `tmp/ux-sim.ts`): it starts the real store, auth, web shell and
gateway in one process, queues scripted model answers, drives `/chat`, `/muscle`, `/chat/history` and the decision
endpoint, and prints the exact reply, card payload, page card HTML, banners and error copy quoted above. The gate on
the slice is **604/604** in 22 files (`pnpm check`), commit `b6a22f8`, stylesheet v31; the live :8093 process still
serves the 2026-11-20 build.

**Disposition (2026-11-22, later the same day).** Every finding F1-F16, the copy audit and the measurement events
were planned and implemented in [20-muscle-suggestion-ux-plan.md](20-muscle-suggestion-ux-plan.md), which also records
the decision on each open question of section 8; the simulated conversation was re-run there as the acceptance script.
The one item not closed is F15's pixel capture (no browser in that environment) - mitigated by moving the card into
the status rail - and section 6's assistive-tech evidence remains code-read, not device-tested.
