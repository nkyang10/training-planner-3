# The Muscle tab — per-muscle feedback, diagnosis guidance and drill suggestions

**Status:** designed 2026-11-19, implemented in this slice. The Muscle tab is the runner-facing check-in surface:
an interactive front/back muscle map where the runner tags how each muscle feels, a deterministic interpretation
layer that classifies each tag (normal DOMS → watch → warning → urgent) with drill suggestions, and a coach layer
that puts the same facts in the AI coach's prompt and answers questions about them. Research basis and citations
are in §9.

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
| App bar | A third tab: **Plan / Training log / Muscles** |
| `/muscle` | The Muscle tab: a 3D interactive figure (three.js) plus the flat-figure fallback, check-in form, heat, latest diagnosis, drills, coach knowledge, history |
| `POST /muscle/checkin` | Stores one check-in (validated server-side) |
| `/activity/<id>` | A **Muscles worked** card (primary/secondary) + "Check in these muscles" link |
| Run review card (new run synced / run logged) | A "Log muscle feel · 回報肌肉" link into `/muscle?activity=<id>` |
| Calendar | A state-style chip when the latest check-in is at warning level ("Muscles · watch") |
| Coach | `review-muscles` intent (comment-only), muscle facts in every prompt, per-muscle knowledge blocks |
| `/coach-states` | Reachable one-tap from a warning check-in: set `pain_injury` (or `medical_red_flag`) with prefilled note |
| `/export.json` | Muscle check-ins are part of the runner's data bundle |
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

## 4b. The 3D figure

The Muscle tab's primary view is an interactive **3D anatomy figure** built with three.js:

- **Realistic rendering.** ACES filmic tone mapping, a three-point light rig (warm key with soft shadows, cool
  fill, ember rim), a shadow-catching ground disc, and physical materials with clearcoat and sheen — the figure
  reads as a lit clay anatomy model rather than a flat drawing.
- **The rig is typed data** (`src/muscle-rig.ts`): the body silhouette (a lathe trunk plus capsule limbs) and one
  overlay shape set per catalog muscle, mirrored across the axis exactly like the 2D figure. Tests hold the rig
  to the catalog, the authoring convention and the figure's bounds.
- **Interaction.** Drag to orbit, scroll or pinch to zoom, click or tap a muscle to select it (raycast against
  the overlay meshes); hover shows a name-and-state tooltip. Front / Back / Reset buttons tween the camera.
- **The animation can be stopped.** While the runner decides, the figure turns slowly on a turntable and
  breathes subtly; the **Pause rotation** button holds it still (and `prefers-reduced-motion` starts it paused).
  Care-needed muscles pulse a low red so the flag never relies on hue alone.
- **One selection state, two surfaces.** The 3D viewer and the flat figure drive the same bridge
  (`window.__muscleTabBridge`), so a click on the 3D figure updates the tray, the editor, the checkbox list and
  the 2D figure — and vice versa. Recent check-ins paint the same heat ramp on the overlay muscles.
- **Resilience.** The 3D layer is an ES module behind an import map that resolves the vendored builds; if WebGL
  cannot start, the viewer says so and opens the flat figure automatically. The flat figure (inside its
  "no 3D needed" details) carries the no-JavaScript and keyboard paths, so the form works in every browser.
- **Browser-verified.** A headless-Chrome harness (tmp scripts, seeded data) loads the page over HTTP and asserts
  from inside the page: the import map resolves, the modules load, `viewerReady=1`, a canvas exists and WebGL
  initialized — then captures [docs/design/muscle-tab-demo.png](design/muscle-tab-demo.png). The capture waits on a
  long-poll load blocker released by the viewer's ready beacon, so the screenshot shows the rendered figure rather
  than the first blank paint.

A photoreal anatomical mesh is the documented follow-up — and the path is now **researched and pipeline-proven**:
BodyParts3D (CC BY 4.0) provides one named mesh per real muscle and bone, and a Blender→GLB→three.js pipeline was
run end-to-end on this machine (real anatomy rendered under the app's light rig, raycast picking returning
anatomical names). Options compared, licenses, the curated part mapping and the integration plan live in
[MUSCLE-ANATOMY-3D-RESEARCH.md](MUSCLE-ANATOMY-3D-RESEARCH.md).

## 5. The check-in flow

1. **Day** (default today, backfillable 14 days) and an optional **linked activity** chosen from that day's runs.
   Linking prefills the selection with the muscles that run worked.
2. **Select muscles** on the map (click/tap or Enter/Space on a region; the full list below the map mirrors the
   selection as checkboxes for keyboard and no-JS users).
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

Rendered as: a **Muscles worked** card on the activity detail (primary bold, secondary muted) with a
"Check in these muscles" deep link; a row in the Muscle tab's "From your training" section; and the prefill
source for `?activity=<id>`.

## 8. The coach layer

- **Facts in every prompt.** `muscleFeedback` joins the coach facts: latest check-in (day, per-muscle soreness,
  tags, side, readiness level) plus a 14-day history count. One new rule in `COACH_RULES` teaches the scale
  anchors, the 24-72 h DOMS window, the sharp-pain-is-not-DOMS line and the referral duty. The coach never
  diagnoses and proposes `pain_injury`/`medical_red_flag` states (existing sensitive-state machinery) rather
  than acting on them silently.
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

- Every region is an SVG group with `role="button"`, `tabindex`, and an `aria-label`; the muscle list below the
  map is real checkboxes, so the form works fully without script. Severity uses a `<input type="range">` with a
  visible anchor line, not color alone; the heat ramp is amber→ember→red (never green/red alone) and warning
  regions also get a dashed outline (and a red pulse in 3D).
- The 3D figure is a pointer-driven surface: orbit, zoom, click-select and the pause control all work with a
  mouse or touch, and its status is announced to the page (`viewerReady`, tooltip `role="status"`). Keyboard
  users keep the flat figure's button regions and the checkbox list; `prefers-reduced-motion` pauses the
  turntable before it starts.
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
- `test/muscle-rig.test.ts`: the 3D rig covers the catalog once, authors mirrored parts on the left, stays
  inside the figure's bounds, uses only the shape kinds the viewer builds, and the trunk lathe closes upward.
- `test/store.test.ts`: append/list/get scoping by user.
- `test/web-muscle.test.ts`: `/muscle` renders (viewer container, import map, controls, the flat-figure
  fallback, catalog list, empty and seeded states), the vendored three.js builds serve with the right type,
  `POST /muscle/checkin` accept/reject paths, `?activity=` prefill, history rows, warning chip on the calendar,
  activity-detail muscles card, export bundle inclusion.
- `test/directives.test.ts`: `review-muscles` parsing and directive build (comment-only, source, muscleId
  reference).
- `test/coach.test.ts`: prompt facts block and referenced-muscle context.
- Headless Chrome (fixture pipeline, not part of the suite): loads the served page and reports from inside it
  that the import map resolved, the modules loaded, the viewer reached `viewerReady=1` with a live canvas and
  WebGL context, then captures the demo screenshot.
