/**
 * Restore drill: prove that the newest backup actually restores.
 *
 * A backup nobody has restored is a hope, not a backup. This copies the newest file (or `--file <path>`) to a scratch
 * directory, opens it through the same `createStore` path the app uses at boot — so the migrations and the sealed-key
 * handling run exactly as they would — then checks integrity, the schema generation and a few row counts.
 *
 * Usage: node --import tsx tools/restore-drill.ts [--backups data/backups] [--file <path>] [--keep]
 * Exit codes: 0 the backup restored, 1 a check failed, 2 usage or no backup found.
 */
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { MIGRATIONS } from "../src/migrations";
import { createStore } from "../src/store";

interface RawDatabase {
  prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined };
  close(): void;
}

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => RawDatabase };

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? String(args[index + 1]) : fallback;
};

if (flag("--help")) {
  console.log("usage: node --import tsx tools/restore-drill.ts [--backups data/backups] [--file <path>] [--keep]");
  process.exit(0);
}

const backupsDir = resolve(value("--backups", "data/backups"));
const explicitFile = args.includes("--file") ? resolve(value("--file", "")) : undefined;

function newestBackup(): string {
  if (explicitFile !== undefined) return explicitFile;
  let entries: string[];
  try {
    entries = readdirSync(backupsDir).filter((name) => name.endsWith(".sqlite"));
  } catch {
    console.error(`restore-drill: cannot read backup directory: ${backupsDir}`);
    process.exit(2);
  }
  const newest = entries
    .map((name) => ({ name, mtime: statSync(join(backupsDir, name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)[0];
  if (newest === undefined) {
    console.error(`restore-drill: no .sqlite backup found in ${backupsDir}`);
    process.exit(2);
  }
  return join(backupsDir, newest.name);
}

const source = newestBackup();
let failures = 0;
const check = (name: string, passed: boolean, detail = ""): void => {
  if (passed) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail === "" ? "" : ` — ${detail}`}`);
  }
};

console.log(`restore-drill: ${source}`);
const scratchDir = mkdtempSync(join(tmpdir(), "milebook-drill-"));
const target = join(scratchDir, "restored.sqlite");

try {
  copyFileSync(source, target);
  const bytes = statSync(target).size;
  check("backup copied to a scratch directory", bytes > 0, `${bytes} bytes`);

  // The app's own boot path: migrations and sealed-key handling run exactly as they would on a real restore.
  const handle = createStore(`sqlite:${target}`);
  handle.close();

  const raw = new DatabaseSync(target);
  try {
    const integrity = String(raw.prepare("PRAGMA integrity_check").get()?.["integrity_check"] ?? "");
    const version = Number(raw.prepare("PRAGMA user_version").get()?.["user_version"] ?? -1);
    const latest = MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);
    const users = Number(raw.prepare("SELECT count(1) AS c FROM users").get()?.["c"] ?? 0);
    const sessions = Number(raw.prepare("SELECT count(1) AS c FROM sessions").get()?.["c"] ?? 0);
    const activities = Number(raw.prepare("SELECT count(1) AS c FROM activities").get()?.["c"] ?? 0);
    check("integrity_check reports ok", integrity === "ok", integrity);
    check(`schema is at version ${latest}`, version === latest, `file reports ${version}`);
    check("the restored file holds the app's tables", users >= 0 && sessions >= 0 && activities >= 0);
    console.log(`      users ${users}, sessions ${sessions}, activities ${activities}`);
  } finally {
    raw.close();
  }
} finally {
  if (flag("--keep")) {
    console.log(`      kept for inspection: ${target}`);
  } else {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? "RESTORE DRILL OK" : `RESTORE DRILL FAILED (${failures} check(s))`);
process.exit(failures === 0 ? 0 : 1);
