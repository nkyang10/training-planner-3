import { describe, expect, it } from "vitest";

import { MUSCLE_CATALOG } from "../src/muscles";
import { MUSCLE_RIG, RIG_BODY, rigCoversCatalog, rigForMuscle, rigWithinBounds } from "../src/muscle-rig";

describe("the 3D muscle rig", () => {
  it("covers the catalog exactly once, with a shape for every muscle", () => {
    expect(rigCoversCatalog()).toBe(true);
    const ids = MUSCLE_RIG.map((entry) => entry.muscleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const muscle of MUSCLE_CATALOG) {
      const entry = rigForMuscle(muscle.id);
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
