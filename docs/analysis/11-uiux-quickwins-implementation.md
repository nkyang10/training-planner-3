# POC3 - UI/UX quick wins: implementation record

**Status:** implemented and verified on 2026-11-19; **not deployed** (see section 5). **Parent:** [10-uiux-design-review.md](10-uiux-design-review.md) section 5.
**Scope:** the 12 quick wins from the review's ready-to-ship table - CSS and client-script level only, no engine, gateway or schema change. Runs on top of the concurrent workflow pass's in-flight tree (see section 4).

## 1. What shipped

| # | Item (review id) | Files | Implementation |
|---|---|---|---|
| 1 | Peek sticky footer (UX-03) | `styles.ts` | `#activity-peek` became a flex column with `overflow:hidden`; only `.peek-body` scrolls. Head and actions stay pinned. |
| 2 | CTA contrast (UX-05) | `styles.ts` | New tokens `--ember-deep: #c93c0d`, `--ember-text: #c23a0a`. `.btn`/`.bubble.user`/`.pr-chip` solid deep ember; the coach bubble keeps its gradient with an ink label; every ember *text* use switched to `--ember-text`. |
| 3 | Row meta legibility (UX-08) | `styles.ts` | `.cal-meta` 10px/700 at full opacity, record/pair meta `#eafbf0` (4.67:1), pair-workout/`.cal-more`/trend axes/`peek-stat`/`peek-step-head` to 10px, the 480px meta-hide deleted. |
| 4 | Row touch targets (UX-01) | `styles.ts` | `.cal-pill` `min-height:24px`; `.cal-pair-part` 20px (42px pair row); `@media (pointer: coarse)` raises rows to 30px. |
| 5 | Hover affordance (UX-24) | `styles.ts` | Inset ring on hover per row type (accent, white on green, lilac for the pair). |
| 6 | Picker never stacks (UX-13) | `web.ts` | `openMonthPicker` closes an open peek and the day menu first. |
| 7 | One-Escape-per-layer (UX-12) | `web.ts` | The three separate Escape listeners became one priority chain: peek -> picker -> day menu -> chat panel; Escape now minimizes the chat. |
| 8 | Signed delta copy (UX-15) | already shipped by the workflow pass | Verified, not duplicated: `planMatchBadge` renders "Completed - on plan (+0.0 km)". |
| 9 | Copy consistency (UX-17/18/10) | `web.ts` | Day page h1 `formatDayLabel(day)` with ISO as secondary; `sessionKindLabel` on day chips, plan-comparison and peek plan; `formatMinutes` everywhere a duration accompanies a distance (plan tooltip, day lines, plan-vs-actual, peek). |
| 10 | Today strip + legend + h1 (UX-02/06/11) | `web.ts`, `styles.ts` | Calendar header: h1 "Your plan", one-line welcome, the workflow pass's legend line kept; a `.today-strip` above the month card (only in the month containing today) with three cases: booked session (kind chip, title, amounts, intent line, Ask coach + View day), recorded run only, nothing booked (Ask the coach prefilled + Log a run). |
| 11 | One coach turn in flight (UX-04) | `web.ts` | `sendInFlight` guard disables Send and drops concurrent sends; `finally` restores. |
| 12 | Garmin modal in place (UX-20) | `web.ts` | The modal script intercepts `a[href*="garmin=setup"]` clicks (modifier keys pass through); the URL param remains the no-JS/deep-link path. |
| 13 | Today-strip intent source | `types.ts`, `directives.ts` | The strip's three Ask-coach intents carry `source: "today-strip"`; the adversarial self-review caught that `parseCoachIntent` whitelists sources, so the source was added to `CoachSource` and `SOURCES`. Verified: the intents now pass validation (the 400 "unknown intent source" is gone; the scratch turn proceeds to the gateway stage). |

## 2. Verification

`pnpm check`: **380/380 tests, lint, typecheck** - green with both passes' changes in the tree (the suite grew from 337 with the workflow pass's tests; two expectations were updated for the intentional copy changes, see section 4, and the workflow pass kept adding tests during this implementation - the final count includes them).

Measured before -> after (same scratch runner, same capture pipeline as the review):

| Measurement | Before | After |
|---|---|---|
| Calendar row height, desktop / 390px phone | 17.4px / 15px | **24px** (30px under emulated touch; pair row 42px) |
| Paired peek internal scroll | `clientHeight` 558 vs `scrollHeight` 685, actions +121px below fold | **`scrollHeight` == `clientHeight` 558, actions pinned inside the popup** |
| Month picker over open peek | both visible (stacked) | **peek closed when the picker opens** |
| Escape behaviour | one press closed every popup; chat ignored Escape | **peek -> picker -> menu -> chat, one layer per press; Escape minimizes the chat** |
| Send during a pending turn | second turn possible | **Send disabled while in flight; a second submit is dropped (verified with a hanging `/chat`)** |
| `.btn` label contrast | white on ember-to-solar, 3.12:1 -> **1.83:1** at the light end | **solid `#c93c0d`, 5.08:1**; bubble label ink on gradient 5.92-10.09:1; ember text uses `#c23a0a`, 5.38:1 on white |
| Row meta | 8.5px, opacity .85 (effective 3.46:1), hidden below 480px | **10px/700 full opacity `#eafbf0` (4.67:1), visible at 390px** |
| Calendar header | 60-word instruction paragraph, no h1, no today answer | **h1 + one-line welcome + legend + today strip** |
| Today-strip intents | (new surface) | **pass `parseCoachIntent`; strip scoped to the month containing today (October has none, November does)** |

Evidence: [docs/design/review/](../design/review) -
[rows before/after](../design/review/review-before-after-rows-mobile.png),
[header + today strip before/after](../design/review/review-before-after-header.png),
[paired peek before/after](../design/review/review-before-after-paired-peek.png),
[CTA before/after](../design/review/review-before-after-cta.png), plus the popups' marked diffs.

## 3. Deferred (with reasons)

- **UX-07** (interactive pills nested inside the day-cell link) - the cell restructure touches `src/calendar-items.ts`, a file the workflow pass introduced in-flight; deferred to avoid churn in their lane.
- **UX-23** (+n more as a link) - same file, same reason.
- **UX-09** (timezone select at signup), **UX-14** (sensitive-state consequence copy), **UX-16** (self-hosted Inter), **UX-21..27** - not in the 12-item table; unchanged backlog order.
- The scratch analyzer's static contrast list still prints the pre-fix pairs; the rendered state is verified by computed styles above.

## 4. Coordination with the concurrent workflow pass

The workflow/engine pass was editing `src/web.ts` and `src/styles.ts` in the same tree while this implementation ran. Its in-flight items that overlap PR-14 were verified and **not duplicated**: the one-line row legend, the end-of-delete toast with the Undo link, guardrail warning styling, the Garmin sync-freshness chip, and the signed plan-match badge (UX-15). Two of its test expectations were updated because this pass intentionally changed copy: the run-peek `planned` string now prints "Easy · 5 km · 35 min" (kind label + one duration format), and the calendar explains the paired row via the legend ("green+purple") instead of the deleted instruction paragraph.

## 5. Why nothing was deployed

`pnpm deploy:live` restarts the live :8093/:8092 process from **this working tree** - which also contains the workflow pass's in-flight feature work. Deploying now would ship a half-finished feature alongside these quick wins. The owner should deploy once the workflow pass reports completion, or ask it to deploy explicitly.

## 6. Files changed by this pass

- `src/styles.ts` - tokens, buttons, bubble, rows, meta, media blocks, hover, peek flex, today-strip styles.
- `src/web.ts` - coach script (send guard, Escape chain), `openMonthPicker`, Garmin modal interceptor, day page, four duration sites, calendar header + today strip.
- `src/types.ts`, `src/directives.ts` - the `today-strip` intent source in the whitelist (section 1, row 13).
- `test/web.test.ts` - two expectation updates (section 4).
- `docs/design/review/` - four before/after evidence images.
- This record, the parent review's status header, and the analysis index.
