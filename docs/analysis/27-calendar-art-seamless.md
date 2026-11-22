# 27 - Calendar art seamless refinement

**Trigger:** the framed 96 px plate from [26-calendar-art-uiux.md](26-calendar-art-uiux.md) read as a pasted thumbnail.
The art itself was good; the integration was not. This pass keeps the same Blender/ComfyUI assets and changes how they
sit in the calendar UI.

**Verdict:** the plate is now a transparent cut-out on the today strip's paper field, with no frame. The coach token
moved from the launcher badge into the coach panel header. The launcher is text-only. The result is shorter, quieter
and reads as part of the page rather than a card inside a card.

## 1. What was wrong

- The 96x96 tile had a border, a paper background, a drop shadow and `object-fit: cover`; it read as a thumbnail.
- It was a square in a wide text row, so it interrupted the reading line between the copy and the actions.
- The coach token was a cream disc inside the orange launcher; it read as a badge or a second button.
- The paper wash lived only behind the calendar card, so the plate's paper did not continue into the strip.

## 2. Design decisions

| ID | Decision | Reason |
|---|---|---|
| SM-01 | Export the Blender object as a **transparent cut-out** (640x480) and remove the tile border, paper background and shadow. | The object, not a rectangle, becomes the visual unit. |
| SM-02 | Put the cut-out on a **10% paper field** inside the empty today strip; use the same `calendar-wash.webp` as the calendar card. | The material continues from the strip into the grid; no separate paper patch. |
| SM-03 | Make the cut-out **120x90 desktop / 84x64 <=820 px**, with a soft drop shadow. | It is an editorial spot, not a thumbnail; the wider proportion suits the landscape object. |
| SM-04 | Move the coach token from the launcher to a **30x30 avatar in the coach panel header**; make the launcher text-only. | The launcher is a control; the coach's object belongs with the coach's name, not as a badge inside a button. |
| SM-05 | Add `?v=2` to the empty-art URL and bump `APP_CSS_VERSION` to 33. | A client that cached the framed composite for a day must not keep it. |
| SM-06 | Keep the object month-agnostic and decorative (`aria-hidden`, `alt=""`); hide the paper field and avatar in forced colors. | Art must never be the only carrier of state, and high contrast outranks decoration. |

## 3. Before / after

| Frame | Before 26 | After 27 |
|---|---:|---:|
| Empty 1440x1000 page | 1400 | **1394** |
| Empty 390x844 page | 1390 | **1382** |
| Empty 320x700 page | 1498 | **1490** |
| Empty 768x1024 page | 1444 | **1436** |
| Empty 980x800 page | 1400 | **1394** |
| Today strip, 1440 | 145 | **139** |
| Today strip, 390 | 221 | **213** |
| Art unit | 96x96 framed | **120x90 cut-out** |
| Art unit, <=820 | 72x72 framed | **84x64 cut-out** |
| Coach bubble, 1440 | 118.1x54 with token | **84.1x48 text-only** |
| Coach bubble, 390 | 106.1x46 with token | **76.1x44 text-only** |
| Coach token | 26 px inside launcher | **30x30 avatar in panel header** |

The populated calendar, history, profile and muscle page heights are unchanged. No frame has horizontal overflow.

## 4. Review

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| SM-01 | P2 | The cut-out is still a third element between copy and actions. | Accepted: it is a small editorial spot, not a tile; the action order is unchanged. |
| SM-02 | P3 | The token is no longer visible on every signed-in page. | Accepted: the launcher stays clean; the token is visible when the coach opens, where it has a name and a role. |
| SM-03 | P3 | The strip paper field is only 10% and may be invisible on some displays. | Intentional: it is material, not a feature; the cut-out carries the art. |
| SM-04 | P3 | The coach avatar is hidden in forced colors. | Intentional: the panel title still names the coach; decorative art yields to system colors. |
| SM-05 | P3 | The art URL changed with `?v=2`; older cached images are bypassed. | Intentional cache-bust for the one-day image cache. |

## 5. Final audit

- Tests: **627 / 627** in 22 files.
- Viewports: 1440x1000, 980x800, 768x1024, 390x844, 320x700 — no horizontal overflow.
- Forced colors: paper field hidden; cut-out shadow removed; coach avatar hidden; launcher uses ButtonFace/ButtonText.
- No-JS: cut-out, strip field and coach avatar markup render server-side.
- zh-HK phone: no overflow; launcher 62x44; art has no text.
- Assets: cut-out 22,914 + wash 26,516 + token 3,992 = 53,422 bytes (~52.2 KB).
- Contrast: ink/surface 16.02:1; muted/surface 5.47:1; the art is decorative.
- Evidence: [`docs/design/calendar-seamless/`](../design/calendar-seamless/).

## 6. Limits

- The cut-out is still an empty-state spot, not a data visualisation.
- The coach token is no longer in the launcher; if the product wants a visible coach mark at all times, a flat glyph
  (not the 3D coin) would be the next experiment.
- No dark-theme variant; the object would need a dark-palette render rather than a CSS filter.
- The live deployment is not updated by this pass.
