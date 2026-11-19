# A nicer 3D muscle/skeleton figure — research, proven pipeline and integration plan

**Status:** researched and pipeline-proven 2026-11-19. The Muscle tab currently renders a procedural, physically
lit anatomy sculpt ([docs/MUSCLE-TAB.md](MUSCLE-TAB.md) §4b). This document answers the owner's next question:
how to get a **nicely looked** muscle-and-skeleton figure — from a ready-made anatomy database, an AI 3D
generation service, or an artist marketplace — and it proves the winning path end to end on this machine.

**Recommendation in one line:** use **BodyParts3D** (CC Attribution 4.0, real adult-male anatomy, one named mesh
per muscle and bone) as the figure, converted with the already-installed Blender into a named-node GLB that the
existing three.js viewer loads; keep the procedural sculpt as the fallback and the interaction rig unchanged.
**The figure is a muscle view, not a naked body:** the default build is muscles over the skeleton (an écorché
anatomy look); the skin mesh exists in the database and would be an optional translucent layer, never the default
surface.

---

## 1. What was compared

| Source | What it gives | License | Fits the app? | Verdict |
|---|---|---|---|---|
| **BodyParts3D / Anatomography** ([database](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html), [license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)) | Whole-body adult-male anatomy: 2,234 per-part OBJ meshes at 99 % polygon reduction, one file per atomic part, keyed by FMA concept ids; whole-body skin included | **CC BY 4.0** — attribution, redistribution and derivative works allowed (license page updated 2025-02-27; the 2013 OBJ headers still carry the legacy CC BY-SA 2.1 JP text — see §4) | Real anatomy, **per-part named meshes** → selection can raycast the actual muscle; downloaded and rendered here | **Recommended — proven** |
| **Z-Anatomy** ([site](https://www.z-anatomy.com/), [GitHub](https://github.com/Z-Anatomy/Models-of-human-anatomy)) | A free, richer Blender atlas (skeleton, muscles, nerves, organs in layers) built partly on BodyParts3D | GitHub license field is **"Other / NOASSERTION"** — must be verified before shipping any of its own additions | Excellent for authoring/posing in Blender; heavyweight for the web app | Secondary source; check its license per asset first |
| **AI image-to-3D services** — Tripo ([licensing](https://www.tripo3d.ai/blog/commercial-use-ai-3d-models)), Meshy ([compare](https://www.meshy.ai/compare/meshy-vs-rodin)), Hyper3D Rodin | Text/image → textured mesh in minutes | Free tiers are CC BY-style with attribution; paid tiers ($14–20/mo, Rodin ~$1.50/download) grant no-attribution commercial rights | Single **fused** mesh — no per-muscle nodes, so selection still needs overlay colliders; anatomy plausibility not guaranteed | Good for a decorative hero body, not for accurate muscle picking |
| **Local AI generation (Hunyuan3D)** via this harness's `codex-hunyuan-multiview-3d` MCP skill | Four-view image → repaired quad mesh → three LOD profiles incl. a browser GLB | Open source, run locally, commercial use allowed | The MCP servers are **not connected in this session**; run them in a session where they are, feeding renders of the current figures as references | Documented follow-up for a stylized upgrade |
| **Commercial anatomy SDKs** — BioDigital Human, Kenhub, Complete Anatomy ([3d4medical](https://3d4medical.com/)) | Best-in-class interactive anatomy, embedded SDKs | Proprietary subscriptions; no mesh downloads | Wrong shape for a private PoC | Out of scope |
| **Online-only viewers** — e.g. Merck Manuals' [muscular-system 3D model](https://www.merckmanuals.com/home/multimedia/3dmodel/muscular-system) | Interactive anatomy in the browser | View-only, no assets | Cannot be embedded legally or practically | Reference only |

## 2. The proven pipeline (ran on this machine, 2026-11-19)

Every step below actually ran; the artifacts live in `tmp/bp3d/` and the evidence in
[docs/design/muscle-anatomy-sample.png](design/muscle-anatomy-sample.png).

1. **Download the database** (no registration):
   - Parts catalog: `isa_parts_list_e.txt` (FMA id ↔ BP representation id ↔ English name, 2,906 rows)
   - Element mapping: `isa_element_parts.txt` (FMA id → OBJ file ids `FJ####`; an `M` suffix marks the mirrored left part)
   - Meshes: `isa_BP3D_4.0_obj_99.zip` (143 MB, 2,234 OBJ files at 99 % reduction)
     from <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip>
2. **Curate the parts** (`tmp/bp3d/build-region-map.mjs` → `tmp/bp3d/region-map.json`): every catalog region maps
   to its BP3D part ids (§3).
3. **Build the muscle view** (`tmp/bp3d/build-muscle-view.py`, Blender 5.2 headless): extract every curated
   muscle and bone — **170 parts, skin excluded by design** — and export one GLB with one named node per part,
   named `region__part__FJ` so the app can map nodes straight back to catalog regions. The body scale uses the
   constants measured from the full-body skin mesh (feet at y = 0, 1719.47 mm → 4.7 units), so the muscle view
   stays aligned with the interaction rig without shipping the skin. Materials: deep muscle red with a clearcoat
   écorché sheen, ivory bones. (`tmp/bp3d/anatomy-muscleview.glb`, 170 objects, 33 region groups, ~20 MB raw —
   the integration slice should decimate the rib/vertebrae detail or export bones at a lower profile.)
   An earlier proof build included the skin mesh and read as a naked body; the owner's direction fixed it:
   **muscles over bones is the product view** (`tmp/bp3d/build_anatomy_glb.py` remains as the with-skin variant).
4. **Render and verify in a real browser** (`tmp/anatomy-probe.html` + `tmp/serve-anatomy.mjs`, headless Chrome):
   the page reports from inside itself, and the muscle-view run reported:
   `meshes=170 · drawn=237,140 px · muscle-red≈88.6k px (5.5× the skin-covered build) · raycast torso=obliques__left-external-oblique-L@5.95`
   — the real muscles load, render under the app's light rig, and **raycast picking returns the anatomical
   muscle it hit**, not a skin. Screenshot captured to `docs/design/muscle-anatomy-sample.png`, verified by
   pixel analysis (12.6 % deep-red muscle + 11.6 % shaded muscle + 1 % ivory bone; no naked-skin tones).
   - **Capture-timing lesson (fixed in the fixture scripts):** headless Chrome's `--screenshot` fires at the
     load event, which can precede an async GLB load — the first capture was the empty viewer gradient. The fix
     is a long-poll load blocker: the page carries `<img src="/late.png">` from the start, and the server holds
     that response until the page reports that frames have presented (`stage=frames`); only then can the load
     event — and the capture — fire. `tmp/serve-anatomy.mjs` and `tmp/serve-3d-demo.mjs` both implement it;
     the muscle-tab demo screenshot was recaptured with the same mechanism.
   - Tooling note for the next slice: three r170's `GLTFLoader.js` also imports
     `../utils/BufferGeometryUtils.js`; vendor that file too (it is 32 KB, same MIT three.js release).

## 3. The curated mapping (region → BodyParts3D parts)

Full machine-readable table: `tmp/bp3d/region-map.json`. Highlights — per-side meshes exist for almost
everything, which is exactly what side-aware tagging needs:

| Region | BodyParts3D parts (OBJ ids) |
|---|---|
| neck | sternocleidomastoid FJ1595/FJ1573 · splenius capitis FJ1545(+M) |
| delts | zone of deltoid FJ1467/FJ1468/FJ1513 (+M) · supraspinatus beneath |
| rotator-cuff | supraspinatus FJ1506(+M) · infraspinatus FJ1500(+M) · subscapularis FJ1504(+M) · teres minor FJ1508(+M) |
| traps | zone + ascending/transverse/descending parts FJ1554/FJ1520/FJ1521(+M) |
| chest | pectoralis clavicular FJ1447(+M) · sternocostal FJ1464(+M) · abdominal part FJ1446(+M) |
| **lats** | **no BP3D part — keep the procedural overlay** (teres major FJ1507 + serratus cover the visual) |
| biceps | short head FJ1512(+M) · long head FJ1478(+M) |
| triceps | lateral FJ1477(+M) · medial FJ1480(+M) · long head FJ1479(+M) |
| forearms | brachioradialis FJ1487(+M) · flexor carpi radialis FJ1496(+M) · extensor carpi radialis FJ1490(+M) |
| abs | muscle of anterior abdominal wall FJ1452(+M) (obliques pair; **rectus abdominis absent**) |
| obliques | external oblique FJ1452(+M) |
| lower-back | longissimus thoracis FJ1535(+M) · iliocostalis lumborum/thoracis FJ1527/FJ1528(+M) · splenius cervicis FJ1546(+M) |
| glutes | maximus FJ1418(+M) · medius FJ1419(+M) · minimus FJ1420(+M) |
| hip-flexors | psoas major FJ1431(+M) · iliacus FJ1422(+M) |
| adductors | longus FJ1402(+M) · brevis FJ1401 · gracilis FJ1421(+M) · pectineus FJ1427(+M) |
| abductors | gluteus med/minimus + tensor fasciae latae FJ1438(+M) |
| quads | rectus femoris FJ1433(+M) · vastus lateralis FJ1442(+M) · medialis FJ1443(+M) · intermedius FJ1441(+M) |
| hamstrings | biceps femoris long FJ1395(+M) / short FJ1444(+M) · semitendinosus FJ1436(+M) · semimembranosus FJ1435(+M) |
| calves | gastrocnemius medial FJ1397(+M) / lateral FJ1394(+M) · soleus FJ1437(+M) |
| tibialis | tibialis anterior FJ1439(+M) |

Skeleton/body for the "muscle skeleton" look: skin FJ2810 · femur FJ3259 · tibia FJ3387/FJ3282 · humerus
FJ3368/FJ3262 · clavicle · scapula · sternum · patella · talus · calcaneus · radius · ulna · ribs (24 files) ·
thoracic/cervical/lumbar vertebrae (24 files) · sacrum FJ3393 · mandible FJ3289. **Fibula has no BP3D part** —
skip it or keep the procedural shin overlay.

## 4. Licensing and attribution (read before shipping)

- The operative license is **CC Attribution 4.0 International** (license page updated 2025-02-27):
  free access, redistribution and derivative works, with the required credit —
  *"BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International"*.
- The OBJ files themselves still embed the **2013 license header text** (CC BY-SA 2.1 JP). The database's own
  license page supersedes it, but the safest reading: carry the CC BY 4.0 attribution prominently (app about
  note / the Muscle tab's honest-notes card), and keep the upstream files unmodified in `tmp/bp3d/` for
  provenance. If the owner wants zero ambiguity, an email to the Database Center for Life Science settles it.
- Derivative GLBs (ours) are permitted; note that changes were made (CC BY 4.0 asks for this).
- Do not ship anything from Z-Anatomy without reading its per-asset license first (GitHub marks the repo
  license as "Other").

## 5. Integration plan (the next slice)

The rig already isolates overlays from the base body, so the swap is contained:

1. **Build the full figure GLB**: the muscle-view build is the product figure — 170 parts, skin excluded,
   objects named `region__part__FJ` (already produced as `tmp/bp3d/anatomy-muscleview.glb`). For the app,
   decimate the rib/vertebrae detail (or drop to bone-region aggregates) to bring it under ~8 MB, and export
   bones + muscles as separate named top-level groups. Vendor `GLTFLoader.js` + `utils/BufferGeometryUtils.js`
   beside the three builds.
2. **Load it in the viewer**: a fetch of `/static/anatomy-muscles.glb` via GLTFLoader replaces the procedural body
   group; keep the procedural build as the catch-path when the fetch or WebGL fails (the flat figure remains the
   ultimate fallback). Serve the GLB from a route like the vendored scripts.
3. **Layers: Muscles (default) / Skeleton / Body silhouette**: muscles over bones is the default product view;
   the skin mesh is an optional, semi-transparent silhouette layer (and raycast-through or off while hidden).
   Selection raycasts the visible layer's meshes and maps node → region via the `region__` name prefix — the
   probe already demonstrated a torso ray returning `obliques__left-external-oblique-L`, a real muscle node.
4. **Heat and state on real muscles**: per-region material tint from `sorenessFill`, selected = ember emissive,
   care-needed = red pulse — the same repaint logic, now driving `region:…` material sets instead of overlay
   groups. The procedural rig stays for regions with no BP3D part (lats, fibula) as thin overlays on the skin.
5. **Keep the tests honest**: assert the GLB's node groups cover every catalog region (parsing the GLB JSON
   chunk in a Node test, as `tmp/bp3d/inspect-glb.mjs` demonstrates), and keep the browser probe beacons as the
   fixture pipeline for screenshots.
6. **Review protocol ("nicely looked")**: the repo already has `tmp/vision-critique.mjs`, which sends design
   screenshots to a vision-capable lane (`llm-main-default`) with a structured five-section critique. Add the
   anatomy screenshot to its shot list with a description like *"the Muscle tab's 3D anatomy figure — real
   BodyParts3D muscles over the skeleton, warm studio lighting"* and require the critique's TOP-3 improvements
   to be addressed before calling the look finished. The session that builds the final model cannot view images
   itself; this pipeline is the owner's working quality bar.

## 6. Honest limits

- BodyParts3D is a **2013 adult-male dataset** at 99 % polygon reduction: accurate topology, moderate surface
  detail, no female model, no posing (anatomical position with slightly abducted arms). The lighting/material
  work carries the "nicely looked" part as much as the geometry.
- Gaps stay procedural: latissimus dorsi, the rectus-abdominis midline, fibula.
- A photoreal **poseable, textured** body (e.g., a generated or marketplace asset) remains compatible with this
  plan — as a base-body swap only; the BP3D muscles keep the interactive truth.
