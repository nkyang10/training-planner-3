# Muscle domain
**Status:** current · **Owner:** muscle tab / body-record domain · **Updated:** 2026-11-22 · **Supersedes:** docs/MUSCLE-TAB.md, docs/analysis/25-muscle-suggestion-ux-plan.md

Milebook's body record: a private per-muscle check-in the runner owns, a deterministic reading of it, a status period that fades with time, drills matched to the tags, and coach suggestions the runner confirms with one tap. The Muscle tab, the activity detail's worked card, the calendar chip, the app-bar badge and the coach prompt all read the same pure functions in `src/muscles.ts`, `src/muscle-status.ts` and `src/muscle-proposals.ts`. Nothing here diagnoses, and nothing writes a body record except the runner's own save or confirm. Citations name the owning symbol, not a line: this domain is edited often and line numbers rot.

## 1. Catalog

`MUSCLE_CATALOG` is the source of truth: 20 readonly entries in display order (shoulders and arms, torso, hips, legs), each carrying `id`, `name`, `group`, `view`, `function`, `issues`, `meaning`, `recovery` and exactly three drills `(src/muscles.ts · MUSCLE_CATALOG)`. `MUSCLES_BY_ID` indexes the catalog once at module load `(src/muscles.ts · MUSCLES_BY_ID)`; `isMuscleId` guards every id that arrives from a form, a URL, a directive or the model `(src/muscles.ts · isMuscleId)`; `getMuscle` returns a definition `(src/muscles.ts · getMuscle)`; `muscleShortName` drops the parenthetical qualifier for chips, history rows and prompt lines `(src/muscles.ts · muscleShortName)`. Group headings come from `MUSCLE_GROUP_LABELS` `(src/muscles.ts · MUSCLE_GROUP_LABELS)`.

| Group | Muscles | Ids |
|---|---|---|
| shoulders | 4 | neck, delts, rotator-cuff, traps |
| arms | 3 | biceps, triceps, forearms |
| torso | 5 | chest, lats, abs, obliques, lower-back |
| hips | 4 | glutes, hip-flexors, adductors, abductors |
| legs | 4 | quads, hamstrings, calves, tibialis |

Naming: `id` is kebab-case and permanent — it appears in URLs, records, prompt lines and the GLB region materials. `name` is the runner-facing label; the text in parentheses is the qualifier `muscleShortName` strips. A **region** is that same id as the painted surface: the `RegionMuscle-<region>` material suffix and the `<region>__…` node prefix in the anatomy asset `(src/muscle-viewer.ts · buildAnatomy)`, one rig entry per catalog id `(src/muscle-rig.ts · MUSCLE_RIG)`.

| Id | Name | Group | View | Covers |
|---|---|---|---|---|
| neck | Neck | shoulders | both | Holds the head steady; posture and balance |
| delts | Shoulders (deltoids) | shoulders | both | Lifts and steadies the arm; front head in every swing |
| rotator-cuff | Rotator cuff | shoulders | back | Centres the ball of the shoulder in its socket |
| traps | Traps (upper back) | shoulders | back | Elevates and retracts the shoulder blades; guards the neck |
| chest | Chest (pectorals) | torso | front | Presses; draws the arm across the body |
| lats | Lats (side back) | torso | back | Pulls the arm down and back; steadies the spine |
| biceps | Biceps | arms | front | Bends the elbow; helps swing the arm |
| triceps | Triceps | arms | back | Straightens the elbow; long head swings the arm back |
| forearms | Forearms | arms | both | Grips, steers the wrist, stabilises the elbow |
| abs | Abs (core front) | torso | front | Braces the trunk; transfers force |
| obliques | Obliques (side core) | torso | front | Resists rotation and side-bend; keeps the pelvis level |
| lower-back | Lower back (erectors) | torso | back | Braces the spine against folding; every footstrike |
| glutes | Glutes | hips | back | Extends the hip; controls the pelvis in single-leg stance |
| hip-flexors | Hip flexors | hips | front | Drives the knee forward; stabilises the lumbar spine |
| adductors | Inner thighs (adductors) | hips | front | Pulls the leg inward; controls direction changes |
| abductors | Outer hips (abductors) | hips | back | Holds the pelvis level; carries force down the outside |
| quads | Quads (front thighs) | legs | front | Straightens the knee; absorbs footstrike; brakes downhill |
| hamstrings | Hamstrings (back thighs) | legs | back | Extends the hip, bends the knee; longest in late swing |
| calves | Calves | legs | back | Springs the foot off the ground; absorbs shock |
| tibialis | Shins (tibialis) | legs | front | Lifts and controls the foot; brakes at footstrike |

Views: 8 front-only, 9 back-only, 3 both. `view` is authoring metadata carried into the editor payload `(src/web-muscle.ts · muscleScript)`; the 3D figure is one orbitable body, so Front/Back are camera tweens, not a filter `(src/muscle-viewer.ts · tweenTo)`.

## 2. Check-in record

One check-in is one submit: a day, an optional same-day run, a list of muscle tags and an optional note `(src/muscles.ts · MuscleCheckIn)`.

| Field | Rule | Enforced by |
|---|---|---|
| `day` | ISO `YYYY-MM-DD`, never future, at most 14 days back | `(src/muscles.ts · validateCheckInDay)` |
| `activityId` | owned run whose day equals the check-in day, else null | `(src/web.ts · "/muscle/checkin")` |
| `muscles[]` | 1 to 20 entries, one per muscle | `(src/muscles.ts · MAX_CHECKIN_MUSCLES)` |
| `muscleId` | catalog id, unknown ids rejected whole | `(src/muscles.ts · isMuscleId)` |
| `soreness` | integer 0-10 after `Math.round` | `(src/muscles.ts · readSoreness)` |
| `conditions[]` | 0 to 8 known keys, deduped, unknown rejected | `(src/muscles.ts · MUSCLE_CONDITIONS)` |
| `side` | both / left / right, absent means both | `(src/muscles.ts · readSide)` |
| `warmUp` | eases / same / worse, absent means null | `(src/muscles.ts · readWarmUp)` |
| `note` | at most 200 characters, trimmed, empty becomes null | `(src/muscles.ts · MAX_CHECKIN_NOTE_CHARS)` |
| `createdAt` | server clock at save | `(src/web.ts · "/muscle/checkin")` |

- **Two submission paths, one record shape.** The script path posts per-muscle JSON through `parseMuscleTagsJson` `(src/muscles.ts · parseMuscleTagsJson)`; the no-script path posts one shared severity, tag set and side over the checked boxes through `buildSharedTags` `(src/muscles.ts · buildSharedTags)`. Both reject an empty or oversized selection, an unknown id and an out-of-range severity, and both store the same `MuscleTag` shape `(src/muscles.ts · MuscleTag)`.
- **Rejected whole, never partially.** On the script path an unknown muscle, an out-of-range severity, an unknown condition, an unknown side or an unknown warm-up answer rejects the entire check-in with a code the page turns into a banner `(src/muscles.ts · parseMuscleTagsJson)`; the no-script path coerces an unrecognised side to both and an unrecognised warm-up answer to null instead of failing the save `(src/web.ts · "/muscle/checkin")`.
- **Per-muscle uniqueness.** A muscle may appear once per check-in; a second entry is rejected with that muscle's name `(src/muscles.ts · parseMuscleTagsJson)`. The same muscle may of course be reported again on a later day — the newest report wins `(src/muscle-status.ts · computeMuscleStatuses)`.
- **Append-only.** A saved check-in is only ever inserted `(src/store.ts · appendMuscleCheckIn)`; the mutable state is the separate control row `(src/store.ts · upsertMuscleStatusControl)`.
- **Run link.** A linked run must be owned by the runner and fall on the check-in's day, otherwise the save is refused with the activity error `(src/web.ts · "/muscle/checkin")`. A run older than the 14-day window cannot be linked, but its muscles still prefill the form and the page says the report is for today `(src/web-muscle.ts · formSection)`.

## 3. Interpretation rules

`readMuscleTag` is the only classifier: pure, ordered, first match wins, and it reads condition tags before severity `(src/muscles.ts · readMuscleTag)`. The ladder runs urgent → warning → watch → heavy → sore → ok.

```text
1  urgent   (soreness >= 8 && swelling) || (soreness >= 9 && fatigued) || (numbness && muscleId = "lower-back")  -> medical_red_flag, drills withheld
2  warning  sharp_pain || swelling || numbness || (old_injury && soreness >= 7) || soreness >= 9                -> pain_injury, drills withheld
3  warning  dull_ache && warmUp = "worse"                                                                      -> pain_injury, drills withheld
4  watch    tight                                                                                              -> null, drills allowed
5  watch    cramp                                                                                              -> null, drills allowed
6  watch    fatigued || dull_ache                                                                              -> null, drills allowed
7  watch    old_injury                                                                                         -> null, drills allowed
8  heavy    soreness >= 7                                                                                      -> null, recovery drills only
9  heavy    soreness >= 4 && warmUp = "worse"                                                                  -> null, recovery drills only
10 sore     soreness >= 4                                                                                      -> null, mobility + recovery
11 ok       anything else                                                                                      -> null, none
```

Because tags outrank severity, a 2/10 sharp pain reads warning and a 0/10 tight reads watch — the tag is the story, the number is the size. `withholdDrills` is true only for warning and urgent `(src/muscles.ts · MuscleTagReading)`.

The 0-10 scale is anchored, and the anchor words are the ones the slider, the legend and the prompt all quote: 0 nothing, 3 mild, 5 noticeable, 7 sore to touch, 9-10 severe `(src/muscles.ts · SORENESS_ANCHORS)`. Display labels bucket the same scale: nothing, barely there, mild, noticeable, clear DOMS, sore to touch, strong, severe `(src/muscles.ts · sorenessLabel)`.

| Level | Runner-facing chip | Reading title |
|---|---|---|
| ok | Fine | "fine" |
| sore | Normal soreness | "expected soreness" |
| heavy | Big response | "a big response" / "worse when moving" |
| watch | Watch | "tight", "cramp", "fatigued", "dull ache", "old injury flare" |
| warning | Needs care | "take direct loading off it" / "ache that worsens" |
| urgent | Care now | "needs medical care now" |

Chip labels live in the page's `LEVEL_CHIP` map `(src/web-muscle.ts · LEVEL_CHIP)`; the guidance paragraph is part of every reading `(src/muscles.ts · readMuscleTag)`.

**Safety overrides.** Three patterns leave the soreness ladder and route to care, not drills:

| Pattern | Level | Copy it must carry |
|---|---|---|
| Severe soreness with swelling or weakness; dark, tea-coloured urine | urgent | Rhabdomyolysis needs a blood test, not a drill; no training on the area until seen `(src/muscles.ts · URGENT_GUIDANCE)` |
| Sharp localized pain, swelling, numbness, strong old-injury flare, 9-10 with no let-up | warning | The injury signature is not how soreness behaves; no hard or direct work, gentle pain-free range, clinician if not clearly better in 3-7 days `(src/muscles.ts · readMuscleTag)` |
| Numbness at the lower back | urgent | Nerve sign in the spine region; medical care now `(src/muscles.ts · readMuscleTag)` |

One-sided tags add "worth a clinician's look sooner", and a warning whose warm-up answer is "worse" adds that the movement made it worse `(src/muscles.ts · readMuscleTag)`. Warning and urgent tags are also listed in the page's care block, which offers the matching coaching state instead of drills `(src/web-muscle.ts · careSection)`.

A whole check-in gets one readiness word from its worst tag: urgent, care (warning or heavy), watch (sore or watch), steady `(src/muscles.ts · readinessForCheckIn)`, rendered with `READINESS_LABELS` `(src/muscles.ts · READINESS_LABELS)`.

## 4. Status periods and heat

A check-in becomes a dated **status period**; today's level is computed from time, so nothing needs maintaining `(src/muscle-status.ts · computeMuscleStatuses)`.

- Perfect by default: a muscle with no report, a resolved control or a fully faded window is simply absent from the status list `(src/muscle-status.ts · computeMuscleStatuses)`.
- The period starts on the check-in's day with the reported level, and recomputes the reading at today's level rather than replaying the original one `(src/muscle-status.ts · computeMuscleStatuses)`.
- Decay: the level holds through day 0 and day 1, then falls linearly to zero across the 10-day window, rounded to the same whole scale `(src/muscle-status.ts · decayedSoreness)`. With `reported` r and elapsed d: d ≤ 1 keeps r; d ≥ 10 gives 0; otherwise `round(r × (10 − d) / 9)`.
- Auto-dismiss: the period ends at the window end, or earlier when the level has reached 0 and no condition tag survives `(src/muscle-status.ts · computeMuscleStatuses)`. A lingering tag keeps a 0/10 status alive, which is deliberate.
- Hold suspends decay and keeps the reported level until the runner changes it; "all better" sets `resolvedDay` and ends the period whatever the clock says `(src/muscle-status.ts · MuscleStatusControl)`.
- A newer report restarts the period with the new level; the save path clears the control, so a surviving `resolvedDay` only suppresses periods the runner ended after reporting them `(src/muscle-status.ts · computeMuscleStatuses)`.
- Each status carries `expectedClearDay` = start day + 10 `(src/muscle-status.ts · addStatusDays)`, plus `checkInId`, `activityId`, `side`, `conditions`, `warmUp`, `hold`, `level` and `reading` `(src/muscle-status.ts · MuscleStatus)`.
- **Attention count** is `statuses.length`: the number of muscles in a non-perfect status `(src/muscle-status.ts · computeMuscleStatuses)`. The status card badge, the calendar chip and `/muscle/attention.json` all use that one list `(src/web-muscle.ts · statusSection)`, `(src/web-muscle.ts · muscleCalendarChip)`, `(src/web.ts · "/muscle/attention.json")`.
- **Worst level** across statuses comes from `worstStatusLevel` → `worstLevel` over the fixed order ok < sore < heavy < watch < warning < urgent `(src/muscle-status.ts · worstStatusLevel)`, `(src/muscles.ts · worstLevel)`.
- The calendar chip disappears when the count is 0, and otherwise says care now, needs care, or "N sore" `(src/web-muscle.ts · muscleCalendarChip)`.

**Heat ramp.** One function maps a level to a colour, so the figure, the status dots and the worked card cannot drift `(src/muscles.ts · sorenessFill)`:

| Value | Fill | | Value | Fill |
|---|---|---|---|---|
| 0 | `#f6eee6` | | 6 | `#f5a257` |
| 1-2 | `#fde8cf` | | 7 | `#f28034` |
| 3-4 | `#fbd5a8` | | 8 | `#ed5f1f` |
| 5 | `#f8bd7a` | | 9 | `#e34515` |
| | | | 10 | `#c92d0b` |

The legend under the figure is deliberately coarser — six swatches at 0, 2, 4, 6, 8, 10 — and carries the anchor words plus "a low red pulse = needs care", so colour is never the only carrier of meaning `(src/muscle-map.ts · renderMuscleLegend)`. The worked card reuses two of the ramp's stops for role emphasis before today's status wins `(src/web-muscle.ts · musclesWorkedCard)`.

## 5. Drills

A drill is a name, a category and a dosage string such as "2 × 15 per side, light" `(src/muscles.ts · MuscleDrill)`. Categories are mobility, activation and recovery `(src/muscles.ts · DrillCategory)`.

| Fact | Value |
|---|---|
| Drills in the library | 60 — exactly three per muscle |
| By category | 21 activation, 20 mobility, 19 recovery |
| Shape | `{ name, category, how }`, embedded in the catalog entry |

Drills are matched to the reading's level and to one tag, not to the muscle alone `(src/muscles.ts · drillsForLevel)`:

| Level | Drills offered | Order |
|---|---|---|
| heavy | recovery only | as authored |
| watch | activation + mobility | activation first when `tight`, else mobility first |
| sore | mobility + recovery | as authored |
| ok, warning, urgent | none | — |

`drillCardsForCheckIn` builds the cards: actionable levels only, ordered heavy → watch → sore, at most six cards, skipping any reading whose `withholdDrills` is set or whose drill list is empty `(src/muscles.ts · drillCardsForCheckIn)`. Warning and urgent levels deliberately suggest no drills — their guidance points to care, and a drill there would read as advice the app must not give `(src/muscles.ts · readMuscleTag)`. Those muscles appear in the care block instead `(src/web-muscle.ts · careSection)`.

## 6. Coach suggestions

The coach may notice a change in the runner's words; only the runner's one tap writes the record `(src/muscle-proposals.ts · MuscleProposal)`.

| Field | Rule |
|---|---|
| `action` | report, hold, release or resolve |
| `muscleId` | catalog id |
| `soreness` | report only, integer 0-10; null on the other three actions |
| `conditions`, `side`, `warmUp`, `note` | report only; the other actions normalize them away instead of failing |
| `note` | at most 200 characters `(src/muscle-proposals.ts · MAX_MUSCLE_PROPOSAL_NOTE_CHARS)` |
| `activityId` | report only; re-resolved against the store, never trusted from the model |
| `evidence` | 1-3 of the runner's own short quotes, each at most 200 characters `(src/muscle-proposals.ts · MAX_MUSCLE_PROPOSAL_EVIDENCE)` |
| `confidence` | 0.5 to 1 `(src/muscle-proposals.ts · parseMuscleProposalDraft)` |
| `day`, `status`, timestamps | server-assigned: the turn's day, `proposed`, and the clock |

- **Cap per turn:** at most six suggestions, one per muscle `(src/muscle-proposals.ts · MAX_MUSCLE_PROPOSALS)`; the tool schema mirrors the cap and the coach is told to name the rest as a Muscle-tab action instead of dropping them `(src/coach.ts · COACH_RULES)`.
- **TTL:** seven days; a proposal older than the window is not offered and cannot be confirmed `(src/muscle-proposals.ts · MUSCLE_PROPOSAL_TTL_DAYS)`.
- **Per-muscle superseding:** a newer suggestion for the same muscle dismisses the older pending row — dismissed, never deleted, so the journal stays honest — and an identical pending suggestion is skipped rather than stacked `(src/gateway.ts · recordMuscleProposals)`.
- **Honest partition:** `partitionPendingMuscleProposals` splits pending rows into `offered`, `expired` (outside the window) and `inactive` (a hold, release or resolve whose status faded before the tap), and both counts are shown on the page instead of a card that could only fail `(src/muscle-proposals.ts · partitionPendingMuscleProposals)`.
- **Confirm semantics:** report appends a one-muscle check-in for the proposal's day and resets the control to fading; hold, release and resolve only move the control row, and each refuses with `no-active-status` when nothing is active `(src/muscle-proposals.ts · confirmMuscleProposal)`.
- **The run link is re-resolved at confirm time** and downgrades to an unlinked report if the run moved or vanished, rather than failing the decision `(src/muscle-proposals.ts · confirmMuscleProposal)`.
- **The coach never writes the body record directly.** The turn's apply step only appends pending rows; the confirm function is the sole proposal path that appends a check-in or upserts a control `(src/gateway.ts · recordMuscleProposals)`, `(src/muscle-proposals.ts · confirmMuscleProposal)`.
- **Decision endpoints:** `POST /muscle/proposals/{id}/confirm`, `/dismiss`, `/restore` `(src/web.ts · proposalAction)`. With an Accept header asking for JSON the dock gets 200, 404 for a missing or foreign row, 409 for any other refusal; without script the browser is redirected back to `/muscle` with `saved=proposal`, `saved=dismissed` (plus the id, so the banner can offer Undo) or an error code `(src/web.ts · proposalAction)`. Restore refuses a stale, confirmed or foreign row `(src/muscle-proposals.ts · restoreMuscleProposal)`.
- **One card, two hosts.** The card is server-rendered with Confirm, Dismiss and an "Adjust in the form" link into the prefilled check-in form `(src/web-muscle.ts · proposalCardHtml)`. The dock renders the same view model `(src/web-muscle.ts · muscleProposalView)`; on the Muscle tab the page card owns the standing queue and the dock defers to it with one link, while a card the turn just created still renders in the dock `(src/web.ts · addMuscleProposalCards)`.
- **Evidence is data.** Quotes are shown as the runner's own words, never as instructions and never paraphrased into a level they did not give `(src/muscle-proposals.ts · MuscleProposal)`.

## 7. 3D figure and fallback

The figure is one reusable panel with two hosts: the Muscle tab's check-in form (bridge mode) and the activity detail's worked card (link mode) `(src/muscle-viewer.ts · renderMuscleViewerPanel)`.

| Asset | Role |
|---|---|
| `src/vendor/anatomy-muscles.glb` | Real anatomy: BodyParts3D release 4.0 muscles over bones, CC BY 4.0, ~11 MB, built with Blender 5.2; attribution sits beside it `(src/vendor/THREE-LICENSE.txt · anatomy-muscles.glb)` |
| `three.module.min.js`, `OrbitControls.js`, `GLTFLoader.js`, `BufferGeometryUtils.js` | three r170, vendored and served from `/static/`, so the app keeps zero runtime npm dependencies `(src/vendor/THREE-LICENSE.txt · three.module.min.js)` |
| `MUSCLE_RIG`, `RIG_BODY` | Typed procedural sculpt in world units, y up, authored on the left and mirrored `(src/muscle-rig.ts · MUSCLE_RIG)` |

- **Worked card roles.** Its primary/helper split comes from `musclesForRun`, the planner's honest default — session kind and title words adapt the base running pattern (hills upweight calves and glutes, faster kinds upweight the hip flexors and hamstrings, cross-training is recognised by its words), never EMG data `(src/muscles.ts · musclesForRun)`.
- **Region materials.** Every mesh whose material name starts with `RegionMuscle-` is pickable; its region is the node name before `__`, and one material instance is shared per region `(src/muscle-viewer.ts · buildAnatomy)`. Bones stay visible but unpickable. The lats have no BodyParts3D part, so they paint only in the procedural fallback — a region with no mesh simply does not paint `(src/muscle-viewer.ts · syncMuscle)`.
- **Viewer.** A module script behind a pinned import map (`"three"` → `/static/three.module.js`), ACES tone mapping, soft shadows, a ground disc, orbit with damping, distance clamped 3.6-11 and a polar cap, pixel ratio capped at 2 `(src/muscle-viewer.ts · renderMuscleViewerScript)`.
- **Orbit / pause / front / back / reset.** Auto-rotate starts on unless the runner prefers reduced motion; the Pause button flips `aria-pressed` and the label between "Pause rotation" and "Play rotation". Front (azimuth 0), Back (π) and Reset (0.5) tween the camera once with smoothstep easing, disable auto-rotate for the tween and hand control back after `(src/muscle-viewer.ts · tweenTo)`.
- **Hover vs select.** Hover and selection share one ember `#ff5a1f` with a matching emissive, so the muscle under the cursor looks exactly like a clicked one; a care-needed region instead pulses a low red emissive while the runner is not selecting it `(src/muscle-viewer.ts · syncMuscle)`. Hover is throttled to 60 ms with a trailing re-pick so a glide that stops still lands its highlight, and a click only counts when the pointer moved 7 px or less, so orbiting never selects `(src/muscle-viewer.ts · applyHover)`, `(src/muscle-viewer.ts · renderMuscleViewerScript)`.
- **Two interaction modes.** Bridge mode calls `window.__muscleTabBridge.toggle(id)` and reads `peek`/`has`; `peek` is read-only on purpose, or a hover glide would tag every muscle it crossed `(src/web-muscle.ts · muscleScript)`. Link mode navigates to `/muscle?focus=<id>`. Decorative mode names the muscle and does nothing else `(src/muscle-viewer.ts · activate)`.
- **Fallback.** WebGL failure writes a plain sentence into the container, marks it failed and reveals the list tab; an asset or loader failure builds the procedural sculpt instead `(src/muscle-viewer.ts · showFallback)`, `(src/muscle-viewer.ts · buildProcedural)`. `data-viewer-ready` is set only after a figure exists, so a capture can never fire early `(src/muscle-viewer.ts · renderMuscleViewerScript)`.
- **No-JS and keyboard.** Both panels render stacked without script; the tab strip only hides the inactive panel once script runs, and the list tab is a grouped checkbox list plus the quick set — the whole form without JavaScript `(src/muscle-viewer.ts · renderPanelTabScript)`, `(src/web-muscle.ts · muscleListSection)`. The canvas is not focusable; the list and the tray are the keyboard path.

## 8. Accessibility and safety copy

| Concern | Behaviour |
|---|---|
| Tabs | `role="tablist"`, `role="tab"` with `aria-controls`, `role="tabpanel"` with `aria-labelledby`; click or Left/Right arrow (wrapping) changes `aria-selected` and hides the other panel `(src/muscle-viewer.ts · renderPanelTabScript)` |
| Viewer | The container carries the spoken label and the no-script hint; the tooltip is `role="status"` and is positioned away from the pointer `(src/muscle-viewer.ts · renderMuscleViewerPanel)` |
| Editor | The per-muscle editor is `aria-live="polite"`, the tray is labelled "Selected muscles", and condition chips are toggle buttons with `aria-pressed` `(src/web-muscle.ts · muscleScript)` |
| Anchored slider | `input[type=range]` with `min=0`, `max=10`, `step=1`, a `<label for>` and a live `<output>` reading "n/10 · label"; the anchor sentence sits under it. There is no `aria-valuetext`, so the anchors are the visible explanation `(src/web-muscle.ts · renderEditor)` |
| Warm-up question | Hidden until it discriminates: soreness ≥ 4 or one of sharp pain, swelling, numbness, old injury, dull ache `(src/web-muscle.ts · syncWarmupVisibility)` |
| Status controls | Real forms posting to `/muscle/status`, so hold, release, resolve and "Everything's better" work without script `(src/web-muscle.ts · statusActionForm)` |
| Reduced motion | The figure starts paused under `prefers-reduced-motion: reduce`; the app-wide block also collapses animation and transition durations `(src/muscle-viewer.ts · renderMuscleViewerScript)`, `(src/styles.ts · @media (prefers-reduced-motion: reduce))` |
| Forced colours | The app-wide forced-colours block keeps the shell legible; there are no muscle-specific rules, so the text alternative carries the meaning `(src/styles.ts · @media (forced-colors: active))` |
| Never colour alone | Heat is repeated as a chip label, a trend sentence and the list tab; the legend is decorative and states the anchors in words `(src/muscle-map.ts · renderMuscleLegend)` |

**Medical disclaimer location.** The page's last card, "Honest notes about this page", carries four statements: the readings are guidance, not a diagnosis; normal soreness peaks at 24-72 h and is not damage; severe soreness with swelling, weakness or tea-coloured urine needs care now; and everything here is private, joins the coach's facts and is included in the data export `(src/i18n.ts · muscle.safetyNote1)`, `(src/web-muscle.ts · safetySection)`. The care block adds that the state offer switches on the existing guardrail — no intensity or racing while active, and a clinician line in the coach's advice `(src/i18n.ts · muscle.careProse)`.

## 9. Prompt integration

| Fact that rides | Renderer | Where it lands |
|---|---|---|
| Today's computed level per muscle, the fade-or-held story, the note and the 14-day check-in count | `(src/muscle-status.ts · renderMuscleStatusFactsForPrompt)` | Snapshot block "Muscle status:" `(src/coach.ts · buildContextSnapshot)` |
| Pending suggestions, newest first, with day, note and a "not confirmed yet" framing | `(src/muscle-proposals.ts · renderMuscleProposalsForPrompt)` | Snapshot block "Pending muscle suggestions:" `(src/coach.ts · buildContextSnapshot)` |
| One muscle's knowledge, drill library and the runner's tags for it | `(src/muscles.ts · referencedMuscleContext)` | Turn suffix "Referenced context" under key `muscle` `(src/coach.ts · buildTurnSuffix)` |
| Check-in id and pending proposal ids | `(src/coach.ts · CoachEpochParts)` | Snapshot epoch; changes raise `new-muscle-check-in` / `muscle-suggestion-changed` `(src/coach.ts · epochReasons)` |

- The status block is written as a time story, not as today's pain: a fading report says when it was reported and when it should be clear, a held one says the runner reports it is not settling `(src/muscle-status.ts · renderMuscleStatusFactsForPrompt)`. It also states that every muscle not listed is in perfect condition.
- The prompt rules that consume it: fading levels are improving rather than today's pain, tight wants mobility and activation, sharp pain, swelling and numbness are never normal soreness, and a suggestion is the runner's to confirm — never say it is logged `(src/coach.ts · COACH_RULES)`.
- The tool schema pins the enums (20 muscle ids, 8 condition keys, four actions, integer 0-10, confidence 0.5-1) and caps the array at six `(src/coach.ts · COACH_TOOL)`.
- **Token budget concern.** Assembly estimates tokens as characters / 4 and drops the oldest history messages above 8000, never below ten messages and never a snapshot, so the muscle block competes with conversation history rather than being truncated `(src/coach.ts · assembleConversation)`. Its size is bounded structurally instead: at most 20 status lines, a 200-character note, at most eight listed suggestions plus one tail line `(src/muscle-proposals.ts · MAX_PROMPT_MUSCLE_PROPOSALS)`. Any new muscle fact added to the snapshot spends history budget and forces a fresh snapshot, which costs the provider's cached prefix.

## 10. Rules that must not regress

1. **One deterministic reading.** Every surface — page, status layer, proposal card, prompt — must read `readMuscleTag` rather than re-deriving a level from severity, and the status layer must recompute it at today's decayed level `(src/muscles.ts · readMuscleTag)`, `(src/muscle-status.ts · computeMuscleStatuses)`, `(src/web-muscle.ts · muscleProposalView)`.
2. **No diagnosis.** Guidance is educational and warning copy ends in a clinician referral; the urgent copy names rhabdomyolysis and a blood test, never a drill `(src/muscles.ts · URGENT_GUIDANCE)`, `(src/muscles.ts · readMuscleTag)`.
3. **Sensitive routing.** Warning offers `pain_injury`, urgent offers `medical_red_flag`, drills are withheld at both levels, and the state offer carries a 21-day or 7-day TTL respectively `(src/muscles.ts · MuscleTagReading)`, `(src/web-muscle.ts · careSection)`.
4. **One owner per record surface.** On the Muscle tab the page card owns the standing queue and the dock defers with one link; on every other page the dock owns the decision; a card created by the current turn still renders in the dock `(src/web.ts · addMuscleProposalCards)`.
5. **The coach never writes the body record.** A turn appends pending proposals only; the runner's confirm is the sole path to a check-in or a control `(src/gateway.ts · recordMuscleProposals)`, `(src/muscle-proposals.ts · confirmMuscleProposal)`.

## Related documents

| Document | What it answers |
|---|---|
| [COACH-CONTRACT.md](COACH-CONTRACT.md) | The propose/validate/apply split this domain's suggestions inherit |
| [COACHING-STATES.md](COACHING-STATES.md) | The `pain_injury` and `medical_red_flag` states the care block offers |
| [HTTP-API.md](HTTP-API.md) | The `/muscle`, `/muscle/checkin`, `/muscle/status`, `/muscle/proposals/*` and `/muscle/attention.json` endpoints |
| [DATA-MODEL.md](DATA-MODEL.md) | The `muscle_checkins`, `muscle_status_controls` and `muscle_proposals` tables |
| [UI-GRAMMAR.md](UI-GRAMMAR.md) | Tabs, chips, banners and the status rail this page reuses |
| [ASSET-PROVENANCE.md](ASSET-PROVENANCE.md) | The BodyParts3D GLB and the vendored three r170 builds |
