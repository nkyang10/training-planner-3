# POC3 analysis package -- adversarial review report

**Status:** complete. **Date:** 2026-11-18. **Reviewer role:** adversarial reviewer (independent of the five authors).
**Inputs:** `docs/analysis/01-user-workflow-map.md` .. `05-improvement-backlog.md` (all dated 2026-11-18), plus
`README.md`, `docs/POC3-CALENDAR.md`, `docs/COACH-STATES.md`, `docs/FEATURES-FOR-REVIEW.md`, `docs/TRAINING-LOG-PLAN.md`,
`docs/GARMIN-TRAINING-PROGRAMS.md`, ADR-0001..0003, and the working tree `src/` at HEAD `b87ed2f`.
**Deliverable:** this file only, plus surgical factual corrections to 04 (see section 4). No source, test, data, tool or
product doc was modified; no server was started or stopped; no SQLite file was touched.

## 0. Method, and what was checked vs not checked

**Checked by doing, not reading:**
1. 33 distinct `src/file:line` claims from 01/04/05 opened and read against the working tree (not just grepped for
   existence): 29 confirmed; 3 anchors wrong or overstated (2 wrong-line, plus 2 wrong claims carried by one anchor);
   1 misleading range. Absence claims re-derived by grep.
2. 10 distinct cited URLs from 03 opened with a fetcher (not accepted from the ledger): 8 returned substantive body
   text that supports the one-line claim, 2 resolved but returned an empty/JS-shell body (listed in F-17/F-18).
3. ID traceability recomputed mechanically: 43 N rows in 02 vs every N used in 04/05; G-01..G-28 and I-01..I-24
   definition counts; WF/CN/ST/SF/X/O/Q/C/NB families cross-counted per document.
4. Encoding audited byte-by-byte (UTF-8 validity, BOM, non-ASCII code points, lone surrogates, control bytes).
5. Cross-document consistency: 04 executive order vs 05 rank order vs 05 slices vs 03 opportunities; numeric counts;
   severity/effort claims re-read against the anchor they cite.
6. Coverage sweep against a fixed checklist (onboarding, notifications, account lifecycle, export/delete, safety,
   body image, accessibility, performance, privacy, i18n, offline, multi-user).

**Not checked (stated so the reader can discount):** no test run, no server start, no browser, no runtime observation of
animation, sync, model turns or Garmin payloads; `test/` not read line-by-line; 01 read in full only for sections 1-2 and
the anchor-bearing tables; 02 read for ledger/limitations/ranking, not all 43 need rows; 03 read for the matrix, the
executive findings, the ledger and sections 1.11/1.5; 58 of 68 03-ledger URLs and 46 of 46 02 sources not re-opened;
no git-history forensics on when each product doc changed; no competitor price checked beyond Athletica, Runna,
TrainingPeaks, COROS, Strava, Garmin (marketing pages only).

---

## 1. Verdict per document

| Doc | Verdict | Single biggest reason |
|---|---|---|
| 01 user workflow map | **revise** (format only; content is decision-grade) | Fails the ASCII-only rule outright: 1,091 non-ASCII bytes, including 34 CJK/mojibake characters and 2 lone surrogates -- the only document with actual character corruption, not just typography (F-01). |
| 02 runner needs research | **accept-with-corrections** | Sound, honest, well-ranked, but its 46-source ledger carries no resolvable URL (bare host paths), so no reader can re-verify a single citation (F-03). |
| 03 competitive benchmark | **revise** (format only; content is strong) | Fails ASCII-only with 2,067 non-ASCII bytes; the feature matrix's meaning lives in glyphs (U+25CF/U+25D0/U+25CB) that cannot be transliterated mechanically without losing yes/partial/no (F-02, F-16). |
| 04 gap analysis | **accept-with-corrections** | Two wrong-line anchors, two overstated accessibility claims, one false-positive doc mismatch (M2) and one cross-doc contradiction with 03 on Runna (F-04..F-10). |
| 05 improvement backlog | **accept-with-corrections** | I-18 is assigned to no slice, G-08 and G-18 have no item, and the "no new infrastructure above rank 15" claim is contradicted by its own reminder item (F-11..F-13). |

No document is rejected: every load-bearing claim I could reach is either confirmed or correctable in place. The package
is usable for a build decision after the 04 corrections below and an encoding repair on 01/03.

---

## 2. Findings register

Severity: **critical** = blocks the stated deliverable rule or would mislead a build decision; **major** = a claim a
reader would rely on is wrong, unsupported or unreachable; **minor** = precision, count or wording defect.

| ID | Doc | Location | Sev | Issue | Evidence | Disposition |
|---|---|---|---|---|---|---|
| F-01 | 01 | whole file | critical | Not ASCII. 1,091 bytes outside U+0020-U+007E: U+2014 x156, U+00B7 x134, U+2192 x41, U+2026 x23, U+00A7 x9, U+2264 x9, U+2190 x2, U+2265 x1, U+2713, U+25C8, U+00D7, plus CJK (U+66F4, U+66C6, U+65E5, U+672A, U+6709, U+6539, U+5DF2, U+65B0, U+5957, U+7528) and lone surrogates U+D83D/U+DCAC x2 | Byte census of the file as UTF-8 | Cannot be repaired mechanically without guessing the CJK; recommended, see 4.3 |
| F-02 | 03 | whole file | critical | Not ASCII. 2,067 bytes outside range: U+25CF x215, U+25D0 x124, U+25CB x54, U+2014 x82, U+2013 x57, U+2192 x54, superscripts U+00B9/00B2/00B3/2074..2079 x94, U+00A7 x9, U+25C7 x5, U+20AC x2, U+2264 x2, U+2026 x1 | Byte census | Recommended: map glyphs to yes/part/no and footnote digits to `^n`; needs author confirmation, see 4.3 |
| F-03 | 02 | section 3 ledger, S1-S55 | major | Zero resolvable URLs. All 46 retained sources are bare host paths (`reddit.com/r/Garmin/comments/1gci9f1/`), no scheme; the string "http" appears once in the whole 462-line file. A citation ledger that cannot be opened is not a ledger | Regex over 02 for `https?://` returns nothing; ledger rows read at L68-L73 | Recommended: add full URLs (author has them) -- not corrected here, I will not fabricate links |
| F-04 | 04 | section 1.1 row 22; G-10 row | major | Wrong-line anchor for the day page. `src/web.ts:2182-2185` is the day-menu click handler (`openSessionPeek`/`openDayMenu`), not a `<li>` list | Read `src/web.ts:2182-2187`; the training-log day render is `renderDay` at `:3446-3460`, which emits `<p>` rows | **Corrected** in 04 |
| F-05 | 04 | section 7 security paragraph | major | Wrong-line anchor for "error page leaks the raw exception". `src/web.ts:3330-3334` is the `?month=` validator (`/^\d{4}-\d{2}$/`) | Read `:3328-3334`; the raw exception reaches HTML at `:3891` and JSON detail at `:3312`; 05 QW-8 cites `:3330-3334` correctly as the validated sibling, which proves the mis-anchor | **Corrected** in 04 |
| F-06 | 04 | G-27 row; section 7 accessibility paragraph | major | "no `aria-modal`" is false, and "no labelled title at open" is contradicted by the cited line | `src/web.ts:1482` sets `aria-modal="true"` on the Garmin modal; `:2304` sets `aria-labelledby="activity-peek-title"` on the peek | **Corrected** in 04: claim narrowed to the peek |
| F-07 | 04 | section 1.1 row 14 and mismatch list M2 | major | False positive. The code supports the doc, not the mismatch. `/sync` and `/garmin/key` do not "skip `resolveSession`"; they call it with `syncOnStart=false` | `src/web.ts:2932-2935` (`!ownsSync`) -> `:2886-2901` (`startSession(userId, today, syncOnStart)`), so no session-start auto-sync; `docs/POC3-CALENDAR.md:789` is accurate | **Corrected** in 04: M2 withdrawn |
| F-08 | 04 | section 1.1 row 15 and M3 | minor | Overreach. The audit route is scoped by `user.userId`; there is no admin role, so "owner-only" reads as "only the data owner sees it", which is true | `src/web.ts:3063-3069` passes `user.userId` to every query | **Corrected** in 04: reworded, not a mismatch |
| F-09 | 04 | mismatch paragraph | minor | "all four product docs" for a list of five mismatches (M1-M5) spanning three docs | Text count vs M1-M5 list | **Corrected** in 04 |
| F-10 | 04 | G-18 competitive column | major | Cross-doc contradiction. 04 says "Garmin/Runna/NRC all fail app-versus-reality"; 03 says the opposite for Runna | 03 L398: "Runna gives post-run Workout Insights (AI feedback)"; 03 S28 row; fetched Runna support page confirms planned-vs-actual feedback | **Corrected** in 04 |
| F-11 | 05 | section 4 slices | major | I-18 is in no slice. Slice 1 = 8 items, slice 2 = 9, slice 3 = 6 = 23 of 24; I-18 appears in the table, the dependency graph and the Q mapping only | Enumerated slice contents at 05 L385/L397/L407 vs I-01..I-24 | Recommended: assign I-18 to slice 1 or 2 (owner call; I did not invent a placement) |
| F-12 | 05 | whole file | minor | G-08 and G-18 are defined in 04 and rated high/high, but no backlog item maps to either (zero occurrences in 05) | Regex count: `G-08` 0, `G-18` 0 in 05 | Recommended: add a mapping note or an item |
| F-13 | 05 | L57 | minor | "Nothing above rank 15 requires new infrastructure" is contradicted by I-10 at rank 11 (reminder, effort M). The PoC has no service worker, no push, no email; 05 L310 itself says "No email infrastructure in slice 2" | Absence greps: `serviceWorker` 0, `manifest` 0 in `src/`; 05 L310 | Recommended: reword the claim or add the delivery channel to slice 2's risk |
| F-14 | 04 vs 05 | 04 section 2 vs 05 section 2 | minor | Unexplained ordering reversal. 04 puts G-09 second; 05 ranks its item I-06 sixth. 05's rank 2 (I-03/G-05) is 04's fifth | 04 L59 vs 05 L35 and L31 | Recommended: state that 04 orders by impact x cost and 05 by score |
| F-15 | package | repo root | minor | Stale duplicate editions of 01/02/03 sit untracked at the repo root. Root 02 is 743 lines against 462 in `docs/analysis/`; root 03 differs by 111 bytes; root 01 is byte-identical | `git status` (`?? 01-...md`, `?? 02-...md`, `?? 03-...md`), line/byte counts | Recommended: delete the root copies (outside my write scope) |
| F-16 | 03 | feature matrix | minor | Matrix semantics depend on non-ASCII glyphs; superscript footnote markers are unreadable in plain text and will not survive an ASCII pass | U+25CF/U+25D0/U+25CB counts; U+00B9..U+2079 x94 | Recommended: ASCII legend (`Y`/`P`/`-`) plus `^n` markers |
| F-17 | 03 | S-ledger, Garmin Coach source | minor | Cited Garmin Coach overview URL resolves but returns navigation only; the marketing claim it supports cannot be confirmed by a plain fetch | Fetch of `garmin.com/en-US/garmin-coach/overview/`: HTTP 200, nav shell, no plan body | Recommended: mark as JS-shell and cite a support article instead |
| F-18 | 03 | S-ledger, Final Surge pricing | minor | Cited pricing URL resolves but returns an empty body; the price claim is unverified from the cited source | Fetch of `finalsurge.com/pricing`: HTTP 200, title only, content truncated/empty | Recommended: replace with a source that renders, or mark the price as snippet-only |
| F-19 | 02 | section 3 heading | minor | "S1-S55, 9 ids dropped" is disclosed, but the id range still reads as if 55 sources are live; the ranking in section 10 does not restate the retained count next to each need | 02 L62 heading vs L16 "46 retained sources" | Recommended: retitle the section "46 retained of S1-S55" |
| F-20 | 04 | section 1.1 row 19 | minor | Row 19 says the trend-truncation claim was "not re-derived; accepted from 01", but it is directly checkable and true | `src/web.ts:1184-1189`: `.slice(0, 12)` | Recommended: promote to confirmed (the package understates its own verification) |
| F-21 | 03 | whole file | minor | One literal `??` pair remains in the file; every other document has none. Not isolated to a line, so it may be a lost character rather than a placeholder | `??` count = 1 in 03, 0 in 01/02/04/05 | Recommended: locate and repair during the ASCII pass |
| F-22 | package | coverage | major | No performance numbers anywhere: no page weight, no script size, no render time, yet G-11/G-25 and slice 2/3 make performance and "render no longer blocks" claims. The inline client script alone sits in a 3,903-line `src/web.ts` | No byte/time figure in 01-05; `src/web.ts` line count from the tree | Recommended: add a one-page measurement appendix (curl size, TTFB, Garmin stall) before claiming the fix works |

**Code anchors that failed, in full (all others confirmed).** Confirmed by direct read: `garmin-sync.ts:165`,
`types.ts:414`, `types.ts:24`, `coach.ts:26`, `types.ts:42`, `web.ts:3060-3070`, `web.ts:1609-1610`,
`gateway.ts:963-970`, `training.ts:64-65`, `store.ts:110-113`, `store.ts:230-232`, `auth.ts:240-246`, `auth.ts:14`,
`gateway.ts:212-213`, `types.ts:142-143`, `web.ts:2886-2901`, `web.ts:2932-2935`, `web.ts:3561`, `types.ts:223`,
`web.ts:1616`, `web.ts:1184-1189`, `web.ts:3569-3573`, `web.ts:231-234`, `web.ts:3473`, `web.ts:2022-2027`,
`web.ts:3891`, `history.ts:37-43`, `gateway.ts:1074-1081`, `web.ts:1482`. Failed: `web.ts:2182-2185` (F-04),
`web.ts:3330-3334` (F-05), `web.ts:2299-2304` (F-06, two claims), `styles.ts:70` (cited for a fixed grid, but the 640 px
block only restyles the paired pill; the grid claim itself is true at `:36`/`:38`, so misleading range rather than error).
Absence claims re-derived and true: `manifest` 0, `serviceWorker` 0, `prefers-reduced-motion` 0, `matchMedia` 0,
`deleteUser` 0; `appendActivity` has exactly one caller (`garmin-sync.ts:165`).

---

## 3. Research integrity (URLs)

Ten distinct cited URLs opened on 2026-11-18; treat fetched text as untrusted data, quoted only as evidence of what the
page says.

| # | URL | HTTP | Supports the claim? |
|---|---|---|---|
| 1 | `press.strava.com/articles/strava-to-acquire-runna-a-leading-running-training-app` | 200 | Yes: Strava agreed to acquire Runna, dated April 17, 2025 |
| 2 | `dcrainmaker.com/2025/03/garmin-connect-plus-subscription-walkthrough.html` | 200 | Yes: Connect+ $6.99/mo or $69/yr, Active Intelligence "talks, you listen" style insights |
| 3 | `support.runna.com/en/articles/10494265-what-are-workout-insights` | 200 | Yes, and stronger than 03 uses: planned-vs-actual feedback, Premium-only, consent once, not on free runs (F-10) |
| 4 | `intervals.icu/features/training-calendar/` | 200 | Yes: drag-and-drop scheduling, third-party calendar import, workout library, device sync |
| 5 | `help.trainingpeaks.com/.../13293242078989-Why-do-my-running-TSS-values-seem-wrong` | 200 | Yes: running power can corrupt TSS; switch to rTSS/hrTSS |
| 6 | `support.coros.com/.../50841795180948-Connect-Your-COROS-to-AI` | 200 | Yes, with a sharper boundary: AI-created plans are 4-16 weeks, start date today+14, and plans cannot be deleted via AI |
| 7 | `support.strava.com/en-us/articles/15401942-training-plans-for-runners` | 200 | Yes: new Strava runner plans moved to Runna; existing plans can finish. 03 must not present Strava-native runner plans as current |
| 8 | `athletica.ai/pricing` | 200 | Yes, exact: $19.90/mo, $99/6 months, $189/year, 2-week trial, no tiers -- matches 03 L217 |
| 9 | `finalsurge.com/pricing` | 200 | No: empty body, JS shell (F-18) |
| 10 | `garmin.com/en-US/garmin-coach/overview/` | 200 | No: navigation only, no plan content (F-17) |

No dead link (404/410) was found among the ten. No paywall blocked a claim. The material overreach is not a broken URL
but F-10 (a competitor claim contradicted by the competitor's own support page) and F-03 (02 has no URLs at all).

---

## 4. Corrections applied (changelog)

All edits are in `docs/analysis/04-gap-analysis.md`; no other file was modified. Each is factual or citation-only.

1. **Section 1.1, row 14.** Before: "`/sync` and `/garmin/key` skip `resolveSession` ... **mismatch (WF-12)**".
   After: "pass `syncOnStart=false` to `resolveSession` (`src/web.ts:2932-2935` -> `:2886-2901`), so `startSession`
   does not auto-sync ... confirmed (M2 withdrawn)". Why: F-07, code supports the doc.
2. **Section 1.1, row 15.** Before: "any signed-in user sees its own rows ... **wording overstates access control**".
   After: "route is scoped by `user.userId` ... there is no admin role ... confirmed (M3 reworded)". Why: F-08.
3. **Section 1.1, row 22.** Before: "day page lists `<li>` `:2182-2185`". After: "day page renders plain `<p>` rows
   `:3446-3460` (the old `:2182-2185` anchor was the day-menu click handler)". Why: F-04.
4. **Mismatch paragraph (M1-M5).** Before: "all four product docs". After: "three of the five (M1, M4, M5) are real doc
   defects across three product docs; M2 is withdrawn and M3 is reworded, both after review (see 06 F-07/F-08)".
   Why: F-07, F-08, F-09.
5. **G-18 competitive column.** Before: "Garmin/Runna/NRC all fail 'app versus reality' per 02 section 8". After:
   "Runna's Workout Insights already compares planned with actual post-run (03 section 1.5, S28), so the gap is the
   missing judgement on POC3's own review surface, not competitor absence". Why: F-10.
6. **G-27 row.** Before: "... buttons nested inside links, no `aria-modal`". After: "... no `aria-modal` on the peek
   (the Garmin modal at `src/web.ts:1482` does set it)". Why: F-06.
7. **Section 7 accessibility paragraph.** Before: "no `aria-modal`, no focus trap and no labelled title at open".
   After: "no `aria-modal` and no focus trap, and its `aria-labelledby` target does exist". Why: F-06.
8. **Section 7 security paragraph.** Before: "raw exception (`src/web.ts:3330-3334`)". After: "raw exception
   (`src/web.ts:3891`, JSON detail at `:3312`; the old `:3330-3334` anchor was the `?month=` validator)". Why: F-05.

**Not corrected (recommended only, with reasons):** F-01/F-02 encoding repair on 01 and 03 -- 1,091 and 2,067 byte
substitutions would be a mechanical rewrite of two documents, and the CJK runs in 01 are unrecoverable without guessing,
so a safe fix needs the author. F-03 02 URLs -- I will not synthesise links. F-11 I-18 slice placement, F-12 G-08/G-18
mapping, F-13 infrastructure wording, F-14 ordering note, F-15 root duplicates (outside the allowed write scope),
F-17/F-18/F-21 03 ledger and glyph work, F-22 performance appendix -- all are content decisions or need data I do not have.

---

## 5. Remaining risks and open questions

1. **The package cannot answer "how bad is it on a phone?"** No measurement exists. G-11 asserts a seven-column grid at
   360 px from CSS; nobody loaded the page at 360 px. A single headless-Chrome pass at 360/390/768 px would settle it.
2. **The package cannot answer "does the model actually drop the goal?"** The claim rests on reading `facts` in
   `src/coach.ts:265-302`; no prompt was captured. One logged turn with a goal set would settle it (read-only).
3. **Garmin behaviour is contract-only.** README:334-340 and `docs/GARMIN-TRAINING-PROGRAMS.md:61-64` admit the DTO is
   partly undocumented; every Garmin claim in 01/04 is mapper-contract, not observed payload.
4. **02 cannot be audited by a third party** until URLs exist. Its top-15 ranking is therefore the least re-checkable
   part of the package, even though it drives most N ids.
5. **Runtime unknowns that change gap severity:** whether the peek really loses focus on open, whether the animation
   blocks the main thread, whether `/sync` can stall past the platform timeout (no server timeout for Garmin calls).
6. **Product-doc drift is only partly mapped.** M1/M4/M5 are real; M2 is withdrawn; M3 is wording. No one has swept
   `docs/POC3-CALENDAR.md` (1,049 lines) for other claims of the same class.
7. **Open question for the owner:** is `docs/COACH-STATES.md:265` + `README.md:133` + `POC3-CALENDAR.md:844` all saying
   "owner-only" a deliberate product term? If yes, define it once; if not, replace it with "per-runner, unlinked".

---

## 6. Confidence statement

**Trust without re-checking:** the code-anchor layer of 04 (27/33 confirmed, failures now corrected), the absence claims
(`manifest`, `serviceWorker`, `prefers-reduced-motion`, `matchMedia`, `deleteUser`, single `appendActivity` caller), the
ID traceability result (every N used in 04/05 exists in 02; G-01..G-28 and I-01..I-24 each defined once; every WF/CN/ST/
SF/X/O/Q id referenced exists), and 03's pricing rows for Athletica and TrainingPeaks, which I re-fetched and matched
exactly.

**Re-check before a build decision:** anything about Garmin payload shape or sync timing; the claim that Runna/NRC "fail
app-versus-reality" (now corrected in 04 but still repeated in 02 section 8 -- I did not edit 02); the 360 px mobile
claim; the reminder item's feasibility; and every 02 need whose only support is a snippet-only source, since 02's ledger
cannot be opened.

**Do not trust:** 01's and 03's current byte content as deliverables (both fail ASCII-only), the "all four product docs"
count (fixed), and any statement that POC3's audit page is access-controlled by role (it is per-user scoped, no roles).

---

## 7. What the package gets right (decision-grade)

- **The evidence discipline is real.** 01's legend (`[inference]`, `[drift]`, confidence scale), 02's verification
  letters (F/P/B/S) and 03's V/R ledger columns are unusually honest; 02 explicitly refuses to invent demographics or
  quotes and discloses its one-coder limitation.
- **The core diagnosis is correct and well-evidenced.** Coach-only writes (G-09, one `appendActivity` caller, 502 path),
  the goal that never reaches the prompt (G-01, `types.ts:24` vs `coach.ts:265-302`), the missing manual log (G-02), and
  invisible trust machinery (G-05/G-06) are all confirmed at the line level and are the right top of the backlog.
- **The traceability web is sound.** N -> G -> I -> WF/CN mappings close, ids are unique, and the protect list
  (ST-01..ST-12) is genuinely defensible -- timezone-correct "today" and no body/weight fields are real advantages.
- **05 is the strongest document for a builder.** Testable exit criteria per slice, explicit "no new infrastructure"
  framing for slice 1, a rejected list, a dependency graph and a validation plan. Its quick wins are correctly anchored
  (QW-2's header anchor and QW-8's `?month=` sibling are both right).
- **04's non-functional sweep is broader than most audits:** security, i18n, accessibility, offline, error handling,
  non-goals and clinical non-goals are all present; nothing in the checklist I applied was silently absent.

**Bottom line:** accept 02 and 05 as-is after the small fixes; accept 04 with the eight corrections above (applied);
send 01 and 03 back for an encoding-only repair, with no content rewrite needed.

---

## 8. Root disposition (post-review)

The root reviewed the findings above and applied the following. This section is the root's record, not the reviewer's
verdict.

| Finding | Disposition |
|---|---|
| F-01 (01 encoding) | No content repair. 01 is valid UTF-8; the non-ASCII bytes are intentional typography, quoted zh-Hant UI strings and arrows. A strict UTF-8 decode found no invalid sequence, no replacement character and no mojibake. Kept as UTF-8 and documented in the package README. |
| F-02 (03 encoding) | No content repair. The matrix glyphs are the documented legend (yes / partial / no) in 03 section 2.1. Kept as UTF-8 and documented. |
| F-03 (02 URLs) | Fixed: 43 ledger URLs now carry `https://`; 3 long paths stay abbreviated and are marked `F*`. Two repaired URLs were fetched and support their claims (PMC10915606, Runners Connect easy-pace). |
| F-04, F-05, F-06 | Corrected by the reviewer in 04. |
| F-07 | M2 withdrawn by the reviewer; 00 and README now list four drifts, not five. |
| F-08 | M3 reworded to "per-runner, not role-gated"; 00 updated. |
| F-09 | 04 corrected by the reviewer; 00/README counts aligned. |
| F-10 | 04 corrected by the reviewer; 02's top-15 row reworded to acknowledge Runna Workout Insights. |
| F-11 | I-18 assigned to slice 1; an exit criterion was added. |
| F-12 | Mapping note added in 05 section 9 for G-08 and G-18. |
| F-13 | The rank-15 claim was reworded; I-09 and I-10 are named as the infrastructure exceptions. |
| F-14 | Ordering note added after the backlog table. |
| F-15 | Deleted the stale root copies of 01, 02, 03 and POC3-CALENDAR.md after hash and path checks. |
| F-16 | Kept the glyph legend; documented in 03 section 2.1 and the package README. |
| F-17, F-18 | Fetch-limitation note added to 03's ledger intro; S21 and S30 reliability cells already mark them marketing or snippet-only. |
| F-19 | 02 heading retitled "46 retained, 9 ids dropped"; resolvability note added. |
| F-20 | 04 row 19 promoted to confirmed with `.slice(0, 12)`. |
| F-21 | Both literal `??` occurrences in 03 repaired. |
| F-22 | Measurement gap recorded in 04 section 7; no runtime measurement was performed in this pass. Performance claims remain static-analysis only. |

**Result:** 00-05 are decision-usable with the caveats above; 06 remains the audit trail. No product code, test, data or
product doc was changed.
