import { describe, expect, it } from "vitest";

import { failedGarminWorkout, mapGarminWorkout } from "../src/garmin-workout";
import type { Activity } from "../src/types";

const activity: Activity = {
  activityId: "garmin:900001",
  userId: "u1",
  day: "2026-11-12",
  title: "Threshold run",
  distanceKm: 10,
  durationMin: 45,
  paceSecPerKm: 270,
  avgHr: 165,
  source: "garmin",
  createdAt: "2026-11-12T09:00:00.000Z",
};

/** The live endpoint's flat FIT-style steps: warm-up, work, recovery, a repeat marker, cool-down. */
const observed = [
  {
    stepIndex: 1,
    intensity: "WARMUP",
    durationType: "TIME",
    durationValue: 600,
    targetType: "PACE",
    targetValueLow: 2.6,
    targetValueHigh: 2.9,
  },
  {
    stepIndex: 2,
    intensity: "ACTIVE",
    durationType: "TIME",
    durationValue: 420,
    targetType: "PACE",
    targetValueLow: 3.66,
    targetValueHigh: 3.94,
    notes: "Stay relaxed",
  },
  { stepIndex: 3, intensity: "RECOVERY", durationType: "TIME", durationValue: 120 },
  {
    stepIndex: 4,
    intensity: "ACTIVE",
    durationType: "REPEAT_UNTIL_STEPS_CMPLT",
    durationValue: 2,
    targetValue: 3,
  },
  {
    stepIndex: 5,
    intensity: "COOLDOWN",
    durationType: "TIME",
    durationValue: 600,
    targetType: "PACE",
    targetValueLow: 2.6,
    targetValueHigh: 2.9,
  },
];

describe("mapGarminWorkout", () => {
  it("groups the observed flat steps into a workout with a repeat", () => {
    const workout = mapGarminWorkout(observed, activity, "2026-11-12T10:00:00.000Z");

    expect(workout.status).toBe("ok");
    expect(workout.activityId).toBe("garmin:900001");
    expect(workout.userId).toBe("u1");
    expect(workout.day).toBe("2026-11-12");
    expect(workout.name).toBeNull();
    expect(workout.label).toBe("3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00)");
    expect(workout.summary).toBe(
      "Warm-up 10:00 @ 5:45–6:25/km · 3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00) · Cool-down 10:00 @ 5:45–6:25/km",
    );
    expect(workout.steps).toHaveLength(5);
    expect(workout.steps[0]).toMatchObject({
      index: 1,
      intensity: "Warm-up",
      intensityKey: "WARMUP",
      duration: "10:00",
      target: "5:45–6:25/km",
    });
    expect(workout.steps[3]).toMatchObject({
      index: 4,
      intensity: "Repeat",
      intensityKey: "REPEAT",
      duration: "3 ×",
      target: "back to step 2",
    });
    expect(workout.notes).toBe("Stay relaxed");
  });

  it("uses the workout name from an object envelope", () => {
    const workout = mapGarminWorkout(
      { workoutName: "Kenosha - Threshold", workoutSteps: observed },
      activity,
      "2026-11-12T10:00:00.000Z",
    );

    expect(workout.name).toBe("Kenosha - Threshold");
    expect(workout.label).toBe("Kenosha - Threshold");
    expect(workout.summary).toContain("3 × (Run 7:00");
  });

  it("flattens a classic workout DTO with segments and a repeat group", () => {
    const workout = mapGarminWorkout(
      {
        workoutName: "Simple session",
        workoutSegments: [
          {
            workoutSteps: [
              {
                type: "ExecutableStepDTO",
                stepOrder: 1,
                stepType: { stepTypeKey: "warmup" },
                endCondition: { conditionTypeKey: "time" },
                endConditionValue: 180,
                targetType: { workoutTargetTypeKey: "no.target" },
              },
              {
                type: "RepeatGroupDTO",
                stepOrder: 2,
                numberOfIterations: 3,
                workoutSteps: [
                  {
                    type: "ExecutableStepDTO",
                    stepType: { stepTypeKey: "interval" },
                    endCondition: { conditionTypeKey: "distance" },
                    endConditionValue: 1000,
                    targetType: { workoutTargetTypeKey: "pace.zone" },
                    targetValueOne: 3.0,
                    targetValueTwo: 3.3,
                  },
                  {
                    type: "ExecutableStepDTO",
                    stepType: { stepTypeKey: "recovery" },
                    endCondition: { conditionTypeKey: "time" },
                    endConditionValue: 120,
                  },
                ],
              },
              {
                type: "ExecutableStepDTO",
                stepType: { stepTypeKey: "cooldown" },
                endCondition: { conditionTypeKey: "time" },
                endConditionValue: 120,
              },
            ],
          },
        ],
      },
      activity,
      "2026-11-12T10:00:00.000Z",
    );

    expect(workout.name).toBe("Simple session");
    expect(workout.summary).toBe(
      "Warm-up 3:00 · 3 × (Run 1 km @ 5:03–5:33/km, Recovery 2:00) · Cool-down 2:00",
    );
    expect(workout.steps.map((step) => step.intensityKey)).toEqual([
      "WARMUP",
      "INTERVAL",
      "RECOVERY",
      "REPEAT",
      "COOLDOWN",
    ]);
  });

  it("formats heart-rate, cadence, power and speed targets", () => {
    const step = (targetType: string, low: number, high: number): unknown => ({
      stepIndex: 1,
      intensity: "ACTIVE",
      durationType: "TIME",
      durationValue: 600,
      targetType,
      targetValueLow: low,
      targetValueHigh: high,
    });

    const text = (targetType: string, low: number, high: number): string | null =>
      mapGarminWorkout([step(targetType, low, high)], activity, "2026-11-12T10:00:00.000Z").steps[0]?.target ?? null;

    expect(text("HEART_RATE", 150, 160)).toBe("150–160 bpm");
    expect(text("HEART_RATE", 80, 90)).toBe("80–90% max HR");
    expect(text("CADENCE", 170, 180)).toBe("170–180 spm");
    expect(text("POWER", 200, 250)).toBe("200–250 W");
    expect(text("SPEED", 3, 4)).toBe("10.8–14.4 km/h");
  });

  it("formats a single pace target, an open step, a lap button and reps", () => {
    const single = mapGarminWorkout(
      [{ stepIndex: 1, intensity: "ACTIVE", durationType: "TIME", durationValue: "600", targetType: "PACE", targetValue: 3.5 }],
      activity,
      "2026-11-12T10:00:00.000Z",
    );
    expect(single.steps[0]?.target).toBe("4:46/km");

    const open = mapGarminWorkout(
      [{ stepIndex: 1, intensity: "WARMUP", durationType: "OPEN", durationValue: 0 }],
      activity,
      "2026-11-12T10:00:00.000Z",
    );
    expect(open.steps[0]?.duration).toBe("open");

    const lap = mapGarminWorkout(
      [{ stepIndex: 1, intensity: "WARMUP", durationType: "LAP_BUTTON", durationValue: 0 }],
      activity,
      "2026-11-12T10:00:00.000Z",
    );
    expect(lap.steps[0]?.duration).toBe("lap");

    const reps = mapGarminWorkout(
      [{ stepIndex: 1, intensity: "ACTIVE", durationType: "REPS", durationValue: 12, exerciseName: "Squat" }],
      activity,
      "2026-11-12T10:00:00.000Z",
    );
    expect(reps.steps[0]?.duration).toBe("12 reps");
    expect(reps.summary).toBe("Squat 12 reps");
  });

  it("reads millisecond FIT times as seconds", () => {
    const workout = mapGarminWorkout(
      [{ stepIndex: 1, intensity: "WARMUP", durationType: "TIME", durationValue: 600_000 }],
      activity,
      "2026-11-12T10:00:00.000Z",
    );
    expect(workout.steps[0]?.duration).toBe("10:00");
  });

  it("treats an empty or unreadable payload as no planned workout", () => {
    for (const payload of [[], null, {}, "nonsense", { workoutSteps: [] }]) {
      const workout = mapGarminWorkout(payload, activity, "2026-11-12T10:00:00.000Z");
      expect(workout.status).toBe("none");
      expect(workout.summary).toBe("");
      expect(workout.label).toBe("");
      expect(workout.steps).toEqual([]);
      expect(workout.notes).toBeNull();
    }
  });

  it("keeps root notes and drops duplicate step notes", () => {
    const workout = mapGarminWorkout(
      {
        workoutName: "Notes run",
        notes: "Keep it relaxed",
        workoutSteps: [
          { stepIndex: 1, intensity: "WARMUP", durationType: "TIME", durationValue: 600, notes: "Easy" },
          { stepIndex: 2, intensity: "ACTIVE", durationType: "TIME", durationValue: 600, notes: "Easy" },
        ],
      },
      activity,
      "2026-11-12T10:00:00.000Z",
    );

    expect(workout.notes).toBe("Keep it relaxed");
  });

  it("caps the summary and label without throwing", () => {
    const steps = Array.from({ length: 30 }, (_, index) => ({
      stepIndex: index + 1,
      intensity: "ACTIVE",
      durationType: "TIME",
      durationValue: 600,
      targetType: "PACE",
      targetValueLow: 3,
      targetValueHigh: 3.2,
    }));
    const workout = mapGarminWorkout(steps, activity, "2026-11-12T10:00:00.000Z");

    expect(workout.status).toBe("ok");
    expect(workout.summary.length).toBeLessThanOrEqual(320);
    expect(workout.label.length).toBeLessThanOrEqual(64);
  });
  it("caps upstream workout names and notes and strips their control characters", () => {
    const workout = mapGarminWorkout(
      {
        name: `Threshold\n${"b".repeat(300)}`,
        notes: `line one\nline two\u0000 ${"c".repeat(2000)}`,
        workoutSegments: [{ workoutSteps: observed }],
      },
      activity,
      "2026-11-12T10:00:00.000Z",
    );

    expect(workout.name?.length).toBeLessThanOrEqual(120);
    expect(workout.name).not.toMatch(/[\u0000-\u001F\u007F]/);
    expect(workout.notes?.length).toBeLessThanOrEqual(1000);
    expect(workout.notes).not.toMatch(/[\u0000-\u001F\u007F]/);
  });
});

describe("failedGarminWorkout", () => {
  it("keeps a retryable failure row without inventing steps", () => {
    const workout = failedGarminWorkout(activity, 2, "2026-11-12T10:00:00.000Z");

    expect(workout).toMatchObject({
      activityId: "garmin:900001",
      userId: "u1",
      day: "2026-11-12",
      status: "unavailable",
      attempts: 2,
      fetchedAt: "2026-11-12T10:00:00.000Z",
      steps: [],
      summary: "",
    });
    expect(failedGarminWorkout(activity, 0, "2026-11-12T10:00:00.000Z").attempts).toBe(1);
  });
});
