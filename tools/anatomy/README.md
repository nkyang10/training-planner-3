# Anatomy pipeline

How `src/vendor/anatomy-muscles.glb` — the 3D muscle figure on the Muscles tab — is produced, and how to rebuild it.

Everything that encodes a **decision** is in this directory: the curated region mapping, the extraction manifest and
the build scripts. The BodyParts3D source meshes are not in the repository (they are a separate 4.0 release download),
so a rebuild starts with a download, not a clean clone. That boundary is deliberate and stated below.

## Licence

The output is a derivative work of **BodyParts3D, release 4.0**, © The Database Center for Life Science, licensed under
**CC Attribution 4.0 International** (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html>).

The attribution string the licence requires is baked into both Blender scripts (`LICENSE_NOTE`) and repeated in
[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md). It must stay visible to end users — see
[ASSET-PROVENANCE.md](../../docs/ASSET-PROVENANCE.md).

## What is committed here

| Path | What it is |
|---|---|
| `data/region-map.json` | Curated mapping: catalog region → BodyParts3D FMA ids → the FJ meshes for each id. This is the human decision in the pipeline. |
| `data/muscleview-manifest.json` | Extraction manifest: 180 `[region, objectName, FJ]` entries (170 unique FJ files). Regions that share one BP3D mesh each get their own entry. |
| `build-region-map.mjs` | Regenerates `region-map.json` from BodyParts3D's ISA element-parts list. |
| `extract-muscle-view.mjs` | Regenerates `muscleview-manifest.json` from `region-map.json`. |
| `materialize-muscle-view.mjs` | Copies the extracted OBJ files to the manifest's names, which is what Blender imports. |
| `build-muscle-view.py` | Blender build of the shipped GLB: region materials, decimation, 4.7-unit scale, y-up. |
| `build-anatomy-probe.py` | Blender build of the exploratory probe GLB (skin + muscles + bones, no region grouping). Not served by the app. |
| `inspect-glb.mjs` | Prints a GLB's node tree, transforms and material names; used to verify a rebuild. |

## What is not committed

| Input | Why | Where it comes from |
|---|---|---|
| BodyParts3D 4.0 meshes | A separate ~100 MB release download; not redistributable as part of this repository | BodyParts3D download page |
| `isa_BP3D_4.0_element_parts.txt` | Only needed to *regenerate* the mapping; the mapping itself is committed | Same download |
| Extracted OBJ working directories | Intermediates (tens of MB) that the scripts recreate | Produced by the extraction steps |

## Rebuild

1. **Download** BodyParts3D 4.0 and unpack the OBJ meshes. Keep the ISA element-parts list for step 2.
2. **Regenerate the mapping** (only if the curation changed — the committed copy is authoritative):
   ```powershell
   node tools/anatomy/build-region-map.mjs <isa_BP3D_4.0_element_parts.txt> tools/anatomy/data/region-map.json
   ```
3. **Regenerate the manifest:**
   ```powershell
   node tools/anatomy/extract-muscle-view.mjs tools/anatomy/data/region-map.json tools/anatomy/data/muscleview-manifest.json
   ```
4. **Extract the FJ meshes** for the manifest into a working directory (the per-part OBJ files named `*__FJ####.obj`),
   then materialize the manifest names in that directory:
   ```powershell
   node tools/anatomy/materialize-muscle-view.mjs <working-obj-dir> tools/anatomy/data/muscleview-manifest.json
   ```
   The script exits non-zero and prints `region:FJ` for anything it could not resolve — a non-empty list means the
   download is incomplete, not that the mapping is wrong.
5. **Build the shipped GLB** (Blender 5.2):
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/anatomy/build-muscle-view.py `
       -- --parts <working-obj-dir> --out src/vendor/anatomy-muscles.glb
   ```
6. **Verify** the result against the shipped asset:
   ```powershell
   node tools/anatomy/inspect-glb.mjs src/vendor/anatomy-muscles.glb
   ```
   Expect glTF 2.0, ~187 nodes, ~186 meshes, 20 materials (19 `RegionMuscle-*` plus `AnatomyBone`), no images or
   textures. A different material count means the region mapping changed; a different node count means the extraction
   was incomplete.

## Known limits of the asset

- **Lats and fibula have no BodyParts3D mesh.** Their catalog rows are deliberately empty, so the app paints them only
  in the procedural fallback. Do not "fix" this by borrowing another region's mesh.
- **The mesh is decimated, not anatomically exact.** Muscles at 0.45, ribs/vertebrae at 0.30, sacrum/mandible at 0.40.
  The figure is a map of regions, not a study model.
- **The build is deterministic given the same inputs**, but Blender's exporter version is part of the result: record the
  Blender version when you rebuild, and prefer replacing the asset only with a verified `inspect-glb.mjs` output.
