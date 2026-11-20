# Daily-page review evidence (2026-11-20)

Before/after captures for the training-log and day-page pass. The runner is the same seeded `Ada Runner` used by the
layout review (Asia/Taipei, November 2026: threshold session on the 17th, runs on 10/13/15, two coaching states, one
muscle check-in). The content column is 1044 px in both viewport widths; the before images are 1280 px and the after
images are 1164 px, so the page content is directly comparable.

| Image | What it shows |
|---|---|
| `history-before.png` | Old training log: eyebrow, h1, intro, filter card, four stat cards, then the tabs. |
| `history-after.png` | Shipped: h1 + intro, one period summary line, then the tabs; the four cards are gone. |
| `history-after-runs.png` | Shipped, a week with three runs: the summary line carries runs / km / time / longest. |
| `history-phone-before.png` | Old phone training log (2x, 1759 CSS px tall). |
| `history-phone-after.png` | Shipped phone training log; the summary line stays one line and the days start higher. |
| `day-before.png` | Old day page, full page: eyebrow, date, the date/runner/profile subline, booked, recorded, always-open form. |
| `day-after.png` | Shipped: back link + date, booked, recorded, one `Log a run` disclosure; the form is closed. |
| `day-after-open.png` | The same page with the disclosure open; the five-field form is a native `<details>` panel. |
| `day-phone-before.png` | Old phone day page (2x, 1471 CSS px tall). |
| `day-phone-after.png` | Shipped phone day page (2x, 856 CSS px tall); the form is one tap away. |

**Measured**

| | Before | After |
|---|---|---|
| Day page head | 3 lines | 2 lines (80 px desktop / 59 px phone) |
| Day page, desktop | 1315 px | **900 px** closed (fits one screen) |
| Day page, phone | 1471 px | **856 px** closed, 1421 px open |
| Day primary | none; the form was always open | one 44 px `Log a run` summary |
| Training-log head | 117 px | **95 px** |
| Training-log content start | tabs at y 482 | **y 408** (74 px higher) |
| Training-log, desktop | 1570 px | **1474 px** |
| Training-log, phone | 1759 px | **1556 px** |
| Period stats | four cards | one 17 px summary line with longest + planned |

See [18-daily-pages-review.md](../../analysis/18-daily-pages-review.md) for the findings, the deferred pages and the
verification.
