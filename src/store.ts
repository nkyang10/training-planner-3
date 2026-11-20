import { createRequire } from "node:module";
import type {
  Activity,
  ActivityWorkout,
  AppNotification,
  ChangeSet,
  CoachDirectiveRecord,
  CoachPreferences,
  CoachPreferencesPatch,
  CoachStateEvent,
  CoachStatePatch,
  CoachStateRecord,
  CoachTurnCompletion,
  CoachTurnRecord,
  GarminKey,
  Memory,
  Message,
  MuscleCheckIn,
  MuscleStatusControl,
  PromptSnapshot,
  Store,
  TrainingSession,
  UserProfile,
  UserProfilePatch,
  WorkoutCandidate,
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
  activity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, activity_id)
);
CREATE INDEX IF NOT EXISTS activities_user_day ON activities (user_id, day);

CREATE TABLE IF NOT EXISTS activity_workouts (
  user_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, activity_id)
);
CREATE INDEX IF NOT EXISTS activity_workouts_user_day ON activity_workouts (user_id, day);

CREATE TABLE IF NOT EXISTS sync_state (
  user_id TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS garmin_keys (
  user_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL,
  api_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications (user_id, created_at);

CREATE TABLE IF NOT EXISTS muscle_checkins (
  check_in_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS muscle_checkins_user_day ON muscle_checkins (user_id, day);
CREATE INDEX IF NOT EXISTS muscle_checkins_user_created ON muscle_checkins (user_id, created_at);

CREATE TABLE IF NOT EXISTS muscle_status_controls (
  user_id TEXT NOT NULL,
  muscle_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, muscle_id)
);

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
  directive_hash TEXT,
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS coach_turns_user_created ON coach_turns (user_id, created_at);

CREATE TABLE IF NOT EXISTS coach_directives (
  directive_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_directives_user_created ON coach_directives (user_id, created_at);

CREATE TABLE IF NOT EXISTS coach_states (
  state_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  resolved_at TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_states_user_updated ON coach_states (user_id, updated_at);
CREATE INDEX IF NOT EXISTS coach_states_user_key ON coach_states (user_id, state_key, status);

CREATE TABLE IF NOT EXISTS coach_state_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_state_events_user_created ON coach_state_events (user_id, created_at);

CREATE TABLE IF NOT EXISTS coach_preferences (
  user_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prompt_snapshots_user_created ON prompt_snapshots (user_id, created_at);
`;

const INSERT_USER =
  "INSERT INTO users (user_id, username, created_at, payload) VALUES (?, ?, ?, ?)";
const UPDATE_USER = "UPDATE users SET payload = ? WHERE user_id = ?";
const INSERT_MESSAGE =
  "INSERT INTO messages (message_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_MEMORY =
  "INSERT INTO memories (memory_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const UPSERT_ACTIVITY =
  `INSERT INTO activities (activity_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(user_id, activity_id) DO UPDATE SET
     day = excluded.day,
     created_at = excluded.created_at,
     payload = excluded.payload`;
const UPSERT_ACTIVITY_WORKOUT =
  `INSERT INTO activity_workouts (user_id, activity_id, day, status, attempts, fetched_at, payload)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id, activity_id) DO UPDATE SET
     day = excluded.day,
     status = excluded.status,
     attempts = excluded.attempts,
     fetched_at = excluded.fetched_at,
     payload = excluded.payload`;
const SELECT_ACTIVITY_WORKOUT =
  "SELECT payload FROM activity_workouts WHERE user_id = ? AND activity_id = ?";
const SELECT_ACTIVITY_WORKOUTS =
  `SELECT payload FROM activity_workouts
    WHERE user_id = ? AND day >= ? AND day <= ?
    ORDER BY day ASC, fetched_at ASC, rowid ASC`;
const SELECT_WORKOUT_CANDIDATES =
  `SELECT a.payload AS activity_payload, COALESCE(w.attempts, 0) AS attempts
     FROM activities a
     LEFT JOIN activity_workouts w
       ON w.user_id = a.user_id AND w.activity_id = a.activity_id
    WHERE a.user_id = ? AND a.day >= ? AND a.day <= ?
      AND a.activity_id LIKE 'garmin:%'
      AND (w.activity_id IS NULL OR (w.status = 'unavailable' AND w.attempts < ?))
    ORDER BY a.day DESC, a.created_at DESC, a.rowid DESC
    LIMIT ?`;
const UPSERT_SYNC_STATE = `
  INSERT INTO sync_state (user_id, last_synced_at) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_synced_at = excluded.last_synced_at
`;
const UPSERT_GARMIN_KEY = `
  INSERT INTO garmin_keys (user_id, saved_at, api_key) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET saved_at = excluded.saved_at, api_key = excluded.api_key
`;
const INSERT_NOTIFICATION =
  "INSERT INTO notifications (notification_id, user_id, created_at, read_at, payload) VALUES (?, ?, ?, ?, ?)";
const INSERT_MUSCLE_CHECKIN =
  "INSERT INTO muscle_checkins (check_in_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";
const UPSERT_MUSCLE_STATUS_CONTROL = `
  INSERT INTO muscle_status_controls (user_id, muscle_id, updated_at, payload) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, muscle_id) DO UPDATE SET
    updated_at = excluded.updated_at,
    payload = excluded.payload
`;
const MARK_NOTIFICATIONS_READ =
  "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL";
const UPSERT_SESSION =
  "INSERT OR REPLACE INTO sessions (session_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)";
const INSERT_CHANGE_SET =
  "INSERT INTO change_sets (change_set_id, user_id, created_at, reverted_at, payload) VALUES (?, ?, ?, ?, ?)";
const INSERT_COACH_STATE_EVENT = `
  INSERT INTO coach_state_events
    (event_id, user_id, state_id, state_key, action, from_status, to_status, source, confidence, evidence, created_at, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
const PRUNE_COACH_STATES =
  "DELETE FROM coach_states WHERE user_id = ? AND status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at < ?";
const PRUNE_COACH_STATE_EVENTS =
  "DELETE FROM coach_state_events WHERE user_id = ? AND created_at < ?";
const MARK_CHANGE_SET_REVERTED =
  "UPDATE change_sets SET reverted_at = ?, payload = ? WHERE user_id = ? AND change_set_id = ?";
const CLAIM_COACH_TURN = `
  INSERT INTO coach_turns (request_id, user_id, created_at, completed_at, status, attempts, validation_code, outcome, response_json, directive_hash)
  VALUES (?, ?, ?, NULL, 'in_progress', 0, NULL, NULL, NULL, ?)
  ON CONFLICT(user_id, request_id) DO UPDATE SET
    created_at = excluded.created_at,
    completed_at = NULL,
    status = 'in_progress',
    attempts = 0,
    validation_code = NULL,
    outcome = NULL,
    response_json = NULL,
    directive_hash = excluded.directive_hash
  WHERE coach_turns.status = 'failed'
`;
const INSERT_COACH_DIRECTIVE =
  "INSERT INTO coach_directives (directive_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const INSERT_COACH_STATE =
  "INSERT INTO coach_states (state_id, user_id, state_key, status, source, updated_at, expires_at, resolved_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
const COMPLETE_COACH_TURN = `
  UPDATE coach_turns
  SET completed_at = ?, status = 'completed', attempts = ?, validation_code = ?, outcome = ?, response_json = ?
  WHERE user_id = ? AND request_id = ?
`;
const FAIL_COACH_TURN =
  "UPDATE coach_turns SET completed_at = ?, status = 'failed' WHERE user_id = ? AND request_id = ?";
const UPSERT_COACH_PREFERENCES = `
  INSERT INTO coach_preferences (user_id, updated_at, payload) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload
`;
const INSERT_PROMPT_SNAPSHOT =
  "INSERT INTO prompt_snapshots (snapshot_id, user_id, created_at, payload) VALUES (?, ?, ?, ?)";
const PRUNE_PROMPT_SNAPSHOTS = `
  DELETE FROM prompt_snapshots
   WHERE user_id = ?
     AND snapshot_id NOT IN (
       SELECT snapshot_id FROM prompt_snapshots WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 3
     )
`;
/** Memories are merged on write: a normalized duplicate is skipped instead of accumulating (LL-6). */
const MEMORY_KEEP_COUNT = 24;

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

/**
 * Older Milebook databases keyed activities by activity_id alone, so one runner's row blocked another runner from storing
 * the same Garmin activity. Rebuild that table with the composite (user_id, activity_id) key, preserving every row.
 */
function migrateActivitiesTable(db: SqliteDatabase): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activities'")
    .get();
  if (row === undefined) return;
  const sql = String(row["sql"] ?? "");
  if (sql.includes("PRIMARY KEY (user_id, activity_id)")) return;

  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE activities_new (
      activity_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (user_id, activity_id)
    )`);
    db.exec(`INSERT OR IGNORE INTO activities_new (activity_id, user_id, day, created_at, payload)
      SELECT activity_id, user_id, day, created_at, payload FROM activities`);
    db.exec("DROP TABLE activities");
    db.exec("ALTER TABLE activities_new RENAME TO activities");
    db.exec("CREATE INDEX IF NOT EXISTS activities_user_day ON activities (user_id, day)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Older databases predate the hidden-directive hash on coach turns. Add the column in place so an existing live
 * database keeps its turn history and idempotency records.
 */
function migrateCoachTurnsDirectiveHash(db: SqliteDatabase): void {
  const columns = db.prepare("PRAGMA table_info(coach_turns)").all();
  if (columns.some((column) => column["name"] === "directive_hash")) return;
  db.exec("ALTER TABLE coach_turns ADD COLUMN directive_hash TEXT");
}

class SqliteStore implements Store {
  private readonly db: SqliteDatabase;
  private closed = false;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(SCHEMA);
    migrateActivitiesTable(this.db);
    migrateCoachTurnsDirectiveHash(this.db);
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

  /**
   * Append one memory, merged on write: a normalized duplicate of an existing fact is skipped instead of
   * accumulating, and the table keeps only the newest `MEMORY_KEEP_COUNT` rows per runner (LL-6).
   */
  appendMemory(memory: Memory): void {
    const normalized = memory.text.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = this.listMemories(memory.userId, MEMORY_KEEP_COUNT);
    if (existing.some((row) => row.text.toLowerCase().replace(/\s+/g, " ").trim() === normalized)) return;
    this.db
      .prepare(INSERT_MEMORY)
      .run(memory.memoryId, memory.userId, memory.createdAt, JSON.stringify(memory));
    this.db
      .prepare(
        `DELETE FROM memories
          WHERE user_id = ?
            AND memory_id NOT IN (
              SELECT memory_id FROM memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
            )`,
      )
      .run(memory.userId, memory.userId, MEMORY_KEEP_COUNT);
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
      .prepare(UPSERT_ACTIVITY)
      .run(
        activity.activityId,
        activity.userId,
        activity.day,
        activity.createdAt,
        JSON.stringify(activity),
      );
  }

  getActivity(userId: string, activityId: string): Activity | undefined {
    const row = this.db
      .prepare("SELECT payload FROM activities WHERE user_id = ? AND activity_id = ?")
      .get(userId, activityId);
    return row === undefined ? undefined : decode<Activity>(String(row["payload"]));
  }

  getActivityWorkout(userId: string, activityId: string): ActivityWorkout | undefined {
    const row = this.db.prepare(SELECT_ACTIVITY_WORKOUT).get(userId, activityId);
    return row === undefined ? undefined : decode<ActivityWorkout>(String(row["payload"]));
  }

  saveActivityWorkout(workout: ActivityWorkout): void {
    this.db
      .prepare(UPSERT_ACTIVITY_WORKOUT)
      .run(
        workout.userId,
        workout.activityId,
        workout.day,
        workout.status,
        workout.attempts,
        workout.fetchedAt,
        JSON.stringify(workout),
      );
  }

  listActivityWorkouts(userId: string, fromDay: string, toDay: string): ActivityWorkout[] {
    const rows = this.db.prepare(SELECT_ACTIVITY_WORKOUTS).all(userId, fromDay, toDay);
    return rows.map((row) => decode<ActivityWorkout>(String(row["payload"])));
  }

  listWorkoutCandidates(
    userId: string,
    fromDay: string,
    toDay: string,
    limit: number,
    maxAttempts: number,
  ): WorkoutCandidate[] {
    const take = normalizeLimit(limit, 3);
    if (take === 0) return [];
    const rows = this.db
      .prepare(SELECT_WORKOUT_CANDIDATES)
      .all(userId, fromDay, toDay, Math.max(1, maxAttempts), take);
    return rows.map((row) => ({
      activity: decode<Activity>(String(row["activity_payload"])),
      attempts: Number(row["attempts"] ?? 0),
    }));
  }

  getLastSync(userId: string): string | null {
    const row = this.db
      .prepare("SELECT last_synced_at FROM sync_state WHERE user_id = ?")
      .get(userId);
    return row === undefined ? null : String(row["last_synced_at"]);
  }

  recordSync(userId: string, at: string): void {
    this.db.prepare(UPSERT_SYNC_STATE).run(userId, at);
  }

  getGarminKey(userId: string): GarminKey | undefined {
    const row = this.db
      .prepare("SELECT api_key, saved_at FROM garmin_keys WHERE user_id = ?")
      .get(userId);
    if (row === undefined) return undefined;
    return { userId, apiKey: String(row["api_key"]), savedAt: String(row["saved_at"]) };
  }

  saveGarminKey(key: GarminKey): void {
    this.db.prepare(UPSERT_GARMIN_KEY).run(key.userId, key.savedAt, key.apiKey);
  }

  deleteGarminKey(userId: string): boolean {
    const result = this.db.prepare("DELETE FROM garmin_keys WHERE user_id = ?").run(userId);
    return Number(result.changes) > 0;
  }

  appendNotification(notification: AppNotification): void {
    this.db
      .prepare(INSERT_NOTIFICATION)
      .run(
        notification.notificationId,
        notification.userId,
        notification.createdAt,
        notification.readAt,
        JSON.stringify(notification),
      );
  }

  appendMuscleCheckIn(checkIn: MuscleCheckIn): void {
    this.db
      .prepare(INSERT_MUSCLE_CHECKIN)
      .run(checkIn.checkInId, checkIn.userId, checkIn.day, checkIn.createdAt, JSON.stringify(checkIn));
  }

  getMuscleCheckIn(userId: string, checkInId: string): MuscleCheckIn | undefined {
    const row = this.db
      .prepare("SELECT payload FROM muscle_checkins WHERE user_id = ? AND check_in_id = ?")
      .get(userId, checkInId);
    return row === undefined ? undefined : decode<MuscleCheckIn>(String(row["payload"]));
  }

  listMuscleCheckIns(userId: string, limit = 40): MuscleCheckIn[] {
    const take = normalizeLimit(limit, 40);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT payload FROM muscle_checkins
          WHERE user_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(userId, take);
    return rows.map((row) => decode<MuscleCheckIn>(String(row["payload"])));
  }

  listMuscleStatusControls(userId: string): MuscleStatusControl[] {
    const rows = this.db
      .prepare("SELECT payload FROM muscle_status_controls WHERE user_id = ? ORDER BY muscle_id")
      .all(userId);
    return rows.map((row) => decode<MuscleStatusControl>(String(row["payload"])));
  }

  upsertMuscleStatusControl(control: MuscleStatusControl): void {
    this.db
      .prepare(UPSERT_MUSCLE_STATUS_CONTROL)
      .run(control.userId, control.muscleId, control.updatedAt, JSON.stringify(control));
  }

  listNotifications(userId: string, limit = 20): AppNotification[] {
    const take = normalizeLimit(limit, 20);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT payload, read_at FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(userId, take);
    return rows.map((row) => {
      const notification = decode<AppNotification>(String(row["payload"]));
      notification.readAt = row["read_at"] === null ? null : String(row["read_at"]);
      return notification;
    });
  }

  countUnreadNotifications(userId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL")
      .get(userId);
    return row === undefined ? 0 : Number(row["n"]);
  }

  markNotificationsRead(userId: string, at: string): void {
    this.db.prepare(MARK_NOTIFICATIONS_READ).run(at, userId);
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
      .run(record.requestId, record.userId, record.createdAt, record.directiveHash);
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
      directiveHash: row["directive_hash"] === null || row["directive_hash"] === undefined ? null : String(row["directive_hash"]),
    };
  }

  appendCoachDirective(record: CoachDirectiveRecord): void {
    this.db
      .prepare(INSERT_COACH_DIRECTIVE)
      .run(record.directiveId, record.userId, record.createdAt, JSON.stringify(record));
  }

  listCoachDirectives(userId: string, limit = 50): CoachDirectiveRecord[] {
    const take = normalizeLimit(limit, 50);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        "SELECT payload FROM coach_directives WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, take);
    return rows.map((row) => decode<CoachDirectiveRecord>(String(row["payload"])));
  }

  listCoachDirectiveSuffixes(userId: string, limit = 50): Array<{ messageId: string; suffix: string }> {
    const take = normalizeLimit(limit, 50);
    if (take === 0) return [];
    const rows = this.listCoachDirectives(userId, take);
    const out: Array<{ messageId: string; suffix: string }> = [];
    for (const record of rows) {
      if (typeof record.messageId !== "string" || record.messageId.length === 0) continue;
      if (typeof record.renderedPromptSuffix !== "string" || record.renderedPromptSuffix.length === 0) continue;
      out.push({ messageId: record.messageId, suffix: record.renderedPromptSuffix });
    }
    return out;
  }

  getCoachPreferences(userId: string): CoachPreferences | undefined {
    const row = this.db
      .prepare("SELECT payload FROM coach_preferences WHERE user_id = ?")
      .get(userId);
    return row === undefined ? undefined : decode<CoachPreferences>(String(row["payload"]));
  }

  patchCoachPreferences(userId: string, patch: CoachPreferencesPatch, at: string): CoachPreferences {
    const existing = this.getCoachPreferences(userId);
    const next: CoachPreferences = {
      userId,
      language: patch.language !== undefined ? patch.language : existing?.language ?? null,
      tone: patch.tone !== undefined ? patch.tone : existing?.tone ?? null,
      replyLength: patch.replyLength !== undefined ? patch.replyLength : existing?.replyLength ?? null,
      nickname: patch.nickname !== undefined ? patch.nickname : existing?.nickname ?? null,
      updatedAt: at,
    };
    this.db.prepare(UPSERT_COACH_PREFERENCES).run(userId, at, JSON.stringify(next));
    return next;
  }

  appendPromptSnapshot(snapshot: PromptSnapshot): void {
    this.db
      .prepare(INSERT_PROMPT_SNAPSHOT)
      .run(snapshot.snapshotId, snapshot.userId, snapshot.createdAt, JSON.stringify(snapshot));
    this.db.prepare(PRUNE_PROMPT_SNAPSHOTS).run(snapshot.userId, snapshot.userId);
  }

  getLatestPromptSnapshot(userId: string): PromptSnapshot | undefined {
    const row = this.db
      .prepare(
        "SELECT payload FROM prompt_snapshots WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(userId);
    return row === undefined ? undefined : decode<PromptSnapshot>(String(row["payload"]));
  }

  listPromptSnapshots(userId: string, limit = 3): PromptSnapshot[] {
    const take = normalizeLimit(limit, 3);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        "SELECT payload FROM prompt_snapshots WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, take);
    return rows
      .map((row) => decode<PromptSnapshot>(String(row["payload"])))
      .reverse();
  }

  appendCoachState(record: CoachStateRecord): void {
    this.db
      .prepare(INSERT_COACH_STATE)
      .run(
        record.stateId,
        record.userId,
        record.key,
        record.status,
        record.source,
        record.updatedAt,
        record.expiresAt,
        record.resolvedAt,
        JSON.stringify(record),
      );
  }

  updateCoachState(userId: string, stateId: string, patch: CoachStatePatch): boolean {
    const existing = this.getCoachState(userId, stateId);
    if (existing === undefined) return false;
    const next: CoachStateRecord = {
      ...existing,
      ...patch,
      stateId: existing.stateId,
      userId: existing.userId,
      key: existing.key,
    };
    this.db
      .prepare(
        `UPDATE coach_states
          SET status = ?, source = ?, updated_at = ?, expires_at = ?, resolved_at = ?, payload = ?
          WHERE user_id = ? AND state_id = ?`,
      )
      .run(
        next.status,
        next.source,
        next.updatedAt,
        next.expiresAt,
        next.resolvedAt,
        JSON.stringify(next),
        userId,
        stateId,
      );
    return true;
  }

  getCoachState(userId: string, stateId: string): CoachStateRecord | undefined {
    const row = this.db
      .prepare("SELECT payload FROM coach_states WHERE user_id = ? AND state_id = ?")
      .get(userId, stateId);
    return row === undefined ? undefined : decode<CoachStateRecord>(String(row["payload"]));
  }

  listCoachStates(userId: string, limit = 50): CoachStateRecord[] {
    const take = normalizeLimit(limit, 50);
    if (take === 0) return [];
    const rows = this.db
      .prepare(
        "SELECT payload FROM coach_states WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, take);
    return rows.map((row) => decode<CoachStateRecord>(String(row["payload"])));
  }

  getActiveCoachStates(userId: string, at: string): CoachStateRecord[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM coach_states
          WHERE user_id = ?
            AND status IN ('observing', 'active')
            AND (expires_at IS NULL OR expires_at > ?)
          ORDER BY updated_at DESC, rowid DESC`,
      )
      .all(userId, at);
    return rows.map((row) => decode<CoachStateRecord>(String(row["payload"])));
  }

  appendCoachStateEvent(event: CoachStateEvent): void {
    this.db
      .prepare(INSERT_COACH_STATE_EVENT)
      .run(
        event.eventId,
        event.userId,
        event.stateId,
        event.key,
        event.action,
        event.fromStatus,
        event.toStatus,
        event.source,
        event.confidence,
        JSON.stringify(event.evidence),
        event.createdAt,
        JSON.stringify(event),
      );
  }

  listCoachStateEvents(userId: string, limit = 20): CoachStateEvent[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM (
           SELECT payload, created_at, rowid FROM coach_state_events
            WHERE user_id = ?
            ORDER BY created_at DESC, rowid DESC
            LIMIT ?
         ) ORDER BY created_at DESC, rowid DESC`,
      )
      .all(userId, limit);
    return rows.map((row) => decode<CoachStateEvent>(String(row["payload"])));
  }

  pruneCoachStates(userId: string, before: string): void {
    this.db.prepare(PRUNE_COACH_STATES).run(userId, before);
    this.db.prepare(PRUNE_COACH_STATE_EVENTS).run(userId, before);
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
