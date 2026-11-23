#!/usr/bin/env node
/**
 * Post-deploy smoke check against a running Milebook instance.
 *
 * The unit suite proves the code; this proves *this deployment*: the process answers, the pages carry the stylesheet
 * version the source declares, the security headers are on the wire, signup and the calendar work, and the coach
 * either answers or is reported as the one failing piece.
 *
 * Usage: node tools/smoke.mjs [baseUrl] [--allow-coach-failure]
 *   baseUrl                  defaults to http://127.0.0.1:8093
 *   --allow-coach-failure    do not fail when /chat cannot reach a model (pages-only deployment)
 *
 * Exit codes: 0 all checks passed, 1 a check failed, 2 usage.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));
if (flags.has("--help")) {
  console.log("usage: node tools/smoke.mjs [baseUrl] [--allow-coach-failure]");
  process.exit(0);
}
const unknown = [...flags].filter((flag) => flag !== "--allow-coach-failure");
if (unknown.length > 0) {
  console.error(`unknown flag: ${unknown.join(", ")}`);
  process.exit(2);
}
const base = (positional[0] ?? process.env.SMOKE_BASE ?? "http://127.0.0.1:8093").replace(/\/$/, "");
const allowCoachFailure = flags.has("--allow-coach-failure");

const source = readFileSync(new URL("../src/web.ts", import.meta.url), "utf8");
const cssVersion = source.match(/APP_CSS_VERSION\s*=\s*(\d+)/)?.[1];
if (cssVersion === undefined) {
  console.error("could not read APP_CSS_VERSION from src/web.ts");
  process.exit(2);
}

let failures = 0;
let warnings = 0;
const check = (name, passed, detail = "") => {
  if (passed) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail === "" ? "" : ` — ${detail}`}`);
  }
};
const warn = (name, detail) => {
  warnings += 1;
  console.log(`warn  ${name} — ${detail}`);
};

console.log(`smoke: ${base} (source declares app.css?v=${cssVersion})\n`);

// 1. Health: the process, the coach gateway and the database.
let health;
try {
  const response = await fetch(`${base}/health`);
  health = { status: response.status, body: await response.json().catch(() => null) };
} catch (error) {
  console.error(`FAIL  /health unreachable: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
check("/health answers 200", health.status === 200, `status ${health.status}`);
check("/health reports db ok", health.body?.db === "ok", JSON.stringify(health.body));
check("/health reports gateway ok", health.body?.gateway === "ok", JSON.stringify(health.body));

// 2. Login page: brand, stylesheet version, security headers, CSP hashes.
const login = await fetch(`${base}/login`);
const loginHtml = await login.text();
const csp = login.headers.get("content-security-policy") ?? "";
check("/login answers 200", login.status === 200, `status ${login.status}`);
check("/login carries the brand", loginHtml.includes("Milebook"));
check(`/login references app.css?v=${cssVersion}`, loginHtml.includes(`app.css?v=${cssVersion}`));
check("/login sends a CSP", csp.includes("default-src 'self'"));
check("CSP forbids framing", csp.includes("frame-ancestors 'none'"));
check("CSP has no inline script escape hatch", !csp.includes("script-src 'self' 'unsafe-inline'"));
const inlineScripts = [...loginHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1] ?? "")
  .filter((body) => body.length > 0);
const missingHashes = inlineScripts
  .map((body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`)
  .filter((hash) => !csp.includes(hash));
check(`CSP covers all ${inlineScripts.length} inline script(s)`, missingHashes.length === 0, `missing ${missingHashes.length}`);

// 3. A throwaway account: signup, session cookie, the pages behind the gate, then erasure so the database is left clean.
const username = `smoke_${Date.now().toString(36)}`;
const password = `smoke-${createHash("sha256").update(username).digest("hex").slice(0, 16)}`;
const signup = await fetch(`${base}/signup`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ username, password, displayName: "Smoke Check", timezone: "Asia/Taipei" }).toString(),
  redirect: "manual",
});
const setCookie = signup.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0] ?? "";
check("/signup answers 303", signup.status === 303, `status ${signup.status}`);
check("/signup sets a session cookie", cookie.length > 0);
check("session cookie is Secure", setCookie.includes("Secure"));
check("session cookie is HttpOnly", setCookie.includes("HttpOnly"));

try {
  for (const path of ["/calendar", "/profile", "/privacy", "/credits", "/history", "/changes"]) {
    const response = await fetch(`${base}${path}`, { headers: { cookie } });
    check(`${path} answers 200`, response.status === 200, `status ${response.status}`);
  }

  // 4. The coach: works, or is reported as the one broken piece.
  const startedAt = Date.now();
  const chat = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message: "how did my week go?" }),
  });
  const elapsed = Date.now() - startedAt;
  const chatBody = await chat.text();
  if (chat.status === 200) {
    check(`/chat answers 200 (${elapsed} ms)`, true);
  } else if (allowCoachFailure) {
    warn(`/chat answers ${chat.status}`, `${chatBody.slice(0, 120)} (allowed by --allow-coach-failure)`);
  } else {
    check(`/chat answers 200 (${elapsed} ms)`, false, `status ${chat.status}: ${chatBody.slice(0, 160)}`);
  }
} finally {
  // 5. Erasure: the smoke account removes itself, which also proves the delete path on this deployment.
  const deleted = await fetch(`${base}/profile/delete`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ currentPassword: password, confirm: username }).toString(),
    redirect: "manual",
  });
  check("/profile/delete answers 303", deleted.status === 303, `status ${deleted.status}`);
  const afterDelete = await fetch(`${base}/calendar`, { headers: { cookie }, redirect: "manual" });
  check("the erased session no longer reaches the calendar", afterDelete.status !== 200, `status ${afterDelete.status}`);
}

// 5. The deploy gate: a stylesheet that is smaller than any real one means the wrong build.
const css = await fetch(`${base}/static/app.css`);
const cssText = await css.text();
check("/static/app.css answers 200", css.status === 200, `status ${css.status}`);
check("/static/app.css is the real stylesheet", cssText.length > 10_000, `${cssText.length} bytes`);

console.log(`\n${failures === 0 ? "SMOKE OK" : `SMOKE FAILED (${failures} check(s))`}${warnings > 0 ? `, ${warnings} warning(s)` : ""}`);
process.exit(failures === 0 ? 0 : 1);
