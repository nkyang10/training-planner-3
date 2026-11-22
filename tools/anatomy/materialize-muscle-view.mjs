/**
 * Materializes the muscle-view manifest on disk: for each entry, copies the matching BodyParts3D OBJ file to the
 * manifest's file name, which is what the Blender build imports.
 *
 * Mirrored-left ("M") files already exist on disk under M-stripped names from the first extraction, so an M entry
 * falls back to the clean-FJ file that carries the "-L" stem.
 *
 * Run: node tools/anatomy/materialize-muscle-view.mjs <extracted-obj-dir> [manifest.json]
 */
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targetDir = process.argv[2];
if (targetDir === undefined) {
  console.error("usage: node tools/anatomy/materialize-muscle-view.mjs <extracted-obj-dir> [manifest.json]");
  process.exit(2);
}
const dir = resolve(targetDir);
const manifestPath = resolve(process.argv[3] ?? join(here, "data", "muscleview-manifest.json"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = readdirSync(dir).filter((name) => name.endsWith(".obj"));

let copied = 0;
let present = 0;
const missing = [];
for (const [region, name, fj] of manifest) {
  const dest = join(dir, `${name}.obj`);
  if (existsSync(dest)) {
    present += 1;
    continue;
  }
  const exact = files.find((file) => file.endsWith(`__${fj}.obj`));
  if (exact !== undefined) {
    copyFileSync(join(dir, exact), dest);
    copied += 1;
    continue;
  }
  if (fj.endsWith("M")) {
    const clean = fj.slice(0, -1);
    const mirrored = files.find((file) => file.endsWith(`__${clean}.obj`) && file.includes("-L"));
    if (mirrored !== undefined) {
      copyFileSync(join(dir, mirrored), dest);
      copied += 1;
      continue;
    }
  }
  missing.push(`${region}:${fj}`);
}
console.log(`present: ${present}, copied: ${copied}, missing: ${missing.length}`);
if (missing.length > 0) console.log(missing.join(", "));
if (missing.length > 0) process.exit(1);
