/**
 * Builds the extraction manifest for the muscle view as an array of [region, name, fj].
 *
 * Several regions share one BodyParts3D part (abs and obliques share the anterior-abdominal-wall mesh; delts and
 * rotator-cuff share the supraspinatus; abductors and glutes share the medius/minimus; lower-back, traps and neck
 * share splenius), so a by-FJ map would silently drop regions. The skin is deliberately excluded: this build shows
 * muscles over the skeleton, not a naked body.
 *
 * Run after build-region-map.mjs.
 * Run: node tools/anatomy/extract-muscle-view.mjs [region-map.json] [out-manifest.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const regionMapPath = resolve(process.argv[2] ?? join(here, "data", "region-map.json"));
const manifestPath = resolve(process.argv[3] ?? join(here, "data", "muscleview-manifest.json"));

const rows = JSON.parse(readFileSync(regionMapPath, "utf8"));
const entries = [];
const seen = new Set();
for (const row of rows) {
  if (row.region === "skin") continue;
  for (const part of row.parts) {
    for (const fj of part.fjs) {
      const side = fj.endsWith("M") ? "-L" : "";
      const clean = fj.replace(/M$/, "");
      const name = `${row.region}__${part.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}${side}__${clean}`;
      const key = `${row.region}|${fj}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push([row.region, name, fj]);
    }
  }
}
writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
console.log("manifest entries:", entries.length, "unique FJ files:", new Set(entries.map((entry) => entry[2])).size);
