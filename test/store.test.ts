import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStore, type StoreHandle } from "../src/store";
import type { Activity, ChangeEntry, ChangeSet, Memory, Message, TrainingSession, UserProfile } from "../src/types";

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
});

