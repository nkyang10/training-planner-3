import { describe, expect, it } from "vitest";

import type { GarminClient } from "../src/garmin";
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
});
