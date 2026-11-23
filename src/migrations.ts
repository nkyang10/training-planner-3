/**
 * Ordered schema migrations.
 *
 * Every change to the shape of the database is a numbered step here, applied once and recorded in `PRAGMA user_version`.
 * The runner owns the transaction, so a failing step leaves the file at the previous version instead of half-migrated;
 * a step therefore must not open its own transaction.
 *
 * Rules for adding a step:
 * 1. Never edit or renumber a shipped step: an existing database has already run it.
 * 2. Append with the next version number and make it idempotent when the schema may already contain the change, because
 *    databases created before versioning existed have `user_version = 0` and will run every step on first boot.
 * 3. Keep it synchronous and local: no network, no model calls, no clock-dependent branching.
 */
import type { SecretBox } from "./secrets";

export interface MigrationDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): unknown;
  };
}

export interface MigrationContext {
  /** Present when the deployment configured an at-rest key; steps that seal data use it and no-op without it. */
  readonly secretBox?: SecretBox;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: (db: MigrationDatabase, context: MigrationContext) => void;
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly string[];
}

/**
 * Older Milebook databases keyed activities by activity_id alone, so one runner's row blocked another runner from storing
 * the same Garmin activity. Rebuild that table with the composite (user_id, activity_id) key, preserving every row.
 */
function activitiesCompositeKey(db: MigrationDatabase): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activities'").get();
  if (row === undefined) return;
  const sql = String(row["sql"] ?? "");
  if (sql.includes("PRIMARY KEY (user_id, activity_id)")) return;

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
}

/** Older databases predate the hidden-directive hash on coach turns; the column is additive and nullable. */
function coachTurnsDirectiveHash(db: MigrationDatabase): void {
  const columns = db.prepare("PRAGMA table_info(coach_turns)").all();
  if (columns.some((column) => column["name"] === "directive_hash")) return;
  db.exec("ALTER TABLE coach_turns ADD COLUMN directive_hash TEXT");
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "activities: composite (user_id, activity_id) key", up: activitiesCompositeKey },
  { version: 2, name: "coach_turns: directive_hash column", up: coachTurnsDirectiveHash },
];

/** The schema version recorded in the file; 0 for a database created before versioning existed. */
export function schemaVersion(db: MigrationDatabase): number {
  const row = db.prepare("PRAGMA user_version").get();
  const value = Number(row?.["user_version"] ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Applies every step newer than the recorded version, in order, each in its own transaction. Returns what ran, so a boot
 * log can state it instead of guessing.
 */
export function runMigrations(
  db: MigrationDatabase,
  context: MigrationContext = {},
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  const from = schemaVersion(db);
  // Validate the whole list before filtering: an invalid version would otherwise be skipped silently when it is not
  // newer than the recorded one.
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`migration version must be a positive integer: ${migration.version}`);
    }
  }
  const pending = migrations
    .filter((migration) => migration.version > from)
    .sort((left, right) => left.version - right.version);

  const applied: string[] = [];
  for (const migration of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db, context);
      // A PRAGMA cannot take a bound parameter; the value is our own validated integer, never input.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${migration.version} (${migration.name}) failed: ${reason}`);
    }
    applied.push(migration.name);
  }

  return { from, to: pending.length === 0 ? from : pending[pending.length - 1]!.version, applied };
}
