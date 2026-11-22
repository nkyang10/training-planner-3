# Calendar art seamless evidence

This folder is the before/after evidence for the seamless refinement in
[`../../analysis/27-calendar-art-seamless.md`](../../analysis/27-calendar-art-seamless.md). The framed plate record is
[`../calendar/`](../calendar/README.md).

## Before

- `before-empty-1440.png` - framed 96x96 plate.
- `before-empty-390.png` - framed plate on the phone.

## After

- `after-empty-1440.png`, `after-empty-390.png`, `after-empty-320.png`, `after-empty-768.png`,
  `after-empty-980.png` - cut-out on the strip paper field at the tested widths.
- `after-empty-zh-390.png` - zh-HK phone.
- `after-demo-1440.png`, `after-demo-390.png` - populated calendar; no art plate.
- `after-history-1440.png` - clean launcher on another signed-in page.
- `after-coach-1440.png`, `after-coach-390.png` - coach token as the 30x30 panel avatar.
- `after-forced-colors-1440.png` - Windows forced-colors mode.
- `after-nojs-1440.png` - server-rendered with JavaScript disabled.
- `after-measurements.json` - viewport, strip, art, bubble and avatar measurements.
- `art-audit.txt` - asset bytes, before/after heights, contrast and fallbacks.

## Art

- `after-art-cutout-640.png` - the transparent cut-out source.
- `after-art-cutout-120.png` - desktop display size.
- `after-art-cutout-84.png` - <=820 px display size.

The committed asset is `src/vendor/calendar/calendar-empty.webp`; the page requests it as `?v=2` to bypass the framed
version in the one-day cache.

## Reproduce

Seeded review server: `tmp/calendar-art/server.ts` (gitignored) on `http://127.0.0.1:18092`. Headless Chrome over CDP.
Final gate: `pnpm check` (627 tests).
