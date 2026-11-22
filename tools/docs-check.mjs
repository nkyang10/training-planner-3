/**
 * Documentation gate for Milebook.
 *
 * Four rules, all of which the PoC-era docs violated and nobody noticed:
 *
 *   1. Every relative markdown link and image target resolves.
 *   2. Every `(src/file.ts · symbol)` code anchor names a file that exists and a symbol that file defines.
 *   3. No encoding corruption: the GBK round-trip markers, U+FFFD, or a literal `??` in prose (code fences are
 *      exempt because `??` is the nullish operator).
 *   4. Every reference page opens with a title and a `**Status:** … · **Owner:** … · **Updated:** YYYY-MM-DD` line.
 *   5. No reference to the gitignored `tmp/` scratch directory, and no absolute Windows paths.
 *
 * Dependency-free, so it runs before install like the lint gate.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const checked = [];

/** Files whose markdown is scanned. */
const ROOT_FILES = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md", "CHANGELOG.md"];

function walkMarkdown(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".git" || entry === "data") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walkMarkdown(path));
    else if (path.endsWith(".md")) found.push(path);
  }
  return found;
}

const files = [
  ...ROOT_FILES.map((name) => join(root, name)).filter((path) => existsSync(path)),
  ...walkMarkdown(join(root, "docs")),
  ...walkMarkdown(join(root, ".github")),
];

/** Reference pages must carry the status header; the index and the ADRs have their own shape. */
function needsHeader(name) {
  if (!name.startsWith("docs/") || name === "docs/README.md") return false;
  if (name.startsWith("docs/adr/")) return false;
  return true;
}

const CORRUPTION = /[\u875C\u7E5A\u981B\u981D\u5541\u90CA\uFFFD]/;

for (const file of files) {
  const name = relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  checked.push(name);

  // --- 1. links and images ---------------------------------------------------------------------------------------
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const withoutAnchor = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (withoutAnchor.length === 0) continue;
    const resolved = resolve(dirname(file), withoutAnchor);
    if (!existsSync(resolved)) problems.push(`${name}: broken link -> ${target}`);
  }

  // --- 2. code anchors `(path · symbol)`, one or more comma-separated symbols --------------------------------
  for (const match of text.matchAll(/\(([A-Za-z0-9_./-]+\.(?:ts|mjs|json|yml|yaml|txt|ps1)) · ([^()\n]+)\)/g)) {
    const [, path, symbols] = match;
    const target = resolve(root, path);
    if (!existsSync(target)) {
      problems.push(`${name}: anchor file missing -> ${path}`);
      continue;
    }
    const haystack = readFileSync(target, "utf8");
    for (const raw of symbols.split(",")) {
      const cleaned = raw.trim().replace(/`/g, "");
      if (cleaned.length === 0) continue;
      // `Class.member` is allowed: every dotted segment must appear in the file (the class, then the method name).
      for (const segment of cleaned.split(".")) {
        if (segment.length === 0) continue;
        const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(haystack)) {
          problems.push(`${name}: anchor symbol not found -> ${path} · ${cleaned}`);
          break;
        }
      }
    }
  }

  // --- 3. encoding corruption, outside fenced code ---------------------------------------------------------------
  let inFence = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (CORRUPTION.test(line)) problems.push(`${name}:${index + 1}: encoding corruption`);
    else if (line.includes("??")) problems.push(`${name}:${index + 1}: literal '??' in prose`);
  });

  // --- 4. status header ------------------------------------------------------------------------------------------
  if (needsHeader(name)) {
    const head = text.split(/\r?\n/).slice(0, 6).join("\n");
    if (!/^# \S/m.test(head)) problems.push(`${name}: missing '# Title' heading`);
    if (!/\*\*Status:\*\*.*\*\*Owner:\*\*.*\*\*Updated:\*\*\s*\d{4}-\d{2}-\d{2}/.test(head)) {
      problems.push(`${name}: missing '**Status:** … · **Owner:** … · **Updated:** YYYY-MM-DD' header`);
    }
  }

  // --- 5. scratch paths ------------------------------------------------------------------------------------------
  text.split(/\r?\n/).forEach((line, index) => {
    if (/\btmp\//.test(line) && !/gitignored/i.test(line)) problems.push(`${name}:${index + 1}: references gitignored tmp/`);
    if (/[A-Za-z]:\\\\Users\\\\/.test(line)) problems.push(`${name}:${index + 1}: absolute Windows path`);
  });
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\nDOCS: ${problems.length} problem(s) in ${checked.length} files`);
  process.exit(1);
}
console.log(`DOCS: OK - ${checked.length} markdown files, links, anchors, encoding and headers verified`);
