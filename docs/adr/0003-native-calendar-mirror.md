# ADR-0003 — Mirror into Open WebUI's native Calendar; do not fork or iframe

- **Status:** accepted (POC3, optional integration)
- **Context:** the runner may also use Open WebUI for long-form chat. Open WebUI 0.11 already ships a personal calendar with
  month/week/day views, reminders and an events API.

## Decision

1. **No fork** of Open WebUI's SvelteKit frontend.
2. **No iframe** of Open WebUI inside the POC3 calendar.
3. When the Open WebUI environment is configured, mirror each session as an all-day event through
   `/api/v1/calendars/events/...`, using nanosecond timestamps and `meta.poc3_session_id` / `meta.source: "poc3-coach"`.
4. Namespacing keeps POC3 events separate from PoC2-era events; prune only POC3-owned events.
5. A mirror failure never loses the booking in SQLite; the calendar page is unaffected.
6. A fork is revisited only if the native calendar's limits (no external sync, no custom training metrics) become the
   product's core gap.

## Consequences

- The plan appears in Open WebUI's sidebar Calendar with reminders, without a second login.
- POC3 stays upgrade-compatible with upstream Open WebUI.
- The native calendar UI refreshes on navigation; POC3's page is the live view.
