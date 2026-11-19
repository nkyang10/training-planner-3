# POC3 documents

Start with the [solution document](POC3-CALENDAR.md); it is the reference for the architecture, coach contract, calendar
and training-log behavior. The [training-log plan](TRAINING-LOG-PLAN.md) goes deeper on the analysis slices, the
[Garmin training-program note](GARMIN-TRAINING-PROGRAMS.md) answers what the Garmin API can and cannot provide, and the
[feature backlog](FEATURES-FOR-REVIEW.md) lists what is still waiting for owner review.

| Document | What it answers |
|---|---|
| [POC3-CALENDAR.md](POC3-CALENDAR.md) | The standalone solution: problem, architecture, accounts/profiles, coach contract, CRUD/batch, change history/revert, suggestions, animation, run/session peek, paired run+workout rows, the integrated run+program peek, Garmin, API, runbook, limits |
| [TRAINING-LOG-PLAN.md](TRAINING-LOG-PLAN.md) | Research, feature inventory and the implemented training-log slices: load/ramp, hard/easy, rich run metrics, per-kilometre splits, Garmin laps/intervals, HR zones, period best efforts/PRs, the metric-selectable trend graph, the Garmin activity-workout overlay (paired row, integrated run+program peek, calendar fill) and weekly coach review |
| [GARMIN-TRAINING-PROGRAMS.md](GARMIN-TRAINING-PROGRAMS.md) | What the Garmin Personal API exposes (per-activity executed workout), what it does not (future scheduled workouts, Coach/adaptive plans), and what a full-plan import would require |
| [FEATURES-FOR-REVIEW.md](FEATURES-FOR-REVIEW.md) | Remaining candidate features from PoC1/PoC2, prioritised for owner review; the implemented slice is marked done |
| [analysis/13-layout-review.md](analysis/13-layout-review.md) | Page-by-page 排版 review (calendar, day, training log, activity, muscle, states, profile, auth) and the coach dock: before/after measurements, tabs-vs-side-by-side options, the Chat/States/Changes IA, interaction details and verification |
| [adr/0001-server-validated-coach.md](adr/0001-server-validated-coach.md) | LLM proposes, server validates before writing |
| [adr/0002-calendar-first-bubble.md](adr/0002-calendar-first-bubble.md) | Calendar is the product; the bubble is self-implemented, not an iframe |
| [adr/0003-validation-feedback-loop.md](adr/0003-validation-feedback-loop.md) | Rejected proposals are fed back to the model for one repair/clarification; turns are idempotent |

## Design screenshots

All screenshots use a fake demo runner (`Demo Runner`) and synthetic training data.

| Screenshot | Shows |
|---|---|
| [Calendar rows](design/calendar-demo.png) | Typed plan/run rows and paired green/purple run+workout rows in the month grid; every row adds the amount its title omits, and the paired row opens one integrated run+program peek |
| [Run peek](design/activity-peek-demo.png) | Clicking a run row, or anywhere on a paired run+workout row, opens one popup with metrics, plan match, the integrated training program, load/effect, fastest efforts and four actions; Ask coach sends the natural question with the run's day and metrics plus a hidden review directive |
| [Session peek](design/session-peek-demo.png) | A planned-session row opens the same popup with the kind, planned distance/duration, completion outcome and matched run, plus View day, comment-only Ask coach, Open run and Training log week |
| [Coaching states](design/coach-states-demo.png) | Active and proposed coaching states, the Refresh action, set-state form, resolved history and clinician/safety copy; active states also appear as calendar chips and chat-bubble cards |
| [Coach state card](design/coach-state-bubble-demo.png) | A chat-bubble state card with evidence and Resolve, plus the race-week guardrail system line |
| [Coach audit](design/coach-audit-demo.png) | The owner-only audit page: recent hidden directives, comment-only/blocked-write stats, active coaching states, the immutable State activity log and legacy `mode:` memories |
| [Calendar CRUD animation](design/calendar-crud-demo.png) | A session pill flying into the bin while the deleted day pulses |
| [Coach starter suggestions](design/coach-starter-demo.png) | Starter prompts on first open |
| [Coach Could not apply card](design/coach-not-applied-demo.png) | Structured failure card above the suggestion rail |
| [Coach delete in place](design/coach-delete-demo.png) | Delete applied in place |
| [Training log month](design/training-log-month-demo.png) | Period selector, weekly volume, best efforts, the metric trend card and week rows |
| [Training log week](design/training-log-week-demo.png) | Load card, daily volume, the metric-selectable trend graph and plan-match badges, plus the Garmin workout line |
| [Training log cadence](design/training-log-cadence-demo.png) | The same week with the Cadence chip selected: the CSS-only metric switch shows the cadence panel without a reload |
| [Training log year](design/training-log-year-demo.png) | Monthly volume, best efforts, the metric trend card and month rows |
| [Activity detail](design/activity-detail-demo.png) | Rich metrics, fastest efforts, per-kilometre splits, laps, HR zones and the Garmin workout step card |
| [Coach dock, before/after](design/layout-review/before-after-coach-dock.png) | The 380 px floating panel covering 26 % of the month card, beside the shipped 340 px dock that reflows the page |
| [Coach dock tabs](design/layout-review/coach-dock-tabs.png) | Chat / States / Changes side by side: the conversation and composer, active + proposed states with Confirm/Resolve, and change sets with Undo, Discuss and Show on calendar |
| [Coach sheet, before/after](design/layout-review/before-after-coach-mobile.png) | The old phone takeover with one 32 px “−”, beside the shipped sheet with the tab strip, a visible × and locked background scroll |
