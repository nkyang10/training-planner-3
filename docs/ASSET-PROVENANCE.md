# Asset provenance
**Status:** current · **Owner:** legal/asset provenance · **Updated:** 2026-11-22 · **Supersedes:** docs/MUSCLE-ANATOMY-3D-RESEARCH.md

Milebook ships twelve asset files, all under `src/vendor/`, and nothing else: no CDN fetches, no npm-installed three.js, no stock photography, no web font. This page is the durable record of what each file is, which licence governs it, and whether the running product must show the credit — the PoC-era notes that used to carry those facts are being deleted. Citations name a file plus a symbol, never a line, because these files outlive line numbers.

## 1. Inventory
Measured on disk 2026-11-22. Twelve files, 12,355,110 bytes (11.78 MiB); the anatomy GLB alone is 91 % of that.

| File | Size | What it is | Where it is used (symbol) | Licence | Must the credit be visible to end users? |
|---|---:|---|---|---|---|
| `src/vendor/three.module.min.js` | 691,654 B (675 KiB) | three.js **r170** ES module build, minified | `THREE_MODULE`, served at `/static/three.module.js` and mapped to the bare `three` specifier `(src/web.ts · THREE_MODULE)`, `(src/muscle-viewer.ts · renderMuscleViewerScript)` | MIT | No — the notice is a comment inside the file, never rendered |
| `src/vendor/OrbitControls.js` | 33,657 B (33 KiB) | r170 orbit/zoom/pan addon | `ORBIT_CONTROLS_MODULE` → `/static/orbit-controls.js` `(src/web.ts · ORBIT_CONTROLS_MODULE)` | MIT | No — the file carries no header of its own |
| `src/vendor/GLTFLoader.js` | 114,999 B (112 KiB) | r170 glTF 2.0 loader addon, one hand-edited import | `GLTF_LOADER_MODULE` → `/static/gltf-loader.js`, imported by `buildAnatomy` `(src/web.ts · GLTF_LOADER_MODULE)`, `(src/muscle-viewer.ts · buildAnatomy)` | MIT | No |
| `src/vendor/BufferGeometryUtils.js` | 33,141 B (32 KiB) | r170 addon, used only for `toTrianglesDrawMode` | `BUFFER_GEOMETRY_UTILS_MODULE` → `/static/utils/BufferGeometryUtils.js` `(src/web.ts · BUFFER_GEOMETRY_UTILS_MODULE)` | MIT | No |
| `src/vendor/anatomy-muscles.glb` | 11,271,460 B (10.75 MiB) | BodyParts3D release 4.0 muscles over bones, decimated: glTF 2.0, 187 nodes / 186 meshes / 20 materials, no textures | `ANATOMY_MUSCLES_GLB` → `/static/anatomy-muscles.glb`, traversed by `buildAnatomy` `(src/web.ts · ANATOMY_MUSCLES_GLB)`, `(src/muscle-viewer.ts · buildAnatomy)` | **CC BY 4.0** | **Yes — and it is not shown today (§3)** |
| `src/vendor/THREE-LICENSE.txt` | 1,693 B (1.7 KiB) | the provenance record itself: three.js terms, the BodyParts3D credit, the build note | read by `test/muscle-anatomy.test.ts`; **not routed**, so no URL serves it `(src/web.ts · sendAsset)` | repo file | No — it is a repo file, not a product surface |
| `src/vendor/calendar/calendar-empty.webp` | 22,914 B (22 KiB), 640×480, alpha | ComfyUI paper + Blender blank-month cut-out | `CALENDAR_EMPTY_WEBP` → `/static/calendar-empty.webp`; the today strip's decorative spot `(src/web.ts · CALENDAR_EMPTY_WEBP)` | project (§4) | No requirement |
| `src/vendor/calendar/calendar-wash.webp` | 26,516 B (26 KiB), 1200×600 | ComfyUI paper field, used at 10-16 % opacity | `CALENDAR_WASH_WEBP` → `/static/calendar-wash.webp` `(src/web.ts · CALENDAR_WASH_WEBP)`, `(src/styles.ts · .calendar-card.is-empty::before)` | project | No requirement |
| `src/vendor/calendar/coach-token.webp` | 3,992 B (3.9 KiB), 128×128, alpha | Blender coin, the coach's avatar | `COACH_TOKEN_WEBP` → `/static/coach-token.webp`, `.coach-avatar` `(src/web.ts · COACH_TOKEN_WEBP)` | project | No requirement |
| `src/vendor/signin/auth-hero.webp` | 83,966 B (82 KiB), 1024×1280 | ComfyUI Flux2 dawn-track plate | `AUTH_HERO_WEBP` → `/static/auth-hero.webp`, `.auth-story-bg` `(src/web.ts · AUTH_HERO_WEBP)` | project | No requirement |
| `src/vendor/signin/calendar-object.webp` | 63,248 B (62 KiB), 1200×899, alpha | Blender Cycles calendar sculpture | `AUTH_OBJECT_WEBP` → `/static/calendar-object.webp`, `.auth-object` `(src/web.ts · AUTH_OBJECT_WEBP)` | project | No requirement |
| `src/vendor/signin/paper-grain.webp` | 7,870 B (7.7 KiB), 128×128, alpha | deterministic Pillow noise tile | `AUTH_GRAIN_WEBP` → `/static/paper-grain.webp`, `.auth-panel::before` `(src/web.ts · AUTH_GRAIN_WEBP)`, `(src/styles.ts · .auth-panel::before)` | project | No requirement |

Every route above is one branch of the same `/static/*` chain, so a file that is not in the table is not served `(src/web.ts · sendAsset)`. The six WebP files are asserted by name in one test `(test/web.test.ts · serves the auth and calendar art as cacheable WebP)`. The root `LICENSE` and `THIRD-PARTY-NOTICES.md` are records rather than shipped assets, so they are not rows here (§5); `THREE-LICENSE.txt` is a row because it sits beside the code it licenses.

## 2. three.js and its addons

**Version actually vendored: r170** (`three@0.170.0`). Verified from three independent facts, not from memory: the file header reads `Copyright 2010-2024 Three.js Authors` / `SPDX-License-Identifier: MIT`, the minified build defines the revision as `const t="170"` and exports it as `REVISION` `(src/vendor/three.module.min.js)`, and `THREE-LICENSE.txt` records the four jsdelivr URLs at tag `0.170.0` `(src/vendor/THREE-LICENSE.txt)`. The addons carry no version string of their own; they came from the same tag, and the loader's import of `toTrianglesDrawMode` from `BufferGeometryUtils` matches that release.

**Licence: MIT** — use, copy, modify, merge, publish, distribute, sublicense and sell are permitted, conditioned on the copyright notice and permission notice travelling with copies or substantial portions; no warranty. A browser copy of the served JS is a copy, so the notice obligation is real even though nothing is "installed".

| File | Upstream | Local edit | Inline header |
|---|---|---|---|
| `src/vendor/three.module.min.js` | `three@0.170.0/build/three.module.min.js` | none | yes, `@license` block |
| `src/vendor/OrbitControls.js` | `three@0.170.0/examples/jsm/controls/OrbitControls.js` | none | no |
| `src/vendor/GLTFLoader.js` | `three@0.170.0/examples/jsm/loaders/GLTFLoader.js` | **one import path** | no |
| `src/vendor/BufferGeometryUtils.js` | `three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js` | none | no |

**The hand edit.** `GLTFLoader.js` imports `toTrianglesDrawMode` from `./utils/BufferGeometryUtils.js`; upstream writes `../utils/BufferGeometryUtils.js` `(src/vendor/GLTFLoader.js · toTrianglesDrawMode)`. The app serves the loader at `/static/gltf-loader.js` and the util at `/static/utils/BufferGeometryUtils.js`, so the relative path must be `./utils/…` — `../utils/…` resolves above the static root and 404s. This is the only edit to any vendored file: `OrbitControls.js` and `BufferGeometryUtils.js` need none, because their only non-relative import is the bare `three` specifier, which the import map satisfies `(src/muscle-viewer.ts · renderMuscleViewerScript)`. The bare `three` specifier is left untouched in `GLTFLoader.js` for the same reason.

**Re-vendor procedure.**
1. Choose an exact tag (`three@0.170.0` today) and fetch the four files from that tag, never from a branch.
2. Overwrite the four files; re-apply the single `./utils/BufferGeometryUtils.js` edit in `GLTFLoader.js`.
3. Update `src/vendor/THREE-LICENSE.txt`: version, upstream URLs, the edit note, the served `/static/` paths.
4. Regenerate the checksum manifest (§2.1); never hand-edit a hash.
5. Run `pnpm check`; the anatomy test asserts the GLB and the attribution strings, the web test asserts the six WebP routes.
6. Load `/muscle` and confirm `data-viewer-ready` fires — the loader path is what breaks first.

### 2.1 Checksum idea for CI
A dependency-free `tools/asset-checksums.mjs` writes `tools/asset-checksums.json` (path → sha256 → bytes) for every file under `src/vendor/`; one Vitest case recomputes and compares. CI already runs `pnpm check` `(.github/workflows/ci.yml)`, so the check costs no new workflow step. It matters because nobody reviews an 11 MB binary or a minified bundle in a diff: a hash row is the cheapest proof that the committed file is the upstream build plus the one documented edit.

Baseline as vendored 2026-11-22 (full values; regenerate, do not paste by hand):

```
8e71269b773b81802e7f5f71d8528f1e0c29a82c55f0609845b528389aed8439  src/vendor/three.module.min.js
00021f896fee7accad035ada2b72abd9e12f21de349896576e8fd75d9542989e  src/vendor/OrbitControls.js
957a1392eff52523f32c977db0b422d0a2589c78653f002bb669af9669e1b3c7  src/vendor/GLTFLoader.js
5beb9dc7e9248a32f7b5e8cc0dd5fd4054d227d8e19a3a98b4715f6d2784c4ef  src/vendor/BufferGeometryUtils.js
8ca7b1af7a43f24daf716be671ed29b458ad8618d73403324c100faceaa84a7c  src/vendor/anatomy-muscles.glb
```

## 3. BodyParts3D anatomy meshes

**Source.** BodyParts3D release 4.0 (Database Center for Life Science, Japan), downloaded without registration as `isa_BP3D_4.0_obj_99.zip` (143 MB, 2,234 per-part OBJ files at 99 % polygon reduction) with `isa_parts_list_e.txt` (2,906 rows) and `isa_element_parts.txt` (FMA id → `FJ####` file ids). One named mesh per atomic part is the reason picking can return the real muscle instead of a silhouette.

**Licence: CC BY 4.0.** Redistribution and derivative works are allowed with credit, a licence link, an indication of changes, and no implied endorsement. Caveat worth carrying forward: the OBJ files' own 2013 headers still embed CC BY-SA 2.1 JP text, while the database's licence page (updated 2025-02-27) states CC BY 4.0 and supersedes it; the conservative reading is a prominent CC BY 4.0 credit plus a changes note. Do not ship anything from Z-Anatomy without reading its per-asset licence first — its repository reports "Other / NOASSERTION".

**Required attribution string**, verbatim as the repo records it (ASCII `(c)`, not `©`):

```
BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International
```

**Where the credit lives today — repo files and code comments only:**
- `src/vendor/THREE-LICENSE.txt` carries the string in the ASCII `(c)` form, with the source URL and the build note `(src/vendor/THREE-LICENSE.txt)`.
- `THIRD-PARTY-NOTICES.md` at the repo root repeats the same credit with `©`, plus the licence URL and a "changes made" line `(THIRD-PARTY-NOTICES.md)`.
- Code comments repeat it beside the asset `(src/web.ts · ANATOMY_MUSCLES_GLB)`, `(src/muscle-viewer.ts · buildAnatomy)`.
- A test asserts the string stays in the vendor licence file `(test/muscle-anatomy.test.ts · records the required BodyParts3D attribution beside the asset)`.
- `README.md` and `MUSCLE-DOMAIN.md` repeat it in prose.

The two repo copies differ only in the copyright glyph — `(c)` in `THREE-LICENSE.txt`, `©` in the notices file — and the test pins the ASCII form, so an edit that changes either one is a licence edit, not a typo fix.

**It is visible to end users now.** `/credits` is a public, server-rendered page that prints both required strings verbatim, names the source database, states the changes made and points at `THIRD-PARTY-NOTICES.md` `(src/web.ts · renderCredits)`. Every footer links it, including the sign-in page, so the credit is reachable before an account exists `(src/web.ts · renderFooter)`; `test/web.test.ts` fetches the page and asserts both strings, so a refactor cannot drop the credit silently.

**What shipped.**
1. A public `/credits` page, no JavaScript, both locales: the three.js MIT line and the BodyParts3D CC BY line verbatim, the source URL, the changes made, and a pointer to the notices file `(src/web.ts · renderCredits)`.
2. A footer link on every page, sign-in included, so the attribution does not require an account `(src/web.ts · renderFooter)`.
3. A test that fetches `/credits` without a session and asserts both strings `(test/web.test.ts)`; it fails if either credit line is edited away.
4. The credit lines are deliberately not translated: an attribution that changes with the interface language is no longer an attribution. Only the labels around them are localized `(src/i18n.ts · credits.heading)`.

**Blender → GLB pipeline.** The scripts and the curated mapping are committed under `tools/anatomy/`: `build-region-map.mjs` (FMA → catalog region), `extract-muscle-view.mjs` (region map → extraction manifest), `materialize-muscle-view.mjs` (manifest names → OBJ files), `build-muscle-view.py` (Blender: decimate, one `RegionMuscle-<region>` material per region, bones under `AnatomyBone`, 4.7-unit scale, export GLB), `build-anatomy-probe.py` (the exploratory probe build) and `inspect-glb.mjs` (node/material assertions). `data/region-map.json` and `data/muscleview-manifest.json` ship with them, so the curation is reviewable and the generators reproduce it byte-for-byte. A rebuild still needs Blender 5.2 with the Khronos glTF exporter — the shipped file's `asset.generator` reads `Khronos glTF Blender I/O v5.2.41` `(src/vendor/anatomy-muscles.glb)` — and the BodyParts3D 4.0 mesh download, which is not redistributed here; `tools/anatomy/README.md` records every step and that boundary.

The shipped file is a muscle view by design: skin excluded, 186 parts of 2,234, 19 `RegionMuscle-*` materials plus one `AnatomyBone`, no images or textures embedded, and no mesh for the lats (the catalog keeps the procedural overlay for it) `(src/muscle-viewer.ts · buildAnatomy)`.

## 4. Generated art

Six images, all original to this project, all made locally, and released under the project licence (§5) — the same proprietary terms as the code, with no separate grant and no third-party credit owed.

| File | Made with | What it is |
|---|---|---|
| `src/vendor/calendar/calendar-empty.webp` | ComfyUI Flux2 dev fp8 paper (1024²) + Blender 5.3 Cycles/OptiX blank-month render (1024², transparent), composited in Pillow | a 640×480 cut-out of a month-agnostic calendar slab: grid, weekday initials, one ember route, no month name and no day numbers |
| `src/vendor/calendar/calendar-wash.webp` | ComfyUI Flux2 wide paper (1536×768), plain field cropped | a quiet 1200×600 paper field for the empty month card and the today strip |
| `src/vendor/calendar/coach-token.webp` | Blender 5.3 Cycles/OptiX coin (512², transparent film) | the 128×128 coach avatar in the panel header |
| `src/vendor/signin/auth-hero.webp` | ComfyUI 0.45.6, Flux2 dev fp8 + `mistral_3_small_flux2` encoder + `flux2-vae`, seed 20261122 | the 1024×1280 dawn-track plate behind the sign-in story |
| `src/vendor/signin/calendar-object.webp` | Blender 5.3 Cycles/OptiX, 1600×2000, 128 samples, transparent film, denoised | the calendar sculpture on the sign-in page, alpha preserved at 1200×899 |
| `src/vendor/signin/paper-grain.webp` | deterministic Pillow noise, seed 20261122 | the 128×128 grain tile multiplied behind the form panel |

No stock image, marketplace asset or remote generation service is involved, and none of the tooling is redistributed: the repo contains renders only, never ComfyUI, Blender or model weights. No attribution obligation for that tooling is recorded anywhere in the repo; if the Flux2 weights' terms reach their outputs, that has not been written down — treat it as an open question for legal, not as a settled fact.

All six are decorative: empty `alt`, `aria-hidden` parents, hidden in forced colours, so none of them needs a credits surface `(src/styles.ts · @media (forced-colors: active))`. Art must never be the only carrier of state.

## 5. Licence posture of the repo

**Proprietary, all rights reserved.** A root `LICENSE` file exists as of 2026-11-22; before that date there was none, and plain default copyright applied. It is titled "MILEBOOK — PROPRIETARY SOFTWARE LICENCE", copyright "2026 the Milebook authors. All rights reserved.", grants nothing except by separate written agreement, and its clause 3 keeps third-party components under their own licences `(LICENSE)`. `package.json` declares `"private": true` and `"license": "SEE LICENSE IN LICENSE"` `(package.json)`, and `README.md` points at both files. The posture did not change when the file landed: no grant to copy, modify or distribute, now written down instead of implied.

**How third-party terms compose.** The MIT grant on the four three.js files and the CC BY 4.0 grant on the GLB are independent of the project's own terms. A proprietary project licence narrows nothing those grants already gave, and editing `LICENSE` later cannot relicense vendored files — clause 3 says exactly that. In practice the app ships its assets under its own terms *plus* the upstream obligations: MIT notice retained, CC BY credit shown, changes indicated.

**`THIRD-PARTY-NOTICES.md` at the repo root** exists as of 2026-11-22 and is the release-visible half of this record: the MIT text with "Copyright (c) 2010-2024 Three.js Authors", the four vendored files with served paths, origin and the one local edit, the BodyParts3D credit with source URL, CC BY URL and the changes made, and a fonts/icons/artwork statement. It must keep containing:
1. The full MIT text, the copyright line, the four file names, the version (r170) and the upstream URLs.
2. The BodyParts3D credit, the licence name and URL, the source URL, and the changes: 186 of 2,234 parts, decimation, skin removed, renamed nodes and materials, glTF 2.0 conversion.
3. The single local edit to `GLTFLoader.js`, so a reader can diff against upstream.
4. A statement that the six images are original project assets under the repo's terms.
5. A statement that no fonts, icon sets or stock imagery are included.
6. No endorsement implication and no warranty from the upstream authors.

The file existing is not the same as satisfying the duty, and as of 1.1.0 the duty is met by `/credits` rather than by the file: the page carries both notices in HTML, and the repo file keeps the full text. `pnpm check` also runs `node tools/docs-check.mjs` `(package.json)`, which rejects GBK round-trip markers and stray double question marks in prose and requires the status header on every reference page, so a notices file damaged by a bad edit fails the gate instead of shipping quietly.

## 6. Release checklist for assets

| Check | State today | Gate |
|---|---|---|
| CC BY 4.0 attribution surface | **present** - `/credits` prints the string verbatim and every footer links it `(src/web.ts · renderCredits)` | `test/web.test.ts` asserts both credit strings |
| `THIRD-PARTY-NOTICES.md` at root | present 2026-11-22; `/credits` states the licence, the source and the changes, and the file keeps the full text | linked from `/credits` |
| Licence text reachable at a URL | **partial** - `/credits` renders both notices as HTML, but the raw licence files are still not routed | serve `/static/THREE-LICENSE.txt` when convenient; not a blocker |
| Asset weight | 11.27 MB GLB is 91 % of the 11.78 MiB vendor tree, served uncompressed (it is a compressed container; text assets are gzipped on the wire, binary ones are not); parse measured ~0.3 s in a browser | accepted; PR-35 covers compression |
| LFS decision | `.gitattributes` exists (line-ending normalization only), so the GLB is a plain git blob | decide before the next tag ([RELEASE.md](RELEASE.md)); converting later rewrites history |
| Checksums | no manifest, no drift test | add `tools/asset-checksums.json` + the test (§2.1), or PR-30's fixed-artifact record |
| No unlicensed fonts or icons | system stacks only (`--font`, `--auth-font`, `--auth-display`), inline SVG, emoji glyphs; no `@font-face`, no CDN `(src/styles.ts)` | pass |
| No remote asset URLs at runtime | none — every image and the GLB are same-origin reads `(src/web.ts · sendAsset)` | pass |
| Cache headers | art `max-age=86400`, GLB `max-age=3600`, three.js modules `no-cache` | keep; a re-vendor must not hide behind a cached copy |
| Deploy gate | `tools/deploy.ps1` validates the stylesheet, not the assets | add an asset-route assertion before the next release |

## 7. Rules that must not regress

1. **The credit stays.** `THREE-LICENSE.txt` keeps the BodyParts3D string verbatim and `test/muscle-anatomy.test.ts` keeps asserting it; once the credits surface exists, nothing may remove it.
2. **Licence files stay with the code they cover.** The four three.js files never leave `src/vendor/` without `THREE-LICENSE.txt`, and the CC BY record never travels without the GLB.
3. **No asset without a provenance row.** A new file under `src/vendor/` needs a row here — size, symbol, licence, credit visibility — before merge.
4. **The only edit to a vendored file is the documented `GLTFLoader.js` import rewrite.** Any other edit must be recorded in `THREE-LICENSE.txt` and here, or the checksum stops meaning anything.
5. **The GLB is reproducible from the pipeline, not from a clean clone.** The scripts and the curated mapping are committed under `tools/anatomy/`; a rebuild additionally needs the BodyParts3D 4.0 download, which is not in the repository. Never describe the asset as reproducible from the repo alone.
6. **Project terms never override upstream terms.** The MIT notice and the CC BY credit survive every revision of `LICENSE`, whose clause 3 says so.

## Related documents

| Document | What it answers |
|---|---|
| [MUSCLE-DOMAIN.md](MUSCLE-DOMAIN.md) | The region materials, node naming and viewer that consume the GLB |
| [UI-GRAMMAR.md](UI-GRAMMAR.md) | Where a credits/about surface belongs and how it is worded |
| [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) | Which of these gaps block a release, and in what order |
| [RELEASE.md](RELEASE.md) | The release procedure this checklist feeds |
