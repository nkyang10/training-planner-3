import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStore, type StoreHandle } from "../src/store";
import type {
  Activity,
  ActivityWorkout,
  AppNotification,
  ChangeEntry,
  ChangeSet,
  CoachStateEvent,
  CoachStateRecord,
  GarminKey,
  Memory,
  Message,
  MuscleCheckIn,
  MuscleProposal,
  MuscleProposalStatus,
  MuscleStatusControl,
  PromptSnapshot,
  TrainingSession,
  UserProfile,
} from "../src/types";

const handles: StoreHandle[] = [];
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...params: unknown[]): unknown };
    close(): void;
  };
};

function memoryStore(): StoreHandle {
  const handle = createStore(":memory:");
  handles.push(handle);
  return handle;
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.close();
  }
});

function message(messageId: string, userId: string, createdAt: string): Message {
  return { messageId, userId, role: "user", text: `text-${messageId}`, createdAt };
}

function memory(memoryId: string, userId: string, createdAt: string): Memory {
  return { memoryId, userId, text: `fact-${memoryId}`, createdAt };
}

function session(
  sessionId: string,
  userId: string,
  day: string,
  createdAt: string,
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    sessionId,
    userId,
    day,
    title: `session-${sessionId}`,
    kind: "easy",
    distanceKm: 8,
    durationMin: 45,
    note: null,
    createdAt,
    ...overrides,
  };
}

function activity(activityId: string, userId: string, day: string, createdAt: string): Activity {
  return {
    activityId,
    userId,
    day,
    title: `activity-${activityId}`,
    distanceKm: 10,
    durationMin: 55,
    paceSecPerKm: 330,
    avgHr: 140,
    source: "garmin",
    createdAt,
  };
}

function garminKey(userId: string, apiKey: string, savedAt: string): GarminKey {
  return { userId, apiKey, savedAt };
}

function workout(
  activityId: string,
  userId: string,
  day: string,
  overrides: Partial<ActivityWorkout> = {},
): ActivityWorkout {
  return {
    activityId,
    userId,
    day,
    name: "Threshold 3 × 7:00",
    label: "Threshold 3 × 7:00",
    summary: "Warm-up 10:00 · 3 × (Run 7:00 @ 4:30–4:50/km, Recovery 2:00) · Cool-down 10:00",
    steps: [
      { index: 1, intensity: "Warm-up", intensityKey: "WARMUP", duration: "10:00", target: null },
    ],
    notes: null,
    status: "ok",
    attempts: 0,
    fetchedAt: `${day}T09:00:00.000Z`,
    ...overrides,
  };
}

function notification(
  notificationId: string,
  userId: string,
  createdAt: string,
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    notificationId,
    userId,
    source: "garmin",
    status: "success",
    title: `title-${notificationId}`,
    body: `body-${notificationId}`,
    href: "/calendar",
    createdAt,
    readAt: null,
    ...overrides,
  };
}

function profile(userId: string, username: string, createdAt = "2026-01-01T00:00:00.000Z"): UserProfile {
  return {
    userId,
    username,
    displayName: `Runner ${username}`,
    passwordHash: "scrypt:fake",
    timezone: "Asia/Taipei",
    goal: null,
    createdAt,
  };
}

function entry(action: ChangeEntry["action"], before: TrainingSession | null, after: TrainingSession | null): ChangeEntry {
  return {
    action,
    sessionId: before?.sessionId ?? after?.sessionId ?? "session:unknown",
    before,
    after,
    fromDay: before?.day ?? null,
    toDay: after?.day ?? null,
    title: after?.title ?? before?.title ?? "unknown",
    kind: after?.kind ?? before?.kind ?? "easy",
  };
}

function changeSet(
  changeSetId: string,
  userId: string,
  createdAt: string,
  entries: ChangeEntry[] = [],
): ChangeSet {
  return { changeSetId, userId, createdAt, summary: `summary-${changeSetId}`, entries, revertedAt: null };
}

describe("messages", () => {
  it("appends append-only and lists oldest-first", () => {
    const { store } = memoryStore();
    store.appendMessage(message("m1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendMessage(message("m2", "u1", "2026-01-01T09:00:00.000Z"));
    store.appendMessage(message("m3", "u1", "2026-01-01T10:00:00.000Z"));

    expect(store.listMessages("u1").map((m) => m.messageId)).toEqual(["m1", "m2", "m3"]);
    expect(store.listMessages("u1")[0]).toEqual(message("m1", "u1", "2026-01-01T08:00:00.000Z"));
  });

  it("returns the last N messages in chronological order", () => {
    const { store } = memoryStore();
    for (let i = 1; i <= 5; i += 1) {
      store.appendMessage(message(`m${i}`, "u1", `2026-01-0${i}T08:00:00.000Z`));
    }

    expect(store.listMessages("u1", 2).map((m) => m.messageId)).toEqual(["m4", "m5"]);
    expect(store.listMessages("u1", 50)).toHaveLength(5);
    expect(store.listMessages("u1", 0)).toEqual([]);
  });
});

describe("memories", () => {
  it("is append-only and keeps insertion order", () => {
    const { store } = memoryStore();
    store.appendMemory(memory("k1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendMemory(memory("k2", "u1", "2026-01-02T08:00:00.000Z"));
    store.appendMemory(memory("k3", "u1", "2026-01-03T08:00:00.000Z"));

    expect(store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1", "k2", "k3"]);
    expect(store.listMemories("u1", 2).map((m) => m.memoryId)).toEqual(["k2", "k3"]);
  });

  it("isolates memories per user", () => {
    const { store } = memoryStore();
    store.appendMemory(memory("k1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendMemory(memory("k2", "u2", "2026-01-01T09:00:00.000Z"));

    expect(store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1"]);
    expect(store.listMemories("u2").map((m) => m.memoryId)).toEqual(["k2"]);
    expect(store.listMemories("u3")).toEqual([]);
  });

  it("merges duplicate facts instead of accumulating (LL-6)", () => {
    const { store } = memoryStore();
    store.appendMemory({ memoryId: "k1", userId: "u1", text: "Prefers morning runs", createdAt: "2026-01-01T08:00:00.000Z" });
    // Same fact, different casing and spacing: skipped, not duplicated.
    store.appendMemory({ memoryId: "k2", userId: "u1", text: "prefers   MORNING  runs", createdAt: "2026-01-02T08:00:00.000Z" });
    expect(store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1"]);
    store.appendMemory({ memoryId: "k3", userId: "u1", text: "Training for a 10k", createdAt: "2026-01-03T08:00:00.000Z" });
    expect(store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1", "k3"]);
    // The comparison is scoped per runner.
    store.appendMemory({ memoryId: "k4", userId: "u2", text: "Prefers morning runs", createdAt: "2026-01-04T08:00:00.000Z" });
    expect(store.listMemories("u2").map((m) => m.memoryId)).toEqual(["k4"]);
  });

  it("keeps only the newest 24 memories per runner", () => {
    const { store } = memoryStore();
    for (let index = 0; index < 26; index += 1) {
      store.appendMemory({
        memoryId: `k${index}`,
        userId: "u1",
        text: `fact number ${index}`,
        createdAt: `2026-01-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
      });
    }
    const kept = store.listMemories("u1", 100);
    expect(kept).toHaveLength(24);
    expect(kept[0]?.memoryId).toBe("k2");
    expect(kept[kept.length - 1]?.memoryId).toBe("k25");
  });
});

describe("coach preferences", () => {
  it("starts undecided and patches only the keys it is given", () => {
    const { store } = memoryStore();
    expect(store.getCoachPreferences("u1")).toBeUndefined();
    const first = store.patchCoachPreferences("u1", { language: "zh-Hant" }, "2026-01-01T08:00:00.000Z");
    expect(first).toMatchObject({ userId: "u1", language: "zh-Hant", tone: null, replyLength: null, nickname: null });
    const second = store.patchCoachPreferences("u1", { tone: "brief", nickname: "Mei" }, "2026-01-02T08:00:00.000Z");
    expect(second).toMatchObject({ language: "zh-Hant", tone: "brief", nickname: "Mei", replyLength: null });
    expect(second.updatedAt).toBe("2026-01-02T08:00:00.000Z");
    expect(store.getCoachPreferences("u1")).toMatchObject({ language: "zh-Hant", nickname: "Mei" });
  });

  it("is isolated per runner", () => {
    const { store } = memoryStore();
    store.patchCoachPreferences("u1", { nickname: "Mei" }, "2026-01-01T08:00:00.000Z");
    store.patchCoachPreferences("u2", { nickname: "Sam" }, "2026-01-01T08:30:00.000Z");
    expect(store.getCoachPreferences("u1")?.nickname).toBe("Mei");
    expect(store.getCoachPreferences("u2")?.nickname).toBe("Sam");
    expect(store.getCoachPreferences("u3")).toBeUndefined();
  });
});

describe("prompt snapshots", () => {
  const snapshot = (snapshotId: string, userId: string, createdAt: string): PromptSnapshot => ({
    snapshotId,
    userId,
    epoch: `e-${snapshotId}`,
    epochJson: "{}",
    reasons: ["first-turn"],
    body: `[context ${snapshotId}]`,
    createdAt,
  });

  it("appends, returns oldest first and prunes to the newest three", () => {
    const { store } = memoryStore();
    store.appendPromptSnapshot(snapshot("s1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendPromptSnapshot(snapshot("s2", "u1", "2026-01-02T08:00:00.000Z"));
    expect(store.listPromptSnapshots("u1").map((row) => row.snapshotId)).toEqual(["s1", "s2"]);
    expect(store.getLatestPromptSnapshot("u1")?.snapshotId).toBe("s2");
    store.appendPromptSnapshot(snapshot("s3", "u1", "2026-01-03T08:00:00.000Z"));
    store.appendPromptSnapshot(snapshot("s4", "u1", "2026-01-04T08:00:00.000Z"));
    expect(store.listPromptSnapshots("u1").map((row) => row.snapshotId)).toEqual(["s2", "s3", "s4"]);
    expect(store.getLatestPromptSnapshot("u1")?.snapshotId).toBe("s4");
    expect(store.getLatestPromptSnapshot("u1")?.body).toBe("[context s4]");
  });

  it("is isolated per runner", () => {
    const { store } = memoryStore();
    store.appendPromptSnapshot(snapshot("s1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendPromptSnapshot(snapshot("s2", "u2", "2026-01-01T09:00:00.000Z"));
    expect(store.listPromptSnapshots("u1").map((row) => row.snapshotId)).toEqual(["s1"]);
    expect(store.listPromptSnapshots("u2").map((row) => row.snapshotId)).toEqual(["s2"]);
    expect(store.getLatestPromptSnapshot("u3")).toBeUndefined();
  });
});

describe("sessions", () => {
  it("upserts by session id", () => {
    const { store } = memoryStore();
    store.upsertSession(session("s1", "u1", "2026-02-10", "2026-02-01T08:00:00.000Z"));
    store.upsertSession(
      session("s1", "u1", "2026-02-10", "2026-02-01T08:00:00.000Z", { title: "renamed" }),
    );

    const rows = store.listSessions("u1", "2026-02-01", "2026-02-28");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("renamed");
  });

  it("lists an inclusive day range ordered by day then created_at", () => {
    const { store } = memoryStore();
    store.upsertSession(session("s3", "u1", "2026-02-11", "2026-02-01T10:00:00.000Z"));
    store.upsertSession(session("s1", "u1", "2026-02-10", "2026-02-01T09:00:00.000Z"));
    store.upsertSession(session("s2", "u1", "2026-02-10", "2026-02-01T08:00:00.000Z"));
    store.upsertSession(session("s4", "u1", "2026-02-12", "2026-02-01T11:00:00.000Z"));

    expect(store.listSessions("u1", "2026-02-10", "2026-02-11").map((s) => s.sessionId)).toEqual([
      "s2",
      "s1",
      "s3",
    ]);
    expect(store.listSessions("u1", "2026-02-11", "2026-02-11").map((s) => s.sessionId)).toEqual([
      "s3",
    ]);
    expect(store.listSessions("u1", "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("replaces only future days and keeps past sessions", () => {
    const { store } = memoryStore();
    store.upsertSession(session("past", "u1", "2026-02-01", "2026-01-30T08:00:00.000Z"));
    store.upsertSession(session("oldA", "u1", "2026-02-10", "2026-02-02T08:00:00.000Z"));
    store.upsertSession(session("oldB", "u1", "2026-02-11", "2026-02-02T09:00:00.000Z"));
    store.upsertSession(session("otherUser", "u2", "2026-02-10", "2026-02-02T10:00:00.000Z"));

    store.replaceFutureSessions("u1", "2026-02-10", [
      session("newA", "u1", "2026-02-12", "2026-02-05T08:00:00.000Z"),
      session("newB", "u1", "2026-02-14", "2026-02-05T09:00:00.000Z"),
    ]);

    expect(store.listSessions("u1", "2026-01-01", "2026-12-31").map((s) => s.sessionId)).toEqual([
      "past",
      "newA",
      "newB",
    ]);
    expect(store.listSessions("u2", "2026-01-01", "2026-12-31").map((s) => s.sessionId)).toEqual([
      "otherUser",
    ]);
  });

  it("clears future sessions when the replacement is empty", () => {
    const { store } = memoryStore();
    store.upsertSession(session("past", "u1", "2026-02-01", "2026-01-30T08:00:00.000Z"));
    store.upsertSession(session("future", "u1", "2026-02-20", "2026-02-02T08:00:00.000Z"));

    store.replaceFutureSessions("u1", "2026-02-10", []);

    expect(store.listSessions("u1", "2026-01-01", "2026-12-31").map((s) => s.sessionId)).toEqual([
      "past",
    ]);
  });
});

describe("activities", () => {
  it("appends and lists the newest day first", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("a1", "u1", "2026-02-01", "2026-02-01T07:00:00.000Z"));
    store.appendActivity(activity("a2", "u1", "2026-02-03", "2026-02-03T07:00:00.000Z"));
    store.appendActivity(activity("a3", "u1", "2026-02-02", "2026-02-02T07:00:00.000Z"));

    expect(store.listActivities("u1").map((a) => a.activityId)).toEqual(["a2", "a3", "a1"]);
    expect(store.listActivities("u1", 2).map((a) => a.activityId)).toEqual(["a2", "a3"]);
  });

  it("upserts a repeated activity id instead of throwing", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("a1", "u1", "2026-02-01", "2026-02-01T07:00:00.000Z"));
    store.appendActivity({
      ...activity("a1", "u1", "2026-02-02", "2026-02-02T07:00:00.000Z"),
      title: "Updated activity",
    });

    const rows = store.listActivities("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Updated activity");
    expect(rows[0]?.day).toBe("2026-02-02");
  });

  it("keeps the same activity id independent for different runners", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("a1", "u1", "2026-02-01", "2026-02-01T07:00:00.000Z"));
    store.appendActivity({
      ...activity("a1", "u2", "2026-02-02", "2026-02-02T07:00:00.000Z"),
      title: "u2 activity",
    });

    expect(store.listActivities("u1")).toHaveLength(1);
    expect(store.listActivities("u1")[0]?.title).toBe("activity-a1");
    expect(store.listActivities("u2")).toHaveLength(1);
    expect(store.listActivities("u2")[0]?.title).toBe("u2 activity");
    expect(store.getActivity("u1", "a1")?.title).toBe("activity-a1");
    expect(store.getActivity("u2", "a1")?.title).toBe("u2 activity");
  });

  it("migrates an old activity_id primary key to per-user ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "training-planner-migrate-"));
    const dbPath = join(dir, "old.db");
    const raw = new DatabaseSync(dbPath);
    raw.exec(`CREATE TABLE activities (
      activity_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )`);
    const original = activity("a1", "u1", "2026-02-01", "2026-02-01T07:00:00.000Z");
    raw
      .prepare("INSERT INTO activities (activity_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(original.activityId, original.userId, original.day, original.createdAt, JSON.stringify(original));
    raw.close();

    const handle = createStore(`sqlite:${dbPath}`);
    handles.push(handle);
    try {
      expect(handle.store.getActivity("u1", "a1")?.title).toBe("activity-a1");
      handle.store.appendActivity({
        ...activity("a1", "u2", "2026-02-02", "2026-02-02T07:00:00.000Z"),
        title: "u2 activity",
      });
      expect(handle.store.listActivities("u1")).toHaveLength(1);
      expect(handle.store.listActivities("u2")).toHaveLength(1);
      expect(handle.store.getActivity("u2", "a1")?.title).toBe("u2 activity");
    } finally {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gets one activity only for its owner", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("a1", "u1", "2026-02-01", "2026-02-01T07:00:00.000Z"));

    expect(store.getActivity("u1", "a1")?.title).toBe("activity-a1");
    expect(store.getActivity("u2", "a1")).toBeUndefined();
    expect(store.getActivity("u1", "missing")).toBeUndefined();
  });
});

describe("activity workouts", () => {
  it("saves, replaces and reads one workout per activity and runner", () => {
    const { store } = memoryStore();
    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-02"));

    expect(store.getActivityWorkout("u1", "garmin:1")?.name).toBe("Threshold 3 × 7:00");
    expect(store.getActivityWorkout("u2", "garmin:1")).toBeUndefined();
    expect(store.getActivityWorkout("u1", "garmin:missing")).toBeUndefined();

    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-03", { status: "none", name: null, steps: [] }));

    const saved = store.getActivityWorkout("u1", "garmin:1");
    expect(saved?.status).toBe("none");
    expect(saved?.day).toBe("2026-11-03");
    expect(saved?.steps).toEqual([]);
  });

  it("lists workouts by day range, oldest first", () => {
    const { store } = memoryStore();
    store.saveActivityWorkout(workout("garmin:2", "u1", "2026-11-03"));
    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-01"));
    store.saveActivityWorkout(workout("garmin:3", "u1", "2026-12-01"));

    expect(store.listActivityWorkouts("u1", "2026-11-01", "2026-11-30").map((row) => row.activityId)).toEqual([
      "garmin:1",
      "garmin:2",
    ]);
    expect(store.listActivityWorkouts("u2", "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("offers missing and retryable activities as candidates, newest first", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("garmin:1", "u1", "2026-11-01", "2026-11-01T07:00:00.000Z"));
    store.appendActivity(activity("garmin:2", "u1", "2026-11-02", "2026-11-02T07:00:00.000Z"));
    store.appendActivity(activity("garmin:3", "u1", "2026-11-03", "2026-11-03T07:00:00.000Z"));
    store.appendActivity(activity("garmin:4", "u1", "2026-11-04", "2026-11-04T07:00:00.000Z"));
    store.appendActivity(activity("chat:1", "u1", "2026-11-05", "2026-11-05T07:00:00.000Z"));
    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-01"));
    store.saveActivityWorkout(workout("garmin:2", "u1", "2026-11-02", { status: "none", steps: [] }));
    store.saveActivityWorkout(workout("garmin:3", "u1", "2026-11-03", { status: "unavailable", attempts: 1 }));
    store.saveActivityWorkout(workout("garmin:4", "u1", "2026-11-04", { status: "unavailable", attempts: 2 }));

    expect(
      store.listWorkoutCandidates("u1", "2026-11-01", "2026-11-30", 10, 2).map((candidate) => [
        candidate.activity.activityId,
        candidate.attempts,
      ]),
    ).toEqual([["garmin:3", 1]]);

    expect(store.listWorkoutCandidates("u1", "2026-11-01", "2026-11-30", 1, 2)).toHaveLength(1);
    expect(store.listWorkoutCandidates("u1", "2026-11-01", "2026-11-30", 0, 2)).toEqual([]);
    expect(store.listWorkoutCandidates("u2", "2026-11-01", "2026-11-30", 10, 2)).toEqual([]);
  });

  it("turns a failed attempt into a found workout without duplicating the row", () => {
    const { store } = memoryStore();
    store.appendActivity(activity("garmin:1", "u1", "2026-11-01", "2026-11-01T07:00:00.000Z"));
    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-01", { status: "unavailable", attempts: 1 }));

    expect(store.listWorkoutCandidates("u1", "2026-11-01", "2026-11-30", 10, 2)).toHaveLength(1);

    store.saveActivityWorkout(workout("garmin:1", "u1", "2026-11-01"));

    expect(store.getActivityWorkout("u1", "garmin:1")?.status).toBe("ok");
    expect(store.listWorkoutCandidates("u1", "2026-11-01", "2026-11-30", 10, 2)).toEqual([]);
  });
});

describe("sync state", () => {
  it("records the last sync per runner", () => {
    const { store } = memoryStore();
    expect(store.getLastSync("u1")).toBeNull();
    store.recordSync("u1", "2026-02-01T07:00:00.000Z");
    store.recordSync("u2", "2026-02-01T08:00:00.000Z");
    expect(store.getLastSync("u1")).toBe("2026-02-01T07:00:00.000Z");
    store.recordSync("u1", "2026-02-02T07:00:00.000Z");
    expect(store.getLastSync("u1")).toBe("2026-02-02T07:00:00.000Z");
    expect(store.getLastSync("u2")).toBe("2026-02-01T08:00:00.000Z");
  });
});

describe("Garmin keys", () => {
  it("saves, replaces and isolates a runner's key", () => {
    const { store } = memoryStore();
    expect(store.getGarminKey("u1")).toBeUndefined();
    store.saveGarminKey(garminKey("u1", "first-key", "2026-02-01T07:00:00.000Z"));
    expect(store.getGarminKey("u1")).toEqual(garminKey("u1", "first-key", "2026-02-01T07:00:00.000Z"));
    store.saveGarminKey(garminKey("u1", "second-key", "2026-02-02T07:00:00.000Z"));
    expect(store.getGarminKey("u1")?.apiKey).toBe("second-key");
    expect(store.getGarminKey("u2")).toBeUndefined();
    store.saveGarminKey(garminKey("u2", "other-key", "2026-02-03T07:00:00.000Z"));
    expect(store.getGarminKey("u1")?.apiKey).toBe("second-key");
    expect(store.getGarminKey("u2")?.apiKey).toBe("other-key");
  });

  it("deletes one runner's key without touching another runner", () => {
    const { store } = memoryStore();
    store.saveGarminKey(garminKey("u1", "first-key", "2026-02-01T07:00:00.000Z"));
    store.saveGarminKey(garminKey("u2", "other-key", "2026-02-03T07:00:00.000Z"));
    expect(store.deleteGarminKey("u1")).toBe(true);
    expect(store.getGarminKey("u1")).toBeUndefined();
    expect(store.getGarminKey("u2")?.apiKey).toBe("other-key");
    expect(store.deleteGarminKey("u1")).toBe(false);
  });
});

describe("notifications", () => {
  it("lists newest first, counts unread and marks every unread as read", () => {
    const { store } = memoryStore();
    store.appendNotification(notification("n1", "u1", "2026-02-01T07:00:00.000Z"));
    store.appendNotification(notification("n2", "u1", "2026-02-02T07:00:00.000Z", { status: "error" }));
    store.appendNotification(notification("n3", "u1", "2026-02-03T07:00:00.000Z"));

    expect(store.listNotifications("u1").map((n) => n.notificationId)).toEqual(["n3", "n2", "n1"]);
    expect(store.listNotifications("u1", 2).map((n) => n.notificationId)).toEqual(["n3", "n2"]);
    expect(store.countUnreadNotifications("u1")).toBe(3);

    store.markNotificationsRead("u1", "2026-02-04T07:00:00.000Z");
    expect(store.countUnreadNotifications("u1")).toBe(0);
    expect(store.listNotifications("u1").every((n) => n.readAt === "2026-02-04T07:00:00.000Z")).toBe(true);
  });

  it("isolates notifications per runner", () => {
    const { store } = memoryStore();
    store.appendNotification(notification("n1", "u1", "2026-02-01T07:00:00.000Z"));
    store.appendNotification(notification("n2", "u2", "2026-02-01T08:00:00.000Z"));

    expect(store.listNotifications("u1").map((n) => n.notificationId)).toEqual(["n1"]);
    expect(store.listNotifications("u2").map((n) => n.notificationId)).toEqual(["n2"]);
    expect(store.listNotifications("u3")).toEqual([]);
    expect(store.countUnreadNotifications("u3")).toBe(0);
    store.markNotificationsRead("u2", "2026-02-02T00:00:00.000Z");
    expect(store.countUnreadNotifications("u1")).toBe(1);
    expect(store.countUnreadNotifications("u2")).toBe(0);
  });
});

describe("persistence", () => {
  it("keeps rows across close and reopen of a file database", () => {
    const dir = mkdtempSync(join(tmpdir(), "training-planner-store-"));
    const dbPath = join(dir, "store.db");
    const handle = createStore(`sqlite:${dbPath}`);
    handles.push(handle);

    try {
      handle.store.createUser(profile("u1", "alice"));
      handle.store.appendMessage(message("m1", "u1", "2026-01-01T08:00:00.000Z"));
      handle.store.appendMemory(memory("k1", "u1", "2026-01-01T08:30:00.000Z"));
      handle.store.upsertSession(session("s1", "u1", "2026-02-10", "2026-01-01T09:00:00.000Z"));
      handle.store.appendActivity(activity("a1", "u1", "2026-01-05", "2026-01-05T07:00:00.000Z"));
      handle.store.appendChangeSet(
        changeSet("change:1", "u1", "2026-01-01T10:00:00.000Z", [
          entry("add", null, session("s1", "u1", "2026-02-10", "2026-01-01T09:00:00.000Z")),
        ]),
      );
      handle.close();

      const reopened = createStore(`sqlite:${dbPath}`);
      handles.push(reopened);
      expect(reopened.store.getUserByUsername("ALICE")?.userId).toBe("u1");
      expect(reopened.store.listMessages("u1").map((m) => m.messageId)).toEqual(["m1"]);
      expect(reopened.store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1"]);
      expect(reopened.store.listSessions("u1", "2026-02-01", "2026-02-28").map((s) => s.sessionId)).toEqual([
        "s1",
      ]);
      expect(reopened.store.listActivities("u1").map((a) => a.activityId)).toEqual(["a1"]);
      expect(reopened.store.listChangeSets("u1").map((set) => set.changeSetId)).toEqual(["change:1"]);
    } finally {
      while (handles.length > 0) {
        handles.pop()?.close();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("persistence of Garmin connection data", () => {
  it("keeps keys and notifications across close and reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "training-planner-garmin-store-"));
    const dbPath = join(dir, "store.db");
    const handle = createStore(`sqlite:${dbPath}`);
    handles.push(handle);

    try {
      handle.store.saveGarminKey(garminKey("u1", "saved-key", "2026-02-01T07:00:00.000Z"));
      handle.store.appendNotification(
        notification("n1", "u1", "2026-02-01T07:01:00.000Z", { body: "Morning run was added." }),
      );
      handle.close();

      const reopened = createStore(`sqlite:${dbPath}`);
      handles.push(reopened);
      expect(reopened.store.getGarminKey("u1")).toEqual(garminKey("u1", "saved-key", "2026-02-01T07:00:00.000Z"));
      expect(reopened.store.listNotifications("u1")[0]?.body).toBe("Morning run was added.");
      expect(reopened.store.countUnreadNotifications("u1")).toBe(1);
    } finally {
      while (handles.length > 0) {
        handles.pop()?.close();
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("user isolation", () => {
  it("never returns another user's rows", () => {
    const { store } = memoryStore();
    store.appendMessage(message("m1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendMemory(memory("k1", "u1", "2026-01-01T08:00:00.000Z"));
    store.upsertSession(session("s1", "u1", "2026-02-10", "2026-01-01T08:00:00.000Z"));
    store.appendActivity(activity("a1", "u1", "2026-01-02", "2026-01-02T07:00:00.000Z"));

    store.appendMessage(message("m2", "u2", "2026-01-01T08:00:00.000Z"));
    store.appendMemory(memory("k2", "u2", "2026-01-01T08:00:00.000Z"));
    store.upsertSession(session("s2", "u2", "2026-02-10", "2026-01-01T08:00:00.000Z"));
    store.appendActivity(activity("a2", "u2", "2026-01-03", "2026-01-03T07:00:00.000Z"));

    expect(store.listMessages("u2").map((m) => m.messageId)).toEqual(["m2"]);
    expect(store.listMemories("u2").map((m) => m.memoryId)).toEqual(["k2"]);
    expect(store.listSessions("u2", "2026-01-01", "2026-12-31").map((s) => s.sessionId)).toEqual([
      "s2",
    ]);
    expect(store.listActivities("u2").map((a) => a.activityId)).toEqual(["a2"]);

    expect(store.listMessages("u3")).toEqual([]);
    expect(store.listMemories("u3")).toEqual([]);
    expect(store.listSessions("u3", "2026-01-01", "2026-12-31")).toEqual([]);
    expect(store.listActivities("u3")).toEqual([]);
  });
});

describe("session CRUD for coach actions", () => {
  it("gets and deletes one session without touching another", () => {
    const { store, close } = createStore(":memory:");
    const base = {
      userId: "u",
      title: "Easy 5 km",
      kind: "easy" as const,
      distanceKm: 5,
      durationMin: 35,
      note: null,
      createdAt: "2026-11-05T00:00:00.000Z",
    };
    store.upsertSession({ ...base, sessionId: "s1", day: "2026-11-06" });
    store.upsertSession({ ...base, sessionId: "s2", day: "2026-11-07", title: "Long 8 km", kind: "long" });
    expect(store.getSession("u", "s1")?.title).toBe("Easy 5 km");
    expect(store.deleteSession("u", "s1")).toBe(true);
    expect(store.getSession("u", "s1")).toBeUndefined();
    expect(store.deleteSession("u", "missing")).toBe(false);
    expect(store.listSessions("u", "2026-11-01", "2026-11-30")).toHaveLength(1);
    close();
  });
});

describe("users", () => {
  it("creates a profile and reads it back by id and by username, case-insensitively", () => {
    const { store, close } = createStore(":memory:");
    store.createUser(profile("u1", "alice"));
    store.createUser(profile("u2", "bob"));

    expect(store.getUser("u1")).toEqual(profile("u1", "alice"));
    expect(store.getUserByUsername("alice")?.userId).toBe("u1");
    expect(store.getUserByUsername("ALICE")?.userId).toBe("u1");
    expect(store.getUserByUsername("  Alice  ")?.userId).toBe("u1");
    expect(store.getUserByUsername("bob")?.userId).toBe("u2");
    expect(store.getUserByUsername("carol")).toBeUndefined();
    expect(store.getUser("missing")).toBeUndefined();
    close();
  });

  it("rejects a duplicate username regardless of case", () => {
    const { store, close } = createStore(":memory:");
    store.createUser(profile("u1", "alice"));
    expect(() => store.createUser(profile("u2", "ALICE"))).toThrow(/username already taken/);
    expect(store.getUser("u2")).toBeUndefined();
    close();
  });

  it("updates only the mutable fields and keeps the login name", () => {
    const { store, close } = createStore(":memory:");
    store.createUser(profile("u1", "alice"));
    const updated = store.updateUser("u1", {
      displayName: "Alice",
      timezone: "Europe/Berlin",
      goal: "10k in 8 weeks",
      passwordHash: "scrypt:new",
    });

    expect(updated).toMatchObject({
      userId: "u1",
      username: "alice",
      displayName: "Alice",
      timezone: "Europe/Berlin",
      goal: "10k in 8 weeks",
      passwordHash: "scrypt:new",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(store.getUser("u1")?.displayName).toBe("Alice");
    expect(store.getUserByUsername("alice")?.goal).toBe("10k in 8 weeks");
    expect(store.updateUser("missing", { displayName: "x" })).toBeUndefined();
    close();
  });

  it("can clear the goal back to null", () => {
    const { store, close } = createStore(":memory:");
    store.createUser(profile("u1", "alice"));
    store.updateUser("u1", { goal: "10k in 8 weeks" });
    store.updateUser("u1", { goal: null });
    expect(store.getUser("u1")?.goal).toBeNull();
    close();
  });
});

describe("change sets", () => {
  it("appends newest first and honours the limit", () => {
    const { store, close } = createStore(":memory:");
    store.appendChangeSet(changeSet("change:1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendChangeSet(changeSet("change:2", "u1", "2026-01-02T08:00:00.000Z"));
    store.appendChangeSet(changeSet("change:3", "u1", "2026-01-03T08:00:00.000Z"));

    expect(store.listChangeSets("u1").map((set) => set.changeSetId)).toEqual([
      "change:3",
      "change:2",
      "change:1",
    ]);
    expect(store.listChangeSets("u1", 2).map((set) => set.changeSetId)).toEqual(["change:3", "change:2"]);
    expect(store.listChangeSets("u1", 0)).toEqual([]);
    expect(store.listChangeSets("u2")).toEqual([]);
    close();
  });

  it("keeps the before/after snapshots on every entry", () => {
    const { store, close } = createStore(":memory:");
    const before = session("s1", "u1", "2026-02-10", "2026-02-01T08:00:00.000Z");
    const after = session("s1", "u1", "2026-02-11", "2026-02-02T08:00:00.000Z", { title: "Moved" });
    store.appendChangeSet(changeSet("change:1", "u1", "2026-02-02T09:00:00.000Z", [entry("update", before, after)]));

    const stored = store.getChangeSet("u1", "change:1");
    expect(stored?.entries).toHaveLength(1);
    expect(stored?.entries[0]).toMatchObject({
      action: "update",
      sessionId: "s1",
      fromDay: "2026-02-10",
      toDay: "2026-02-11",
      title: "Moved",
      kind: "easy",
    });
    expect(stored?.entries[0]?.before?.day).toBe("2026-02-10");
    expect(stored?.entries[0]?.after?.day).toBe("2026-02-11");
    expect(stored?.revertedAt).toBeNull();
    close();
  });

  it("marks a change set reverted once and never twice", () => {
    const { store, close } = createStore(":memory:");
    store.appendChangeSet(changeSet("change:1", "u1", "2026-01-01T08:00:00.000Z"));

    expect(store.markChangeSetReverted("u1", "change:1", "2026-01-02T08:00:00.000Z")).toBe(true);
    expect(store.getChangeSet("u1", "change:1")?.revertedAt).toBe("2026-01-02T08:00:00.000Z");
    expect(store.markChangeSetReverted("u1", "change:1", "2026-01-03T08:00:00.000Z")).toBe(false);
    expect(store.getChangeSet("u1", "change:1")?.revertedAt).toBe("2026-01-02T08:00:00.000Z");
    expect(store.markChangeSetReverted("u1", "change:missing", "2026-01-03T08:00:00.000Z")).toBe(false);
    close();
  });

  it("never returns another user's change sets", () => {
    const { store, close } = createStore(":memory:");
    store.appendChangeSet(changeSet("change:1", "u1", "2026-01-01T08:00:00.000Z"));
    store.appendChangeSet(changeSet("change:2", "u2", "2026-01-02T08:00:00.000Z"));

    expect(store.listChangeSets("u2").map((set) => set.changeSetId)).toEqual(["change:2"]);
    expect(store.getChangeSet("u2", "change:1")).toBeUndefined();
    expect(store.markChangeSetReverted("u2", "change:1", "2026-01-03T08:00:00.000Z")).toBe(false);
    expect(store.getChangeSet("u1", "change:1")?.revertedAt).toBeNull();
    close();
  });
});

describe("transactions", () => {
  it("commits a batch and rolls the whole batch back on failure", () => {
    const { store, close } = createStore(":memory:");
    const first = session("s1", "u1", "2026-02-10", "2026-02-01T08:00:00.000Z");
    const second = session("s2", "u1", "2026-02-11", "2026-02-01T08:00:00.000Z");

    store.transaction(() => {
      store.upsertSession(first);
      store.upsertSession(second);
    });
    expect(store.listSessions("u1", "2026-02-01", "2026-02-28")).toHaveLength(2);

    expect(() =>
      store.transaction(() => {
        store.deleteSession("u1", "s1");
        store.deleteSession("u1", "s2");
        throw new Error("simulated mid-batch failure");
      }),
    ).toThrow("simulated mid-batch failure");
    expect(store.listSessions("u1", "2026-02-01", "2026-02-28")).toHaveLength(2);
    close();
  });
});

describe("coach turn audit", () => {
  const record = (requestId: string) => ({
    requestId,
    userId: "u1",
    createdAt: "2026-02-01T08:00:00.000Z",
    completedAt: null,
    status: "in_progress" as const,
    attempts: 0,
    validationCode: null,
    outcome: null,
    responseJson: null,
    directiveHash: null,
  });

  it("claims a request once, completes it, and never reclaims a completed turn", () => {
    const { store, close } = createStore(":memory:");
    expect(store.claimCoachTurn(record("req-1"))).toBe(true);
    expect(store.claimCoachTurn(record("req-1"))).toBe(false);
    expect(store.getCoachTurn("u1", "req-1")?.status).toBe("in_progress");

    store.completeCoachTurn("u1", "req-1", {
      completedAt: "2026-02-01T08:00:01.000Z",
      attempts: 2,
      validationCode: "past-session",
      outcome: "clarified",
      responseJson: '{"ok":true}',
    });
    const completed = store.getCoachTurn("u1", "req-1");
    expect(completed).toMatchObject({
      status: "completed",
      attempts: 2,
      validationCode: "past-session",
      outcome: "clarified",
      responseJson: '{"ok":true}',
    });
    expect(store.claimCoachTurn(record("req-1"))).toBe(false);
    expect(store.getCoachTurn("u2", "req-1")).toBeUndefined();
    close();
  });

  it("allows a failed turn to be retried with the same request id", () => {
    const { store, close } = createStore(":memory:");
    expect(store.claimCoachTurn(record("req-2"))).toBe(true);
    store.failCoachTurn("u1", "req-2", "2026-02-01T08:00:02.000Z");
    expect(store.getCoachTurn("u1", "req-2")?.status).toBe("failed");
    expect(store.claimCoachTurn(record("req-2"))).toBe(true);
    expect(store.getCoachTurn("u1", "req-2")).toMatchObject({
      status: "in_progress",
      completedAt: null,
      responseJson: null,
    });
    close();
  });

  it("stores the directive hash on a claim and lets a failed retry replace it", () => {
    const { store, close } = createStore(":memory:");
    expect(store.claimCoachTurn({ ...record("req-hash"), directiveHash: "hash-a" })).toBe(true);
    expect(store.getCoachTurn("u1", "req-hash")?.directiveHash).toBe("hash-a");
    store.failCoachTurn("u1", "req-hash", "2026-02-01T08:00:02.000Z");
    expect(store.claimCoachTurn({ ...record("req-hash"), directiveHash: "hash-b" })).toBe(true);
    expect(store.getCoachTurn("u1", "req-hash")?.directiveHash).toBe("hash-b");
    close();
  });

  it("appends and lists hidden directives newest first, scoped to one runner", () => {
    const { store, close } = createStore(":memory:");
    const directive = {
      mode: "review" as const,
      allowCalendarWrites: false,
      allowMemoryWrites: true,
      focus: ["schedule" as const],
      references: { activityId: "garmin:1", day: "2026-11-04" },
      background: "Comment only.",
      source: "run-peek" as const,
      style: { language: "auto" as const, tone: "supportive" as const },
    };
    store.appendCoachDirective({
      directiveId: "directive:1",
      userId: "u1",
      requestId: "req-1",
      messageId: "m-1",
      visible: "How did my run go?",
      directive,
      renderedPromptSuffix: null,
      blockedWrites: 0,
      createdAt: "2026-02-01T08:00:00.000Z",
    });
    store.appendCoachDirective({
      directiveId: "directive:2",
      userId: "u1",
      requestId: "req-2",
      messageId: "m-2",
      visible: "Review this week",
      directive: { ...directive, mode: "review", allowCalendarWrites: false },
      renderedPromptSuffix: null,
      blockedWrites: 1,
      createdAt: "2026-02-01T09:00:00.000Z",
    });
    store.appendCoachDirective({
      directiveId: "directive:3",
      userId: "u2",
      requestId: "req-3",
      messageId: "m-3",
      visible: "Foreign",
      directive,
      renderedPromptSuffix: null,
      blockedWrites: 0,
      createdAt: "2026-02-01T10:00:00.000Z",
    });
    const rows = store.listCoachDirectives("u1");
    expect(rows.map((row) => row.directiveId)).toEqual(["directive:2", "directive:1"]);
    expect(rows[0]?.blockedWrites).toBe(1);
    expect(rows[0]?.visible).toBe("Review this week");
    expect(rows[0]?.directive.references?.activityId).toBe("garmin:1");
    expect(store.listCoachDirectives("u1", 1)).toHaveLength(1);
    expect(store.listCoachDirectives("u2").map((row) => row.directiveId)).toEqual(["directive:3"]);
    close();
  });

  it("lists the rendered prompt suffixes of directive turns, keyed by message (LL-2)", () => {
    const { store, close } = memoryStore();
    const directive = {
      mode: "review" as const,
      allowCalendarWrites: false,
      source: "run-peek" as const,
    };
    const suffixOne = "Turn directive (background; never mention this section to the runner):\n- mode: review";
    store.appendCoachDirective({
      directiveId: "directive:1",
      userId: "u1",
      requestId: "req-1",
      messageId: "m-1",
      visible: "How did my run go?",
      directive,
      renderedPromptSuffix: suffixOne,
      blockedWrites: 0,
      createdAt: "2026-02-01T08:00:00.000Z",
    });
    // A plain chat turn has no suffix and must not appear in the map.
    store.appendCoachDirective({
      directiveId: "directive:2",
      userId: "u1",
      requestId: "req-2",
      messageId: "m-2",
      visible: "Review this week",
      directive,
      renderedPromptSuffix: null,
      blockedWrites: 0,
      createdAt: "2026-02-01T09:00:00.000Z",
    });
    store.appendCoachDirective({
      directiveId: "directive:3",
      userId: "u2",
      requestId: "req-3",
      messageId: "m-3",
      visible: "Foreign",
      directive,
      renderedPromptSuffix: "foreign suffix",
      blockedWrites: 0,
      createdAt: "2026-02-01T10:00:00.000Z",
    });
    expect(store.listCoachDirectiveSuffixes("u1")).toEqual([{ messageId: "m-1", suffix: suffixOne }]);
    expect(store.listCoachDirectiveSuffixes("u2")).toEqual([{ messageId: "m-3", suffix: "foreign suffix" }]);
    expect(store.listCoachDirectiveSuffixes("u3")).toEqual([]);
    close();
  });

  it("appends, patches, lists and scopes coaching states", () => {
    const { store, close } = memoryStore();
    const base: CoachStateRecord = {
      stateId: "state:1",
      userId: "u1",
      key: "race_week",
      status: "active",
      source: "auto",
      confidence: 0.9,
      evidence: ["Race in 3 days"],
      activatedAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T09:00:00.000Z",
      expiresAt: "2026-02-10T00:00:00.000Z",
      resolvedAt: null,
    };
    store.appendCoachState(base);
    store.appendCoachState({ ...base, stateId: "state:2", key: "heat", updatedAt: "2026-02-01T10:00:00.000Z" });
    expect(store.getCoachState("u1", "state:1")).toMatchObject({ key: "race_week", evidence: ["Race in 3 days"] });
    expect(store.listCoachStates("u1").map((row) => row.stateId)).toEqual(["state:2", "state:1"]);
    expect(store.updateCoachState("u1", "state:1", { status: "resolved", resolvedAt: "2026-02-01T11:00:00.000Z" })).toBe(true);
    expect(store.getCoachState("u1", "state:1")).toMatchObject({ status: "resolved", resolvedAt: "2026-02-01T11:00:00.000Z" });
    expect(store.updateCoachState("u2", "state:1", { status: "active" })).toBe(false);
    expect(store.updateCoachState("u1", "state:missing", { status: "active" })).toBe(false);
    expect(store.listCoachStates("u2")).toHaveLength(0);
    expect(store.listCoachStates("u1", 1)).toHaveLength(1);
    close();
  });

  it("appends, lists and prunes coaching state events", () => {
    const { store, close } = memoryStore();
    const event = (eventId: string, userId: string, createdAt: string, action: "activate" | "resolve"): CoachStateEvent => ({
      eventId,
      userId,
      stateId: "state:1",
      key: "race_week",
      action,
      fromStatus: action === "resolve" ? "active" : null,
      toStatus: action === "resolve" ? "resolved" : "active",
      source: "auto",
      confidence: 0.9,
      evidence: ["Race"],
      createdAt,
    });
    store.appendCoachStateEvent(event("state-event:1", "u1", "2026-02-01T00:00:00.000Z", "activate"));
    store.appendCoachStateEvent(event("state-event:2", "u1", "2026-02-02T00:00:00.000Z", "resolve"));
    store.appendCoachStateEvent(event("state-event:3", "u2", "2026-02-03T00:00:00.000Z", "activate"));
    expect(store.listCoachStateEvents("u1").map((row) => row.eventId)).toEqual(["state-event:2", "state-event:1"]);
    expect(store.listCoachStateEvents("u1", 1).map((row) => row.eventId)).toEqual(["state-event:2"]);
    expect(store.listCoachStateEvents("u2").map((row) => row.eventId)).toEqual(["state-event:3"]);

    store.pruneCoachStates("u1", "2026-02-01T12:00:00.000Z");
    expect(store.listCoachStateEvents("u1").map((row) => row.eventId)).toEqual(["state-event:2"]);
    close();
  });

  it("returns only active or observing unexpired states, newest first", () => {
    const { store, close } = memoryStore();
    const base: CoachStateRecord = {
      stateId: "state:active",
      userId: "u1",
      key: "race_week",
      status: "active",
      source: "auto",
      confidence: 0.9,
      evidence: ["Race"],
      activatedAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T09:00:00.000Z",
      expiresAt: "2026-02-10T00:00:00.000Z",
      resolvedAt: null,
    };
    store.appendCoachState(base);
    store.appendCoachState({ ...base, stateId: "state:observing", key: "pain_injury", status: "observing", source: "chat", updatedAt: "2026-02-01T10:00:00.000Z" });
    store.appendCoachState({ ...base, stateId: "state:resolved", status: "resolved", updatedAt: "2026-02-01T11:00:00.000Z", resolvedAt: "2026-02-01T11:00:00.000Z" });
    store.appendCoachState({ ...base, stateId: "state:expired", updatedAt: "2026-02-01T12:00:00.000Z", expiresAt: "2026-02-04T00:00:00.000Z" });
    store.appendCoachState({ ...base, stateId: "state:foreign", userId: "u2", updatedAt: "2026-02-01T13:00:00.000Z" });
    expect(store.getActiveCoachStates("u1", "2026-02-05T00:00:00.000Z").map((row) => row.stateId)).toEqual([
      "state:observing",
      "state:active",
    ]);
    expect(store.listCoachStates("u1").map((row) => row.stateId)).toEqual([
      "state:expired",
      "state:resolved",
      "state:observing",
      "state:active",
    ]);
    close();
  });
});

describe("muscle check-ins", () => {
  const checkIn = (checkInId: string, userId: string, day: string, createdAt: string): MuscleCheckIn => ({
    checkInId,
    userId,
    day,
    activityId: null,
    muscles: [
      { muscleId: "calves", soreness: 6, conditions: ["tight"], side: "left", warmUp: null },
      { muscleId: "quads", soreness: 2, conditions: [], side: "both", warmUp: null },
    ],
    note: null,
    createdAt,
  });

  it("appends, fetches and lists newest first without crossing runners", () => {
    const { store, close } = memoryStore();
    store.appendMuscleCheckIn(checkIn("checkin:1", "u1", "2026-11-03", "2026-11-03T08:00:00.000Z"));
    store.appendMuscleCheckIn(checkIn("checkin:2", "u1", "2026-11-05", "2026-11-05T08:00:00.000Z"));
    store.appendMuscleCheckIn(checkIn("checkin:other", "u2", "2026-11-05", "2026-11-05T08:00:00.000Z"));
    expect(store.listMuscleCheckIns("u1").map((row) => row.checkInId)).toEqual(["checkin:2", "checkin:1"]);
    expect(store.listMuscleCheckIns("u1", 1).map((row) => row.checkInId)).toEqual(["checkin:2"]);
    expect(store.listMuscleCheckIns("u2").map((row) => row.checkInId)).toEqual(["checkin:other"]);
    expect(store.listMuscleCheckIns("u1", 0)).toEqual([]);
    expect(store.getMuscleCheckIn("u1", "checkin:1")?.day).toBe("2026-11-03");
    expect(store.getMuscleCheckIn("u1", "checkin:1")?.muscles[0]).toMatchObject({ muscleId: "calves", soreness: 6, side: "left" });
    expect(store.getMuscleCheckIn("u2", "checkin:1")).toBeUndefined();
    close();
  });

  it("keeps muscle check-ins across a reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "milebook-muscle-"));
    const dbPath = join(directory, "muscle.sqlite");
    const handle = createStore(`sqlite:${dbPath}`);
    handle.store.appendMuscleCheckIn(checkIn("checkin:persist", "u1", "2026-11-05", "2026-11-05T08:00:00.000Z"));
    handle.close();
    const reopened = createStore(`sqlite:${dbPath}`);
    const rows = reopened.store.listMuscleCheckIns("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.muscles[0]?.muscleId).toBe("calves");
    expect(rows[0]?.muscles[1]?.soreness).toBe(2);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
});

describe("muscle proposals", () => {
  const proposal = (
    userId: string,
    proposalId: string,
    status: MuscleProposalStatus,
    createdAt: string,
  ): MuscleProposal => ({
    proposalId,
    userId,
    action: "report",
    muscleId: "calves",
    soreness: 6,
    conditions: ["tight"],
    side: "left",
    warmUp: null,
    note: null,
    evidence: ["my calf is tight"],
    confidence: 0.8,
    day: createdAt.slice(0, 10),
    status,
    createdAt,
    updatedAt: createdAt,
    decidedAt: status === "proposed" ? null : createdAt,
  });

  it("appends, fetches and filters by status without crossing runners", () => {
    const { store, close } = memoryStore();
    store.appendMuscleProposal(proposal("u1", "p1", "proposed", "2026-11-03T08:00:00.000Z"));
    store.appendMuscleProposal(proposal("u1", "p2", "confirmed", "2026-11-04T08:00:00.000Z"));
    store.appendMuscleProposal(proposal("u1", "p3", "proposed", "2026-11-05T08:00:00.000Z"));
    store.appendMuscleProposal(proposal("u2", "other", "proposed", "2026-11-05T08:00:00.000Z"));
    expect(store.listMuscleProposals("u1").map((row) => row.proposalId)).toEqual(["p3", "p2", "p1"]);
    expect(store.listMuscleProposals("u1", "proposed").map((row) => row.proposalId)).toEqual(["p3", "p1"]);
    expect(store.listMuscleProposals("u1", "proposed", 1).map((row) => row.proposalId)).toEqual(["p3"]);
    expect(store.listMuscleProposals("u1", undefined, 0)).toEqual([]);
    expect(store.getMuscleProposal("u1", "p2")?.status).toBe("confirmed");
    expect(store.getMuscleProposal("u1", "p2")?.evidence).toEqual(["my calf is tight"]);
    expect(store.getMuscleProposal("u2", "p1")).toBeUndefined();
    close();
  });

  it("replaces a row when the runner decides and keeps it across a reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "milebook-muscle-proposals-"));
    const dbPath = join(directory, "proposals.sqlite");
    const handle = createStore(`sqlite:${dbPath}`);
    handle.store.appendMuscleProposal(proposal("u1", "p1", "proposed", "2026-11-05T08:00:00.000Z"));
    const decided: MuscleProposal = {
      ...proposal("u1", "p1", "confirmed", "2026-11-05T08:00:00.000Z"),
      decidedAt: "2026-11-05T09:00:00.000Z",
      updatedAt: "2026-11-05T09:00:00.000Z",
    };
    handle.store.updateMuscleProposal(decided);
    expect(handle.store.getMuscleProposal("u1", "p1")).toMatchObject({
      status: "confirmed",
      decidedAt: "2026-11-05T09:00:00.000Z",
    });
    handle.close();
    const reopened = createStore(`sqlite:${dbPath}`);
    expect(reopened.store.listMuscleProposals("u1", "confirmed")).toHaveLength(1);
    expect(reopened.store.listMuscleProposals("u1", "proposed")).toHaveLength(0);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps the newest rows and drops the journal tail", () => {
    const { store, close } = memoryStore();
    for (let index = 0; index < 45; index += 1) {
      const minute = String(index).padStart(2, "0");
      store.appendMuscleProposal(
        proposal("u1", `p${index}`, "confirmed", `2026-11-05T08:${minute}:00.000Z`),
      );
    }
    const rows = store.listMuscleProposals("u1", undefined, 100);
    expect(rows).toHaveLength(40);
    expect(rows[0]?.proposalId).toBe("p44");
    expect(rows.some((row) => row.proposalId === "p4")).toBe(false);
    close();
  });
});

describe("muscle status controls", () => {
  const control = (userId: string, muscleId: string, hold: boolean, resolvedDay: string | null): MuscleStatusControl => ({
    userId,
    muscleId,
    hold,
    resolvedDay,
    updatedAt: "2026-11-05T08:00:00.000Z",
  });

  it("upserts one row per muscle and replaces it without crossing runners", () => {
    const { store, close } = memoryStore();
    store.upsertMuscleStatusControl(control("u1", "calves", true, null));
    store.upsertMuscleStatusControl(control("u1", "calves", false, "2026-11-05"));
    store.upsertMuscleStatusControl(control("u1", "quads", false, null));
    store.upsertMuscleStatusControl(control("u2", "calves", true, null));
    expect(store.listMuscleStatusControls("u1")).toHaveLength(2);
    const calves = store.listMuscleStatusControls("u1").find((row) => row.muscleId === "calves");
    expect(calves).toMatchObject({ userId: "u1", hold: false, resolvedDay: "2026-11-05" });
    const other = store.listMuscleStatusControls("u2");
    expect(other).toHaveLength(1);
    expect(other[0]?.hold).toBe(true);
    close();
  });

  it("keeps status controls across a reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "milebook-muscle-controls-"));
    const dbPath = join(directory, "controls.sqlite");
    const handle = createStore(`sqlite:${dbPath}`);
    handle.store.upsertMuscleStatusControl(control("u1", "calves", true, null));
    handle.close();
    const reopened = createStore(`sqlite:${dbPath}`);
    const rows = reopened.store.listMuscleStatusControls("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ muscleId: "calves", hold: true, resolvedDay: null });
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
});

