# 21 - Calendar page art and UI/UX review

**Scope:** the signed-in Plan/calendar page. This is the same four-cycle research -> design/brainstorm -> POC ->
review loop used for the auth page, applied to a data-dense surface instead of a marketing surface.

**Art slots chosen:**

1. an empty-month plate in the today strip;
2. a low-contrast paper wash behind an empty calendar card;
3. a coach token in the floating coach bubble.

**Non-goals:** a full-page hero, a new navigation model, changing the calendar's data semantics, or replacing the
real muscle anatomy with illustration. The calendar must stay usable before it looks designed.

## 1. Method

- Four cycles, each ending in rendered evidence and a decision.
- Original assets only: ComfyUI Flux2 paper textures, Blender 5.3 Cycles objects, Pillow compositing.
- Headless Chrome over CDP at 1440, 980, 768, 390 and 320 widths; measurements from `getBoundingClientRect`.
- The final gate is `pnpm check` (562 tests in 21 files).
- Evidence lives in [`docs/design/calendar/`](../design/calendar/).

## 2. Cycle 1 - research and baseline

### 2.1 Research

| Source | What it says | What changed here |
|---|---|---|
| [NN/g, Empty-State Interface Design](https://www.nngroup.com/articles/empty-state-interface-design/) | An empty state should explain what is happening and offer the next action; it is not just decoration. | The existing copy and CTAs stay; the plate supports the empty state instead of replacing it. |
| [WCAG 2.2, Non-text Content (1.1.1)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) | Decorative images can be ignored by assistive technology when they add no information. | The plate is `aria-hidden`, the image `alt=""`; the wash is CSS; the token is `alt=""` inside a labelled button. |
| [WCAG 2.2, Contrast Minimum (1.4.3)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Text needs 4.5:1, or 3:1 at large sizes. | The art never carries text; semantic text pairs stay 5.47-16.02:1. |
| [WCAG 2.2, Non-text Contrast (1.4.11)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) | Controls and meaningful graphics need 3:1 against adjacent colours. | The plate is decorative; the tile border and controls keep their existing contrast. |
| [WCAG 2.2, Reflow (1.4.10)](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Content must reflow without two-dimensional scrolling at 320 CSS px. | The plate stacks at <=820 px and shrinks to 72 px; no horizontal overflow at 320. |
| [WCAG 2.2, Target Size Minimum (2.5.8)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Pointer targets need at least 24x24 CSS px, with inline exceptions. | The plate is not a target; the plan button and log link keep their existing sizes. |

### 2.2 Baseline

| Frame | Page height | Today strip | Month grid | Art slots |
|---|---:|---:|---:|---|
| Empty calendar, 1440x1000 | 1327 | 72 | 654 | 0 |
| Empty calendar, 390x844 | 1313 | 144 | 498 | 0 |
| Populated calendar, 1440x1000 | 1348 | 93 | 654 | 0 |
| History, 1440x1000 | 1559 | - | - | 0 |
| Profile, 1440x1000 | 1160 | - | - | 0 |
| Muscle, 1440x1000 | 2438 | - | - | 0 |

The empty calendar is a wall of 30 blank cells with one text strip above it. The page has no visual anchor and the
coach bubble is a generic speech emoji.

### 2.3 Findings

| ID | Severity | Finding |
|---|---|---|
| C1-01 | P2 | An empty month has no visual anchor; the blank grid reads as an unfinished screen. |
| C1-02 | P3 | The coach bubble is a generic emoji, not a Milebook object. |
| C1-03 | P3 | The page head and month nav are text-only; the signed-in surface has no material identity. |
| C1-04 | P2 | A large hero or a full-width illustration would push the month grid and the today action below the fold. |
| C1-05 | P2 | Any art must work for any month; a November-specific object would be wrong in December. |

### 2.4 Concepts

- **A - Blank Month Plate:** a small Blender calendar object on a ComfyUI paper field, inside the today strip. It
  gives the empty state a visual anchor without a new section.
- **B - Route Wash:** a wide paper/track texture behind the empty calendar card, at low opacity. It adds materiality
  without height.
- **C - Coach Token:** a Blender coin with an ember route, replacing the emoji in the coach bubble. It gives the coach
  a consistent object across signed-in pages.

Chosen: combine A + B + C. No hero. The art must stay decorative, local and compact.

## 3. Cycle 2 - design and first POC

### 3.1 Art direction

**Field Notes / Blank Month.** Warm cream paper, espresso clay, one ember route line. The plate is a made object, not
a flat icon: a dark slab, a recessed cream page, a printed grid and a route that starts and ends with a dot. It shares
the auth page's paper/ember palette without repeating the dawn-track scene.

### 3.2 Pipeline

| Step | Tool | Output |
|---|---|---|
| Paper square | ComfyUI Flux2 dev fp8, 1024x1024 | `calendar-empty` background |
| Paper wide | ComfyUI Flux2 dev fp8, 1536x768 | plain paper field for the wash |
| Blank calendar | Blender 5.3 Cycles/OPTIX, 1024x1024 transparent | `calendar-empty-blank.png` |
| Coach token | Blender 5.3 Cycles/OPTIX, 512x512 transparent | `coach-token-top.png` |
| Composite | Pillow: crop alpha, contact shadow, grain, WebP | three committed assets |

The calendar object deliberately has **no month label and no day numbers**: only the grid, weekday initials and the
route. It belongs to any month.

### 3.3 POC

- `today-strip.has-mark` adds a 96 px plate between the empty copy and the actions.
- `calendar-card.is-empty` adds a 16% paper wash behind the month card.
- `#coach-bubble` replaces the emoji with a 26 px token.
- `calendar-empty.webp`, `calendar-wash.webp` and `coach-token.webp` are read once at startup and served with
  `image/webp` and `public, max-age=86400`.

### 3.4 First review

| ID | Severity | Finding | Fix |
|---|---|---|---|
| C2-01 | P2 | The first Blender object said **NOV** and carried day numbers; it would be wrong on any other month. | Re-rendered a blank month: grid + weekdays + route only. |
| C2-02 | P3 | The first wide paper had a strong orange band and a coffee stain; behind the grid it read as a selection or a stain. | Cropped the plain upper paper field; the wash now has no line or stain. |
| C2-03 | P2 | The 96 px plate adds 73 px to the empty page. | Accepted: the empty state is the moment for the plate; the month grid still starts above the fold. |
| C2-04 | P3 | At 26 px the token reads as a small badge, not a detailed coin. | Accepted: the silhouette and route are enough; the bubble label still carries the meaning. |

## 4. Cycle 3 - refined POC and review

### 4.1 What changed

- Blank-month Blender object; no month-specific text.
- Clean paper wash, no band or stain.
- Coach token integrated in the bubble, 26 px desktop / 22 px phone.
- Responsive plate: 96 px above 820 px, 72 px at <=820 px, stacked under the copy.
- Forced-colors block: wash hidden, tile border CanvasText, today action ButtonFace/ButtonText, bubble
  ButtonFace/ButtonText and token hidden.
- Print: plate and wash hidden.
- Static-asset test extended to all six WebP files.
- `APP_CSS_VERSION` bumped to 32.

### 4.2 Evidence

| Frame | Page | Today strip | Plate | Calendar card | Result |
|---|---:|---:|---:|---:|---|
| Empty 1440x1000 | 1400 | 145 | 96 | 314 | No overflow; CTA visible |
| Empty 390x844 | 1390 | 221 | 72 | 418 | No overflow; CTA visible |
| Empty 320x700 | 1515 | 251 | 72 | 464 | No overflow; CTA visible |
| Empty 768x1024 | 1444 | 189 | 72 | 358 | Stacked plate; no overflow |
| Empty 980x800 | 1400 | 145 | 96 | 314 | Three-column strip; no overflow |
| Populated 1440x1000 | 1348 | 93 | 0 | 262 | Unchanged; no wash |
| Populated 390x844 | 1416 | 205 | 0 | 402 | Unchanged; no wash |
| History 1440 | 1559 | - | - | - | Token only |
| Profile 1440 | 1160 | - | - | - | Token only |
| Muscle 1440 | 2438 | - | - | - | Token only |

### 4.3 Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| C3-01 | P2 | In forced colors the today border and button still showed ember until explicitly overridden. | Fixed with Canvas/ButtonFace/ButtonText; wash hidden. |
| C3-02 | P3 | The coach token is hidden in forced colors. | Intentional: the text label carries the control; decorative art yields to high contrast. |
| C3-03 | P3 | The plate cannot communicate data and must not be read as a chart. | Decorative only: parent `aria-hidden`, image `alt=""`; all data remains in text and cells. |
| C3-04 | P3 | At 768 the plate stacks under the copy and adds height. | Accepted; the first field and the plan action remain visible. |

## 5. Cycle 4 - final audit

### 5.1 Viewport and layout

- Empty calendar: 1400 px at 1440x1000, 1390 px at 390x844, 1515 px at 320x700, 1444 px at 768x1024,
  1400 px at 980x800.
- Baseline cost: +73 px desktop, +77 px phone. The month grid still begins at 410 px desktop and 533 px phone.
- Populated calendar, history, profile and muscle keep their previous page heights; the only change is the coach
  bubble width (+9.3 px desktop, +5.3 px phone).
- No horizontal overflow in any tested frame.

### 5.2 Accessibility, fallbacks and assets

- Plate: `aria-hidden="true"` wrapper, `alt=""`, intrinsic 96x96; 72x72 at <=820 px.
- Token: `alt=""`; the button keeps its `aria-label` and visible "Coach" label.
- Wash: CSS background; hidden in forced colors and print.
- Forced colors: wash display none; tile border CanvasText; today action ButtonFace/ButtonText; bubble
  ButtonFace/ButtonText and token hidden.
- No-JS: the plate, wash, token and both CTAs render server-side.
- zh-HK empty 390: no overflow; bubble 92x46; the art has no text to translate.
- Assets: 20,392 + 26,516 + 3,992 = 50,900 bytes (~49.7 KB); local WebP; cacheable one day.
- Contrast: ink/surface 16.02:1; muted/surface 5.47:1; ink on sampled wash paper 15.80:1; muted on wash paper
  5.39:1; coach label ink on ember 5.22:1 and on solar 8.90:1.

### 5.3 Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| C4-01 | P2 | The empty state is 73-77 px taller than baseline. | Accepted: the plate earns its space and the month grid is still above the fold. |
| C4-02 | P3 | The bubble is wider by 5-9 px. | Accepted: it still fits at 320, 390 and 980 with the right inset. |
| C4-03 | P3 | There is no dark-mode variant of the plate or wash. | Existing app has no dark theme; the assets follow the current tokens. |
| C4-04 | P3 | The token is hidden in forced colors. | Intentional; the text label is the control. |

### 5.4 Verdict

The calendar page now has a small, original art system that does a job: it gives an empty month a visual anchor, gives
the month card a paper field, and gives the coach a Milebook token. It does not add a hero, does not push the calendar
off the fold, does not replace any data, and does not introduce a fake control. The normal populated calendar is
unchanged.

## 6. Files and evidence

- `src/web.ts` - asset reads/routes, today-strip plate, empty-card class, coach token.
- `src/styles.ts` - plate grid/responsive, wash, token, forced-colors and print rules.
- `src/vendor/calendar/calendar-empty.webp` - ComfyUI paper + Blender blank month.
- `src/vendor/calendar/calendar-wash.webp` - plain paper field.
- `src/vendor/calendar/coach-token.webp` - Blender token.
- `test/web.test.ts` - empty-state markup and six-asset route test.
- `docs/design/calendar/` - baseline, final captures, measurements and art audit.

## 7. Limits and next work

- The plate is an empty-state affordance, not a data visualisation. It must not be used to imply a run, a plan or a
  month-specific date.
- The wash is intentionally quiet; at 16% it is atmosphere, not a feature.
- The coach token is decorative; the bubble label remains the accessible name.
- Forced colors hides the token and wash; this is deliberate.
- No dark theme or seasonal variants yet. If the product adds a dark theme, the plate and token need dark-palette
  renders rather than CSS filters.
- The live deployment is not updated by this change.
