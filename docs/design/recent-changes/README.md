# Recent-changes evidence: before, prototype, shipped (2026-11-21/22)

Before, state, proposed and shipped captures for the Recent changes card. The runner is a seeded `Ada Runner`
(Asia/Taipei, fixed clock 2026-11-21 20:00, en + zh-HK) with five coach batches shaped like the owner's screenshot: two
mobility add-ons, three same-day updates and one 14-item plan batch. All data is synthetic; the account and the database
are scratch (`tmp/recent-changes/scratch.sqlite`), never the live one.

## Before the review

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

## The design prototype

| Image | What it shows |
|---|---|
| `proposed-card-desktop.png` | Prototype at 1280: count + range headline, entry rows, `+ Show all 14`, counted undo labels, "Ask why". |
| `proposed-card-390.png` | The prototype at 390x844: 1128 CSS px (-18%). |
| `proposed-card-320.png` | The prototype at 320x700: 1522 CSS px (-10%); the 14-item row is 285 px (-44%). |

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

The proposed images are a **design prototype**, not product code: the card was rebuilt in the live page from
`/chat/history` plus an injected style block. The mock has no undo behaviour, is English-only, and cannot show the
`before`/`after` deltas because that endpoint does not carry them. See
[21-recent-changes-review.md](../../analysis/21-recent-changes-review.md) for the findings, the fix spec and the
verification.

## Shipped (2026-11-22)

F1-F5 of the review shipped, with F6-F9 in the same slice. The page card is still server-rendered; the dock card is
client-built but now uses the same words, en-GB dates and counted labels. The raw coach summary is no longer rendered.
The card's footnote now ends with **See all changes** to `/changes`, and the dock's footer link is **Open all changes**;
the shipped captures below predate those links. See [the all-changes page](../changes-page/README.md) and
[23-all-changes-page.md](../../analysis/23-all-changes-page.md).

| Image | What it shows |
|---|---|
| `shipped-card-desktop.png` | The shipped card at 1280x900, English: counted headline, entry rows, counted Undo, Ask why, local-day meta. |
| `shipped-card-desktop-open.png` | The 14-item batch with the native disclosure open (`− Show all 14`). |
| `shipped-card-390.png` | Phone 390x844 (2x): 1208 CSS px (-12.6%); the 14-item row is 234 px. |
| `shipped-card-320.png` | Small phone 320x700 (2x): 1324 CSS px (-21.7%); the 14-item row is 254 px (-50%). |
| `shipped-card-zh-HK.png` | The same card in Traditional Chinese: localized headline, entries, labels and dates. |
| `shipped-long-batch.png` | Crop of the 14-item batch: 3 rows + `+ Show all 14`, counted Undo, Ask why. |
| `shipped-undo-in-place.png` | After an in-place undo: `Undone` badge, no Undo form, Ask why kept, toast `Undone: 2 sessions`. |
| `shipped-dock-changes.png` | The dock's Changes tab: same headlines, en-GB dates, counted labels, sorted entries. |
| `shipped-dock-long.png` | The dock's 14-item card: 3 rows + `+ Show all 14`, `Undo 14 sessions`, Ask why. |

| Measure | Before | Shipped | Delta |
|---|---|---|---|
| Card, 1280x900 | 864.8 px | 897 px | +32.2 px (+3.7%) |
| Card, 390x844 | 1382.8 px | **1208 px** | **-174.8 px (-12.6%)** |
| Card, 320x700 | 1689.8 px | **1324 px** | **-365.8 px (-21.7%)** |
| 14-item row, 320 | 508 px | **254 px** | **-254 px (-50%)** |
| Undo label | `Undo this change` (x5) | `Undo 1 session` / `Undo 2 sessions` / `Undo 14 sessions` | count |
| Undo target | 174.4 x 47 px | 136-143 x 45 px | clear of the launcher at 320 |
| Ask why target | 129 x 26.4 px (`Discuss this change`) | 57 x 36 px | +9.6 px tall |
| Meta | `19 Nov` (UTC slice) | `Changed 19 Nov · 2 days ago` | local day + relative |
| Undone text | 2.57:1 | 5.55:1 | badge, no opacity |
| AX names | 5 x `Undo this change` + 5 x `Discuss this change` | unique within page card and dock | F8 |

Desktop is 3.7% taller because three short entry rows replace two long lines; the phone is 12.6% shorter and the small
phone 21.7% shorter, and the 14-item row is half its former height. The shipped card is 17 px shorter than the 914 px
mock at 1280 and 198 px shorter at 320; at 390 it is 80 px taller than the mock. What remains: F10 is partial (two
renderers; `/chat/history` lacks `before`/`after`, so the dock shows no deltas) and F11 (the discovery line) is not
shipped. The full record is [22-recent-changes-implementation.md](../../analysis/22-recent-changes-implementation.md).

**Harness** (gitignored `tmp/recent-changes/`): `seed.ts` builds the scratch DB, `serve.ts` runs the product code on
:18091 with a fixed clock, `shoot.mjs` captures and probes the before states, `evidence.mjs` builds the annotated
composite and the prototype, `analyze.mjs` prints the numbers and contrast, `undo-experiment.ts` runs the audited revert
against a DB copy, `dock-undo-check.mjs` inspects the page row after a dock undo, `shipped.mjs` captures the shipped
states and the in-place undo (`shipped.json`), and `ax-check.mjs` reads the page and dock AX names (`ax.json`). Headless
Chrome 158 via CDP on :9223.

**Machine evidence:** `probe.json` (17 geometry/style/AX records), `evidence.json` (rects, prototype heights, landing
probe), `undo-experiment.json` (the 14-entry revert: 14 sessions deleted, 0 restored), `dock-undo.json` (the page row
after a dock undo), `shipped.json` (card/row/action geometry, dock text, post-undo state) and `ax.json` (AX names).
UTF-8 JSON, straight from the harness.
