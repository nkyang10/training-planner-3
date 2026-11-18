import { describe, expect, it } from "vitest";

import { GarminError, mapGarminActivity, type GarminClient } from "../src/garmin";
import { createGarminSync } from "../src/garmin-sync";
import { createStore } from "../src/store";

const raw = {
  activityId: 900001,
  activityName: "Shared run",
  startTimeLocal: "2026-11-15 06:30:00",
  distance: 5000,
  duration: 1800,
  averageHR: 150,
};

const workoutSteps = [
  { stepIndex: 1, intensity: "WARMUP", durationType: "TIME", durationValue: 600 },
  {
    stepIndex: 2,
    intensity: "ACTIVE",
    durationType: "TIME",
    durationValue: 420,
    targetType: "PACE",
    targetValueLow: 3.66,
    targetValueHigh: 3.94,
  },
  { stepIndex: 3, intensity: "RECOVERY", durationType: "TIME", durationValue: 120 },
  {
    stepIndex: 4,
    intensity: "ACTIVE",
    durationType: "REPEAT_UNTIL_STEPS_CMPLT",
    durationValue: 2,
    targetValue: 3,
  },
];

const client: GarminClient = {
  token: async () => "jwt",
  listActivities: async () => [raw],
};

const workoutClient = (workouts: GarminClient["getActivityWorkouts"]): GarminClient => ({
  ...client,
  getActivityWorkouts: workouts,
});

describe("createGarminSync", () => {
  it("stores the same Garmin activity independently for two runners", async () => {
    const handle = createStore(":memory:");
    try {
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => client,
        now: () => "2026-11-15T08:00:00.000Z",
      });

      const first = await sync.sync("u1", "2026-11-15");
      const second = await sync.sync("u2", "2026-11-15");

      expect(first.created).toBe(1);
      expect(second.created).toBe(1);
      expect(handle.store.listActivities("u1").map((activity) => activity.activityId)).toEqual([
        "garmin:900001",
      ]);
      expect(handle.store.listActivities("u2").map((activity) => activity.activityId)).toEqual([
        "garmin:900001",
      ]);
      expect(handle.store.listNotifications("u1")).toHaveLength(1);
      expect(handle.store.listNotifications("u2")).toHaveLength(1);

      const repeated = await sync.sync("u1", "2026-11-15");

      expect(repeated.created).toBe(0);
      expect(handle.store.listActivities("u1")).toHaveLength(1);
      expect(handle.store.listActivities("u2")).toHaveLength(1);
      expect(handle.store.listNotifications("u1")).toHaveLength(1);
      expect(handle.store.listNotifications("u2")).toHaveLength(1);
    } finally {
      handle.close();
    }
  });

  it("confirms an explicit no-new sync but stays silent for automatic checks", async () => {
    const handle = createStore(":memory:");
    try {
      const mapped = mapGarminActivity(raw, "u1");
      if (!mapped) throw new Error("fixture did not map");
      handle.store.appendActivity(mapped);

      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => client,
        now: () => "2026-11-15T08:00:00.000Z",
      });

      const automatic = await sync.sync("u1", "2026-11-15");
      expect(automatic.created).toBe(0);
      expect(handle.store.listNotifications("u1")).toHaveLength(0);

      const manual = await sync.sync("u1", "2026-11-15", { notifyWhenUnchanged: true });
      expect(manual.created).toBe(0);
      const notes = handle.store.listNotifications("u1");
      expect(notes).toHaveLength(1);
      expect(notes[0]?.title).toBe("Garmin sync: no new activities");
      expect(notes[0]?.body).toContain("1 activity checked; nothing new.");
      expect(notes[0]?.href).toBe("/history");
    } finally {
      handle.close();
    }
  });

  it("reports the newest newly created activity, not a newer existing one", async () => {
    const existingRaw = {
      ...raw,
      activityId: 900002,
      activityName: "Existing newer",
      startTimeLocal: "2026-11-16 06:30:00",
    };
    const newRaw = {
      ...raw,
      activityId: 900003,
      activityName: "New older",
      startTimeLocal: "2026-11-15 06:30:00",
    };
    const mixedClient: GarminClient = {
      token: async () => "jwt",
      listActivities: async () => [existingRaw, newRaw],
    };
    const handle = createStore(":memory:");
    try {
      const existing = mapGarminActivity(existingRaw, "u1");
      if (!existing) throw new Error("existing fixture did not map");
      handle.store.appendActivity(existing);

      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => mixedClient,
        now: () => "2026-11-16T08:00:00.000Z",
      });
      const outcome = await sync.sync("u1", "2026-11-16");

      expect(outcome.created).toBe(1);
      expect(outcome.newest?.activityId).toBe("garmin:900003");
      const notes = handle.store.listNotifications("u1");
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toContain("New older");
      expect(notes[0]?.href).toBe("/calendar?month=2026-11");
    } finally {
      handle.close();
    }
  });
});

describe("Garmin workout enrichment", () => {
  it("stores the workout a synced run followed", async () => {
    const handle = createStore(":memory:");
    try {
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => workoutClient(async () => workoutSteps),
        now: () => "2026-11-15T08:00:00.000Z",
      });

      const outcome = await sync.sync("u1", "2026-11-15");

      expect(outcome.error).toBeNull();
      const workout = handle.store.getActivityWorkout("u1", "garmin:900001");
      expect(workout).toMatchObject({
        status: "ok",
        day: "2026-11-15",
        fetchedAt: "2026-11-15T08:00:00.000Z",
        attempts: 0,
      });
      expect(workout?.summary).toContain("3 × (Run 7:00");
      expect(handle.store.listActivityWorkouts("u1", "2026-11-15", "2026-11-15")).toHaveLength(1);
    } finally {
      handle.close();
    }
  });

  it("caps the workout lookups per sync and backfills on later syncs", async () => {
    const handle = createStore(":memory:");
    try {
      const days = ["2026-11-13", "2026-11-14", "2026-11-15"];
      const calls: string[] = [];
      const multiClient: GarminClient = {
        token: async () => "jwt",
        listActivities: async () =>
          days.map((day, index) => ({
            ...raw,
            activityId: 900010 + index,
            startTimeLocal: `${day} 06:30:00`,
          })),
        getActivityWorkouts: async (activityId) => {
          calls.push(activityId);
          return workoutSteps;
        },
      };
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => multiClient,
        now: () => "2026-11-15T08:00:00.000Z",
        workoutFetchLimit: 1,
      });

      await sync.sync("u1", "2026-11-15");
      expect(calls).toEqual(["900012"]);
      expect(handle.store.listActivityWorkouts("u1", "2026-11-01", "2026-11-30")).toHaveLength(1);

      await sync.sync("u1", "2026-11-15");
      expect(calls).toEqual(["900012", "900011"]);
      expect(handle.store.listActivityWorkouts("u1", "2026-11-01", "2026-11-30")).toHaveLength(2);

      await sync.sync("u1", "2026-11-15");
      expect(calls).toEqual(["900012", "900011", "900010"]);
      expect(handle.store.listActivityWorkouts("u1", "2026-11-01", "2026-11-30")).toHaveLength(3);

      await sync.sync("u1", "2026-11-15");
      expect(calls).toHaveLength(3);
    } finally {
      handle.close();
    }
  });

  it("records a 404 as a confirmed no-workout and a 403 as retryable", async () => {
    const handle = createStore(":memory:");
    try {
      const twoDays = [
        { ...raw, activityId: 900021, startTimeLocal: "2026-11-14 06:30:00" },
        { ...raw, activityId: 900022, startTimeLocal: "2026-11-15 06:30:00" },
      ];
      const failingClient: GarminClient = {
        token: async () => "jwt",
        listActivities: async () => twoDays,
        getActivityWorkouts: async (activityId) => {
          if (activityId === "900021") throw new GarminError("not found", 404);
          throw new GarminError("denied", 403);
        },
      };
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => failingClient,
        now: () => "2026-11-15T08:00:00.000Z",
      });

      const outcome = await sync.sync("u1", "2026-11-15");

      expect(outcome.error).toBeNull();
      expect(handle.store.getActivityWorkout("u1", "garmin:900021")?.status).toBe("none");
      expect(handle.store.getActivityWorkout("u1", "garmin:900022")).toMatchObject({
        status: "unavailable",
        attempts: 1,
      });
    } finally {
      handle.close();
    }
  });

  it("retries a failed workout once and then stops asking Garmin", async () => {
    const handle = createStore(":memory:");
    try {
      let calls = 0;
      const failingClient = workoutClient(async () => {
        calls += 1;
        throw new GarminError("denied", 403);
      });
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => failingClient,
        now: () => "2026-11-15T08:00:00.000Z",
        maxWorkoutAttempts: 2,
      });

      await sync.sync("u1", "2026-11-15");
      expect(handle.store.getActivityWorkout("u1", "garmin:900001")?.attempts).toBe(1);

      await sync.sync("u1", "2026-11-15");
      expect(handle.store.getActivityWorkout("u1", "garmin:900001")?.attempts).toBe(2);

      await sync.sync("u1", "2026-11-15");
      expect(calls).toBe(2);
      expect(handle.store.getActivityWorkout("u1", "garmin:900001")?.status).toBe("unavailable");
    } finally {
      handle.close();
    }
  });

  it("keeps the activity sync green when the workout fetch throws", async () => {
    const handle = createStore(":memory:");
    try {
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => workoutClient(async () => {
          throw new Error("network down");
        }),
        now: () => "2026-11-15T08:00:00.000Z",
      });

      const outcome = await sync.sync("u1", "2026-11-15");

      expect(outcome.error).toBeNull();
      expect(outcome.created).toBe(1);
      expect(handle.store.listActivities("u1")).toHaveLength(1);
      expect(handle.store.getActivityWorkout("u1", "garmin:900001")?.status).toBe("unavailable");
    } finally {
      handle.close();
    }
  });

  it("does nothing when the client has no workout endpoint", async () => {
    const handle = createStore(":memory:");
    try {
      const sync = createGarminSync({
        store: handle.store,
        clientFor: () => client,
        now: () => "2026-11-15T08:00:00.000Z",
      });

      await sync.sync("u1", "2026-11-15");

      expect(handle.store.listActivities("u1")).toHaveLength(1);
      expect(handle.store.listActivityWorkouts("u1", "2026-11-01", "2026-11-30")).toEqual([]);
    } finally {
      handle.close();
    }
  });
});
