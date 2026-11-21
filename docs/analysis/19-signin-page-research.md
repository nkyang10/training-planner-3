# Milebook - sign-in and sign-up experience research

**Status:** cycle 1 research complete; feeds the four-cycle auth design loop in
[20-signin-page-design-loop.md](20-signin-page-design-loop.md). **Date:** 2026-11-22.
**Scope:** the signed-out entry to Milebook - `/login` and `/signup` - as a visual, interaction and trust surface. The
account engine, session cookie, rate limiting and Garmin key storage are out of scope except where the page must describe
them honestly.
**Lens:** a senior product designer's pass, grounded in authentication security guidance, accessibility standards,
mobile-form research and a measured audit of the current pages. The page is judged on what a runner must do, what they
can see, what they can recover from, and whether the product feels worth trusting with a private training history.

## 1. Why this page carries more weight than its size

The auth page is the product's first real screen. It is also the only screen every runner must pass through, on every
device, often while standing outside or between sessions. In the current build it is a 460 px card with five fields and
no product story. That is a strategic mismatch: Milebook's differentiator is a private calendar and a coach that edits it
in front of you, but the entry screen shows neither the calendar nor the coach.

Three forces make the page a design problem rather than a form-styling problem:

1. **Trust.** A private training log, a Garmin key and an AI coach are high-trust objects. The page has to look like it
   takes that seriously before it asks for a password.
2. **Friction.** Sign-up currently asks for a username, display name, password, a free-text IANA timezone and a goal.
   The timezone field is an impossible question for most runners (UX-09 in the earlier design review) and the page gives
   no guidance on the username or password.
3. **Recovery.** Login has no password visibility control, no caps-lock warning, no recovery path and no in-flight state.
   A runner who mistypes a password has no way to check it; a runner who forgets one has no path at all.

The page does not need more decoration. It needs a clear point of view, a shorter path to the first session, and a
visible safety net.

## 2. Method and evidence

This is desk research plus a measured audit, not a usability test with runners.

- **Desk research:** authentication guidance from OWASP and NIST, accessibility success criteria from W3C, mobile form
  research from NN/g, and the GOV.UK password pattern. Sources and the takeaway used from each are in section 3.
- **Current-state audit:** a scratch Milebook instance on ports 18091/18090, captured in headless Chrome through CDP at
  1440x1000 and 390x844 (device scale 2), with DOM geometry, computed styles, focus order and WCAG contrast measured.
  Evidence: `docs/design/signin/baseline-login-1440.png`, `baseline-signup-1440.png`, `baseline-login-390.png`.
- **What is not evidence:** no runner interviews, no moderated task tests, no screen-reader session, no live password
  manager test. Those are listed as open validation work in section 7. Any claim about "most runners" below is a
  hypothesis to test, not a finding.

The scratch instance used a fresh SQLite file and the default locale resolution. Chrome's `Accept-Language` resolved to
`zh-HK`, so the baseline captures are the Traditional Chinese page. That is useful: it exposes the bilingual layout
rather than hiding it behind English.

## 3. What the guidance actually says

| ID | Source | Takeaway used in this design |
|---|---|---|
| SR-01 | [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) | Use generic login errors; allow all characters including spaces and Unicode; do not impose composition rules; permit at least 64-character passwords; offer a strength meter and blocklist; provide a secure recovery mechanism; protect the login transport and throttle attempts. |
| SR-02 | [NIST SP 800-63B - Strength of Passwords](https://pages.nist.gov/800-63-4/sp800-63b/passwords/) | Length is the primary strength factor. Composition rules produce predictable `Password1!` patterns and should not be imposed. Encourage long passphrases and screen against common passwords instead of adding arbitrary rules. |
| SR-03 | [W3C WCAG 2.2 - SC 3.3.8 Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) | Do not require a cognitive function test. Support password managers, allow paste, and offer a show-password control. A login form with proper `autocomplete` and accessible names is the baseline; blocking paste fails the criterion. |
| SR-04 | [W3C WCAG 2.2 - SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Pointer targets must be at least 24x24 CSS px, or have enough spacing. Important controls should aim higher; 44-48 px is the touch-friendly target the product already uses for its coach launcher. |
| SR-05 | [W3C WCAG 2.2 - SC 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) | When input is rejected, identify the item and describe the error in text. Native browser validation alone is not enough for a considered experience; errors should be visible, specific and associated with the field. |
| SR-06 | [NN/g - A Checklist for Registration and Login Forms on Mobile](https://www.nngroup.com/articles/checklist-registration-login/) | Ask only for the minimum information; explain the benefit of registering; make the password visible; disclose constraints upfront; show a strength meter; do not repeat fields; include a forgot-password path. |
| SR-07 | [NN/g - Password Creation: 3 Ways To Make It Easier](https://www.nngroup.com/articles/password-creation/) | Show the rules before typing, let people see what they typed, and use a strength meter. Requirements hidden until submission are the core frustration. |
| SR-08 | [GOV.UK Design System - Password input](https://design-system.service.gov.uk/components/password-input/) | Hide by default with a Show control; do not add a confirm-password field; set `autocomplete` correctly; allow paste; do not use `maxlength` to truncate; disable spellcheck and autocapitalisation; do not reveal whether username or password was wrong. |
| SR-09 | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) | A recovery path is part of authentication, not a nice-to-have. It must be generic, token-based, time-limited and resistant to enumeration. The current PoC has no reset flow, so the page must not pretend it does. |
| SR-10 | [FIDO Alliance - UX Guidelines for Passkey Creation and Sign-ins](https://fidoalliance.org/wp-content/uploads/2023/05/FIDO-Alliance-UX-Guidelines-for-Passkey-Creation-and-Sign-ins.pdf) | Passkeys are the strongest low-friction path, but they require backend support and careful naming. They are a future path here, not a control to fake on a page that cannot authenticate with them. |
| SR-11 | [W3C - Making Content Usable for People with Cognitive and Learning Disabilities, 4.7.1](https://www.w3.org/TR/coga-usable/#provide-a-login-that-does-not-rely-on-memory-or-other-cognitive-skills-pattern) | Provide a login that does not rely on memory or other cognitive skills. Password managers, paste and visibility are the practical mechanisms available to this PoC. |
| SR-12 | [WCAG 2.2 - SC 3.3.7 Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html) | Do not make people re-enter information the service already has. On this page that means preserving non-secret fields after a server error and not asking for the same thing twice. |

Two tensions are worth naming:

- **Security wants less information in errors; usability wants more.** The resolution is a generic login error that still
  tells the runner what to do ("Check your username and password, then try again") and field-level guidance on sign-up
  where the information is not secret.
- **A strength meter can imply a guarantee it cannot make.** The meter will be a transparent length-and-variety hint,
  not a claim of crack-time. The copy will say "longer is stronger", not "this password is secure".

## 4. Current-state audit

### 4.1 Measured geometry

| Measurement | `/login` 1440x1000 | `/signup` 1440x1000 | `/login` 390x844 |
|---|---|---|---|
| Document height | 1000 px | **1052 px** (52 px scroll) | 844 px |
| Card | 460 x 424.9 px at y=154 | 460 x 682.9 px at y=154 | 370 x 424.9 px at y=125.5 |
| H1 | 32 px / 700 | 32 px / 700 | 32 px / 700 |
| Input | 418 x 47 px | 418 x 47 px | 328 x 47 px |
| Submit | 418 x 45 px | 418 x 45 px | 328 x 45 px |
| App bar | 50 px | 50 px | 42 px |
| Footer | 55 px | 55 px | 81 px |
| Horizontal overflow | none | none | none |
| Empty vertical space around the card | ~470 px | ~315 px | ~294 px |

The login card occupies 42% of the viewport height and 32% of its width. At 1440x1000 it leaves roughly 154 px above,
366 px below and 490 px on each side of empty paper. The signup page is 52 px taller than the viewport at 1440x1000
before the language switcher wraps.

### 4.2 Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| AU-01 | P1 | **The page has no product story.** The first screen shows a card, a heading and two fields. Nothing says "private calendar", "coach that edits it" or "Garmin-aware"; the only brand signal is a lightning-bolt wordmark in the app bar. | Baseline captures; body copy is one muted sentence. |
| AU-02 | P1 | **The anonymous app bar duplicates the auth task.** `/login` renders `Sign in` and `Sign up` links in the top-right before the form, then repeats `Create an account` / `Sign in` under it. The first three tab stops are brand, Sign in, Sign up - not the form. | Focusable order from CDP audit. |
| AU-03 | P1 | **Signup asks for an IANA timezone string.** `value="Asia/Hong_Kong"` is a free-text input; a Taipei runner must know and type `Asia/Taipei`. The value steers today, the calendar ring and same-day plan matching, so the cost of getting it wrong is not cosmetic. | `src/web.ts` signup markup; UX-09. |
| AU-04 | P1 | **No password visibility control.** Both auth pages use a bare `type="password"` input. The Garmin key form in the same product already has a Show/Hide control, so the same control behaves differently in the same product. | Baseline markup; UX-25. |
| AU-05 | P1 | **No recovery path.** There is no "Forgot password?" link, no help text, and no reset route. A locked-out runner has no next step. | Route table; UX-25 / I-14. |
| AU-06 | P1 | **Errors are a bare red paragraph with no field association.** `errorBanner()` renders `<p class="error" role="alert">`; no icon, no field `aria-invalid`, no `aria-describedby`, no focus move, and the redirect loses every entered value. | `src/web-html.ts:13-15`; `authErrorText`; baseline. |
| AU-07 | P1 | **No password guidance or strength feedback.** The form says only "Password"; the 8-character minimum is hidden in the `minlength` attribute. NN/g and OWASP both call for rules upfront and a meter. | Markup; SR-01, SR-06, SR-07. |
| AU-08 | P1 | **Input boundaries fail non-text contrast.** Border `#f0dccb` on paper `#fff8f0` measures **1.26:1**; input fill `#fff1e4` on paper is **1.05:1**. WCAG 1.4.11 asks for 3:1 for the visual boundary needed to identify a control. | Computed WCAG ratios. |
| AU-09 | P2 | **No in-flight state or double-submit guard.** The submit button stays active; on a slow connection a second Enter can send a second POST. | Markup has no JS on auth pages. |
| AU-10 | P2 | **No autofocus or deliberate first focus.** On load the first tab stop is the brand link; the username field is four stops later. On mobile an autofocus would open the keyboard, so the behavior needs to be conditional. | Focusable order. |
| AU-11 | P2 | **The signup page overflows a 1000 px desktop viewport** (1052 px) and loses the language switcher below the fold. At 390x844 the login page fits, but signup will not. | Measured document heights. |
| AU-12 | P2 | **The page is visually anonymous.** Warm palette, 20 px radius and shadow are consistent with the app, but there is no typographic hierarchy, no art direction, no 3D or photographic asset and no moment of craft. It reads as a placeholder next to the calendar and muscle pages. | Baseline captures. |
| AU-13 | P3 | **The language switcher is 12 px text at the very bottom.** On the page where a bilingual runner forms their first impression, the switch is the least prominent control. | Footer markup; baseline mobile footer 81 px. |
| AU-14 | P3 | **The app bar's brand is a lightning emoji + wordmark.** It renders differently per platform and is the only brand mark on the page. A custom mark would be more crafted. | UX-19; baseline. |

### 4.3 What already works and must be protected

- The forms are plain HTML POSTs to same-origin actions and work without JavaScript. Any enhancement must keep that
  baseline.
- `autocomplete="username"`, `autocomplete="current-password"` and `autocomplete="new-password"` are already correct on
  the three credential fields. Do not break password-manager autofill (SR-03).
- The submit button already uses `--ember-deep` + white, measured at **5.08:1**; this is the one primary CTA in the
  product that passes AA at its actual size. Keep it.
- Muted copy `#7a6455` on paper measures **5.27:1** and passes. The warm palette is calm and distinctive; do not replace
  it with generic slate.
- The same-origin POST guard and signed session cookie are backend behavior; the page must not add client-side auth
  logic that implies more security than exists.

## 5. Design principles for the rebuild

| ID | Principle | What it means in pixels and copy |
|---|---|---|
| AP-1 | **Show the product before asking for data.** | The left half (desktop) or top band (mobile) carries the calendar/coach story and one original visual. The form is the right half / lower sheet, not the whole page. |
| AP-2 | **One job, two modes, no maze.** | Sign in and Create account are a visible two-state switch. The current mode is a page, not a modal; switching keeps the URL and the back button honest. |
| AP-3 | **Calm confidence, not hype.** | Warm paper, espresso ink, ember accent, a serif display face, generous space. No gradient mesh, no glassmorphism, no fake testimonials, no "revolutionary" copy. |
| AP-4 | **Make the safe path visible.** | Password rules before typing, Show/Hide, Caps Lock warning, a strength hint, an honest recovery disclosure, and an error that says what to do next. |
| AP-5 | **Respect the runner's context.** | 44-48 px controls on touch, 16 px inputs to avoid iOS zoom, no horizontal overflow at 320 px, reduced motion honoured, no autofocus that summons a keyboard on a phone. |
| AP-6 | **Bilingual by construction.** | Every new string exists in English and Traditional Chinese (Hong Kong). The display face must have a CJK serif fallback, and the Chinese layout must be captured, not assumed. |
| AP-7 | **No fake auth methods.** | No Google/Apple/passkey buttons that cannot work. Recovery copy tells the truth about a local PoC account. A future passkey path is documented, not simulated. |
| AP-8 | **Progressive enhancement.** | The page is complete without JavaScript: both forms post, the mode switch is two links, the language switch is a GET. JS adds visibility, strength, restore and in-flight feedback on top. |

## 6. Opportunity map

| Opportunity | User value | Effort | Cycle |
|---|---|---|---|
| Editorial split layout with an original calendar/route artwork | Makes the first impression specific to Milebook; gives the form a calm, premium frame | M | 1 |
| Shared auth shell for login and signup with a two-state switch | Removes the duplicate app-bar links; makes the relationship between the two pages obvious | S | 1 |
| Password Show/Hide + Caps Lock + strength hint | Fewer typos, fewer failed attempts, more confidence | S | 1-2 |
| Timezone select with detected default | Removes an impossible question and a class of wrong-today bugs | M | 1 |
| Inline error treatment and field preservation | Lets a runner recover without retyping; makes the failure feel handled | M | 2 |
| Honest recovery disclosure | Gives a locked-out runner a next step without faking a reset flow | S | 2 |
| Mobile sheet composition with a compact art band | Keeps the brand moment without pushing the form below the fold | M | 2 |
| No-JS and keyboard polish | Makes the page usable with password managers, keyboards and assistive tech | S | 3 |
| Motion and loading craft | Makes a slow connection feel alive instead of broken | S | 3 |
| Final contrast, target-size and bilingual pass | Removes the remaining measurable failures | S | 4 |

## 7. Open validation work

These are deliberately not claimed as done:

1. **Moderated task test** with 5-8 runners: create an account, sign in, recover from a wrong password, switch language.
   Measure time, errors, and whether the timezone default is noticed or trusted.
2. **Screen-reader pass** (NVDA on Windows, VoiceOver on iOS) over the error, show/hide, caps-lock and strength live
   regions.
3. **Password-manager pass** with 1Password/Bitwarden and Chrome's built-in manager: autofill, save, update, paste.
4. **Real-device mobile pass** at 320, 360, 390 and 430 px, including iOS keyboard and safe-area behavior.
5. **Recovery decision:** the PoC has no reset flow. The page can be honest about that, but the product decision is to
   add a token-based reset or an owner-assisted reset path. This document does not pretend the page solves it.
6. **Passkey decision:** FIDO guidance is cited as the future path; no WebAuthn backend exists, so no passkey control
   ships in this loop.

## 8. What "professional" means here

Professional is not a dark-blue gradient and a stock photo of a laptop. For this product it means:

- the page knows what product it belongs to;
- the form asks the fewest questions it can and explains the ones it must ask;
- the safe path is visible before it is needed;
- the layout survives a 320 px phone, a keyboard, a password manager and a Chinese locale;
- the visual system is consistent with the calendar and muscle pages, not a separate theme;
- every claim on the page is true of the PoC.

That is the bar the four cycles in [20-signin-page-design-loop.md](20-signin-page-design-loop.md) are measured against.
