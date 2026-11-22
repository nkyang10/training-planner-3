/**
 * Builds the curated catalog-region → BodyParts3D part mapping.
 *
 * Input: BodyParts3D's ISA element-parts list (tab-separated `fma \t name \t fj`), release 4.0.
 * Download: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html → `isa_BP3D_4.0_element_parts.txt`
 * Output: the committed `data/region-map.json`, which records which anatomy parts back each catalog region.
 *
 * Run: node tools/anatomy/build-region-map.mjs [element-parts.txt] [out.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(process.argv[2] ?? join(here, "input", "isa_BP3D_4.0_element_parts.txt"));
const outputPath = resolve(process.argv[3] ?? join(here, "data", "region-map.json"));

const elementParts = readFileSync(inputPath, "utf8").split(/\r?\n/);
const byFma = new Map();
for (const line of elementParts) {
  const [fma, name, fj] = line.split("\t");
  if (!fma || !fma.startsWith("FMA")) continue;
  if (!byFma.has(fma)) byFma.set(fma, { name, fjs: [] });
  byFma.get(fma).fjs.push(fj);
}

// Curated per catalog region: which BP3D parts to use, preferring per-side meshes.
// An empty list is a deliberate finding: BodyParts3D has no mesh for that region, so the app keeps its
// procedural overlay for it (lats and fibula are the two known cases).
const regions = [
  ["neck", ["FMA13408", "FMA13409", "FMA22653"]],
  ["delts", ["FMA34676", "FMA32544", "FMA32545"]],
  ["rotator-cuff", ["FMA32544", "FMA32545", "FMA32547", "FMA32548", "FMA13414", "FMA13415", "FMA32553", "FMA32554"]],
  ["traps", ["FMA32529", "FMA32555", "FMA32556", "FMA32557"]],
  ["chest", ["FMA34690", "FMA34691", "FMA79979", "FMA79980", "FMA34699", "FMA45874"]],
  ["lats", []],
  ["biceps", ["FMA37684", "FMA37685", "FMA37682", "FMA37683"]],
  ["triceps", ["FMA37694", "FMA37695", "FMA37692", "FMA37693"]],
  ["forearms", ["FMA38486", "FMA38487", "FMA38460", "FMA38461", "FMA38495", "FMA38496"]],
  ["abs", ["FMA20278"]],
  ["obliques", ["FMA13336", "FMA13337"]],
  ["lower-back", ["FMA22709", "FMA22702", "FMA22703", "FMA22653", "FMA22681"]],
  ["glutes", ["FMA22328", "FMA22329", "FMA22330", "FMA22331", "FMA22332", "FMA22333"]],
  ["hip-flexors", ["FMA22342", "FMA22343", "FMA22322", "FMA22323"]],
  ["adductors", ["FMA22456", "FMA22457", "FMA22452", "FMA22453", "FMA43883", "FMA43884", "FMA22450", "FMA22451"]],
  ["abductors", ["FMA22330", "FMA22331", "FMA22332", "FMA22333", "FMA22425", "FMA22426"]],
  ["quads", ["FMA38928", "FMA38929", "FMA38930", "FMA38931", "FMA22432", "FMA22433"]],
  ["hamstrings", ["FMA45888", "FMA45889", "FMA22358", "FMA22359", "FMA22448", "FMA22449", "FMA45890"]],
  ["calves", ["FMA45957", "FMA45958", "FMA45959", "FMA22558", "FMA22559"]],
  ["tibialis", ["FMA22544", "FMA22545"]],
];

const skeleton = [
  ["femur", ["FMA9611"]],
  ["tibia", ["FMA24477", "FMA24478"]],
  ["fibula", []],
  ["humerus", ["FMA23130", "FMA23131"]],
  ["clavicle", ["FMA13322", "FMA13323"]],
  ["scapula", ["FMA13395", "FMA13396"]],
  ["sternum", ["FMA7487", "FMA12215"]],
  ["patella", ["FMA24486", "FMA24487"]],
  ["talus", ["FMA24482", "FMA24483"]],
  ["calcaneus", ["FMA24497", "FMA24498"]],
  ["radius", ["FMA23464", "FMA23465"]],
  ["ulna", ["FMA23467"]],
  ["ribs", ["FMA7574"]],
  ["vertebrae", ["FMA9139", "FMA9915", "FMA9921"]],
  ["sacrum", ["FMA16202"]],
  ["mandible", ["FMA52748"]],
  ["skin", ["FMA7163"]],
];

const rows = [];
for (const [region, fmas] of [...regions, ...skeleton]) {
  const parts = fmas
    .map((fma) => {
      const entry = byFma.get(fma);
      if (entry === undefined) return null;
      return { fma, name: entry.name, fjs: entry.fjs };
    })
    .filter((part) => part !== null);
  const missing = fmas.filter((fma) => !byFma.has(fma));
  rows.push({ region, parts, missing, empty: fmas.length === 0 });
}
writeFileSync(outputPath, JSON.stringify(rows, null, 2));
for (const row of rows) {
  const summary = row.empty
    ? "NO BP3D PART (procedural overlay stays)"
    : row.parts.map((part) => `${part.name} ${part.fjs.join(",")}`).join(" · ");
  const missingNote = row.missing.length > 0 ? ` [missing: ${row.missing.join(", ")}]` : "";
  console.log(`${row.region}: ${summary}${missingNote}`);
}
