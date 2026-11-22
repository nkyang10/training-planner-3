# ADR-000X: <short decision title>

- **Status:** proposed | accepted | superseded by ADR-000Y
- **Date:** YYYY-MM-DD
- **Deciders:** <roles or names>
- **Related:** <links to code, pages, issues>

## Context

What is the situation that forces a decision? State the constraints that are real (product rule, security boundary,
data ownership, hosting reality) and the ones that are preferences. Include the measurements or evidence you have; an
ADR without evidence is an opinion.

## Options considered

| Option | What it means | Why not chosen |
|---|---|---|
| A | … | … |
| B | … | … |

## Decision

One paragraph, in the present tense, stating what the system does now. Name the enforcement point in code:
`(src/coach.ts · parseCoachTurn)`.

## Consequences

- **Positive:** what this buys.
- **Negative / accepted cost:** what it makes harder, and who pays for it.
- **Invariants:** the rules a future change must not break. These are the part a reviewer should quote back at you.

## How it is verified

The test, gate or manual check that would fail if the decision were undone.

---

*Copy this file to `docs/adr/NNNN-<slug>.md`, use the next number, and add a row to the decisions table in
[docs/README.md](../README.md).* A superseded ADR stays in place with its status updated — decisions are append-only.
