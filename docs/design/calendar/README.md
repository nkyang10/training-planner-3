# Calendar page art evidence

This folder holds the rendered evidence for the calendar-page art/UIUX pass. The decision record is
[`../../analysis/21-calendar-art-uiux.md`](../../analysis/21-calendar-art-uiux.md).

## Baseline

- `baseline-empty-1440.png` - empty calendar before art.
- `baseline-empty-390.png` - phone empty calendar before art.
- `baseline-demo-1440.png` - populated calendar before art.

## Final

- `final-empty-1440.png`, `final-empty-390.png`, `final-empty-320.png`, `final-empty-768.png`,
  `final-empty-980.png` - empty-month plate and wash at the tested widths.
- `final-empty-zh-390.png` - zh-HK phone empty state.
- `final-demo-1440.png`, `final-demo-390.png` - populated calendar; no plate or wash.
- `final-history-1440.png`, `final-profile-1440.png`, `final-muscle-1440.png` - coach token on the other signed-in
  pages.
- `final-forced-colors-1440.png` - Windows forced-colors mode.
- `final-nojs-1440.png` - server-rendered page with JavaScript disabled.
- `final-measurements.json` - viewport, plate, card, bubble and image measurements.
- `art-audit.txt` - asset bytes, contrast pairs, target sizes and fallback notes.

## Art

- `art-calendar-empty-640.png`, `art-calendar-empty-96.png` - the blank-month plate at full and display size.
- `art-calendar-wash-1200.png` - the plain paper wash.
- `art-coach-token-128.png` - the Blender coach token.

The committed assets are in `src/vendor/calendar/`:

- `calendar-empty.webp` - ComfyUI paper + Blender blank month.
- `calendar-wash.webp` - ComfyUI paper field.
- `coach-token.webp` - Blender token.

All are original to this project; no stock or remote images.

## Reproduce

The seeded review server is `tmp/calendar-art/server.ts` (gitignored) on `http://127.0.0.1:18092`, with an empty user
and a populated demo user. Captures use headless Chrome over CDP. The final gate is `pnpm check` (562 tests).
