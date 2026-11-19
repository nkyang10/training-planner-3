# The Muscle tab — per-muscle feedback, diagnosis guidance and drill suggestions

**Status:** designed 2026-11-19, implemented in this slice. The Muscle tab is the runner-facing check-in surface:
an interactive front/back muscle map where the runner tags how each muscle feels, a deterministic interpretation
layer that classifies each tag (normal DOMS → watch → warning → urgent) with drill suggestions, and a coach layer
that puts the same facts in the AI coach's prompt and answers questions about them. A second pass (same day) adds
the **status layer**: a check-in becomes a dated status period whose soreness is computed by time — perfect
condition by default, auto-dismissing after a standard window unless the runner holds it (§3b). Research basis and
citations are in §9.

## 1. Why

The calendar and training log say *what* the runner did. Nothing in POC3 says *how the runner's body absorbed it*.
The muscle loop closes that gap with the same philosophy as the rest of the app:

- **Care about the user.** A check-in takes under a minute, never scolds, and normalizes DOMS ("soreness is not
  damage"). Warnings are phrased as decisions handed back to the runner, and every urgent flag ends in
  "seek medical care" — never a diagnosis.
- **Knowledge for the coach.** The coach already receives load, ACWR and coaching states. This slice adds
  per-muscle facts to the same prompt, plus a rule for interpreting them, so a question like "my calves are 7/10
  and tight — what should I do tomorrow?" is answered from the runner's own data with evidence-based guidance.
- **Interactive muscle view.** Click/select/tag on a two-view body map; severity renders as a heat fill; muscles
  worked by a run are highlighted and can prefill the next check-in.

## 2. Surfaces

| Surface | What it adds |
|---|---|
| App bar | A third tab: **Plan / Training log / Muscles** — plus a notification-style **attention badge** on the Muscles tab (the count of muscles in a special status, loaded from `/muscle/attention.json`) |
| `/muscle` | The Muscle tab: the reusable **3D muscle plugin** (figure tab + list tab), the live **Muscle status** card with one-tap controls, check-in form, heat, latest diagnosis, drills, coach knowledge, history |
| `POST /muscle/checkin` | Stores one check-in (validated server-side); the optional **Keep until I change it** box holds the reported levels |
| `POST /muscle/status` | The one-tap status controls: `hold` / `release` / `resolve` for one muscle, `resolve-all` for everything |
| `GET /muscle/attention.json` | The badge feed: `{ count, items }` for the app-bar badge script |
| `/activity/<id>` | A **Muscles worked** card running the same 3D plugin in link mode (primary movers ember, helpers light, click a muscle to report it) with the live status of those muscles, the report already linked to the run, and the "Check in these muscles" deep link that auto-selects the run |
| Run review card (new run synced / run logged) | A "Log muscle feel · 回報肌肉" link into `/muscle?activity=<id>` |
| Calendar | A state-style chip while muscles are in a special status ("Muscles · N sore", or the care labels at warning/urgent) |
| Coach | `review-muscles` intent (comment-only), today's **computed** muscle status in every prompt, per-muscle knowledge blocks |
| `/coach-states` | Reachable one-tap from a warning check-in: set `pain_injury` (or `medical_red_flag`) with prefilled note |
| `/export.json` | Muscle check-ins and status controls are part of the runner's data bundle |
| `/static/three.module.js`, `/static/orbit-controls.js` | Pinned three.js r170 builds (MIT), vendored in `src/vendor/` and served as static scripts behind an import map — no runtime npm dependency |

## 3. Data model

```ts
export type MuscleConditionKey =
  | "tight" | "cramp" | "fatigued" | "dull_ache"
  | "sharp_pain" | "swelling" | "numbness" | "old_injury";

export type MuscleSide = "left" | "right" | "both";
/** Asked only when it matters: "better once warmed up" is the cheapest DOMS-vs-strain discriminator. */
export type MuscleWarmUp = "eases" | "same" | "worse" | null;

export interface MuscleTag {
  muscleId: string;          // kebab-case id from the muscle catalog
  soreness: number;           // 0-10 anchored scale (see §5)
  conditions: MuscleConditionKey[];
  side: MuscleSide;           // default "both"
  warmUp: MuscleWarmUp;       // asked when soreness >= 4 or a pain tag exists
}

export interface MuscleCheckIn {
  checkInId: string;
  userId: string;
  day: string;                // ISO day the feelings are about
  activityId: string | null;  // optional link to the session it follows
  muscles: MuscleTag[];
  note: string | null;        // <= 200 chars, free text for the coach
  createdAt: string;
}
```

Storage follows the existing pattern: one table `muscle_checkins` with the full record as a JSON payload plus
mirrored filter columns (`user_id`, `day`, `created_at`) and an index on `(user_id, day)`. Check-ins are append-only;
the map renders the latest one, history lists the rest.

## 3b. The status layer: dated periods, time-computed soreness, hold and resolve

A check-in says how a muscle felt *on a day*. The status layer turns that into what the app holds as true *today*.
`src/muscle-status.ts` is the one source of truth; the muscle tab, the calendar chip, the attention badge and the
coach prompt all read it.

- **Perfect by default.** A muscle with no active period is in perfect condition. Nothing is assumed sore until
  the runner reports it, and absence (not a zero row) is how perfection is stored.
- **A period starts at the report.** The newest check-in mentioning a muscle starts its status on that check-in's
  day: the reported level is the start level, its conditions and side carry through, and its linked run rides along.
- **Soreness is computed from time.** `decayedSoreness(reported, elapsed)` holds the reported level through day 1
  (DOMS peaks 24-72 h, so a same-day or next-morning report is already the peak), then falls linearly to 0 at
  `MUSCLE_STATUS_WINDOW_DAYS = 10` — the standard auto-dismiss window. The period ends when the level rounds to 0
  with no conditions left, or at the window's end, whichever comes first. No maintenance work: a forgotten report
  dismisses itself.
- **Hold constant.** A `hold` control suspends the decay: the level stays exactly as reported until the runner
  changes it — the honest option for something that is not settling on its own. The check-in form offers the same
  choice as one checkbox ("Keep these levels until I change them").
- **All better.** A `resolve` control ends the period on the runner's claim, whatever the clock says; `resolve-all`
  clears every active status in one tap.
- **The last word wins.** Saving a check-in that mentions a muscle resets that muscle's control row (a survived
  "resolved" is cleared, and the form's hold box decides the decay mode), so reporting is always current.
- **Today's reading.** The deterministic interpretation (§6) is recomputed at the faded level, so guidance matches
  the day: a 7/10 reported Monday reads "big response" Monday and "expected soreness" once time has taken it to 4.

The stored state is deliberately tiny — one row per (runner, muscle) in `muscle_status_controls`
(`{ userId, muscleId, hold, resolvedDay, updatedAt }`); everything else is derived from the append-only
check-ins. The runner-facing surfaces: a **Muscle status** card at the top of the muscle tab (heat dot, today's
level, the fade clock, and one-tap Update / Hold / All better per muscle); an **attention badge** with the count on
the Muscles tab of the app bar (the same notification-icon pattern as the unread bell); the calendar chip; and
per-muscle status chips on the activity detail, next to "Check in these muscles".

## 4. The muscle catalog

20 clickable regions across a front and a back view (bilateral regions are one logical muscle with left/right
paths), chosen for a running-first app that also covers gym cross-training:

| Group | Muscles (view) |
|---|---|
| Shoulders/arms | `delts` (both), `rotator-cuff` (back), `biceps` (front), `triceps` (back), `forearms` (both) |
| Torso | `neck` (both), `traps` (back), `chest` (front), `lats` (back), `abs` (front), `obliques` (front), `lower-back` (back) |
| Hips | `glutes` (back), `hip-flexors` (front), `adductors` (front), `abductors` (back) |
| Legs | `quads` (front), `hamstrings` (back), `tibialis` (front), `calves` (back) |

Each region carries coach knowledge: function, common issues, what soreness there usually means for a runner,
recovery guidance, and 2-4 concrete drills (mobility / activation / recovery) with dosage text (§6 of the research
report).

## 4b. The 3D figure plugin (reusable, tabbed)

The muscle figure is **a reusable plugin** (`src/muscle-viewer.ts`), not a muscle-tab private: one panel
renderer, two hosts. The Muscle tab's check-in form embeds it in **bridge mode** — clicking a muscle toggles
the host's selection state through `window.__muscleTabBridge` — and the activity detail's **Muscles worked**
card embeds it in **link mode**, where clicking a muscle deep-links into a check-in on exactly that muscle
(`/muscle?focus=<id>`). Both hosts paint the same way: server-computed region fills (today's status heat, or
the run's worked footprint) ride into the script and tint the real muscle surfaces.

The panel is **tabbed**: a **3D figure** tab and a **list** tab (the text representation). The muscle tab's
list is the grouped checkbox list — the keyboard and no-JavaScript path; the worked card's list is the
primary/helper chip list with a spoken summary. Without script both panels render stacked (the tab strip takes
over only when script runs); without WebGL the script reveals the list and says why. The flat 2D SVG figure
is retired: the figure is 3D, the text is the list.

- **The real figure ships in the app.** BodyParts3D per-muscle and per-bone OBJ meshes (CC BY 4.0; attribution in
  `src/vendor/THREE-LICENSE.txt`), curated per catalog region, decimated for the browser and exported by Blender
  5.2 headless as `src/vendor/anatomy-muscles.glb` — 186 named objects (`region__part__FJ`) across 19 muscle
  regions plus the skeleton, each muscle region carrying its own `RegionMuscle-<region>` material so the app tints
  and selects it independently. Options, licenses, build scripts and the curated mapping:
  [MUSCLE-ANATOMY-3D-RESEARCH.md](MUSCLE-ANATOMY-3D-RESEARCH.md).
- **Interaction on the real meshes.** Hover raycasts and **recolors the muscle with the same ember as a
  click-select** (`#ff5a1f` colour plus emissive glow, so hovering and selecting read identically) while the
  tooltip names it and its state — the tag on the muscle tab, the role/level note on the worked card. A
  trailing-edge re-pick lands the cursor's resting position — a glide that stops between the 60 ms throttle
  windows still highlights the muscle under the still cursor — and hovering is read-only (`bridge.peek`): it
  never creates a tag, so gliding across the figure no longer quietly selects the muscles it crossed. Click
  or tap acts on the catalog region (drag still orbits — a small movement threshold separates the two); scroll
  or pinch zooms; **Pause rotation** stops the turntable and the subtle breathing; Front / Back / Reset tween
  the camera. Bones stay visible but unpickable. Lats has no BP3D part, so its 3D surface simply does not
  paint — the list tabs still carry it.
- **The procedural rig is the fallback** (`src/muscle-rig.ts`, typed and test-held): if the asset or WebGL
  fails, the viewer builds the stylized sculpt instead and reveals the list tab, so the runner always has a
  working surface. Both hosts share one selection state through the bridge (`window.__muscleTabBridge`) on
  the muscle tab; the worked card has no selection state of its own.
- **Rendering.** ACES filmic tone mapping, a warm key with soft shadows, cool fill, ember rim, shadow-catching
  ground; muscles read as an écorché deep red with clearcoat, bones ivory. Care-needed muscles pulse low red so
  the flag never relies on hue alone; the status heat (muscle tab) and the worked footprint (primary ember,
  helpers light) paint on the actual muscle surfaces.
- **Browser-verified.** The fixture harness loads the real app page over HTTP: the module graph and the 11 MB GLB
  resolve, `anatomy-ok` fires, the in-page canvas reports a ~111 KB rendered frame, and the captured screenshot
  ([docs/design/muscle-tab-demo.png](design/muscle-tab-demo.png)) pixel-verifies the écorché figure in the viewer
  region. A dedicated probe measured the GLB loading 186 meshes in ~0.3 s with a torso raycast returning
  `abs__muscle-of-anterior-abdominal-wall-L` — a real muscle, not a silhouette.

## 5. The check-in flow

1. **Day** (default today, backfillable 14 days) and an optional **linked activity** chosen from that day's runs.
   Linking prefills the selection with the muscles that run worked — and the "Check in these muscles" deep link
   auto-selects that run in the form; a run older than the 14-day window cannot be linked, so the form defaults
   to today, still prefills its muscles, and says so instead of dropping the run silently.
2. **Select muscles** on the 3D figure (click/tap), or in the plugin's **list tab** — the grouped checkbox list
   that mirrors the selection for keyboard and no-JS users.
3. **Tag each selected muscle**: a 0-10 soreness slider with anchored wording
   (0 nothing · 3 mild · 5 noticeable · 7 sore to touch · 9-10 severe), condition chips
   (tight / cramp / fatigued / dull ache / sharp pain / swelling / numbness / old injury), a
   left/right/both toggle, and — only when soreness ≥ 4 or a pain tag is set — a "better once warmed up?"
   toggle (eases / same / worse). No-JS fallback: shared severity + shared conditions apply to every checked
   muscle; the client script upgrades this to per-muscle editing.
4. **Save** → `POST /muscle/checkin` → redirect to `/muscle?saved=1`.

The next-morning timing is respected in copy ("how do they feel *today*"), because DOMS has a 12-24 h pain-free
window; a same-evening check-in under-reports (§1.3 of the research report).

## 6. The interpretation layer (deterministic, server-side)

Every tagged muscle is classified. The worst level names the check-in's readiness; nothing is invented beyond
the rules, and the classification is stored data, not a diagnosis.

| Level | Trigger | Copy (care-first) | Drills |
|---|---|---|---|
| `ok` | soreness ≤ 3, no tags | "Normal training response — keep your plan." | none required |
| `sore` | 4-6, no tags | "Expected DOMS. It peaks 24-72 h after the session and eases once you're moving; keep today easier on this muscle." | easy movement / recovery |
| `heavy` | 7-8, no tags, or `fatigued` with 4+ | "A big response. No hard direct work for 48-72 h; easy movement, food and sleep." | recovery + light movement; rhabdo screen note |
| `watch` | `tight`, or `dull_ache`, or `old_injury` ≤ 6 | "Worth a look, not a stop." | mobility + activation for that muscle |
| `warning` | `sharp_pain`, `swelling`, `numbness`; or `old_injury` ≥ 7; or soreness ≥ 9 | "Sharp pain, swelling or numbness is not normal DOMS — take direct loading off it and see a clinician if it is not clearly better in 3-7 days." | gentle ROM only + clinician line; one-tap `pain_injury` state |
| `urgent` | soreness ≥ 8 with `swelling`, or ≥ 9 with `fatigued`, or any `numbness` in `lower-back` with side "both" | "Severe soreness with swelling/weakness needs medical care now — check for dark, tea-coloured urine." | no drills; one-tap `medical_red_flag` state |

Modifiers refine the reading: `warmUp: "worse"` upgrades a plain `sore` to `heavy` and a `dull_ache` to `warning`
(an ache that worsens with movement is the cheapest strain signal the runner can give); `warmUp: "eases"` adds a
reassuring line to `sore`/`heavy`; `side` other than "both" adds "one-sided — worth a clinician's look sooner".
Check-in readiness chip: `steady` (all ok) · `watch` (sore/watch present) · `care` (heavy/warning) · `urgent`.

The DOMS timeline is modelled: a muscle tagged at a level on day N is expected to fall daily; a later check-in
that rises shows "this no longer looks like normal DOMS" as a watch line. Pain persisting beyond 7 days reads as
a referral line in every history row (§3.1 of the research report).

## 7. Muscles worked (after-activity highlight)

The session kinds and the run's numbers map to primary/secondary muscles; a keyword pass over the title adapts
hill/trail/gym/cycle/swim runs:

| Input | Primary | Secondary |
|---|---|---|
| Base run (any kind) | `glutes`, `quads`, `hamstrings`, `calves` | `hip-flexors`, `tibialis`, `abs`, `lower-back` |
| `interval`/`tempo`/`race` | base + `hip-flexors`, `hamstrings` upweighted | + `obliques`, `adductors`, `abductors` |
| Title mentions hill/altitude or elevation gain ≥ 100 m | + `calves`, `glutes` upweighted | + `quads` |
| Title mentions trail | + `adductors`, `abductors`, `tibialis` | — |
| `cross` with cycle/bike/spin | `quads`, `calves`, `glutes` | `hamstrings`, `abs` |
| `cross` with swim | `lats`, `delts`, `chest` | `abs`, `triceps`, `forearms` |
| `cross` with gym/strength/weights | `quads`, `glutes`, `chest`, `lats`, `abs` | `delts`, `hamstrings`, `triceps`, `biceps`, `forearms` |
| `cross` otherwise | `quads`, `glutes`, `abs`, `calves` | — |

Rendered as: a **Muscles worked** card on the activity detail running the reusable 3D muscle plugin in link
mode — primary movers ember, helpers light, today's status heat painting on top, click a muscle to jump into
a check-in on it — with the worked list tab (primary/helper chips plus a spoken summary) and a
"Check in these muscles" deep link that auto-selects the run; a row in the Muscle tab's "From your training"
section; and the prefill source for `?activity=<id>`.

## 8. The coach layer

- **Facts in every prompt.** `muscleFacts` joins the coach facts: today's computed muscle status — one line per
  active period (current level, fade story or held marker, expected clear day, tags, side, warm-up), "every other
  muscle is in perfect condition", the latest check-in note, and an honest 14-day count. One new rule in
  `COACH_RULES` teaches the scale anchors, the 24-72 h DOMS window, that fading levels mean improving (never
  today's pain), that a held level means the runner says it is not settling, the sharp-pain-is-not-DOMS line and
  the referral duty. The coach never diagnoses and proposes `pain_injury`/`medical_red_flag` states (existing
  sensitive-state machinery) rather than acting on them silently, and invites a fresh check-in when advice
  depends on how a muscle feels today.
- **`review-muscles` intent.** The Muscle tab's "Ask coach about this check-in" button sends a conversational
  visible message plus a typed intent; the server builds a comment-only directive (mode `review`, focus
  `recovery`, source `muscle-tab`) with an optional `muscleId` reference so a per-muscle question ("my calves")
  resolves to that muscle's knowledge and the runner's tags for it. The gateway enforces `allowCalendarWrites:
  false`; drill suggestions stay conversational, and booking a mobility session remains a separate explicit ask
  ("Ask the coach to work this in") with the `plan` intent.
- **Per-muscle knowledge blocks** render in the tag editor (function, common issues, recovery) so the runner sees
  the same reference the coach reads.

## 9. Research basis

- **Scale:** 0-10 numeric soreness with anchored wording (VAS-style; Lau et al. 2015,
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC4732393/>); single-item daily measures are the feasible standard
  (Duignan et al. 2020, <https://pmc.ncbi.nlm.nih.gov/articles/PMC7534939/>).
- **DOMS course:** pain-free 12-24 h, peaks 24-72 h, resolves by 5-7 days; soreness ≠ damage magnitude
  (Nosaka et al. 2002, <https://onlinelibrary.wiley.com/doi/abs/10.1034/j.1600-0838.2002.10178.x>;
  Physiopedia, <https://www.physio-pedia.com/Delayed_Onset_Muscle_Soreness>); repeated-bout effect blunts
  recurrence (Connolly et al., <https://pmc.ncbi.nlm.nih.gov/articles/PMC3967433/>).
- **DOMS vs strain discriminators** (dull/diffuse/bilateral/eases-with-warm-up vs sharp/localized/worsening):
  <https://www.thetxroom.com/doms-vs-injury/>, <https://www.reboundmd.com/news/how-know-difference-between-soreness-pain>.
- **Red flags:** rhabdomyolysis triad (severe pain + swelling + dark urine; CDC,
  <https://www.cdc.gov/niosh/rhabdo/signs-symptoms/index.html>), neurological signs as referral triggers
  (<https://www.physio-pedia.com/Red_Flags_in_Spinal_Conditions>), >7-day persistence warrants evaluation
  (<https://my.clevelandclinic.org/health/symptoms/myalgia-muscle-pain>).
- **Interventions:** light exercise is the best DOMS analgesic (Cheung et al. 2003,
  <https://pubmed.ncbi.nlm.nih.gov/12617692/>); foam rolling/massage help perceived soreness (Pearcey et al.
  2015, <https://pmc.ncbi.nlm.nih.gov/articles/PMC4299735/>); stretching does not reduce DOMS (Afonso et al.
  2021, <https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.677581/full>); post-session
  cold water can blunt hypertrophy adaptations (Piñero et al. 2024,
  <https://onlinelibrary.wiley.com/doi/10.1002/ejsc.12074>).
- **Training-permission matrix and per-muscle drill dosages:** compiled in the feature's research pass from the
  sources above plus region-specific references (hamstring sprint mechanisms, calf "tennis leg", MTSS/shin
  splints, groin-strain recurrence, Copenhagen plank prevention) — captured in §6 of the research report and
  encoded in `src/muscles.ts`.

## 10. Accessibility, fallback and honesty

- The plugin's list tab is real checkboxes (and, on the worked card, real links), so the form works fully
  without script or WebGL; the tab strip itself is keyboard-operable (click or arrow keys) and the inactive
  panel is only hidden when script runs. Severity uses a `<input type="range">` with a visible anchor line,
  not color alone; the heat ramp is amber→ember→red (never green/red alone) and warning regions get a low red
  pulse in 3D plus "needs care" in the tooltip text.
- The 3D figure is a pointer-driven surface: orbit, zoom, click-act and the pause control all work with a
  mouse or touch, and its status is announced to the page (`viewerReady`, tooltip `role="status"`). Keyboard
  users reach every muscle through the list tab's checkboxes; `prefers-reduced-motion` pauses the turntable
  before it starts.
- The no-JS path posts the same shape with shared severity/conditions; the script path posts per-muscle JSON.
- Copy keeps the app's honesty: DOMS is normalized, "no soreness" is never called a wasted session, and urgent
  flags hand the runner to medical care instead of pretending the app can advise.
- **Not in scope:** EMG or HRV-based readiness, clinical decision support, human-coach dashboards, image-precise
  anatomy. The interpretation layer is educational guidance, not a diagnosis.

## 11. Test plan

- `test/muscles.test.ts`: catalog integrity (unique ids, view placement, drills referenced exist), check-in
  validation (ids, soreness bounds, condition keys, note caps, day backfill window), interpretation rules
  (each level, modifiers, urgent combinations), muscles-worked mapping (kind + title keywords + elevation), and
  prompt-facts rendering.
- `test/muscle-status.test.ts`: the decay curve (peak hold, linear fall, window end, clamping), the status
  computation (perfect by default, dated period, fade + recomputed reading, auto-dismiss, hold, resolve, newer
  report wins, lingering conditions, linked run and side), the shared status line, and the coach prompt block
  (fade story, held wording, honest 14-day count).
- `test/muscle-rig.test.ts`: the 3D rig covers the catalog once, authors mirrored parts on the left, stays
  inside the figure's bounds, uses only the shape kinds the viewer builds, and the trunk lathe closes upward.
- `test/store.test.ts`: append/list/get scoping by user; status controls upsert/replace, scoping and persistence.
- `test/web-muscle.test.ts`: `/muscle` renders the tabbed plugin (tab strip, viewer container, import map,
  controls, the checkbox list tab, the no-script hint, empty and seeded states), the vendored three.js builds
  serve with the right type, `POST /muscle/checkin` accept/reject paths, `?activity=` prefill with the run
  auto-selected (including the older-than-window case with its honest note) and `?focus=` prefill, history rows,
  the status card with its one-tap forms, `POST /muscle/status` (hold, release, resolve, resolve-all, rejects),
  `/muscle/attention.json`, the badge script, the calendar chip (sore count and care labels, dropped when
  perfect), the activity detail's worked plugin in link mode (worked tints, deep-link base, list tab, status
  chips, linked report), per-runner privacy, export bundle inclusion.
- `test/directives.test.ts`: `review-muscles` parsing and directive build (comment-only, source, muscleId
  reference).
- `test/coach.test.ts`: prompt facts block and referenced-muscle context.
- `test/gateway.test.ts`: the gateway renders today's computed status into every prompt and omits the block
  while every muscle is perfect.
- Headless Chrome (fixture pipeline, not part of the suite): loads the served page and reports from inside it
  that the import map resolved, the modules loaded, the viewer reached `viewerReady=1` with a live canvas and
  WebGL context, then captures the demo screenshot.
