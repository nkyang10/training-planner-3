import { describe, expect, it } from "vitest";

import { MUSCLE_CATALOG } from "../src/muscles";
import { MUSCLE_RIG, RIG_BODY, RIG_BOUNDS, type RigShape } from "../src/muscle-rig";

/**
 * The rig is pure data that the 3D viewer trusts, so the invariants it must satisfy live here, next to the tests
 * that assert them, instead of shipping as production functions nobody calls.
 */
function inside(x: number, y: number, z: number): boolean {
  return (
    x >= RIG_BOUNDS.minX &&
    x <= RIG_BOUNDS.maxX &&
    y >= RIG_BOUNDS.minY &&
    y <= RIG_BOUNDS.maxY &&
    z >= RIG_BOUNDS.minZ &&
    z <= RIG_BOUNDS.maxZ
  );
}

function anchorPoints(shape: RigShape): Array<[number, number, number]> {
  const [ax, ay, az] = shape.at;
  if (shape.kind === "lathe") return shape.profile.map(([radius, height]) => [radius, height + ay, 0]);
  return [[ax, ay, az]];
}

function rigWithinBounds(): boolean {
  const parts: ReadonlyArray<{ mirror: boolean; shape: RigShape }> = [
    ...RIG_BODY,
    ...MUSCLE_RIG.flatMap((muscle) => muscle.shapes.map((shape) => ({ mirror: muscle.mirror, shape }))),
  ];
  for (const part of parts) {
    for (const [x, y, z] of anchorPoints(part.shape)) {
      if (!inside(x, y, z)) return false;
      if (part.mirror && !inside(-x, y, z)) return false;
    }
  }
  return true;
}

function rigCoversCatalog(): boolean {
  const rigIds = MUSCLE_RIG.map((entry) => entry.muscleId);
  const catalogIds = MUSCLE_CATALOG.map((muscle) => muscle.id);
  return rigIds.length === catalogIds.length && catalogIds.every((id) => rigIds.includes(id));
}

describe("the 3D muscle rig", () => {
  it("covers the catalog exactly once, with a shape for every muscle", () => {
    expect(rigCoversCatalog()).toBe(true);
    const ids = MUSCLE_RIG.map((entry) => entry.muscleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const muscle of MUSCLE_CATALOG) {
      const entry = MUSCLE_RIG.find((candidate) => candidate.muscleId === muscle.id);
      expect(entry, muscle.id).toBeDefined();
      expect(entry?.shapes.length, muscle.id).toBeGreaterThan(0);
    }
  });

  it("authors mirrored parts on the left and center parts on the axis", () => {
    for (const muscle of MUSCLE_RIG) {
      for (const shape of muscle.shapes) {
        const x = shape.at[0];
        if (muscle.mirror) expect(x, muscle.muscleId).toBeLessThanOrEqual(0);
        else expect(x, muscle.muscleId).toBe(0);
      }
    }
    for (const part of RIG_BODY) {
      if (!part.mirror) expect(part.shape.at[0]).toBe(0);
    }
  });

  it("stays inside the figure's bounds, mirrored halves included", () => {
    expect(rigWithinBounds()).toBe(true);
  });

  it("uses only the shape kinds the viewer builds", () => {
    const kinds = new Set<string>();
    for (const muscle of MUSCLE_RIG) for (const shape of muscle.shapes) kinds.add(shape.kind);
    for (const part of RIG_BODY) kinds.add(part.shape.kind);
    for (const kind of kinds) expect(["sphere", "capsule", "box", "lathe"]).toContain(kind);
  });

  it("gives the trunk a closed lathe profile from the bottom up", () => {
    const lathe = RIG_BODY.find((part) => part.shape.kind === "lathe");
    expect(lathe).toBeDefined();
    if (lathe === undefined) return;
    const profile = lathe.shape.kind === "lathe" ? lathe.shape.profile : [];
    expect(profile.length).toBeGreaterThan(4);
    let previousHeight = -1;
    for (const [radius, height] of profile) {
      expect(radius).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(previousHeight);
      previousHeight = height;
    }
  });
});
