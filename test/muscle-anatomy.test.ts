import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MUSCLE_CATALOG } from "../src/muscles";

interface GltfJson {
  materials?: Array<{ name?: string }>;
  nodes?: Array<{ name?: string; mesh?: number }>;
  meshes?: Array<{ name?: string }>;
}

function readGlbJsonChunk(path: string): GltfJson {
  const buffer = readFileSync(path);
  const magic = buffer.readUInt32LE(0);
  expect(magic).toBe(0x46546c67); // "glTF"
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")) as GltfJson;
}

describe("the vendored anatomy asset", () => {
  const json = readGlbJsonChunk("src/vendor/anatomy-muscles.glb");
  const muscleRegions = (json.materials ?? [])
    .map((material) => material.name ?? "")
    .filter((name) => name.startsWith("RegionMuscle-"))
    .map((name) => name.slice("RegionMuscle-".length));
  const nodeRegions = (json.nodes ?? [])
    .map((node) => (node.name ?? "").split("__")[0] ?? "")
    .filter((name) => name.length > 0);

  it("ships a material per catalog muscle region, lats excepted (no BP3D part exists)", () => {
    const expected = MUSCLE_CATALOG.map((muscle) => muscle.id).filter((id) => id !== "lats");
    for (const id of expected) expect(muscleRegions, id).toContain(id);
    expect(muscleRegions).not.toContain("lats");
  });

  it("names every mesh by region so picking maps straight back to the catalog", () => {
    for (const id of muscleRegions) {
      if (id === undefined) continue;
      const nodes = nodeRegions.filter((region) => region === id);
      expect(nodes.length, id).toBeGreaterThan(0);
    }
    // The skeleton travels with the muscles: bones are visible but unpickable by material name.
    const bones = ["femur", "tibia", "ribs", "vertebrae", "mandible", "sacrum"];
    for (const bone of bones) expect(nodeRegions, bone).toContain(bone);
  });

  it("records the required BodyParts3D attribution beside the asset", () => {
    const license = readFileSync("src/vendor/THREE-LICENSE.txt", "utf8");
    expect(license).toContain("BodyParts3D");
    expect(license).toContain("CC Attribution 4.0 International");
    expect(license).toContain("anatomy-muscles.glb");
  });
});
