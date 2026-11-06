# ADR-0002 — The calendar is the product; the coach is a same-origin bubble

- **Status:** accepted (POC3)
- **Context:** earlier proofs made chat the front door and embedded a calendar elsewhere. That hides the plan, makes edits
  hard to verify, and forces a heavy embed (iframe, cookies, double login) when the calendar is the real object.

## Decision

1. After login the runner lands on a **private month calendar**.
2. The coach is a **self-implemented floating bubble** inside the calendar document — not an iframe, widget or API-key
   embed.
3. The bubble calls the same-origin `POST /chat`, which proxies to the coach gateway. It never calls the model directly.
4. The bubble has direct DOM access to the month grid, so CRUD changes can be animated in place.

## Consequences

- No double login, no iframe sandbox, no reverse proxy for WebSockets.
- The calendar is the source of truth for the UI.
- The bubble still needs streaming; conversation history persistence and LLM-driven undo are implemented (see the backlog).
