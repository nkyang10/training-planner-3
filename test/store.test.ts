import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStore, type StoreHandle } from "../src/store";
import type { Activity, Memory, Message, TrainingSession } from "../src/types";

const handles: StoreHandle[] = [];

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
});

describe("persistence", () => {
  it("keeps rows across close and reopen of a file database", () => {
    const dir = mkdtempSync(join(tmpdir(), "training-planner-store-"));
    const dbPath = join(dir, "store.db");
    const handle = createStore(`sqlite:${dbPath}`);
    handles.push(handle);

    try {
      handle.store.appendMessage(message("m1", "u1", "2026-01-01T08:00:00.000Z"));
      handle.store.appendMemory(memory("k1", "u1", "2026-01-01T08:30:00.000Z"));
      handle.store.upsertSession(session("s1", "u1", "2026-02-10", "2026-01-01T09:00:00.000Z"));
      handle.store.appendActivity(activity("a1", "u1", "2026-01-05", "2026-01-05T07:00:00.000Z"));
      handle.close();

      const reopened = createStore(`sqlite:${dbPath}`);
      handles.push(reopened);
      expect(reopened.store.listMessages("u1").map((m) => m.messageId)).toEqual(["m1"]);
      expect(reopened.store.listMemories("u1").map((m) => m.memoryId)).toEqual(["k1"]);
      expect(reopened.store.listSessions("u1", "2026-02-01", "2026-02-28").map((s) => s.sessionId)).toEqual([
        "s1",
      ]);
      expect(reopened.store.listActivities("u1").map((a) => a.activityId)).toEqual(["a1"]);
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

