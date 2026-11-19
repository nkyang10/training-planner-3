# POC3 - runner workflow, needs and improvement analysis

**Status:** complete analysis package, waiting for owner decisions. **Date:** 2026-11-18.
**Scope:** a full user-workflow and feature analysis of POC3 (the private calendar-first AI coach for runners), mapped
against runner needs researched from public training-sharing sources, reviewed for missing or improvable parts, and
turned into a ranked, sliced backlog.
**Producer:** a multi-agent analysis run: five producer agents (workflow map, runner-needs research, competitive
benchmark, gap analysis, improvement backlog) plus one adversarial reviewer, coordinated by the root agent. Documents
00-06 are read-only analysis; `07-implementation-plan.md` and `10-implementation-record.md` are the later
implementation records and the only documents that describe code changes.

## Start here

Read `00-EXECUTIVE-SUMMARY.md` first. It is the one-page decision document: what the product does well, the five
structural gaps, the top ten improvements and the three slices. `07-implementation-plan.md` records which slice-1 items
were actually built and verified, and `10-implementation-record.md` is the coach-relationship-slice record: what was
actually built for the consultant-friend coach and the honest load signal, with what verification. The other documents
are the evidence behind them.

| Document | Question it answers | Evidence base | Lines |
|---|---|---|---|
| [00-EXECUTIVE-SUMMARY.md](00-EXECUTIVE-SUMMARY.md) | What should the owner decide next, and why? | synthesis of 01-06 | 246 |
| [01-user-workflow-map.md](01-user-workflow-map.md) | How does a runner actually move through POC3 today, end to end? Where does it break? | `src/` at HEAD (routes, client script, gateway, states, store) + product docs | 1033 |
| [02-runner-needs-research.md](02-runner-needs-research.md) | What do runners need, complain about and work around, based on public training-sharing sources? | 46 cited sources: Reddit, LetsRun, Garmin/TrainerRoad forums, coach blogs, race organisers, peer-reviewed papers | 464 |
| [03-competitive-benchmark.md](03-competitive-benchmark.md) | Where does POC3 sit against 12 products, and which gaps are table stakes? | 68 cited sources: vendor pages, help centres, pricing, independent reviews | 802 |
| [04-gap-analysis.md](04-gap-analysis.md) | Which runner needs are unmet, how badly, and where in the workflow? | 01 + 02 + 03, 22 code anchors spot-checked | 460 |
| [05-improvement-backlog.md](05-improvement-backlog.md) | What should be built, in what order, with what acceptance criteria? | 04, ranked by impact x evidence x fit | 580 |
| [06-review-report.md](06-review-report.md) | What in this package is verified, what was corrected, and what still cannot be trusted? | independent code-anchor, URL, id and consistency checks | 234 |
| [07-implementation-plan.md](07-implementation-plan.md) | What was actually built from the backlog, in which files, with what verification, and what is still deferred? | implementation pass after the analysis | 144 |
| [08-institute-product-review.md](08-institute-product-review.md) | Whole-product review from an elite sport-institute seat: product thesis (effort / happiness / structure), the coaching loop, inbound/outbound audits, segments, metrics, design constitution, screen-level findings and a re-sequenced roadmap (PR-xx items, D8-D14) | 00-07 + code spot-checks + an independent vision-model critique of the design screenshots | 321 |
| [09-coach-relationship-model.md](09-coach-relationship-model.md) | The owner's coach-persona directive as law: consultant-friend contract, the three COACH_RULES rewrites, the discuss-feedback-propose-decide protocol, the involve-the-coach action map and the tone book (PR-15, D15-D18) | owner directive 2026-11-18 + `src/coach.ts` contract anchors | 162 |
| [10-uiux-design-review.md](10-uiux-design-review.md) | The hands-on design review: touch-target geometry, popup behaviour, CTA contrast, signup friction, legend/hierarchy and consistency findings (UX-01..UX-30), each measured or live-probed, with a ready-to-ship quick-win spec | signed-in scratch capture in headless Chrome at 1280/390 + Pillow/numpy pixel measurement + live DOM probes + WCAG contrast math; verifies and extends 08 section 11 / PR-14 | 284 |
| [11-uiux-quickwins-implementation.md](11-uiux-quickwins-implementation.md) | What shipped from 10 section 5, in which files, with before/after measurements and evidence, what was deferred and why, and the coordination with the concurrent workflow pass (including why nothing was deployed) | `pnpm check` 375/375 + re-measured headless-Chrome captures + DOM probes with touch emulation | 78 |
| [10-implementation-record.md](10-implementation-record.md) | What was actually built for the consultant-friend coach and the honest load signal, in which files, with what verification? | the three workstream reports + this session's integration log | 224 |
| [11-user-side-review.md](11-user-side-review.md) | What does a first-time runner actually experience on the live product - does the consultant-friend coach behave as promised, and what still confuses a new user? | live journey probe with verbatim coach turns + five vision-model first-impression critiques of the deployed screens (PR-16..PR-20, US-1..US-8) | 99 |
| [12-improvement-record.md](12-improvement-record.md) | What was built from the user-side findings - the coach that finally sees reported effort, the plan_stale gate, the copy pass - and how did the unspecced muscle feature end up shipped? | the improvement slice's workstream reports + the owner's ship decision + the 22/22 live verification | 81 |

**Review status.** The adversarial reviewer (06) opened 33 code anchors (29 confirmed, 3 wrong or overstated, 1
misleading range), 10 cited URLs (8 substantive, 2 JS shells) and recomputed id traceability. It applied 8 surgical
corrections to 04. The root then fixed the remaining review findings: added URL schemes to 02's 43 openable citations,
assigned I-18 to slice 1, added the G-08/G-18 mapping note, reworded the infrastructure claim, repaired the two literal
`??` defects in 03, deleted stale root-level copies of 01-03 and POC3-CALENDAR.md, and recorded the disposition of every
finding in 06 section 8.

**Character encoding.** 00, 02, 04, 05, 06, 07, 10 and this index are pure ASCII. 01, 03, 08, 09 and 11 are valid
UTF-8 and intentionally contain typographic punctuation; 01 and 03 add Chinese UI quotes and the competitive matrix's
yes/partial/no glyphs (audited byte-by-byte in 06: the earlier "lone surrogate" alarm was a UTF-16 reporting
artefact, not file corruption); 08 and 11 quote the calendar's own UI glyphs (the run checkmark and the workout
diamond) in their findings tables; and 09's tone book quotes both a lecturing and an advisory Traditional Chinese
phrase pair. No document contains mojibake or replacement characters. No document contains mojibake or replacement characters.

## ID conventions

| Prefix | Meaning | Lives in |
|---|---|---|
| `P1-P8` | Runner personas (beginner, race-focused, Garmin power user, non-Garmin, returning from injury, time-crunched, masters, bilingual) | 01 |
| `S1-S12` | End-to-end journey stages | 01 |
| `SF-01..SF-23` | User-facing surfaces | 01 |
| `X1-X10` | Cross-cutting workflows (auto-sync, validation, undo, states, notifications, timezone, auth) | 01 |
| `WF-01..WF-27` | Workflow friction and risk register | 01 |
| `CN-01..CN-30` | Verified "cannot do today" checklist | 01 |
| `ST-01..ST-12` | Strengths to protect | 01 |
| `Q-01..Q-12` | Owner questions | 01 (answers in 04) |
| `S1-S55` | Runner-research sources | 02 (separate ledger from 03's S ids) |
| `J1-J11` | Jobs to be done | 02 |
| `N1-N43` | Runner needs, 13 families | 02 |
| `C1-C8` | Segment conflicts and tensions | 02 |
| `S1-S68` | Competitive-benchmark sources | 03 (separate ledger from 02's S ids) |
| `O1-O6` | POC3 differentiation opportunities | 03 |
| `G-01..G-28` | Gaps between needs and the product | 04 |
| `I-01..I-24` | Ranked improvement items | 05 |
| `PR-01..PR-15` | Institute product-review items (season engine, subjective inbound, recaps, share/coach outbound, surface grammar, involve-the-coach pass) | 08 (PR-01..PR-14), 09 (PR-15) |
| `PR-16..PR-20` | User-side follow-ups: RPE into the coach prompt, jargon glosses, states zero-state, label/empty-metric copy, top-chrome copy | 11 |
| `US-1..US-8` | Ranked user-side findings from the live journey and the vision critique | 11 |
| `D1-D7` | Owner decisions (00 section 9) | 00 |
| `D8-D14` | Owner decisions, continuing the numbering | 08 |
| `D15-D18` | Owner decisions from the coach-relationship directive | 09 |
| `QW-1..QW-8` | Sub-one-day quick wins | 05 |
| `UX-01..UX-30` | Measured UI/UX design-review findings, P0-P3 | 10 |
| `F-01..F-22` | Reviewer findings | 06 |

Note: 02 and 03 each use an `S` prefix for their own source ledgers. The numbering is independent. Cite them as
"02 S17" and "03 S17" to avoid ambiguity.

## Evidence and limits

- **Code is the source of truth.** Every workflow claim in 01 and every code touchpoint in 04/05 carries a
  `file:line` anchor against the working tree at analysis time (the tree had uncommitted changes). Line numbers drift
  when `src/web.ts` changes; re-grep the anchor before editing.
- **Product docs overstate some shipped behaviour.** The package records four documentation drifts (horizon shown in the
  bubble header, "owner-only" audit wording, reduced-motion promise, "bell is sync feed only") and withdraws a fifth
  candidate (manual-sync double-pull) after review. See 04 section 1.1 and 06 F-07. Treat the product docs as intent, not
  as proof.
- **Research is desk research, not a survey.** Forum participants self-select, English-language sources dominate, and
  watch owners are over-represented. 02 states its frequency signals, severities and confidences explicitly and lists
  what primary research would settle (G1-G10).
- **Competitor data is dated 2026-11-18.** Prices and features change; the matrix footnotes mark uncertain cells.
- **No primary runner interviews were run.** The validation plan in 05 section 8 is a proposal, not evidence.
- **This package does not modify the product.** All fixes are proposals; nothing here was implemented or deployed.

## How to use it

1. Read 00 for the verdict and decisions.
2. Use 01 as the workflow reference when discussing any screen or route.
3. Use 02 when a prioritisation argument needs runner evidence, and 03 when it needs a market comparison.
4. Use 04 to see which need is unmet and where, and 05 to pick a slice and write acceptance tests.
5. Read 06 before quoting any number or claim from 01-05 in a decision document.
