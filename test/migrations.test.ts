import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS, runMigrations, schemaVersion } from "../src/migrations";
import { createStore } from "../src/store";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): Record<string, unknown> | undefined;
      all(...params: unknown[]): Record<string, unknown>[];
    };
    close(): void;
  };
};

const directories: string[] = [];

function scratch(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "milebook-migrations-"));
  directories.push(dir);
  return { dir, path: join(dir, "legacy.sqlite") };
}

afterEach(() => {
  while (directories.length > 0) {
    const dir = directories.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/** The pre-versioning shape: activities keyed by activity_id alone, coach_turns without the directive hash. */
function createLegacyDatabase(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE activities (
      activity_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE coach_turns (
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
  `);
  db.prepare("INSERT INTO activities (activity_id, user_id, day, created_at, payload) VALUES (?, ?, ?, ?, ?)").run(
    "act-1",
    "user-a",
    "2026-11-01",
    "2026-11-01T08:00:00.000Z",
    JSON.stringify({ activityId: "act-1", userId: "user-a" }),
  );
  db.prepare(
    "INSERT INTO coach_turns (request_id, user_id, created_at, status) VALUES (?, ?, ?, ?)",
  ).run("req-1", "user-a", "2026-11-01T08:00:00.000Z", "completed");
  db.close();
}

describe("schema migrations", () => {
  it("stamps a fresh database at the newest version", () => {
    const { path } = scratch();
    const handle = createStore(`sqlite:${path}`);
    const audit = new DatabaseSync(path);
    expect(schemaVersion(audit)).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
    audit.close();
    handle.close();
  });

  it("upgrades a pre-versioning database in place, preserving rows", () => {
    const { path } = scratch();
    createLegacyDatabase(path);

    const handle = createStore(`sqlite:${path}`);
    const audit = new DatabaseSync(path);
    expect(schemaVersion(audit)).toBe(2);

    const activitiesSql = String(
      (audit.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activities'").get() as {
        sql: string;
      }).sql,
    );
    expect(activitiesSql).toContain("PRIMARY KEY (user_id, activity_id)");

    const columns = audit.prepare("PRAGMA table_info(coach_turns)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain("directive_hash");

    const activities = audit.prepare("SELECT COUNT(*) AS n FROM activities").get() as { n: number };
    const turns = audit.prepare("SELECT COUNT(*) AS n FROM coach_turns").get() as { n: number };
    expect(activities.n).toBe(1);
    expect(turns.n).toBe(1);

    audit.close();
    handle.close();
  });

  it("applies nothing on a second boot", () => {
    const { path } = scratch();
    createStore(`sqlite:${path}`).close();

    const audit = new DatabaseSync(path);
    const result = runMigrations(audit);
    expect(result.from).toBe(2);
    expect(result.to).toBe(2);
    expect(result.applied).toEqual([]);
    audit.close();
  });

  it("rolls back a failing step and leaves the version untouched", () => {
    const { path } = scratch();
    const audit = new DatabaseSync(path);
    audit.exec("CREATE TABLE t (a TEXT)");

    expect(() =>
      runMigrations(audit, {}, [
        {
          version: 1,
          name: "half a change",
          up: (db) => {
            db.exec("ALTER TABLE t ADD COLUMN b TEXT");
            throw new Error("boom");
          },
        },
      ]),
    ).toThrow(/migration 1 \(half a change\) failed: boom/);

    expect(schemaVersion(audit)).toBe(0);
    const columns = audit.prepare("PRAGMA table_info(t)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(["a"]);
    audit.close();
  });

  it("refuses a step without a positive integer version", () => {
    const { path } = scratch();
    const audit = new DatabaseSync(path);
    expect(() => runMigrations(audit, {}, [{ version: 0, name: "bad", up: () => undefined }])).toThrow(
      /positive integer/,
    );
    audit.close();
  });
});
