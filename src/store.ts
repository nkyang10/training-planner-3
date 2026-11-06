import { createRequire } from "node:module";
import type { Activity, Memory, Message, Store, TrainingSession } from "./types";

/**
 * `node:sqlite` is loaded through `createRequire` instead of a static import.
 * Node 24 keeps `sqlite` out of `module.builtinModules`, so Vite 5 (pinned by
 * vitest 2.1) fails to externalize `node:sqlite` and tries to resolve it as a
 * package. A runtime require keeps the same synchronous API in Node and tests.
 */
interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

export interface StoreHandle { store: Store; close(): void; }

/**
 * SQLite-backed store. Every row keeps the full record as a JSON payload and
 * mirrors the columns we filter or order on, so reads never cross users.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_user_created ON messages (user_id, created_at);

CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_user_created ON memories (user_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_day ON sessions (user_id, day);

CREATE TABLE IF NOT EXISTS activities (
  activity_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_user_day ON activities (user_id, day);
`;

const INSERT_MESSAGE =
  "INSERT INTO messages (message_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_MEMORY =
  "INSERT INTO memories (memory_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_ACTIVITY =
  "INSERT INTO activities (activity_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";
const UPSERT_SESSION =
  "INSERT OR REPLACE INTO sessions (session_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";

/** `:memory:` opens an ephemeral database; `sqlite:<path>` opens/creates a file. */
function resolveLocation(spec: string): string {
  if (spec === ":memory:") return spec;
  const prefix = "sqlite:";
  return spec.startsWith(prefix) ? spec.slice(prefix.length) : spec;
}

function decode<T>(payload: string): T {
  const parsed: unknown = JSON.parse(payload);
  return parsed as T;
}

function normalizeLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit)) return fallback;
  const floored = Math.floor(limit);
  return floored > 0 ? floored : 0;
}

class SqliteStore implements Store {
  private readonly db: SqliteDatabase;
  private closed = false;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec(SCHEMA);
  }

  appendMessage(message: Message): void {
    this.db
      .prepare(INSERT_MESSAGE)
      .run(message.messageId, message.userId, message.createdAt, JSON.stringify(message));
  }

  listMessages(userId: string, limit = 50): Message[] {
    const take = normalizeLimit(limit, 50);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        "SELECT payload FROM messages WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, take);
    return rows.map((row) => decode<Message>(String(row["payload"]))).reverse();
  }

  appendMemory(memory: Memory): void {
    this.db
      .prepare(INSERT_MEMORY)
      .run(memory.memoryId, memory.userId, memory.createdAt, JSON.stringify(memory));
  }

  listMemories(userId: string, limit = 200): Memory[] {
    const take = normalizeLimit(limit, 200);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        "SELECT payload FROM memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, take);
    return rows.map((row) => decode<Memory>(String(row["payload"]))).reverse();
  }

  listSessions(userId: string, fromDay: string, toDay: string): TrainingSession[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM sessions
          WHERE user_id = ? AND day >= ? AND day <= ?
          ORDER BY day ASC, created_at ASC, rowid ASC`,
      )
      .all(userId, fromDay, toDay);
    return rows.map((row) => decode<TrainingSession>(String(row["payload"])));
  }

  getSession(userId: string, sessionId: string): TrainingSession | undefined {
    const row = this.db
      .prepare("SELECT payload FROM sessions WHERE user_id = ? AND session_id = ?")
      .get(userId, sessionId);
    return row === undefined ? undefined : decode<TrainingSession>(String(row["payload"]));
  }

  deleteSession(userId: string, sessionId: string): boolean {
    const result = this.db.prepare("DELETE FROM sessions WHERE user_id = ? AND session_id = ?").run(userId, sessionId);
    return Number(result.changes) > 0;
  }

  upsertSession(session: TrainingSession): void {
    this.db
      .prepare(UPSERT_SESSION)
      .run(
        session.sessionId,
        session.userId,
        session.day,
        session.createdAt,
        JSON.stringify(session),
      );
  }

  replaceFutureSessions(
    userId: string,
    fromDay: string,
    sessions: readonly TrainingSession[],
  ): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM sessions WHERE user_id = ? AND day >= ?").run(userId, fromDay);
      const insert = this.db.prepare(UPSERT_SESSION);
      for (const session of sessions) {
        insert.run(
          session.sessionId,
          session.userId,
          session.day,
          session.createdAt,
          JSON.stringify(session),
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listActivities(userId: string, limit = 50): Activity[] {
    const take = normalizeLimit(limit, 50);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT payload FROM activities
          WHERE user_id = ?
          ORDER BY day DESC, created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(userId, take);
    return rows.map((row) => decode<Activity>(String(row["payload"])));
  }

  appendActivity(activity: Activity): void {
    this.db
      .prepare(INSERT_ACTIVITY)
      .run(
        activity.activityId,
        activity.userId,
        activity.day,
        activity.createdAt,
        JSON.stringify(activity),
      );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

export function createStore(spec: string): StoreHandle {
  const store = new SqliteStore(resolveLocation(spec));
  return { store, close: () => store.close() };
}
