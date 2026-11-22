/**
 * The 3D muscle rig: a typed, pure-data description of the body silhouette and of every muscle overlay, in world
 * units (y up, 0..4.7 tall, x mirrored, z positive toward the viewer). The Muscle tab's three.js viewer consumes
 * this as JSON and builds the meshes from it; the tests read it directly, so the figure, the clickable overlays
 * and the 2D catalog stay in lockstep.
 *
 * Authoring convention: mirror parts are authored once on the LEFT side (negative x) and duplicated across the
 * x axis by the viewer, exactly like the 2D figure mirrors its left paths. Center parts sit on x = 0.
 */
import { MUSCLE_CATALOG } from "./muscles";

export type RigShape =
  | {
      kind: "sphere";
      at: readonly [number, number, number];
      radius: number;
      scale?: readonly [number, number, number];
    }
  | {
      kind: "capsule";
      at: readonly [number, number, number];
      radius: number;
      /** Cylinder section length; the hemispherical caps extend beyond it. */
      length: number;
      scale?: readonly [number, number, number];
      /** Lean around the z axis in degrees; mirrored parts lean the other way. */
      tilt?: number;
    }
  | {
      kind: "box";
      at: readonly [number, number, number];
      size: readonly [number, number, number];
      tilt?: number;
      /** Corner-rounding hint for the viewer; it currently renders a plain box. */
      round?: number;
    }
  | {
      kind: "lathe";
      at: readonly [number, number, number];
      /** (radius, height) pairs from the bottom up; the viewer closes the top at radius 0. */
      profile: readonly (readonly [number, number])[];
      /** Flattens the lathe on z so the trunk reads elliptical rather than round. */
      scaleZ?: number;
    };

export interface RigBodyPart {
  shape: RigShape;
  /** True when the part is authored on the left and mirrored to the right. */
  mirror: boolean;
}

export interface RigMuscle {
  muscleId: string;
  mirror: boolean;
  shapes: readonly RigShape[];
}

/** The whole figure fits this box; tests assert every authored point stays inside it. */
export const RIG_BOUNDS = { minX: -1.2, maxX: 1.2, minY: 0, maxY: 4.7, minZ: -0.75, maxZ: 0.75 };

/** The clay silhouette behind the muscles. */
export const RIG_BODY: readonly RigBodyPart[] = [
  { mirror: false, shape: { kind: "sphere", at: [0, 4.52, 0], radius: 0.16, scale: [1, 1.12, 0.95] } },
  { mirror: false, shape: { kind: "capsule", at: [0, 4.32, 0], radius: 0.085, length: 0.18 } },
  {
    mirror: false,
    shape: {
      kind: "lathe",
      at: [0, 0, 0],
      scaleZ: 0.62,
      profile: [
        [0.37, 2.78],
        [0.345, 3.05],
        [0.33, 3.35],
        [0.37, 3.7],
        [0.45, 4.02],
        [0.47, 4.18],
        [0.42, 4.32],
        [0.2, 4.42],
      ],
    },
  },
  { mirror: true, shape: { kind: "sphere", at: [-0.42, 4.19, 0], radius: 0.15, scale: [1, 0.92, 1] } },
  { mirror: true, shape: { kind: "capsule", at: [-0.55, 3.85, 0], radius: 0.075, length: 0.48, tilt: 6 } },
  { mirror: true, shape: { kind: "capsule", at: [-0.63, 3.28, 0], radius: 0.06, length: 0.44, tilt: 4 } },
  { mirror: true, shape: { kind: "sphere", at: [-0.68, 2.98, 0], radius: 0.065 } },
  { mirror: true, shape: { kind: "capsule", at: [-0.23, 2.28, 0], radius: 0.135, length: 0.82, tilt: 2 } },
  { mirror: true, shape: { kind: "sphere", at: [-0.24, 1.58, 0], radius: 0.09 } },
  { mirror: true, shape: { kind: "capsule", at: [-0.25, 1.02, 0], radius: 0.08, length: 0.72 } },
  { mirror: true, shape: { kind: "box", at: [-0.25, 0.07, 0.09], size: [0.16, 0.12, 0.34], round: 0.05 } },
];

/** One overlay per catalog muscle; ids match `MUSCLE_CATALOG` exactly. */
export const MUSCLE_RIG: readonly RigMuscle[] = [
  { muscleId: "neck", mirror: false, shapes: [{ kind: "capsule", at: [0, 4.35, 0.01], radius: 0.075, length: 0.14 }] },
  { muscleId: "delts", mirror: true, shapes: [{ kind: "sphere", at: [-0.42, 4.19, 0], radius: 0.15, scale: [1, 0.92, 1] }] },
  {
    muscleId: "chest",
    mirror: true,
    shapes: [{ kind: "sphere", at: [-0.16, 4.0, 0.16], radius: 0.2, scale: [1.05, 0.78, 0.5] }],
  },
  { muscleId: "biceps", mirror: true, shapes: [{ kind: "capsule", at: [-0.56, 3.86, 0.05], radius: 0.07, length: 0.26 }] },
  { muscleId: "triceps", mirror: true, shapes: [{ kind: "capsule", at: [-0.56, 3.86, -0.05], radius: 0.07, length: 0.26 }] },
  { muscleId: "forearms", mirror: true, shapes: [{ kind: "capsule", at: [-0.63, 3.3, 0], radius: 0.062, length: 0.34 }] },
  {
    muscleId: "abs",
    mirror: false,
    shapes: [
      { kind: "sphere", at: [0, 3.75, 0.17], radius: 0.13, scale: [1, 0.5, 0.42] },
      { kind: "sphere", at: [0, 3.57, 0.17], radius: 0.13, scale: [1, 0.5, 0.42] },
      { kind: "sphere", at: [0, 3.39, 0.17], radius: 0.13, scale: [1, 0.5, 0.42] },
    ],
  },
  { muscleId: "obliques", mirror: true, shapes: [{ kind: "capsule", at: [-0.27, 3.5, 0.12], radius: 0.06, length: 0.34, tilt: 6 }] },
  {
    muscleId: "lats",
    mirror: true,
    shapes: [{ kind: "capsule", at: [-0.26, 3.66, -0.14], radius: 0.1, length: 0.42, scale: [1, 1, 0.55], tilt: 8 }],
  },
  {
    muscleId: "traps",
    mirror: false,
    shapes: [{ kind: "sphere", at: [0, 4.3, -0.06], radius: 0.17, scale: [1.45, 1.0, 0.6] }],
  },
  { muscleId: "rotator-cuff", mirror: true, shapes: [{ kind: "sphere", at: [-0.34, 4.16, -0.09], radius: 0.09 }] },
  { muscleId: "lower-back", mirror: true, shapes: [{ kind: "capsule", at: [-0.09, 3.5, -0.16], radius: 0.055, length: 0.4 }] },
  {
    muscleId: "glutes",
    mirror: true,
    shapes: [{ kind: "sphere", at: [-0.18, 2.98, -0.13], radius: 0.16, scale: [1, 0.9, 0.95] }],
  },
  {
    muscleId: "hip-flexors",
    mirror: true,
    shapes: [{ kind: "sphere", at: [-0.1, 2.95, 0.17], radius: 0.1, scale: [1, 0.75, 0.5] }],
  },
  { muscleId: "adductors", mirror: true, shapes: [{ kind: "capsule", at: [-0.075, 2.42, 0.03], radius: 0.055, length: 0.5 }] },
  { muscleId: "abductors", mirror: true, shapes: [{ kind: "capsule", at: [-0.37, 2.85, 0], radius: 0.07, length: 0.3 }] },
  { muscleId: "quads", mirror: true, shapes: [{ kind: "capsule", at: [-0.24, 2.28, 0.1], radius: 0.1, length: 0.7 }] },
  { muscleId: "hamstrings", mirror: true, shapes: [{ kind: "capsule", at: [-0.24, 2.26, -0.1], radius: 0.09, length: 0.65 }] },
  {
    muscleId: "calves",
    mirror: true,
    shapes: [{ kind: "sphere", at: [-0.26, 1.08, -0.07], radius: 0.09, scale: [0.85, 1.5, 1] }],
  },
  { muscleId: "tibialis", mirror: true, shapes: [{ kind: "capsule", at: [-0.25, 1.06, 0.09], radius: 0.05, length: 0.55 }] },
];

