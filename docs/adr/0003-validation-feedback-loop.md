# ADR-0003 — Validation feedback loop and idempotent coach turns

- **Status:** accepted (POC3)
- **Context:** ADR-0001 rejects an invalid model turn before writing. The first implementation turned that rejection
  directly into a deterministic fallback. The model never saw *why* the proposal failed, so it could not correct a
  schema mistake or ask the runner a useful question. In the live "go" case, the model proposed a drill on a date that
  was already past; the validator correctly blocked it, but the runner only received a generic "say it again" message.
- **Decision:**
  1. The gateway sends the `propose_calendar_turn` tool to the model and accepts either a tool call or a plain assistant
     message. Plain text is a valid clarification/chit-chat turn and writes nothing.
  2. A failed validation is returned to the model as structured feedback: `code`, `issues[]`, `policy`, and an
     authoritative `today`/`timezone`/`horizonEnd` context.
  3. The model gets **one repair attempt** (configurable via `POC3_MAX_ATTEMPTS`, default 2 total attempts). It may
     either correct the proposal or reply with one short clarifying question. The deterministic fallback is used only
     after the attempt budget is exhausted.
  4. The validator remains the only writer. A rejected proposal writes nothing. A committed turn writes its memories,
     sessions, change set and assistant message in one SQLite transaction.
  5. `today` is computed in the runner's IANA timezone, and conversation history is date-stamped in that timezone. A
     date inside an older message is historical, not today.
  6. `x-poc3-request-id` (or `request_id`) makes a turn idempotent. A completed request replays its cached response;
     an in-flight duplicate gets `409`; a failed request can be retried with the same id.
- **Consequences:**
  - The exact "go" scenario now ends in a clarification or a corrected booking, not the generic fallback.
  - Invalid turns cannot corrupt the calendar, and retries cannot duplicate a booking.
  - A repair costs one extra model call; the budget is bounded.
  - The tool schema, validator and prompt must stay in sync; tests cover the contract.
  - `coach_turns` is an audit/idempotency table, not a replacement for the append-only message and change-set history.
