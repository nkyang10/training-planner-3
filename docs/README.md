# POC3 documents

Start with the [solution document](POC3-CALENDAR.md); it is the reference for the architecture, coach contract, calendar
and training-log behavior. The [training-log plan](TRAINING-LOG-PLAN.md) goes deeper on the analysis slices, and the
[feature backlog](FEATURES-FOR-REVIEW.md) lists what is still waiting for owner review.

| Document | What it answers |
|---|---|
| [POC3-CALENDAR.md](POC3-CALENDAR.md) | The standalone solution: problem, architecture, accounts/profiles, coach contract, CRUD/batch, change history/revert, suggestions, animation, run peek, Garmin, API, runbook, limits |
| [TRAINING-LOG-PLAN.md](TRAINING-LOG-PLAN.md) | Research, feature inventory and the implemented training-log slices: load/ramp, hard/easy, rich run metrics, per-kilometre splits, Garmin laps/intervals, HR zones, period best efforts/PRs and weekly coach review |
| [FEATURES-FOR-REVIEW.md](FEATURES-FOR-REVIEW.md) | Remaining candidate features from PoC1/PoC2, prioritised for owner review; the implemented slice is marked done |
| [adr/0001-server-validated-coach.md](adr/0001-server-validated-coach.md) | LLM proposes, server validates before writing |
| [adr/0002-calendar-first-bubble.md](adr/0002-calendar-first-bubble.md) | Calendar is the product; the bubble is self-implemented, not an iframe |
| [adr/0003-validation-feedback-loop.md](adr/0003-validation-feedback-loop.md) | Rejected proposals are fed back to the model for one repair/clarification; turns are idempotent |

## Design screenshots

All screenshots use a fake demo runner (`Demo Runner`) and synthetic training data.

| Screenshot | Shows |
|---|---|
| [Calendar pills](design/calendar-demo.png) | Plan pills and green recorded-run pills in the month grid |
| [Run peek](design/activity-peek-demo.png) | A recorded-run pill opens a popup with metrics, plan match, load/effect, fastest efforts and four actions; Ask coach sends the natural question with the run's day and metrics plus a hidden review directive |
| [Coach states](design/coach-states-demo.png) | Active and proposed coaching states, the Refresh detection action, set-state form, resolved history and clinician/safety copy; active states also appear as calendar chips and chat-bubble cards |
| [Coach state card](design/coach-state-bubble-demo.png) | A chat-bubble state card with evidence and Resolve, plus the race-week guardrail system line |
| [Coach audit](design/coach-audit-demo.png) | The owner-only audit page: recent hidden directives, comment-only/blocked-write stats, active coaching states, the immutable State activity log and legacy `mode:` memories |
| [Calendar CRUD animation](design/calendar-crud-demo.png) | A session pill flying into the bin while the deleted day pulses |
| [Coach starter suggestions](design/coach-starter-demo.png) | Starter prompts on first open |
| [Coach Not applied card](design/coach-not-applied-demo.png) | Structured failure card above the suggestion rail |
| [Coach delete in place](design/coach-delete-demo.png) | Delete applied in place |
| [Training log month](design/training-log-month-demo.png) | Period selector, weekly volume, best efforts and week rows |
| [Training log week](design/training-log-week-demo.png) | Load card, daily volume and plan-match badges |
| [Training log year](design/training-log-year-demo.png) | Monthly volume, best efforts and month rows |
| [Activity detail](design/activity-detail-demo.png) | Rich metrics, fastest efforts, per-kilometre splits, laps and HR zones |
