# POC3 - UI/UX design review

**Status:** review document; the section-5 quick wins were implemented and verified on 2026-11-19 - see
[11-uiux-quickwins-implementation.md](11-uiux-quickwins-implementation.md). The findings below remain the
design reference for everything not yet shipped. **Date:** 2026-11-19.
**Lens:** a working design review from a senior UI/UX designer's seat - visual system, interaction
patterns, microcopy, accessibility, mobile ergonomics and trust design, judged against what a runner
actually has to do with the product every day.
**Relation to the analysis package:** this is the dedicated design pass that 00-09 did not include.
08 section 11 distilled a vision model's first-impression critique into **PR-14 (surface grammar
pass)**; this review verifies those findings with measurements, keeps the ones that hold, drops the
ones the code already handles, and adds what only a hands-on inspection finds (popup stacking,
in-flight send, folded action footers, markup semantics, signup friction). New items carry `UX-xx`;
PR-14 and I-xx ids are reused where they overlap. The workflow/engine lane (coach contract, states
engine, gateway) is out of scope and untouched.

## 1. Method and evidence

Not a screenshots-only review. The app was exercised end to end on a scratch instance
(`data/ui-review-scratch.sqlite`, ports 18090/18091, seeded fake runner with a realistic November:
matched runs, an unmatched session, a paired run+workout, a rest day, a future race). Every surface
was captured from a real signed-in session in headless Chrome over CDP at 1280x900 and 390x844
(device scale 2), including the interactive states a static capture misses: coach panel open, day
menu, run peek, session peek, paired-row peek, month picker, mobile chat. Python (Pillow/numpy) then
measured what a designer would measure with a ruler:

- **geometry** - pill row heights by colour segmentation, day-cell bands, popup bounding boxes by
  pixel diffing against a raster-stable base shot, plus live DOM probes (`getBoundingClientRect`,
  `scrollHeight` vs `clientHeight`) for the popups' internals;
- **contrast** - every fg/bg pair the stylesheet declares, computed as WCAG relative luminance,
  verdict per actual font size and weight (the `AA-large-only` verdict marks a pair that only passes
  the 3:1 large-text bar at the size it is actually used at);
- **palette** - dominant-colour shares of the rendered pages.

Evidence images live in `docs/design/review/` (red boxes mark the measured areas); the capture and
analysis pipeline is in gitignored `tmp/ui-review/`. Anchors are `file:line` at review time; the
workflow agent is editing `src/web.ts`, so **re-grep any anchor before using it**.

## 2. Scorecard

| Surface | Verdict | Top findings |
|---|---|---|
| Calendar (month) | Strong bones, failing touch ergonomics and daily-answer surface | UX-01, UX-02, UX-08 |
| Coach bubble / panel | Best-in-class pattern, weak in-flight and focus details | UX-04, UX-22, UX-12 |
| Run / session / paired peeks | Excellent system with one structural flaw | UX-03, UX-13 |
| Training log | Honest and complete; load card still speaks numbers, not meaning | UX-15 (+08 #5) |
| Activity detail | The best page in the product | - |
| Day page | Solid; two copy slips | UX-10, UX-17 |
| Signup / login | The highest-friction moment in the product | UX-09, UX-25 |
| Coach states | Careful engine, under-specified consequences | UX-14 |
| Visual system | Warm, distinctive, contrast-broken at its brand accents | UX-05, UX-08, UX-16 |

## 3. Protect these (measured or verified as already good)

1. **The typed row anatomy** - one renderer for first paint and refresh (`src/calendar-items.ts:94-131`),
   kind-tinted planned rows, green recorded rows, the paired green/purple two-line row as one click
   target. Structurally ahead of most training calendars.
2. **The peek discipline** - focus restore on close, same-row toggle, `aria-labelledby`, a loading
   state, and an error fallback that still offers "Open full detail / View day"
   (`src/web.ts:2599-2641`). Escape and outside-click close everywhere; the day menu and the peek
   never stack (a cell click closes the peek first - verified live).
3. **The Garmin key modal** - numbered steps, Show/Hide with `aria-pressed`, focus restore, body
   scroll lock (`src/web.ts:1539-1616`). The most carefully built component in the codebase.
4. **Compassionate copy where it counts** - "No run logged - the plan does not change and there is
   nothing to make up" (session peek), "Not medical advice. For chest pain... seek a clinician"
   (coach states). The product's tone lives here; keep it.
5. **Plan vs actual** on the activity detail: delta chips, bars, `role="img"` aria-label - the
   clearest "did I do what we agreed" surface in the market set 03 benchmarked.
6. **Feedback that survives redirects** - sync/log/undo banners re-render from params
   (`src/web.ts:228-259`), unread count in the tab title capped at 99+.
7. **Reduced motion is honoured globally** including the CRUD flourish (`styles.ts:591-600`).
8. **`sessionIntent`** - the why/effort line exists on the day page and session peek; 08's design
   constitution rule 1 is already materially true.
9. **The 48px coach bubble button** (measured 108.8x48) - the one control that already meets touch
   guidance everywhere.
10. **An airy, warm palette** (measured: 54.7% white, 20.2% wash on the calendar) - the canvas reads
    calm, not dashboard-cluttered.

## 4. Findings

Severity: **P0** daily-use blocker, **P1** comprehension/trust/accessibility, **P2** consistency and
flow polish, **P3** visual-system notes. Effort: S (<1h), M (half day), L.

### P0 - fix first

**UX-01 - Calendar rows are 15-18px touch targets.** Measured: desktop plan/record rows 17.4px tall
(33 detections), mobile rows 15px (43 detections), paired rows 36.6px total (two 18px sub-lines).
WCAG 2.2 requires 24x24 minimum (2.5.8); Apple/Android guidance is 44/48px. The row is the product's
primary object: on a phone, opening a specific run's peek means hitting a 15px strip inside a tappable
cell; a miss opens the day menu instead. Fix (S, `styles.ts:49-53`, `:99-104`): give every
`.cal-pill` `min-height:24px` (desktop) and `min-height:30px; padding:3px 4px` under
`@media (pointer:coarse)`; paired rows get `min-height:40px` total; cap visible items at 3 on
`pointer:coarse` or raise `.cell` min-height so cells still fit 4 rows. Acceptance: re-measured row
>= 24px desktop, >= 30px coarse, pair >= 40px, no text clipping.

**UX-02 - The 6am question has no answer surface.** The calendar opens straight into the month grid;
today's session is one cell among 30 and the bubble opens with generic starters. 08 #1 flagged this;
verified: no today strip, no contextual starter, the day page is two taps away. Fix (M, `src/web.ts`
calendar body, data already fetched): a compact "Today - Thu 19 Nov" strip above the month card:
kind chip + title + amount, the session's intent line, and two actions - "Ask coach" prefilled with
a review-day intent and "View day". Empty-day case: "Nothing booked today" + "Ask the coach to
fill it". This is the single highest-leverage addition in the review.

**UX-03 - The paired peek's actions sit 121px below the fold.** Live-probed: popup `clientHeight`
558, `scrollHeight` 685; the `peek-actions` footer renders at y=679 inside a 558px-tall scroller.
On any run with a full Garmin program, the four primary actions ("Open full detail", "Ask coach",
"View day", "Training log week") are invisible until the runner scrolls inside the popup - which
looks like the popup has no actions at all. Evidence: `review-paired-peek.png`. Fix (S,
`styles.ts:354,396`): make `#activity-peek` a flex column (`head` and `.peek-actions` fixed, only
`.peek-body` scrolls: `overflow:auto` on `.peek-body`, `flex:1 1 auto; min-height:0`). Acceptance:
actions visible without scrolling at 7 program steps.

**UX-04 - No in-flight guard on the coach turn.** `send()` (`src/web.ts:1937-1998`) never disables
the form while a turn is pending; a second Enter fires a concurrent `/chat` with a new idempotency
key. The runner sees two "..." bubbles and the calendar can animate two batches. Fix (S): disable
`#coach-form` submit while pending, re-enable in finally; optionally keep the textarea editable and
queue. Acceptance: second submit during a turn is impossible; retry chip still works after failure.

**UX-05 - The primary CTA fails contrast at its lighter half.** Computed: white on `--ember` 3.12:1
(AA large-text only at 15px/800), white on `--solar` **1.83:1 (fail)** - and the `.btn`/bubble
gradient runs exactly from ember to solar (`styles.ts:29,332`). Every primary button and the coach
bubble spend part of their label on unreadable-on-paper territory. Two fixes, both verified:
(a) keep the gradient, switch the label to ink `#1b120c` - 5.92:1 on ember, 10.09:1 on solar - warm,
on-brand, passes AA at every size; (b) form buttons go solid deep ember `#c93c0d` + white (5.08:1).
Recommend (a) for the bubble and (b) for `.btn`. Effort S. Also fix the ember-on-white *text* uses
(brand, account button, "On plan long" chip): `#c23a0a` measures 5.38:1 on white (`styles.ts:12,468`,
`styles.ts:155`).

### P1 - comprehension, trust, semantics

**UX-06 - The calendar teaches itself in prose, every visit.** The header paragraph is a ~60-word
manual ("Planned sessions are colored by kind; green rows are recorded runs. Every row adds the
amount its title does not state...") rendered on every page load (`src/web.ts:3645`). It is the
right information in the wrong form: a one-time onboarding job done permanently. Fix (M): replace
with a compact legend row - three row swatches (Planned / Recorded run / Run + program) plus the kind
colours as dots with a tooltip - and a single welcome line ("Welcome back, Ada."). Pairs with UX-02's
today strip as the new header. (08 #2, now specified.)

**UX-07 - Interactive pills nested inside a link: invalid markup, hijacked semantics.** Every day
cell is `<a href="/day/...">` containing `role="button" tabindex="0"` pills
(`src/calendar-items.ts:96-106`, cell markup `src/web.ts:3627`). HTML forbids interactive content
inside `<a>`; the tab order passes link-then-buttons-inside-a-link, and JS `preventDefault()` means
the link never navigates on its primary action - it opens the day menu instead, so link semantics
and behaviour disagree. Fix (M): make the cell a `div role="button" tabindex="0"` (day menu), and
give the date number its own `<a href="/day/...">` for direct navigation; the day menu's "View day
details" already covers the rest. Acceptance: no interactive descendants of `<a>`; keyboard Enter on
cell opens menu, on date link navigates.

**UX-08 - Data set in 8.5-9.5px type, one step from invisible.** The row amount (`.cal-meta`) is
8.5px at .85 opacity - effective 3.46:1 on the recorded-run green; the paired workout line is 9.5px;
trend axes and `peek-stat` labels 9px; and below 480px the meta disappears entirely
(`styles.ts:52,77,109`), so the "scannable amount" - the row's most useful number - is gone exactly
where rows are smallest. Fix (S): `.cal-meta`/pair-workout/axis text to 10px/700 minimum; meta colour
`#eafbf0` at full opacity (4.67:1 on the green); delete the 480px hide rule. (Partially 08 #2's
"deltas"; the mobile hide is new.)

**UX-09 - Signup asks for an IANA timezone string.** `<input id="timezone" value="Asia/Hong_Kong">`
(`src/web.ts:2713`) - a free-text `Asia/Hong_Kong` for a Taipei runner, and an impossible question
for most runners. This is the app's highest-friction moment, and the value steers *today*, the
calendar ring and same-day plan matching. Fix (M): `<select>` of ~30 zones ordered by offset, plus a
"detected" prefill from `Intl.DateTimeFormat().resolvedOptions().timeZone`; same on the profile.

**UX-10 - The day page's h1 is a raw ISO date.** `<h1>2026-11-10</h1>` (`src/web.ts:3810`) while the
rest of the app writes "Tue, 10 Nov 2026" (`formatDayLabel`, `src/web.ts:408`). The page's biggest
text is its least human string. Fix (S): `formatDayLabel(day)` as h1, ISO as a muted secondary.

**UX-11 - The calendar page has no h1 at all.** The page-head is an eyebrow plus a paragraph
(`src/web.ts:3644-3645`); the month label is a control. Screen-reader heading navigation and visual
hierarchy both lose the page's name. Fix (S): an h1 ("November 2026" or "Your plan") with the picker
control beside it. UX-02's today strip gives the natural place to rebuild this header.

**UX-12 - Escape closes everything at once; the chat ignores it.** Three document-level Escape
handlers (day menu `src/web.ts:2140`, picker `:2260`, peek `:2649`) all fire on one press - a runner
who opened a peek over the menu loses both with one Escape. Meanwhile the chat panel, the largest
overlay, has no Escape at all: keyboard users must hunt the 32px "minimize" button. Fix (S): a
one-popup stack (close topmost only) and Escape minimizes the chat panel when it is topmost.

**UX-13 - The month picker opens stacked over an open peek.** Verified live: with the paired peek
open, clicking the month label leaves `peekHidden:false` and `pickerHidden:false` - two fixed
popups overlapping (the picker's `stopPropagation` also shields it from the peek's outside-click
close; `src/web.ts:2249-2253`, `openMonthPicker` `:2187`). Every other pair of popups in the app is
mutually exclusive; this is the one hole. Evidence: `review-month-picker-over-peek.png`. Fix (S):
call `closeActivityPeek(false)` at the top of `openMonthPicker`.

**UX-14 - Sensitive states are one-tap mutable without consequence copy.** The bubble state card
offers Confirm/Dismiss side by side (`src/web.ts:1896-1932`), and the states page resolves with one
click; nothing says what confirming *changes* ("the coach will cap intensity and avoid hard
intervals while this is active"). 08 #7 flagged the pixels; the engine is stricter than the UI, so
this is presentation. Fix (M): one consequence line per sensitive family on the card + states page;
Dismiss demoted (text button) with an undo snackbar; resolving a safety-family state asks for a
reason. (This is PR-12's UI half.)

**UX-15 - The same delta wears two formats.** History week chip: "On plan 0 km"
(`matchLabel`, `src/web.ts:759`); run peek: "On plan +0.2 km". The history version is the one 08 #3
called the biggest misread risk ("0 km" reads as "ran nothing"). Fix (S): one signed-delta helper
used by both - "On plan +0.2 km" / "Short -2.1 km" / "Long +3.4 km", tooltip keeps the plan.

**UX-16 - Inter is declared but never loads.** The stack is `"Inter", "Segoe UI", system-ui..."`
(`styles.ts:6`) with no `@font-face` and no font link in the layout head (`src/web.ts:1671-1672`);
computed style confirms the family string while Windows renders Segoe UI. Either self-host Inter
(400/800, two woff2 files, ~40KB) so the design's own typeface actually ships, or drop it and let the
system fonts be the design. (S)

### P2 - consistency and flow

**UX-17 - Kind casing is inconsistent.** The day page prints the raw key (`<span class="chip
kind-tempo">tempo</span>`, `src/web.ts:3812`) while the pills and peeks use `sessionKindLabel`
("Tempo", `src/web.ts:944`). Fix (S): use `sessionKindLabel` on the day page and history plan chips.

**UX-18 - Two duration formats in one view.** Plan tooltips/day page: "95 min"; run details:
"1h 39m" (`formatMinutes`, `src/web.ts:482`). Fix (S): `formatMinutes` everywhere a duration
accompanies a distance.

**UX-19 - Emoji as interface icons.** The bubble "💬 Coach", bell "🔔", brand "⚡", and the 46px
"🗑" trash in the delete animation (`src/web.ts:1678,1411,1662`; `styles.ts:436`) render differently
per platform and read less crafted than the rest of the system; the trash is tonally off for a
product this gentle. Fix (M): a 6-icon inline SVG set (chat, bell, flash, trash, sync, caret); keep
the text glyphs "✓"/"◈" - they are already consistent.

**UX-20 - "Connect Garmin" reloads the page to open a modal.** CTAs link to
`/calendar?garmin=setup` and the modal opens from the param (`src/web.ts:1613`) - a full navigation
plus scroll reset on mobile to show a form that is already in the DOM. Fix (S): intercept in place
with JS (`show()`); keep the param for deep links and no-JS.

**UX-21 - Starters are static and context-blind.** `STARTER_SUGGESTIONS` is a constant
("Plan my week / Book a 5 km run / Review last week", `src/web.ts:107`) while the rail mechanism is
excellent (non-scrolling, tappable, refreshed per turn). 08 #11 verified; fix (S): server-render 2-3
contextual starters (review yesterday's run if one exists; "What's on tap today?" if a session is
booked; "Plan next week" near the weekend).

**UX-22 - The chat panel hides the third of the grid it is editing.** Measured: open panel spans
x=851-1263 of 1280 - a 380px column covering the right of the month card; after a booking the
`refreshCalendar` update and the landing pulse happen beneath it (the fx ghosts fly above the panel
at z 32, but the cells they land on are under it). The flagship "watch the coach edit your calendar"
moment happens where the runner cannot see it. Fix (M): narrow the panel to 320px, and end the CRUD
animation with a toast naming the session with an Undo link (PR-14 #9) bottom-left, outside the panel.

**UX-23 - "+n more" is not clickable.** The overflow hint is a `<span>` whose tooltip says "Open the
day to see every session and run" (`src/calendar-items.ts:129`). Fix (S): make it an `<a
href="/day/...">`; it already behaves like one in the runner's mind.

**UX-24 - Hover feedback is a 3% brightness shift.** `.cal-pill.plan:hover { filter:
brightness(.97) }`, paired 1.02 (`styles.ts:55,69`) - measured-invisible affordance on the product's
main objects. Fix (S): border-colour shift to the row accent plus a 1px inset shadow; keep it cheap.

**UX-25 - Login shows no password toggle and no recovery path.** The Garmin key form has a
Show/Hide toggle (`src/web.ts:1558`) but the login and signup password fields do not - the same
control in the same product behaves differently; and "forgot password" does not exist (known I-14,
restated here as the moment it bites: 8-char minimum, no reset, a locked-out runner has no path).
Fix (S for the toggle; I-14 for recovery).

**UX-26 - The bell polls every 5s regardless of visibility.** `setInterval(load, 5000)`
(`src/web.ts:1534`) keeps a phone awake for a feed that changes after syncs. Fix (S): gate on
`document.hidden`, refresh on `visibilitychange` and after sync actions.

**UX-27 - The setup card outranks the coach.** On the calendar body the order is grid -> Garmin
connect card -> Recent changes (`src/web.ts:3652-3654`). A coach change (with Undo) is the most
time-sensitive thing on the page; the connect card is a standing invitation. Fix (S): Recent
changes directly under the month card, connect card last.

### P3 - visual system notes

**UX-28 - The type scale has 15 steps.** 44/28/22/20/18/16/15/14/13/12/11/10.5/10/9.5/9/8.5 all
appear in `styles.ts`; half the steps are 1px apart, and the tail is where the accessibility problems
live (UX-08). Fix (M): consolidate to a 7-step scale (44/28/20/16/13/11/10) with a documented
"data-dense" exception class for grid/table text, floor 10px.

**UX-29 - The page shake reads as an error.** `page-shake` translates the whole main container
+/-7px on every CRUD batch (`styles.ts:434,440`). Reduced-motion users are protected (good), but
even abled readers parse a screen shake as breakage, not celebration; the pulse rings (`land-pulse`,
`delete-pulse`) already carry the signal. Fix (S, taste): keep the rings, halve the shake to a 2px
nudge or drop it.

**UX-30 - Weekends and the past are visually identical to workdays and the future.** The month grid
marks only today. Runners read weeks Saturday-first socially: long runs and races live on weekends.
Fix (S): a 4% wash tint on Sat/Sun columns and a muted date for past days; no layout change.

## 5. Ready-to-ship quick wins (spec, not yet applied)

Ordered by value/effort; the first five are CSS-only in `styles.ts`, the rest touch `src/web.ts`
markup/inline script - **coordinate with the workflow agent before editing `web.ts`**. Nothing here
needs engine, gateway or schema change, so the whole list is PR-14-compatible.

| # | Item | Files | Effort | Acceptance |
|---|---|---|---|---|
| 1 | UX-03 sticky peek footer | `styles.ts` | S | Actions visible without inner scroll at 7 steps |
| 2 | UX-05 ink label on gradient CTA + deep-ember buttons | `styles.ts` | S | Computed ratio >= 4.5:1 on both halves of every `.btn`/bubble label |
| 3 | UX-08 meta >= 10px, `#eafbf0`, no 480px hide | `styles.ts` | S | Measured row text >= 10px; meta visible on a 390px phone |
| 4 | UX-01 row min-heights incl. `pointer:coarse` | `styles.ts` | S | Rows >= 24/30px, pair >= 40px, cells fit |
| 5 | UX-24 hover border shift | `styles.ts` | S | Visible hover state on all three row types |
| 6 | UX-13 close peek in `openMonthPicker` | `web.ts` (1 line) | S | Picker never stacks over a peek |
| 7 | UX-12 one-popup Escape stack + Escape minimizes chat | `web.ts` | S | Escape closes topmost only |
| 8 | UX-15 signed delta copy everywhere | `web.ts` | S | "On plan +0.0 km" in history and peek |
| 9 | UX-17/UX-18/UX-10 kind labels, one duration format, friendly day h1 | `web.ts` | S | No lowercase kinds, one duration format, h1 "Tue, 10 Nov 2026" |
| 10 | UX-06 legend + one-line welcome (with UX-02 today strip) | `web.ts` + `styles.ts` | M | No 60-word paragraph; today's session answerable in one glance |
| 11 | UX-04 send-in-flight guard | `web.ts` | S | Second send during a turn impossible |
| 12 | UX-20 modal opens in place | `web.ts` | S | No reload/scroll reset on Connect click |

## 6. Measurement appendix

| Measurement | Value |
|---|---|
| Plan/record row height, desktop / mobile | 17.4px / 15px (segmentation: 33 / 43 detections) |
| Paired row height (2 sub-lines) | 36.6px |
| Day cell band heights | 104px first row, 102px rows (138px wide at 1280) |
| Coach bubble button | 108.8 x 48px, 15px/800 label |
| Coach panel (open) | 380px wide, spans viewport top-to-bottom (x 851-1263 of 1280) |
| Run / session / paired peek | 388 x 286 / 388 x 419 / 388 x 594px at 900px viewport |
| Paired peek internal scroll | clientHeight 558, scrollHeight 685, actions at +121px below fold |
| Day menu / month picker | 302 x 264 / 300px wide; picker stacks over peek (verified) |
| Mobile chat takeover | 390 x 814 of 390 x 844 (full screen, one 32px "minimize") |
| White on ember / on solar (CTA label) | 3.12:1 / 1.83:1; ink on same 5.92:1 / 10.09:1 |
| Deep ember #c93c0d + white | 5.08:1; #c23a0a on white (text accents) 5.38:1 |
| Row meta effective contrast today | 3.46:1 (8.5px, .85 opacity on #2f7d57); fixed #eafbf0 4.67:1 |
| Muted #7a6455 on wash / paper | 5.01:1 / 5.27:1 (passes) |
| Palette share, calendar desktop | white 54.7%, wash 20.2%, gradient band 11.6% |

Full contrast table for all 34 declared pairs: gitignored `tmp/ui-review/analysis.json`.
Evidence: `docs/design/review/` - row-height crops desktop/mobile (UX-01), paired peek with the
folded footer marked (UX-03), coach panel coverage (UX-22), picker-over-peek (UX-13), mobile chat
takeover, run/session/day-menu popups.

## 7. What was deliberately not flagged

- Streaming and the bounded repair loop - known limits, engine lane.
- No week/agenda default view - already I-09 in the backlog; UX-02's strip is the cheap 80% until
  the real week view is decided.
- The "1.95 ACWR" load-card phrasing - already I-17 + PR-07 with a specified plain-language fix;
  this review adds nothing beyond confirming the numbers render.
- Bilingual inline labels - already I-21 with an owner decision pending (D-list in 09).
- The l10n/formatting family (km vs mi) - backlog-owned, not a design defect.

## 8. Verdict

The product's interaction skeleton - typed rows, peeks, validated edits, undo, honest states - is
designed with unusual care, and the copy is more humane than anything in the 12-product benchmark
set. What separates the current experience from "good to use daily" is a thin, cheap layer: rows you
can actually tap, a CTA you can actually read, a header that answers "what do I do today", popups
that never stack or fold their own buttons, and a signup that stops asking IANA strings. Every item
in section 5 is copy-and-CSS level work; none of it waits on the season engine, and all of it
multiplies whatever the engine lane ships next.
