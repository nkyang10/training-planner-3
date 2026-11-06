# ADR-0001 — The LLM proposes, the server validates and writes

- **Status:** accepted (POC3)
- **Context:** the coach is an LLM. It can hallucinate days, invent session ids, double-book, or return prose instead of JSON.
  The calendar is system-owned, so a bad write is visible and hard for the runner to repair.

## Decision

1. The model returns **one JSON object** with `reply`, `memories` and `sessions[]`.
2. `parseCoachTurn` validates the whole object **before any write**: ISO days, future horizon (56 days), ≤14 actions,
   known kinds, numeric bounds, title/note lengths, CRUD actions, and the required `sessionId` for update/remove.
3. A rejected turn writes **nothing** and returns a deterministic fallback reply.
4. The gateway, not the model, owns ids and persistence. Session ids are deterministic for `add`; update/remove target the
   id supplied in the prompt facts.
5. The gateway mirrors the final state to the optional native calendar only after SQLite is written.

## Consequences

- The model can be wrong without corrupting the plan.
- A malformed reply costs one turn, not data.
- The contract must stay in sync with the prompt; tests cover both.
