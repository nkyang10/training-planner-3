import { createRequire } from "node:module";
import type {
  Activity,
  ChangeSet,
  CoachTurnCompletion,
  CoachTurnRecord,
  Memory,
  Message,
  Store,
  TrainingSession,
  UserProfile,
  UserProfilePatch,
} from "./types";

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
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS change_sets (
  change_set_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reverted_at TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS change_sets_user_created ON change_sets (user_id, created_at);

CREATE TABLE IF NOT EXISTS coach_turns (
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  validation_code TEXT,
  outcome TEXT,
  response_json TEXT,
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS coach_turns_user_created ON coach_turns (user_id, created_at);
`;

const INSERT_USER =
  "INSERT INTO users (user_id, username, created_at, payload) VALUES (?, ?, ?, ?)";
const UPDATE_USER = "UPDATE users SET payload = ? WHERE user_id = ?";
const INSERT_MESSAGE =
  "INSERT INTO messages (message_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_MEMORY =
  "INSERT INTO memories (memory_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_ACTIVITY =
  "INSERT INTO activities (activity_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";
const UPSERT_SESSION =
  "INSERT OR REPLACE INTO sessions (session_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";
const INSERT_CHANGE_SET =
  "INSERT INTO change_sets (change_set_id, user_id, created_at, reverted_at, payload) VALUES (?, ?, ?, ?, ?)";
const MARK_CHANGE_SET_REVERTED =
  "UPDATE change_sets SET reverted_at = ?, payload = ? WHERE user_id = ? AND change_set_id = ?";
const CLAIM_COACH_TURN = `
  INSERT INTO coach_turns (request_id, user_id, created_at, completed_at, status, attempts, validation_code, outcome, response_json)
  VALUES (?, ?, ?, NULL, 'in_progress', 0, NULL, NULL, NULL)
  ON CONFLICT(user_id, request_id) DO UPDATE SET
    created_at = excluded.created_at,
    completed_at = NULL,
    status = 'in_progress',
    attempts = 0,
    validation_code = NULL,
    outcome = NULL,
    response_json = NULL
  WHERE coach_turns.status = 'failed'
`;
const COMPLETE_COACH_TURN = `
  UPDATE coach_turns
  SET completed_at = ?, status = 'completed', attempts = ?, validation_code = ?, outcome = ?, response_json = ?
  WHERE user_id = ? AND request_id = ?
`;
const FAIL_COACH_TURN =
  "UPDATE coach_turns SET completed_at = ?, status = 'failed' WHERE user_id = ? AND request_id = ?";

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

function usernameTaken(username: string): Error {
  return new Error(`username already taken: ${username}`);
}

class SqliteStore implements Store {
  private readonly db: SqliteDatabase;
  private closed = false;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec(SCHEMA);
  }

  getUser(userId: string): UserProfile | undefined {
    const row = this.db.prepare("SELECT payload FROM users WHERE user_id = ?").get(userId);
    return row === undefined ? undefined : decode<UserProfile>(String(row["payload"]));
  }

  getUserByUsername(username: string): UserProfile | undefined {
    // The column is COLLATE NOCASE, so this comparison is case-insensitive without lower-casing the input.
    const row = this.db.prepare("SELECT payload FROM users WHERE username = ?").get(username.trim());
    return row === undefined ? undefined : decode<UserProfile>(String(row["payload"]));
  }

  createUser(profile: UserProfile): void {
    if (this.getUserByUsername(profile.username) !== undefined) throw usernameTaken(profile.username);
    try {
      this.db
        .prepare(INSERT_USER)
        .run(profile.userId, profile.username, profile.createdAt, JSON.stringify(profile));
    } catch (error) {
      // A concurrent create can still lose the race between the lookup above and this insert.
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.username")) {
        throw usernameTaken(profile.username);
      }
      throw error;
    }
  }

  updateUser(userId: string, patch: UserProfilePatch): UserProfile | undefined {
    const existing = this.getUser(userId);
    if (existing === undefined) return undefined;
    const next: UserProfile = { ...existing };
    if (patch.displayName !== undefined) next.displayName = patch.displayName;
    if (patch.passwordHash !== undefined) next.passwordHash = patch.passwordHash;
    if (patch.timezone !== undefined) next.timezone = patch.timezone;
    if (Object.hasOwn(patch, "goal")) next.goal = patch.goal ?? null;
    this.db.prepare(UPDATE_USER).run(JSON.stringify(next), userId);
    return next;
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

  appendChangeSet(changeSet: ChangeSet): void {
    this.db
      .prepare(INSERT_CHANGE_SET)
      .run(
        changeSet.changeSetId,
        changeSet.userId,
        changeSet.createdAt,
        changeSet.revertedAt,
        JSON.stringify(changeSet),
      );
  }

  listChangeSets(userId: string, limit = 10): ChangeSet[] {
    const take = normalizeLimit(limit, 10);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT payload FROM change_sets
          WHERE user_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(userId, take);
    return rows.map((row) => decode<ChangeSet>(String(row["payload"])));
  }

  getChangeSet(userId: string, changeSetId: string): ChangeSet | undefined {
    const row = this.db
      .prepare("SELECT payload FROM change_sets WHERE user_id = ? AND change_set_id = ?")
      .get(userId, changeSetId);
    return row === undefined ? undefined : decode<ChangeSet>(String(row["payload"]));
  }

  markChangeSetReverted(userId: string, changeSetId: string, at: string): boolean {
    const existing = this.getChangeSet(userId, changeSetId);
    if (existing === undefined || existing.revertedAt !== null) return false;
    const next: ChangeSet = { ...existing, revertedAt: at };
    this.db.prepare(MARK_CHANGE_SET_REVERTED).run(at, JSON.stringify(next), userId, changeSetId);
    return true;
  }

  claimCoachTurn(record: CoachTurnRecord): boolean {
    const result = this.db
      .prepare(CLAIM_COACH_TURN)
      .run(record.requestId, record.userId, record.createdAt);
    return Number(result.changes) > 0;
  }

  completeCoachTurn(userId: string, requestId: string, completion: CoachTurnCompletion): void {
    this.db
      .prepare(COMPLETE_COACH_TURN)
      .run(
        completion.completedAt,
        completion.attempts,
        completion.validationCode,
        completion.outcome,
        completion.responseJson,
        userId,
        requestId,
      );
  }

  failCoachTurn(userId: string, requestId: string, completedAt: string): void {
    this.db.prepare(FAIL_COACH_TURN).run(completedAt, userId, requestId);
  }

  getCoachTurn(userId: string, requestId: string): CoachTurnRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM coach_turns WHERE user_id = ? AND request_id = ?")
      .get(userId, requestId);
    if (row === undefined) return undefined;
    return {
      requestId: String(row["request_id"]),
      userId: String(row["user_id"]),
      createdAt: String(row["created_at"]),
      completedAt: row["completed_at"] === null ? null : String(row["completed_at"]),
      status: String(row["status"]) as CoachTurnRecord["status"],
      attempts: Number(row["attempts"]),
      validationCode: row["validation_code"] === null ? null : String(row["validation_code"]),
      outcome: row["outcome"] === null ? null : String(row["outcome"]),
      responseJson: row["response_json"] === null ? null : String(row["response_json"]),
    };
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
