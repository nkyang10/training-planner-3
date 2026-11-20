# Entry-screen review evidence (2026-11-20)

Evidence for the "main entrance from login" review and the shipped simplification. The page was rendered from a
seeded in-memory runner (`nky`, zh-HK, November 2026: a 10K race on the 15th, post-race and low-load states, one sore
calf, Garmin synced 14:23) in headless Chrome at 1164x900 and 390x844.

| Image | What it shows |
|---|---|
| `current-entry-annotated.png` | The old calendar entry at 1164 px, with six numbered findings and a caption strip. |
| `shipped-entry.png` | The shipped entry: today hero, one primary action, states/freshness as quiet meta, the row key at the grid. |
| `shipped-entry-phone.png` | The shipped entry at 390 px. |

The shipped page keeps the same data and components; it is the product code, not a prototype. The capture harness is
`tmp/entry-capture.ts` (gitignored scratch); a second harness (`tmp/entry-capture-booked.ts`) captured the booked-today
hero. Measurements come from `tmp/entry-review/probe.json`.

**Measured:** head 217 -> 51 px, grid 479 -> 362 px at 1164x900; phone grid 556 -> 461 px; above-grid targets 11 -> 7;
primary CTA 26 -> 44 px. See [17-entry-review.md](../../analysis/17-entry-review.md) for the findings and verification.
