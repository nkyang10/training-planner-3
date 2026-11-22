/**
 * Consistent SQLite backup for Milebook.
 *
 * The app runs with WAL enabled, so a plain file copy taken while the process is running can miss committed pages
 * still in the `-wal` file. `VACUUM INTO` writes a single, fully checkpointed copy of the database to a new file
 * while readers and the writer keep running, which is the supported online-backup path for a single-writer app.
 *
 * Usage: node tools/backup-db.mjs <database file> [backup dir] [keep]
 * Exit codes: 0 ok, 2 usage/argument problem, 3 backup failed.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const [databasePath, backupDirArgument, keepArgument] = process.argv.slice(2);
if (databasePath === undefined) {
  console.error("usage: node tools/backup-db.mjs <database file> [backup dir] [keep]");
  process.exit(2);
}

const databaseFile = resolve(databasePath);
if (!existsSync(databaseFile)) {
  console.error(`backup: database not found: ${databaseFile}`);
  process.exit(2);
}

const backupDir = resolve(backupDirArgument ?? "data/backups");
const keep = Number(keepArgument ?? 14);
if (!Number.isInteger(keep) || keep < 1) {
  console.error(`backup: keep must be a positive integer, got ${JSON.stringify(keepArgument)}`);
  process.exit(2);
}

mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const name = `${basename(databaseFile, ".sqlite")}-${stamp}.sqlite`;
const target = join(backupDir, name);
if (existsSync(target)) {
  console.error(`backup: refusing to overwrite ${target}`);
  process.exit(3);
}

try {
  const database = new DatabaseSync(databaseFile);
  database.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  database.close();
} catch (error) {
  console.error(`backup: failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(3);
}

const size = statSync(target).size;
console.log(`backup: ${target} (${(size / 1_048_576).toFixed(2)} MiB)`);

const pattern = new RegExp(`^${basename(databaseFile, ".sqlite").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-.*\\.sqlite$`);
const existing = readdirSync(backupDir)
  .filter((entry) => pattern.test(entry))
  .map((entry) => ({ entry, mtime: statSync(join(backupDir, entry)).mtimeMs }))
  .sort((left, right) => right.mtime - left.mtime);

for (const stale of existing.slice(keep)) {
  unlinkSync(join(backupDir, stale.entry));
  console.log(`backup: pruned ${stale.entry}`);
}
