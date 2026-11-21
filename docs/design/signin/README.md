# Sign-in page evidence

This folder holds the rendered evidence for the four-cycle `/login` + `/signup` redesign. The decision record is
[`../../analysis/20-signin-page-design-loop.md`](../../analysis/20-signin-page-design-loop.md); the source research is
[`../../analysis/19-signin-page-research.md`](../../analysis/19-signin-page-research.md).

## Baseline

- `baseline-login-1440.png`, `baseline-login-390.png`, `baseline-signup-1440.png` - the old card, measured before the
  redesign.

## Cycle evidence

| Prefix | What it shows |
|---|---|
| `r1-*` | First POC: editorial split, original art, first measurements, laptop overflow, hidden-element bug. |
| `r2-*` | Progressive goal disclosure, four required fields, laptop/tablet/phone height fixes, one brand mark, language semantics. |
| `r3-*` | Forced colors, 200% zoom, text spacing, error title/link, autofill/forced-colors CSS. |
| `r4-*` | Client validation states, duplicate-message fix, compact mobile/tablet alerts, final viewport matrix, contrast. |

Text and machine-readable evidence:

- `r1-measurements.txt`, `r1-heights.txt`
- `r2-measurements.txt`, `r2-heights.txt`, `r2-probe.json`
- `r3-probe.json`
- `r4-heights.txt`, `r4-final-matrix.json`, `r4-probe.json`, `r4-contrast.txt`
- `r4-autofill-and-link-focus.txt`

## Reproduce

The app runs at `http://127.0.0.1:18091` with the scratch DB `tmp/signin-poc.sqlite`; captures use headless Chrome over
CDP. The full local runner scripts and intermediate captures live under `tmp/signin/` (gitignored). The final gate is
`pnpm check` (562 tests in 21 files).

## Art

- `src/vendor/signin/auth-hero.webp` - ComfyUI Flux2 dawn-track plate.
- `src/vendor/signin/calendar-object.webp` - Blender Cycles November-2026 calendar sculpture.
- `src/vendor/signin/paper-grain.webp` - deterministic Pillow noise tile.

All three are original to this worktree; no stock or remote images are used.
