/**
 * A small lint gate for POC3: no console output in src (except index.ts), no TODO, no secrets, no `any` in src.
 * Dependency-free so it runs before install completes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const problems = [];
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".git" || entry === "data") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".ts")) files.push(path);
  }
}

walk(join(root, "src"));
walk(join(root, "test"));

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const name = relative(root, file);
  if (name.startsWith("src/") && name !== "src/index.ts" && /console\.(log|debug)\(/.test(text)) {
    problems.push(`${name}: console output in src`);
  }
  if (/\bTODO\b|\bFIXME\b/.test(text)) problems.push(`${name}: unresolved TODO/FIXME`);
  if (/\bany\b/.test(text)) problems.push(`${name}: 'any' is not allowed`);
  if (/GCDC_[A-Za-z0-9+/=.-]{20,}/.test(text)) problems.push(`${name}: looks like a Garmin key`);
  if (/sk-[A-Za-z0-9]{20,}/.test(text)) problems.push(`${name}: looks like an API key`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`LINT: OK - ${files.length} TypeScript files, no console/TODO/any/secrets`);
