# POC3 documents

Start with the [solution document](POC3-CALENDAR.md); it is the reference for the architecture, coach contract, calendar
and training-log behavior. The [training-log plan](TRAINING-LOG-PLAN.md) goes deeper on the analysis slices, and the
[feature backlog](FEATURES-FOR-REVIEW.md) lists what is still waiting for owner review.

| Document | What it answers |
|---|---|
| [POC3-CALENDAR.md](POC3-CALENDAR.md) | The standalone solution: problem, architecture, accounts/profiles, coach contract, CRUD/batch, change history/revert, suggestions, animation, Garmin, API, runbook, limits |
| [TRAINING-LOG-PLAN.md](TRAINING-LOG-PLAN.md) | Research, feature inventory and the implemented training-log slices: load/ramp, hard/easy, rich run metrics, per-kilometre splits, Garmin laps/intervals, HR zones, period best efforts/PRs and weekly coach review |
| [FEATURES-FOR-REVIEW.md](FEATURES-FOR-REVIEW.md) | Remaining candidate features from PoC1/PoC2, prioritised for owner review; the implemented slice is marked done |
| [adr/0001-server-validated-coach.md](adr/0001-server-validated-coach.md) | LLM proposes, server validates before writing |
| [adr/0002-calendar-first-bubble.md](adr/0002-calendar-first-bubble.md) | Calendar is the product; the bubble is self-implemented, not an iframe |
| [adr/0003-validation-feedback-loop.md](adr/0003-validation-feedback-loop.md) | Rejected proposals are fed back to the model for one repair/clarification; turns are idempotent |

## Design screenshots

| Screenshot | Shows |
|---|---|
| [Calendar pills](design/calendar-pills.png) | Plan pills and green recorded-run pills in the month grid |
| [Calendar CRUD animation](design/calendar-crud-animation.png) | A session pill flying into the bin while the deleted day pulses |
| [Coach starter suggestions](design/coach-starter-suggestions.png) | Starter prompts on first open |
| [Coach Not applied card](design/coach-not-applied-card.png) | Structured failure card above the suggestion rail |
| [Coach delete in place](design/coach-delete-in-place.png) | Delete applied in place |
| [Training log month](design/training-log.png) | Period selector, weekly volume, best efforts and week rows |
| [Training log week](design/training-log-week.png) | Load card, daily volume and plan-match badges |
| [Training log year](design/training-log-year.png) | Monthly volume, best efforts and month rows |
| [Activity detail](design/activity-detail.png) | Rich metrics, fastest efforts, per-kilometre splits, laps and HR zones |
