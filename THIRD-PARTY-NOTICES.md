# Third-party notices

Milebook is proprietary software (see [LICENSE](LICENSE)). It ships the third-party components below. Those
components remain under their own licences; the notices here are the ones their licences require and the ones a
recipient of the application must be able to read.

Machine-readable provenance for every asset (size, source, use, licence, attribution duty) lives in
[docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md).

---

## three.js r170 (MIT)

Vendored builds, committed under `src/vendor/` and served by the app as static scripts:

| File | Served at | Origin |
|---|---|---|
| `src/vendor/three.module.min.js` | `/static/three.module.js` | `three@0.170.0/build/three.module.min.js` |
| `src/vendor/OrbitControls.js` | `/static/orbit-controls.js` | `three@0.170.0/examples/jsm/controls/OrbitControls.js` |
| `src/vendor/GLTFLoader.js` | `/static/gltf-loader.js` | `three@0.170.0/examples/jsm/loaders/GLTFLoader.js` (one local edit: the `../utils/BufferGeometryUtils.js` import path was rewritten to `./utils/BufferGeometryUtils.js` so it resolves under `/static/`) |
| `src/vendor/BufferGeometryUtils.js` | `/static/utils/BufferGeometryUtils.js` | `three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js` |

Licence text and the vendoring record: [`src/vendor/THREE-LICENSE.txt`](src/vendor/THREE-LICENSE.txt).

```
MIT License

Copyright (c) 2010-2024 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## BodyParts3D (CC Attribution 4.0 International)

`src/vendor/anatomy-muscles.glb` — the interactive 3D muscle figure on the Muscles tab — is a derivative work built
from the BodyParts3D per-part OBJ meshes (release 4.0), decimated and merged into a single glTF binary.

- Source: BodyParts3D, © The Database Center for Life Science — <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html>
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0) — <https://creativecommons.org/licenses/by/4.0/>
- Changes made: skin excluded (muscles over bones), per-part meshes decimated, merged into one GLB, and grouped
  into one `RegionMuscle-<region>` material per catalog region. No anatomy was added or reinterpreted.
- Required attribution string:

  > BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

**Attribution duty.** CC BY 4.0 requires that end users can find this attribution. Today it exists only in the
repository and in code comments — the running application does not serve it. Shipping the Muscles tab without an
in-app credits surface is a licence defect; the fix is tracked in
[docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md).

**Reproducibility gap.** The Blender conversion scripts that produced the GLB are not in the repository (the old
notes point at a gitignored `tmp/bp3d` directory), so the asset cannot currently be rebuilt from source. Either commit
the conversion script under `tools/` or record the GLB checksum and treat it as a fixed artifact.

## Fonts, icons and artwork

No third-party fonts, icon sets or stock imagery are bundled. All illustration and generated art in
`src/vendor/calendar/`, `src/vendor/signin/` and the UI is original to this project and released under the project
licence.
