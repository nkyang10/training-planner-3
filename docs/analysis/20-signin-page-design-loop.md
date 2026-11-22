# Milebook - sign-in page design loop

**Status:** cycles 1-4 complete; final review. **Date:** 2026-11-22.
**Scope:** the signed-out entry to Milebook (`/login`, `/signup`), rebuilt through four
research → design/brainstorm → POC → review cycles. The account engine, session cookie, Garmin key storage and rate
limiting are out of scope except where the page must describe them honestly.
**Companion:** [19-signin-page-research.md](19-signin-page-research.md) holds the source evidence and the baseline
audit. This document is the decision and verification record: what was tried, what shipped, what the review measured,
and what the next cycle changed.

## 1. Method

Each cycle has the same four moves. A cycle is only complete when its review has evidence.

1. **Research.** Read the guidance, measure the current surface, and name the open questions. No design decision
   without a source or a measurement.
2. **Design / brainstorm.** Produce at least three directions, choose one against the product thesis, and write the
   acceptance criteria before touching code.
3. **POC.** Implement the smallest complete version in the real Milebook shell. Keep the existing POST actions,
   session behavior and zero-runtime-dependency rule. Original art only.
4. **Review.** Capture the real page at desktop, laptop, tablet and phone sizes, including error, filled, restored,
   Chinese and no-JS states. Measure geometry, contrast, target size, focus order and form behavior. The review writes
   the next cycle's research questions.

**Guardrails**

- The forms must keep working without JavaScript: plain same-origin POSTs, native validation, links for mode and
  language switching.
- No fake auth methods. No Google/Apple/passkey button that cannot authenticate, and no fake password-reset flow.
- No stock images. The hero is a ComfyUI generation; the calendar object is a Blender render. Both are original to this
  worktree and served locally.
- Every new string exists in English and Traditional Chinese (Hong Kong).
- `pnpm check` (lint, typecheck, 560 tests) is the regression gate. Markup changes update tests intentionally; they do
  not delete coverage.

## 2. Cycle 1 - research, concept and first POC

### 2.1 Research

The full evidence is in [19-signin-page-research.md](19-signin-page-research.md). The findings that shaped the first
POC:

- The baseline is a 460 px card with no product story, no password visibility, no recovery path, no field-level error
  association, a free-text IANA timezone, and an input border at **1.26:1** contrast.
- OWASP, NIST and NN/g all point away from composition rules and toward length, paste, password managers, visibility,
  rules-before-typing and a strength hint. WCAG 2.2 SC 3.3.8 and SC 2.5.8 set the floor: no cognitive test, paste
  allowed, targets at least 24x24.
- The product's differentiator is a private calendar and a coach that edits it. The entry screen should show that world
  before asking for credentials.
- The PoC has no reset flow. The page can offer an honest "ask the instance owner" disclosure, but it must not pretend
  to send a reset email.

### 2.2 Brainstorm - three directions

| Direction | Sketch | Why it could work | Why it was not chosen |
|---|---|---|---|
| **A. First Light (chosen)** | A full-height editorial split: a warm dawn-track plate on the left, an original Blender calendar sculpture resting on it, and a paper form panel on the right. Serif display, ember accent, one clear form. | It shows the product world before asking for data; the calendar sculpture is literally the product; the warm palette is already Milebook's; it works as a brand moment without stock photography. | Risk of the art overpowering the form; solved by keeping the form on plain paper and the story behind a dark overlay. |
| B. Data-as-art calendar grid | The left panel is a large generative month grid with one highlighted run and a coach bubble; the form sits over it. | Most product-specific; shows the calendar and coach immediately. | A fake product UI next to a real form competes for attention and implies interactions that do not exist. |
| C. Night run / ember | A dark, cinematic night-track hero with an ember glow and a glass form card. | Premium, focused, distinctive. | Breaks the warm-paper system used by the calendar and muscle pages; risks reading as a crypto/fintech login. |

**Chosen concept:** *First Light*. The page says "Your training, in its place." The left panel carries the private
calendar/coach story and the original calendar object; the right panel is the task. The form is paper, not glass.

### 2.3 Original art

No stock assets. Both pieces were made in this worktree.

**ComfyUI hero plate**

- Server: local ComfyUI 0.45.6 on `127.0.0.1:8188`, NVIDIA RTX PRO 5000 Blackwell.
- Model: `flux2_dev_fp8mixed.safetensors` + `mistral_3_small_flux2_bf16` text encoder + `flux2-vae`.
- Workflow: `UNETLoader` → `CLIPLoader(type=flux2)` → `CLIPTextEncode` → `EmptySD3LatentImage` → `KSampler`
  (24 steps, cfg 3.5, euler/simple) → `VAEDecode` → `SaveImage`.
- Prompt: "Extreme close-up macro photograph of a weathered terracotta running track, one soft white lane line curving
  through the frame, warm dawn light raking across the surface, fine grit and texture, shallow depth of field, cream and
  burnt orange palette, abstract minimal composition, generous soft negative space, medium format film grain, no people,
  no text, no logos."
- Seed `20261122`, 1024x1280. Delivered as `src/vendor/signin/auth-hero.webp` (84 KB after WebP quality 80).
- Why this plate: the lane line gives the eye a path, the macro grit gives the page material, and the large soft areas
  let the type and the calendar object sit without a busy background.

**Blender calendar sculpture**

- Blender 5.3, Cycles GPU (OptiX), 1600x2000, 128 samples, transparent film, denoised.
- Scene: a dark espresso cover with a cream November 2026 page; a 7x6 printed grid; 30 real day numbers (1 November
  2026 is a Sunday in a Monday-first grid); a few sage/solar/blue session marks; 17 November in ember; a thin ember route
  line leaving the 17th; no text other than `NOV` and the day numerals.
- Materials: procedural clay/paper bump, ember glaze, brass details removed after the first render because they read as
  a board-game rail. Three studio area lights, 72mm lens, f/8, transparent background.
- Delivered as `src/vendor/signin/calendar-object.webp` (63 KB, 1200x899, alpha preserved).
- Why a physical calendar: it is the product's core object made tangible; the ember route connects the calendar to
  running without a stock runner photograph.

The paper grain tile is a deterministic 128x128 noise PNG/WebP generated with Pillow (seed 20261122), served as
`paper-grain.webp` (8 KB). It is used at low opacity behind the form panel.

### 2.4 First POC - what shipped

| Area | Implementation |
|---|---|
| Page shell | New `renderAuthPage` / `authLayout`-style renderer: no app bar, no coach bubble, no site footer. One hero `<section>` and one `<main>` form panel. Skip link to the username field. |
| Hero | Generated track plate, warm overlay, custom route-M mark, eyebrow, serif h1, subtitle, three proof points, PoC note, transparent Blender calendar object with a slow float (reduced-motion safe). |
| Form panel | Paper grain, compact language switch, two-state mode switch (`aria-current`), serif h2, error banner, single-column form, quiet footer and a native `<details>` help disclosure. |
| Login | Username + password. Password show/hide (JS), Caps Lock status (JS), in-flight busy state (JS), generic server error with `aria-invalid` on both fields and `aria-describedby`. |
| Signup | Username, display name, password, timezone `<select>` with detected default, optional goal + three quick-pick chips. Inline username validation, strength hint, detected-timezone hint. |
| Timezone | Curated 35-zone select grouped by region, labels include the current UTC offset. JS detects `Intl.DateTimeFormat().resolvedOptions().timeZone`, adds it if missing, and updates the hint. No-JS keeps the server default `Asia/Hong_Kong`. |
| Error recovery | Server error codes map to title/message/field associations. Non-secret fields persist in `sessionStorage` across the redirect; password never persists. On error, focus the first invalid field on a fine pointer, or the banner on touch. |
| Progressive enhancement | Without JS the page still posts, switches mode/language via links, and shows the native select. JS adds visibility, strength, caps, goal chips, persistence, focus and busy state. |
| Accessibility | One h1, one h2, labels, `aria-describedby`, `role="alert"`, `role="meter"` with value text, `role="status"` caps, 44 px reveal, 40 px mode links, 48-54 px inputs/buttons, 24 px+ language/help targets, visible focus rings. |
| Assets | Three new static routes (`auth-hero.webp`, `calendar-object.webp`, `paper-grain.webp`) read once at startup. CSS cache version bumped to 31. |
| Tests | Markup-specific anonymous-header test updated to assert the new auth shell. All 560 tests pass. |

**First POC evidence:** `docs/design/signin/r1a-*` (initial capture) and `docs/design/signin/r1-*` (after the cycle-1
quick fixes). The baseline is `baseline-*`.

### 2.5 Review - measurements and findings

Captured through CDP at 1440x1000, 1440x900, 1366x768, 1280x800, 1024x768, 980x800, 768x1024, 430x932, 390x844,
360x800 and 320x700, in English and Traditional Chinese. Full numbers: `docs/design/signin/r1-measurements.txt` and
`r1-heights.txt`.

**What passes**

- **No horizontal overflow at any tested width**, including 320 px.
- Login at 1440x1000 is exactly 1000 px tall; hero 763x1000, panel 677x1000, form 432x246, inputs 52 px, submit 54 px,
  mode links 40 px, language 32 px, reveal 44 px. The primary action is visible.
- Signup at 1440x1000 is exactly 1000 px tall after the cycle-1 compact rhythm; form 432x605, inputs 48 px, submit 50 px.
  The primary action is visible at 864.9.
- Login at 390x844 is 949 px tall; submit at 799.7 is visible. Signup at 390x844 is 1312 px; expected scroll, but the
  first screen still shows the hero and the start of the form.
- Contrast: h2 18.16:1, sub 5.83:1, eyebrow 5.69:1, input border 3.19:1, submit 5.78:1, error 8.98:1, muted 5.83:1,
  focus ring 5.69:1. Hero h1 4.64-5.43:1 (large text, passes 3:1); subtitle 5.26:1; note 7.0:1.
- All targets measured at least 24x24; inputs 48-52, reveal 44, submit 50-54, mode 40, language 30-32, goal chip 32.
- One h1, one h2, one main, labels on every field, unique IDs, no nested interactive elements.
- Show/hide works (`type`, `aria-pressed`, label, icon); strength scores 1/2/3 with text and meter values; goal chip
  fills the input and focuses it; timezone detection sets `Asia/Taipei` and updates the hint; restore brings back
  username/display name/timezone/goal and focuses the invalid username; mobile error focuses the banner; no-JS keeps
  the form action and hides the JS-only controls.
- 560/560 tests pass; typecheck passes.

**Findings**

| ID | Severity | Finding | Evidence | Acceptance for next cycle |
|---|---|---|---|---|
| R1-01 | P1 | **Signup's primary action is below the fold on common laptop heights.** At 1366x768 the page is 959 px and the submit bottom is 885; at 1280x800 it is 917/843; at 1024x768 it is 914/840. Only at 1440x900 does it just fit (963/889.5). | `r1-heights.txt`; `r1-signup-1366x768.png`, `r1-signup-1024x768.png` | Submit visible without scroll at 1366x768 and 1024x768; keep all fields usable. |
| R1-02 | P1 | **The 980 px breakpoint creates a login cliff.** At 980x800 the mobile sheet is 999 px tall and the submit bottom is 848; at 981 the desktop split fits in 800. | `r1-heights.txt` | No viewport in the 980-1000 px band may push the login submit below the fold. |
| R1-03 | P1 | **`[hidden]` was overridden by CSS `display` rules.** The empty strength meter and the JS-only password toggle were visible before JS or before typing; in no-JS the toggle was a dead control. | Chinese mobile capture before the fix; DOM probe | `.auth-page [hidden] { display:none !important; }` ships; no-JS and empty states re-captured. **Fixed in cycle 1.** |
| R1-04 | P2 | **Signup is a five-field wall in one 432 px column.** It fits 1000 px but reads dense; the optional goal field and its three chips consume roughly 140 px. | `r1-signup-1440-en.png` | Reduce initial signup to four fields; move the optional goal behind a disclosure, or group without hiding required fields. |
| R1-05 | P2 | **Mobile signup is 1312 px at 390x844 and 1332 px at 320x700.** Expected for five fields, but the submit is 1222 px down; the first screen cannot show the action. | `r1-signup-390-zh.png`, `r1-signup-320-en.png` | Reduce mobile page height by at least ~120 px without dropping required fields; keep hints legible. |
| R1-06 | P2 | **The mode-switch container boundary is 1.42:1.** The active state is also carried by the white pill, shadow and 2 px ember underline, so it is not colour-only, but a strict 1.4.11 reading may still flag the boundary. | Computed contrast | Keep the text/underline state cue; if the container remains a control, strengthen the boundary or document why text identifies it. |
| R1-07 | P2 | **The current language is a non-focusable `<span role="button">`.** It is announced as a button but cannot be activated. | DOM probe; shared `renderLanguageSwitch` | Render the current language as a status (`aria-current`, no `role="button"`) or make it a real link. |
| R1-08 | P2 | **Two brand marks.** The auth page uses the custom route-M; the rest of the app still uses the ⚡ emoji wordmark. | Auth capture vs app bar | Unify the mark or deliberately document the auth-page exception. |
| R1-09 | P2 | **Error title and message concatenate without a space in accessible text** ("Could not create the accountThat username..."). | DOM probe `restore.error` | Add a separator; re-probe the accessible text. **Fixed in cycle 1.** |
| R1-10 | P2 | **Placeholder text measured 4.29:1**, below AA for normal text. | Contrast calculation | Darken placeholder to `#7a6455` (>=5.2:1). **Fixed in cycle 1.** |
| R1-11 | P2 | **Signup error page is 1065 px at 1440x1000**; the submit at 991 is just visible, but the footer is below and a shorter viewport loses the action. | `r1-signup-error-1440-en.png` | Test the error state at 1366x768 after the cycle-2 layout change. |
| R1-12 | P2 | **Mobile login is 949 px at 390x844**; submit is visible at 799.7 but the recovery help is below the fold. At 980x800 the submit itself is below. | `r1-heights.txt` | Tighten the short mobile viewport; keep the help reachable by one short scroll. |
| R1-13 | P3 | **The optional goal chips are JS-only.** No-JS users can still type a goal; the chips are an enhancement, not a requirement. | No-JS probe | Keep as progressive enhancement; document. |
| R1-14 | P3 | **The auth page has no recovery flow**, only an honest disclosure. A locked-out runner must ask the instance owner. | Help disclosure | Product decision: token reset or owner-assisted reset; not solvable by page copy alone. |
| R1-15 | P3 | **No passkey path.** FIDO guidance is cited, but no WebAuthn backend exists; no button is faked. | Source SR-10 | Future backend decision; not in this loop. |
| R1-16 | P3 | **Hero object is partly cropped on mobile** and subtle at 177x136. It reads as a calendar at desktop; on mobile it is an Easter egg. | `r1-login-390-en.png` | Keep the crop as art direction, or give the mobile object a tighter crop if it reads as noise. |

**Cycle 1 verdict:** the direction is right and the accessibility foundation is real, but the page is not yet
"professional" at laptop and mobile heights. The form is too tall for the frames people actually use, and the optional
goal field is the largest removable block. Cycle 2 must solve height without hiding required information.

### 2.6 Cycle 2 research questions

1. **Optional fields:** what is the accepted pattern for optional signup questions - progressive disclosure, a
   post-signup profile prompt, or a single long form? Does disclosure reduce completion friction without hiding a
   product differentiator?
2. **Short viewports:** what is the right response when a form is taller than a 768 px laptop viewport - tighten rhythm,
   two-column grouping, sticky primary action, or a shorter hero? Which preserves reading order and keyboard flow?
3. **Mobile length:** how long is too long for a signup form at 390x844, and what do runners need in the first screen?
4. **State semantics:** should the current language be a status or a link? What does `aria-current` mean on a language
   switcher?
5. **Brand consistency:** is the auth-page mark an exception or the new system mark? What does it cost to unify it?

Cycle 2 starts from these questions, not from a pixel tweak.

## 3. Cycle 2 - make the form fit real screens

### 3.1 Research

| Source | What it says | What it changed here |
|---|---|---|
| [NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Show only the most important options first; offer specialised options on request. The way to reveal more must be obvious, and the label must set expectations. | The optional training goal became a native `<details>` disclosure after the required fields. The summary says "Add a training goal (optional)" and the plus/minus makes the affordance visible. |
| [GOV.UK, Create accounts](https://design-system.service.gov.uk/patterns/create-accounts/) | The account-creation screen should be about that task, use clear language, and make the difference between creating an account and signing in obvious. Use "Create a username" / "Create a password", not just "Username" / "Password". | Signup labels now say **Create a username** and **Create a password**. The mode switch and heading already separate sign-in from account creation. |
| [GOV.UK, Question pages](https://design-system.service.gov.uk/patterns/question-pages/) | Add "(optional)" to optional questions; do not mark required questions with asterisks; keep hint text short. | Only the goal is optional and only the goal says "(optional)". The required fields are unmarked, as GOV.UK recommends. |
| [GOV.UK, Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/) | Preserve the user's answers; show an error summary; put errors next to fields; turn off HTML5 validation; avoid validating before submit unless research supports it. | The cycle-2 page preserves non-secret fields and associates server errors. Cycle 3 will add `novalidate` and an error title. The username blur check is the one deliberate divergence (see below). |
| [Baymard, Required and optional fields](https://baymard.com/research-articles/required-optional-form-fields) | Mark both required and optional fields explicitly; a short signup can work without marking every required field; 37% of sites mark only optional fields. | With four required fields and one optional goal, marking the optional goal is enough; adding five "required" tags would add noise. |
| [Baymard, Inline form validation](https://baymard.com/research-articles/inline-form-validation) | Inline validation works when it happens after the user leaves the field, not mid-typing. | The username format check runs on blur, not on every keystroke; typing clears the message. GOV.UK would wait for submit. This is a documented tradeoff: the format is cheap to correct and the field is the most error-prone. |
| [NN/g, Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/) | People scroll more than they used to, but top-of-page content still receives more viewing time and fixations; in 2010, 80% of viewing time was above the fold. | The primary action must be above the fold on laptop heights. The optional goal is the only content allowed to move below it. |
| [MDN, `aria-current`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current) | `aria-current` marks the current item in a set; if the current item is not a link, the attribute is optional. It does not make a non-interactive element a button. | The current language is now a `<span class="lang-btn" aria-current="true">` with no `role="button"`. It is a status, not a dead control. |

**Research conclusion.** The first screen should be four required fields, not five. The goal is a
secondary, product-specific question and belongs behind a clearly labelled disclosure. The page still needs to fit
1366x768 and 1024x768 laptops without hiding required information, and the 980 px sheet breakpoint needs its own
short-viewport composition. The mode/language states must be semantically honest.

### 3.2 Design decisions

| ID | Decision | Reason |
|---|---|---|
| AD-11 | Move the optional goal into a native `<details class="auth-goal-disclosure">` after timezone, before submit. Summary: "Add a training goal (optional)". | Progressive disclosure; native keyboard and no-JS behavior; saves 119 px when closed and keeps the coach personalisation available on request. |
| AD-12 | Keep the goal field, hint and chips inside the disclosure; label the input with a visually hidden `<label for="goal">Training goal</label>`; open the disclosure when the server marks the goal invalid. | The input still has an accessible name and description; an invalid goal must be visible when the server rejects it. |
| AD-13 | Add a "Goal saved" sage badge to the summary when non-secret fields are restored after an error; do **not** auto-open the disclosure. | The user can see that their goal survived without paying the 119 px height cost on the error screen. |
| AD-14 | Signup labels become "Create a username" / "Create a password"; login keeps "Username" / "Password". | GOV.UK's clarity rule; the mode already says which task is active. |
| AD-15 | Add short-viewport rhythm rules for desktop/laptop (<=840 px high) and tablet landscape (641-980 px wide, <=860 px high). Required fields stay visible; controls shrink to 44-46 px; the tablet hero loses the proof row and shrinks to 32vh. | Primary action above the fold at 1366x768, 1280x800 and 1024x768, and login above the fold at 980x800. |
| AD-16 | Tighten phone rhythm (14 px form gap, 11.5 px hints, 50 px controls) and keep the 44 px goal summary. | Signup drops from 1312 px to 1176 px at 390x844 without losing a required field or shrinking a touch target. |
| AD-17 | Use one route-M brand mark everywhere: 22 px in the app bar, 28 px on the auth hero; both links have a 32 px target. | Removes the two-brand-marks inconsistency and keeps the mark recognisable at both scales. |
| AD-18 | Current language is a non-interactive status with `aria-current`; only the other language is a link. Add explicit focus-visible rings to the language pills and switch line. | Semantics match behavior; keyboard users can see where they are. |

### 3.3 POC - what changed

- `src/web.ts`
  - `SITE_MARK` replaces `AUTH_MARK`; the app-bar brand and the auth brand use the same SVG route-M. The nav
    accessible name is "Milebook" (the SVG is `aria-hidden`).
  - `renderLanguageSwitch` renders the active language as a span without `role="button"`.
  - Signup labels use `signup.username` / `signup.password` ("Create a username" / "Create a password").
  - The goal field is wrapped in `<details class="auth-goal-disclosure">`; the summary has a saved badge; the
    server adds `open` when `invalid-input` includes the goal; the input keeps its hidden label and
    `aria-describedby="goal-hint"`.
  - The restore script shows the "Goal saved" badge when a non-secret goal is restored, but leaves the disclosure
    closed.
  - Error title and message now have a literal space, so accessible text reads "Could not create the account That
    username is already taken."
- `src/styles.ts`
  - Goal disclosure styles: 1 px `--auth-line-strong` border (3.19:1), 12 px radius, 44 px summary, 22 px
    plus/minus circle, 163 px open height, focus ring.
  - Saved badge: sage, 11 px, 5.1:1 on the disclosure wash.
  - `[hidden]` guard already fixed in cycle 1; still enforced.
  - Brand mark styles; `.brand` min-height 32 px; `.auth-brand` min-height 32 px.
  - Short-viewport rules for desktop/laptop, tablet landscape and small phones; signup-specific selectors where
    the signup compact block would otherwise win on specificity.
  - Focus rings for language pills and the switch-line link.
- `src/i18n.ts`
  - New keys: `auth.goal.disclosure`, `auth.goal.saved`; changed `signup.username` / `signup.password` copy.
- `test/web.test.ts`
  - Auth shell test now checks the site mark, password toggle, goal disclosure, saved badge, hidden JS-only
    controls, timezone select and field descriptions.
  - New error-association test: invalid credentials mark both fields and point to the banner; username-taken points
    to the field plus banner; `invalid-input` opens the goal disclosure.
  - Footer language test updated: the active language has `aria-current` and no `role="button"`.

### 3.4 Review - measurements

Captured at the same matrix as cycle 1. Final evidence: `docs/design/signin/r2-*`; numbers:
`r2-measurements.txt`, `r2-heights.txt`, `r2-probe.json`.

| Viewport | Login page / submit | Signup page / submit | Result |
|---|---|---|---|
| 1440x1000 | 1000 / 728 | 1000 / 865 (goal closed); 1000 / 925 (goal open) | Both actions visible. |
| 1440x900 | 900 / 678 | 900 / 815 | Both visible. |
| 1366x768 | 768 / 557 | 768 / 717 | **R1-01 fixed.** Signup fits exactly. |
| 1280x800 | 800 / 572 | 800 / 712 | Both fit. |
| 1024x768 | 768 / 554 | 768 / 695 | Both fit. |
| 980x800 | 871 / 748 | 1104 / 1040 | Login submit visible (**R1-02 fixed**). Signup still scrolls; tablet landscape is a long-form scroll. |
| 768x1024 | 1088 / 938 | 1333 / 1242 | Login submit visible; signup scrolls. |
| 430x932 | 956 / 821 | 1214 / 1138 | Login submit visible; signup scrolls. |
| 390x844 | 921 / 786 | 1176 / 1100; zh 1151 / 1075 | Login submit visible. Signup is 136 px shorter than cycle 1; still a scroll. |
| 360x800 | 903 / 769 | 1157 / 1081 | Login submit visible. |
| 320x700 | 804 / 699 | 1013 / 967 | Login submit visible. Signup scrolls. |

**Goal disclosure and restoration**

- Collapsed: 44 px high, summary 42 px (desktop) / 44 px (phone); submit below it.
- Open: 163 px high; input, hint and chips visible; submit bottom 925 at 1440x1000.
- Focus order with the disclosure open: skip → brand → Chinese language → Sign in → Create an account →
  username → displayName → password → reveal → timezone → goal summary → goal → three chips → submit.
- No-JS HTML: disclosure closed, goal chips hidden, strength hidden, reveal hidden, goal label present, timezone
  select present. Native `<details>` still opens without JS.
- Restore: username/displayName/timezone/goal come back; disclosure stays closed; "Goal saved" badge is visible;
  page 1000 px; submit 909; username is focused and marked invalid.
- `invalid-input` (goal invalid): disclosure opens; page 1085 px at 1440x1000; submit is below the fold. This is
  accepted because the invalid goal must be visible; the case is rare and the user is already in a correction flow.
- Username blur validation still works; an empty field does not show an error; typing clears it. The server remains
  authoritative.

**Brand and language semantics**

- App bar brand: 114.9x32 px, mark 22x22, text "Milebook", ember text on paper; no horizontal overflow at 1440 or
  390. Auth brand: 28 px mark on desktop, 25 px on phone; 32 px target.
- Active language: `aria-current="true"`, no `role`, not focusable; the other language is a 32 px link.
- Contrast for the new pieces: disclosure border 3.19:1, plus/minus ember 5.6:1, saved sage 5.1:1, summary ink
  18:1, brand nav 5.27:1.
- 561/561 tests pass; typecheck passes.

### 3.5 Findings

| ID | Severity | Finding | Evidence | Acceptance for cycle 3 |
|---|---|---|---|---|
| R2-01 | P2 | **Signup at 980x800 still puts submit below the fold** (page 1104, submit 1040). The 980 px sheet breakpoint is a tablet-landscape case; all required fields are visible on the first screen, but the action is not. | `r2-heights.txt` | Either accept as a long-form scroll with a documented breakpoint, or add a compact landscape composition (shorter brand band/two-column row) without hiding required fields. |
| R2-02 | P2 | **`invalid-input` opens the goal disclosure and pushes submit below the fold** at 1440x1000 (page 1085). | `r2-probe.json` | Keep the invalid goal visible; add a compact error+open-goal composition if it can be done without hiding the error. |
| R2-03 | P2 | **The form still relies on native HTML5 validation** (`required`, `minlength`, `pattern`) and the error page title does not start with "Error:". | Markup + GOV.UK validation pattern | Add `novalidate`; keep server-side validation authoritative; prefix the document title on error; verify no-JS server errors still render. |
| R2-04 | P2 | **Autofill and forced-colors states are unstyled.** Chrome's autofill can paint over the paper inputs; Windows high-contrast can flatten the ember CTA. | CSS review | Add `:-webkit-autofill` paper treatment and a `forced-colors` block; test at 200% zoom and with forced colors. |
| R2-05 | P2 | **The mode-switch container boundary remains 1.42:1.** The active state has text, a white pill and a 2 px ember underline, so it is not colour-only, but a strict non-text-contrast reading may still flag the boundary. | Computed contrast | Keep the text/underline cue; add a stronger boundary only if it does not make the switch look like a boxed control. Document the decision. |
| R2-06 | P2 | **GOV.UK says wait until submit for validation; this page validates the username on blur.** Baymard supports blur validation for most fields, and typing clears the message. | Source tension | Keep the blur check, document the tradeoff, and ensure the server error remains the authoritative one. |
| R2-07 | P3 | **The restored goal is visible only as a "Goal saved" badge**; the value is not shown until the disclosure opens. | `r2-probe.json` | Accept: the badge confirms preservation; opening is one tap. Re-check with screen-reader output in cycle 4. |
| R2-08 | P3 | **The goal summary's plus/minus is CSS-generated**; screen readers get the native expanded state but may not hear the icon. | CSS/DOM review | Accept; the summary text and native state carry the meaning. |
| R2-09 | P3 | **Signup at 320x700 is 1013 px**; the first screen shows the hero and heading, not the first field. | `r2-signup-320-en.png`; `r2-heights.txt` | Accept for a 4-field account form; keep the first field within one short scroll. |
| R2-10 | P3 | **The hero proof row is hidden on short tablet landscape.** | CSS review | Accept; the brand band still carries the mark, eyebrow, headline and subtitle. |

**Cycle 2 verdict:** the laptop-height failure is fixed, the optional goal is now a real progressive-disclosure
pattern, and the brand/language semantics are consistent. The page is ready for the craft pass: native validation
off, error title, autofill, forced colors, 200% zoom, focus and live-state polish.

### 3.6 Cycle 3 research questions

1. **Validation and error announcement:** should the form use `novalidate` and a server-rendered error summary?
   How should the document title and banner announce an error?
2. **Autofill and password managers:** how do Chrome/Safari autofill paint the paper inputs, and what CSS keeps the
   design without breaking the autofill affordance?
3. **Forced colors and zoom:** does the page survive Windows high contrast and 200% browser zoom without losing
   the CTA, the focus ring or the field boundaries?
4. **Live state:** which updates should be announced (strength, caps, busy) and which should stay silent to avoid
   interrupting typing?
5. **Tablet landscape signup:** is the 980x800 scroll acceptable, or is there a compact composition that keeps the
   action visible without hiding required fields?

## 4. Cycle 3 - craft at the edges

### 4.1 Research

| Source | What it says | What it changed here |
|---|---|---|
| [GOV.UK, Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/) | Turn off HTML5 validation; preserve answers; add "Error: " to the page title; show an error summary and field messages; server-side validation is authoritative. | Added `novalidate`, an error title prefix, and a field link inside the alert for single-field errors. Server validation remains the source of truth. |
| [GOV.UK, Error summary](https://design-system.service.gov.uk/components/error-summary/) | Show an error summary, move focus to it, link each error to its answer, and use the same wording as the inline message. | The existing alert is the summary; it is focused and now links to the username for username-taken/not-found. It is not a full list because those errors are single-field or generic. |
| [MDN, `:autofill`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:autofill) | The pseudo-class matches browser-autofilled inputs; Chrome's UA styles use `!important` for background and text, so background-color cannot always be overridden. | Added a paper-preserving inset-shadow treatment plus `-webkit-text-fill-color`; the standard `:autofill` selector is backed by the `-webkit-` alias. |
| [MDN, `forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors) | Do not build a separate design; make small legibility tweaks with system colours. Background images and box-shadows may be forced. | Added a targeted forced-colors block: hide the art plate and grain, use Canvas/CanvasText, ButtonFace/ButtonText for the CTA, Highlight for the selected state, and a visible focus ring. |
| [WCAG 2.2, Reflow (1.4.10)](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Content must reflow at a width equivalent to 320 CSS px without two-dimensional scrolling, except for content that needs two dimensions. | Tested at 320 px and at a 720x500 viewport (200% of 1440x1000). No horizontal overflow; vertical scrolling is allowed. |
| [WCAG 2.2, Focus Visible (2.4.7)](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | Keyboard focus must be visibly indicated. | Added explicit focus-visible rings to the language pills and switch line; the existing field, mode, reveal, summary, chip, submit, help and brand rings remain. |

### 4.2 Design decisions

| ID | Decision | Reason |
|---|---|---|
| AD-19 | Add `novalidate` to the auth form; keep `required`/`minlength`/`pattern` for semantics; server validation remains authoritative. | Removes browser bubbles and makes the server error page the single no-JS fallback. |
| AD-20 | Prefix the document title with "Error: " / "錯誤：" whenever an error is present. | Screen readers hear the error state immediately, following GOV.UK. |
| AD-21 | For username-taken/not-found, append an inline "Choose another username." / "Check the username." link to the alert, pointing at `#username`. JS focuses the target after the jump. | A focused alert is not enough on touch; the link jumps to the field and moves focus there. The link sits inside the message sentence, so the inline target exception applies. |
| AD-22 | Style `:autofill` and `:-webkit-autofill` with an inset paper shadow, ink text and caret. | Keeps the warm surface when a password manager fills the form. |
| AD-23 | Add a targeted `forced-colors` block; do not attempt to preserve the art direction. | High-contrast users need legibility, not the track plate. The brand mark, copy, fields and CTA remain. |
| AD-24 | Add explicit focus rings to language pills and the switch line; keep the existing field/mode/summary/chip/submit/help rings. | The default browser ring was inconsistent with the rest of the page. |
| AD-25 | Guard the live strength text so identical labels are not rewritten on every keystroke. | Avoids repeated screen-reader announcements while keeping the live region. |
| AD-26 | Test the existing busy state explicitly: form `aria-busy`, submit `aria-disabled`, busy label, spinner, `pageshow` reset. | The state existed; the review needed evidence, not a new implementation. |

### 4.3 POC - what changed

- `src/web.ts`
  - `<form ... novalidate>`.
  - `renderAuthPage` prefixes the title when `info` exists.
  - `AuthErrorInfo` gained an optional `link`; `authErrorInfo` returns a username link for username-taken and
    not-found; `renderAuthError` renders it inside the message.
  - The strength text is only rewritten when the label changes.
  - The decorative calendar object is `fetchpriority="low"`; the hero plate stays `fetchpriority="high"`.
- `src/styles.ts`
  - Autofill rules for `:autofill`/`:-webkit-autofill`, including hover/focus.
  - Forced-colors block with system colours; active mode uses `Highlight`/`HighlightText` with a higher-specificity
    selector so the existing panel pill cannot win.
  - Focus-visible rules for `.auth-lang .lang-btn` and `.auth-switch-line a`.
  - Mobile/tablet compact error banner: title and message share a line with a middle dot; the alert is shorter so
    the login action stays reachable.
- `src/i18n.ts`
  - `auth.error.titlePrefix`, `auth.error.chooseUsername`, `auth.error.checkUsername`.
- `test/web.test.ts`
  - Error test now checks the title prefix (English and Chinese), the error link, and the new field-error elements.
  - Auth shell test checks `novalidate` and the new error elements.
  - New static-asset test: all three WebP files return 200, `image/webp`, a 24-hour cache header and a non-trivial
    body.

### 4.4 Review - evidence

| Check | Result |
|---|---|
| Forced colors | `matchMedia('(forced-colors: active)')` true. Story/panel Canvas white; text CanvasText black; input white/black; CTA ButtonFace/ButtonText with a 2 px border; active mode Highlight `rgb(55,0,110)` with white text; hero plate and calendar object `display:none`. |
| 200% zoom / reflow | 720x500: login page 855 px, signup 1088 px; `scrollWidth === 720`, no horizontal overflow; h1 does not overflow. Vertical scroll only. |
| Text spacing | 390x844 with 1.5 line-height, .12em letter-spacing, .16em word-spacing, 2em paragraph spacing: page 1495 px; no horizontal overflow; mode, title and field `scrollWidth <= clientWidth`; submit at 1394. |
| Focus rings | Language pill 2 px ember; mode link 2 px ember; goal summary 2 px ember; submit 2 px ink; switch-line link 2 px ember; skip/brand 2 px solar; inputs 2 px ember. |
| Busy state | After a valid submit: form `aria-busy="true"`, submit `aria-disabled="true"`, class `is-busy`, label "Creating account…", spinner `display:block`; synthetic `pageshow` resets all of it. |
| Error title | `Error: Create an account · Milebook`; `錯誤：登入 · Milebook`. |
| Error link | 1440: 162.9x17 inline, href `#username`; 390: 280x36.5 wrapped; color 8.98:1; underline. |
| Autofill CSS | Served stylesheet contains `:autofill`, `:-webkit-autofill` and `@media (forced-colors: active)`. |
| Tests | 562/562 passing. |

**What passes:** the edge states are now honest and legible. The page works with a password manager, in Windows High
Contrast, at 200% zoom, with enlarged text spacing, and from the keyboard. The error title and field link make
recovery clearer.

### 4.5 Findings

| ID | Severity | Finding | Evidence | Acceptance for cycle 4 |
|---|---|---|---|---|
| R3-01 | P2 | **Forced colors removes the art direction.** The hero becomes a plain Canvas panel; the calendar object disappears. | `r3-login-forced-colors-1440.png` | Accept: high-contrast legibility outranks the art. The mark, copy and form remain. |
| R3-02 | P2 | **At 200% zoom the primary action is below the fold** (login 732, signup 1024 at 720x500). | `r3-login-zoom200-720x500.png`, `r3-signup-zoom200-720x500.png` | Accept: WCAG 1.4.10 requires no two-dimensional scrolling, not that every action fits one screen. No horizontal overflow. |
| R3-03 | P2 | **Autofill is verified statically, not against a real password manager.** Chrome's focused autofill paint can still use UA `!important`; the inset shadow is the mitigation. | CSS + probe | Manual browser check with a saved credential; document the result. |
| R3-04 | P2 | **The error link is an inline 17 px target at 1440.** It wraps to 36.5 px at 390. | `r3-signup-error-link-1440.png` | Accept under the WCAG 2.5.8 inline exception; keep the link inside the message sentence. |
| R3-05 | P2 | **Autofocus on the username has no `:focus-visible` outline** on first load; the field's ember border/glow is the visible focus cue. | Focus probe | Cycle 4 decides whether to keep autofocus; if kept, the border/glow is the indicator. |
| R3-06 | P2 | **`novalidate` means an empty submit posts to the server** and returns a generic "Please check the fields" page. This is a round trip for a case the browser could catch instantly. | GOV.UK pattern + live probe | Cycle 4 adds client-side required validation with inline messages, while keeping the server fallback. |
| R3-07 | P3 | **The alert is not a full GOV.UK-style error list.** For invalid-input (multiple fields) it has no links; it focuses the first invalid field instead. | Error markup | Accept: the generic error is intentionally non-enumerating; the client validation covers empty/invalid values. |
| R3-08 | P3 | **Strength text is a live region**; repeated identical labels are now guarded, but a screen reader may still announce each score change. | JS review | Accept; score changes are infrequent and useful. |
| R3-09 | P3 | **Forced-colors active-state specificity** was initially lost to `.auth-page .auth-mode-link[aria-current]`; fixed with a matching selector. | Probe before/after | Fixed. |
| R3-10 | P3 | **Signup at 980x800 still scrolls** (normal and error). | `r2-heights.txt`, `r4-heights.txt` | Carried to final limits: tablet-landscape signup is a long form. |

### 4.6 Cycle 4 research questions

1. **Client-side required validation:** what is the smallest honest implementation that prevents a server round trip
   for empty/invalid fields without duplicating server logic?
2. **Error-message duplication:** how should hints, strength text and errors coexist without repeating the same
   sentence three times?
3. **Small-screen error states:** at 320x700 and 360x800, which errors should remain above the fold, and which scroll
   is acceptable?
4. **Final AA audit:** contrast, target size, focus, reflow, text spacing, bilingual copy and no-JS fallback - what
   remains, and what is an honest product limit?

## 5. Cycle 4 - validation, small-screen states and final audit

### 5.1 Research

| Source | What it says | What it changed here |
|---|---|---|
| [WCAG 2.2, Error Identification (3.3.1)](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) | Errors must be identified in text, not colour alone. | Every client-side error is a text paragraph associated with its field via `aria-describedby`; the field border and error text both change. |
| [WCAG 2.2, Error Suggestion (3.3.3)](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) | When the correction is known, suggest it. | Messages say what to enter: "Enter a username.", "Use 3–24 lowercase letters…", "Use at least 8 characters." |
| [WCAG 2.2, Redundant Entry (3.3.7)](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html) | Do not make users re-enter information already provided. | Non-secret fields persist in `sessionStorage` across the error redirect; the password never does. |
| [WCAG 2.2, Accessible Authentication (3.3.8)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) | Do not require a cognitive test; allow paste and password managers. | No CAPTCHA, no composition rules, paste allowed, correct `autocomplete` tokens, show/hide button. |
| [GOV.UK, Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/) | Preserve answers; show field errors; validate on submit; server validation is authoritative. | Client validation runs on submit, shows per-field text, focuses the first invalid field, and leaves the server as the fallback. |
| [GOV.UK, Error message](https://design-system.service.gov.uk/components/error-message/) | Put the error next to the field; use clear, concise wording. | Inline field errors sit under the field; the hint and strength text are hidden while the error is active so the same sentence is not repeated. |
| [Baymard, Inline form validation](https://baymard.com/research-articles/inline-form-validation) | Inline validation works after the user leaves a field, not mid-typing. | Username format still validates on blur; required-field validation runs on submit; typing clears the error. |

### 5.2 Design decisions

| ID | Decision | Reason |
|---|---|---|
| AD-27 | Add client-side required validation on submit, with `novalidate` and the server as fallback. | Prevents a round trip for empty fields while preserving the no-JS path. |
| AD-28 | Give every required field a hidden `role="alert"` error paragraph; associate it with `aria-describedby`; set `aria-invalid`; focus the first invalid field in DOM order. | One consistent error model for login and signup; the field is always the source of the message. |
| AD-29 | Hide the username hint, password hint/strength block and timezone hint while the field error is visible; restore them on input or when the field becomes valid. | The first validation screenshots repeated the hint, the strength text and the error three times. Hiding the hint removes the duplication and shortens the error state. |
| AD-30 | On login, client validation checks only that the password is present, not its length; signup enforces the 8-character minimum. | A legacy account must not be locked out by a client rule the server did not impose at creation. |
| AD-31 | Keep the server alert for server errors; use inline field errors for client validation. Do not invent a full error list for a generic `invalid-input` response. | The server deliberately does not enumerate which credential was wrong; the client can be specific about empty fields without leaking server policy. |
| AD-32 | On tablet and phone, render the alert as a compact one-line title/message with a middle dot; at 390x844 and 980x800 the login action stays visible. | The error state was pushing the login submit below the fold on those two common frames. |
| AD-33 | Keep the decorative calendar object at `fetchpriority="low"`; the hero plate remains high priority. | The object is art, not content; the form and hero text should win the network. |
| AD-34 | Add a static-asset test for the three WebP files. | The page depends on local, self-made art; the route, content type, cache header and bytes are now covered by the suite. |

### 5.3 POC - what changed

- `src/web.ts`
  - All required fields now render a hidden `<p class="auth-field-error" role="alert">` with an id:
    `username-error`, `displayName-error`, `password-error`, `timezone-error`.
  - `aria-describedby` includes the field error for both modes; the server alert id is appended when the server marks
    the field.
  - Client validation reads the required fields in DOM order, shows the first error per field, focuses the first
    invalid field, and prevents the submit when anything is missing or invalid.
  - Input listeners clear the field error and `aria-invalid`; the hint and strength block return.
  - Signup checks username format and password length; login checks presence only.
  - The server alert remains untouched on a server error page; client validation is additive.
- `src/i18n.ts`
  - `auth.username.required`, `auth.displayName.required`, `auth.password.required`, `auth.timezone.required`.
  - Client keys: `authUsernameRequired`, `authDisplayNameRequired`, `authPasswordRequired`, `authTimezoneRequired`.
- `src/styles.ts`
  - Tablet (641-980) and phone (<=640) compact alert: title and message on one line with `·`; smaller padding;
    the alert no longer consumes 65-75 px on a phone.
  - Required error text uses `--auth-danger` (7.02:1 on the panel).
- `test/web.test.ts`
  - Error test checks the new field-error ids, the title prefix, the username link and the Chinese error title.
  - Auth shell test checks `novalidate`, the field-error elements and the static asset route.
  - The suite is now 562 tests.

### 5.4 Review - client validation and final matrix

**Client validation (headless Chrome, real submit event, navigation prevented to inspect state)**

| State | Errors shown | Focus | Submit / page | Result |
|---|---|---|---|---|
| Login empty, 1440x1000 | "Enter a username." + "Enter a password." | username | 752.3 / 1000 | Both errors visible; action visible. |
| Login empty, 390x844 | same two | username | 832.5 / 967 | Action visible. |
| Login empty, 320x700 | same two | username | 745.8 / 851 | Action 46 px below fold; accepted. |
| Login empty, 360x800 | same two | username | 815.4 / 950 | Action 15 px below fold; accepted. |
| Signup empty, 1440x1000 | username, display name, password | username | 877.8 / 1000 | All three errors; action visible. |
| Signup invalid, 1440x1000 | format + too-short | username | 866.6 / 1000 | Hint and strength hidden; no duplicate text. |
| Signup empty, 390x844 | three errors | username | 1124.6 / 1200 | Long form; first error visible. |
| Signup invalid, 390x844 | format + too-short | username | 1101.3 / 1177 | Chinese variant: 1152 px page; no overflow. |
| Signup empty, 1366x768 | three errors | username | 728.1 / 768 | Action visible. |
| Signup empty, 1024x768 | three errors | username | 705.6 / 768 | Action visible. |
| Login server error, 980x800 | server alert | username | 795.1 / 918 | Action visible after the compact alert. |
| Login server error, 768x1024 | server alert | username | 984.7 / 1135 | Action visible. |
| Login server error, 390x844 | server alert | banner/username | 836.7 / 972 | Action visible. |
| Signup server error, 1366x768 | server alert + link | username | 766.9 / 805 | Action visible. |

**Validation mechanics**

- Empty login submit stays on `/login` (no navigation), shows two field errors, sets `aria-invalid` on both fields,
  focuses username, and does not set `aria-busy`.
- After typing a username, its error and `aria-invalid` clear; the password error remains. The same holds for every
  field.
- A valid login/signup submit sets `aria-busy="true"`, `aria-disabled="true"`, the busy label and the spinner; the
  `pageshow` handler resets them.
- The hint and strength block are hidden only while the matching error is visible; typing restores them.
- Clicking the server alert's username link moves focus to `#username` (390: scrollY 418; 1440: scrollY 0).
- A programmatic autofill-like fill (values set without input events) submits busy with no errors, keeps the
  strength block hidden at score 0, and leaves the password hint visible.
- No-JS HTML still has `novalidate`, `required`, the error paragraphs and the same POST action. An empty no-JS login
  POST returns the server's generic invalid-credentials page.

**Final viewport matrix**

| Viewport | Login (submit) | Signup (submit) | Login error | Signup error |
|---|---|---|---|---|
| 1440x1000 | 1000 / 728 | 1000 / 865 | 1000 / 772 | 1000 / 909 |
| 1440x900 | 900 / 678 | 900 / 815 | 900 / 722 | 966 / 892 |
| 1366x768 | 768 / 557 | 768 / 717 | 768 / 589 | 805 / 767 |
| 1280x800 | 800 / 572 | 800 / 712 | 800 / 603 | 800 / 743 |
| 1024x768 | 768 / 554 | 768 / 695 | 768 / 585 | 768 / 726 |
| 980x800 | 871 / 748 | 1104 / 1040 | 918 / 795 | 1169 / 1105 |
| 768x1024 | 1088 / 938 | 1333 / 1242 | 1135 / 985 | 1398 / 1306 |
| 430x932 | 956 / 821 | 1214 / 1138 | 1007 / 872 | 1283 / 1207 |
| 390x844 | 921 / 786 | 1176 / 1100 | 972 / 837 | 1262 / 1187 |
| 360x800 | 903 / 769 | 1157 / 1081 | 954 / 820 | 1244 / 1168 |
| 320x700 | 804 / 699 | 1013 / 967 | 873 / 768 | 1100 / 1054 |

No viewport has horizontal overflow. All normal login and signup states fit 1440x1000, 1440x900, 1366x768,
1280x800 and 1024x768. The login action is visible in every tested frame except the 360/320 error states. Signup is
a long form on tablets and phones; the first field and the error are visible, the action requires a short scroll.
The 980/981 boundary was probed separately: at 981x800 all four states fit (login 570, signup 711, login error 601,
signup error 742); at 980x800 the sheet signup is the known long-form exception.

**Contrast and target audit**

- Placeholder 5.55:1; required error 7.02:1; error text/link 8.98:1; goal summary 17.77:1; disclosure border
  3.12:1; saved badge 5.12:1; app brand 5.11:1; input border 3.19:1; submit 5.78:1; focus ring 5.69:1.
- Mode-container border 1.42:1 and error-container border 1.43:1 are decorative: the state and error are identified
  by text, the active underline, the icon and the field border. This is documented rather than hidden.
- Targets: inputs 48 px (52 on login), 44 px on short desktop; submit 46-54; mode 40; language 30-32; reveal 44;
  goal summary 38-44; goal chip 32; skip 37; brand 32. The sub-24 targets are inline text links inside sentences
  (the error link and the footer "Create an account" / "Create a new account" / "Sign in" links); the WCAG 2.5.8
  inline exception applies. Every standalone control is at least 24x24.
- Bilingual: English and zh-HK client errors captured; no overflow at 390; title prefix localised; new strings exist
  in both catalogs.
- Final audit: one h1, one h2, one main, all labels present, unique ids, no nested interactive elements, no external
  URLs, no fake auth controls, current language has no `role="button"`, and all three images are local decorative
  WebP with empty alt.
- 562/562 tests pass; typecheck passes.

### 5.5 Findings

| ID | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| R4-01 | P2 | **Login client errors at 360x800 and 320x700 push submit below the fold** (815.4 and 745.8). | `r4-login-client-errors-390.png`; `r4-heights.txt` | Accepted: both errors and fields are visible; the user scrolls 15-46 px. A future compact form could recover it, but hiding the error would be worse. |
| R4-02 | P2 | **Signup client errors at 980x800, 390x844 and 320x700 still scroll.** | `r4-signup-client-errors-390.png`; matrix | Accepted: a four-field account form with an optional goal is inherently long on these frames; the first error is visible. |
| R4-03 | P2 | **Autofocus on the username has no `:focus-visible` outline on first load.** The ember border/glow is the visible cue. | Focus probe | Accepted; the field is visibly focused. A future option is to remove autofocus for keyboard users or add a programmatic-focus ring. |
| R4-04 | P2 | **Multiple `role="alert"` field errors can announce several messages at once.** | DOM/ARIA review | Accepted: focus moves to the first invalid field and each error is associated with its field; the alternative (one summary) is a larger change. |
| R4-05 | P3 | **The error link is a 17 px inline target at 1440.** | `r3-signup-error-link-1440.png` | Accepted under the WCAG 2.5.8 inline exception; at 390 it wraps to 36.5 px. |
| R4-06 | P3 | **No full error-summary list for a generic `invalid-input` server response.** | Error markup | Accepted: the server deliberately does not enumerate credential errors; client validation covers empty/invalid fields. |
| R4-07 | P3 | **Signup at 980x800 is 1104 px normal / 1169 px error.** | Matrix | Known limit: tablet-landscape signup is a long form; the action requires a scroll. |
| R4-08 | P3 | **Forced colors hides the hero art and calendar object.** | `r3-login-forced-colors-1440.png` | Intentional: high-contrast legibility outranks art. |
| R4-09 | P3 | **No password reset and no passkey.** The page offers only an honest owner-assisted disclosure. | Help disclosure | Product limit, not a page defect. A token reset or WebAuthn backend is future work; no fake control is shown. |

**Cycle 4 verdict:** the page is now a complete, honest, self-contained auth surface. The four required fields fit
the laptop frames that matter; the optional goal is a real progressive-disclosure pattern; the error, validation,
autofill, forced-colors, zoom, focus and bilingual states are tested. The remaining scrolls are on long mobile/tablet
forms or the 320 px error state, and they are documented rather than papered over.

## 6. Final state

### 6.1 Four-cycle summary

| Cycle | Research | Design / brainstorm | POC | Review outcome |
|---|---|---|---|---|
| 1 | Baseline audit + OWASP/NIST/NN/g/WCAG/GOV.UK; 12 guidance items, 14 findings | Three directions; chose *First Light* editorial split; original track plate + Blender calendar | Full auth shell, original art, show/hide, caps, strength, timezone, goal chips, errors, persistence, no-JS baseline | Direction validated; signup too tall on laptops; hidden-element bug and contrast fixed; cycle 2 brief written |
| 2 | Progressive disclosure, optional fields, above-the-fold attention, `aria-current` | Move optional goal behind a native disclosure; four required fields; short-viewport rhythm; one brand mark | Goal disclosure, saved badge, signup labels, laptop/tablet/phone rules, brand unification, language semantics | Signup fits 1366x768/1280x800/1024x768; login fits 980x800/320x700; mobile signup -136 px; 561 tests |
| 3 | GOV.UK validation/error summary, MDN autofill/forced-colors, WCAG reflow/focus | `novalidate`, error title, field link, autofill paper treatment, forced-colors system palette, focus rings | `novalidate`, title prefix, username error links, autofill CSS, forced-colors block, focus styles, live-strength guard | Forced colors, 200% zoom, text spacing and focus rings pass; error title/link verified; 562 tests |
| 4 | WCAG 3.3.1/3.3.3/3.3.7/3.3.8, GOV.UK error message, Baymard inline validation | Client required validation; per-field errors; hide duplicate hints/strength; compact mobile/tablet alert; final audit | Required validation, error paragraphs, `aria-invalid`/focus/clear, compact alert, asset priority, static-asset test | Normal frames fit; client errors clean; 390/980 login error action visible; 562 tests; final matrix and contrast recorded |

### 6.2 Files

- `src/web.ts` - auth shell, original art markup, timezone groups, error model, client enhancement/validation.
- `src/styles.ts` - scoped `.auth-page` design system, responsive rules, autofill, forced colors, focus states.
- `src/i18n.ts` - English and zh-HK auth copy; client-string map.
- `src/vendor/signin/auth-hero.webp` - ComfyUI Flux2 dawn-track plate.
- `src/vendor/signin/calendar-object.webp` - Blender Cycles calendar sculpture.
- `src/vendor/signin/paper-grain.webp` - deterministic Pillow noise tile.
- `test/web.test.ts` - auth shell, error association, `novalidate`, static assets, language semantics.
- `docs/analysis/19-signin-page-research.md` - source evidence and baseline audit.
- `docs/analysis/20-signin-page-design-loop.md` - this record.
- `docs/design/signin/` - baseline, r1/r2/r3/r4 captures, probes, matrices, contrast.

### 6.3 Verification

- `pnpm check` - lint, typecheck and 562 tests in 21 files: **pass**.
- Headless Chrome CDP at 1440x1000, 1440x900, 1366x768, 1280x800, 1024x768, 980x800, 768x1024, 430x932, 390x844,
  360x800, 320x700: **no horizontal overflow**.
- Forced colors, 200% zoom, 1.4.12 text spacing, keyboard focus, busy state, error title/link, client validation,
  no-JS HTML and asset routes: **verified**.
- Final evidence: `docs/design/signin/r1-*` … `r4-*`, `r4-final-matrix.json`, `r4-contrast.txt`.

### 6.4 Known limits and next work

- **No password reset.** The help disclosure is honest about owner-assisted recovery. A token reset needs backend
  work; no fake email flow is shown.
- **No passkey/WebAuthn.** FIDO guidance is future path only.
- **Signup on tablet landscape and phone still scrolls.** Four required fields plus an optional disclosure cannot
  fit a 320x700 or 980x800 frame without hiding required content; the first field/error is visible.
- **Login client errors at 360/320 scroll 15-46 px.** Accepted; the error and fields are visible.
- **Mode/error container borders are below 3:1.** The state/error is carried by text, underline, icon and field
  border; documented rather than colour-only.
- **Autofill needs a manual password-manager check** beyond the static CSS/probe.
- **The live deployment is not updated by this worktree.** The final answer should say so; the live README row
  remains historical.



