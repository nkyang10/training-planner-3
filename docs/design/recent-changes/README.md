# Recent-changes review evidence (2026-11-21)

Before, state and proposed captures for the Recent changes card. The runner is a seeded `Ada Runner` (Asia/Taipei,
fixed clock 2026-11-21 20:00, en + zh-HK) with five coach batches shaped like the owner's screenshot: two mobility
add-ons, three same-day updates and one 14-item plan batch. All data is synthetic; the account and the database are
scratch (`tmp/recent-changes/scratch.sqlite`), never the live one.

| Image | What it shows |
|---|---|
| `before-card-desktop.png` | The card at 1280x900, English: machine headlines, duplicated detail lines, 10 buttons. |
| `before-card-annotated.png` | The same shot with eight numbered callouts and a caption strip; the map for the findings. |
| `before-card-zh-HK.png` | The same card in Traditional Chinese: the headline stays English and keeps ISO dates. |
| `before-card-focus.png` | Keyboard focus on the first Undo button: the browser's default 1 px ring, not the app's ember ring. |
| `before-card-390.png` | Phone 390x844 (2x): the card is 1383 CSS px tall, 1.6 screens. |
| `before-card-320.png` | Small phone 320x700 (2x): the card is 1690 CSS px tall, 2.4 screens; the 14-item row is 508 px. |
| `before-long-batch.png` | Crop of the 14-item batch: a 280-char summary cut at `on…` plus a 245-char run-on detail. |
| `calendar-full-1280.png` | Full calendar at 1280: the card starts at y 1051, below the fold, under the whole month grid. |
| `after-undo-landing.png` | What the runner lands on after pressing Undo: scroll 0, banner at the top, card 1083 px below. |
| `after-undo-card.png` | The card after the undo: a new `Undo: …` row with another "Undo this change", the original row dimmed. |
| `dock-changes.png` | The coach panel's Changes tab for the same journal: per-entry list, `2 sessions`, `Show on calendar`. |
| `discuss-handoff.png` | Clicking "Discuss this change": the panel opens with a canned message containing the raw summary. |
| `proposed-card-desktop.png` | Prototype at 1280: count + range headline, entry rows, `+ Show all 14`, counted undo labels, "Ask why". |
| `proposed-card-390.png` | The prototype at 390x844: 1128 CSS px (-18%). |
| `proposed-card-320.png` | The prototype at 320x700: 1522 CSS px (-10%); the 14-item row is 285 px (-44%). |

**Measured**

| | Before | Proposed |
|---|---|---|
| Card, 1280x900 | 864.8 px | 914 px (+5.7%) |
| Card, 390x844 | 1382.8 px | **1128 px (-18%)** |
| Card, 320x700 | 1689.8 px | **1522 px (-10%)** |
| 14-item row, 320 | 508 px | **285 px (-44%)** |
| Undo label | `Undo this change` (x5) | `Undo these 2 sessions` / `Undo this session` / `Undo these 14 sessions` |
| Undo target | 174.4 x 47 px | 210 x 47 px |
| Discuss / Ask why target | 129 x 26.4 px | 57 x 36 px |
| Long batch | 280 + 245 chars of text | 3 rows + `Show all 14` |

The proposed images are a **design prototype**, not shipped code: the card was rebuilt in the live page from
`/chat/history` plus an injected style block. The mock has no undo behaviour, is English-only, and cannot show the
`before`/`after` deltas because that endpoint does not carry them. See
[19-recent-changes-review.md](../../analysis/19-recent-changes-review.md) for the findings, the fix spec and the
verification.

**Harness** (gitignored `tmp/recent-changes/`): `seed.ts` builds the scratch DB, `serve.ts` runs the product code on
:18091 with a fixed clock, `shoot.mjs` captures and probes the states, `evidence.mjs` builds the annotated composite
and the prototype, `analyze.mjs` prints the numbers and contrast, `undo-experiment.ts` runs the audited revert against
a DB copy, and `dock-undo-check.mjs` inspects the page row after a dock undo. Headless Chrome 158 via CDP on :9223.

**Machine evidence:** `probe.json` (17 geometry/style/AX records), `evidence.json` (rects, prototype heights, landing
probe), `undo-experiment.json` (the 14-entry revert: 14 sessions deleted, 0 restored) and `dock-undo.json` (the page
row after a dock undo). UTF-8 JSON, straight from the harness.
