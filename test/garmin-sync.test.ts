import { describe, expect, it } from "vitest";

import { mapGarminActivity, type GarminClient } from "../src/garmin";
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

const client: GarminClient = {
  token: async () => "jwt",
  listActivities: async () => [raw],
};

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
