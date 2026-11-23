# Production readiness

**Status:** current · **Owner:** release · **Updated:** 2026-11-22 · **Supersedes:** the status and "honest limits" sections of the PoC-era docs

This page is the audit trail for taking Milebook from proof of concept to a production release. It records what was
wrong, what this branch fixed, what is still open, and in which order the remainder should be closed. It is meant to be
edited as items close — a finding leaves this page only when its fix is shipped **and** verified.

**Method.** Three read-only audits ran against commit `e79e11b` before any change: a documentation audit (252 files),
a code audit (all 31 modules, export-reference census, full test run) and a production-readiness audit (security,
config, data lifecycle, ops, licensing). Every finding below carries the evidence the audit used. Fixes were then made
in this branch and re-verified with `pnpm check`.

## 0. Verdict at audit time

**No-go for real users.** Eight blockers: no TLS, fail-open configuration, no credential throttling, an open gateway
trust boundary, no data erasure, a deployment that was not one (and whose gate failed), no observability, and missing
web hardening. The product logic itself was in good shape: consistent per-user scoping, strong escaping, a
server-validated coach contract, and a green suite at that point.

## 1. Fixed in this release

| ID | Severity | Finding (evidence) | Fix |
|---|---|---|---|
| PR-01 | **Blocker** | `MILEBOOK_AUTH_SECRET` defaulted to a repo-known string, so a missing env var produced forgeable session cookies for any user id (`src/index.ts`) | The process now **fails closed**: `AUTH_SECRET` is required, ≥ 32 chars, and no default exists (`(src/index.ts · requireEnv)`) |
| PR-02 | **Blocker** | The gateway trusted `x-milebook-user` from any local process and answered `access-control-allow-origin: *`, so any web page could write any runner's calendar (`src/gateway.ts`) | Shared internal token checked before any store read (`401`), CORS grant removed entirely, `OPTIONS` is a bare `204` (`(src/gateway.ts · createGateway)`) |
| PR-03 | **Blocker** | No throttling on login/signup; `scryptSync` made a handful of wrong passwords a cheap DoS and credential stuffing free (`src/auth.ts`) | 10 failures per client+route+username per 15 min → `429`; 40 coach turns per runner per 5 min → `429` (`(src/rate-limit.ts · createRateLimiter)`) |
| PR-04 | **Blocker** | Deployment was a Windows restart of `pnpm dev` that killed the process with `taskkill /F`, deleted the old logs, took no backup, and **its gate asserted `app.css?v=32` while the source said 33 — so it failed on a healthy build** (`tools/deploy.ps1`) | Rewritten: backup first (`(tools/backup-db.mjs)`), refuse to kill a foreign process, start `node --import tsx src/index.ts`, read `APP_CSS_VERSION` from `src/web.ts`, verify `/health` + `/login` + stylesheet, record commit and pid |
| PR-05 | **Blocker** | No data erasure: no account-deletion route, no cascade delete, while health-adjacent data is stored | **Still open** — see §2 |
| PR-06 | **Blocker** | No TLS anywhere; cookies lacked `Secure` (`src/auth.ts`) | Cookie `Secure` + HSTS behind `MILEBOOK_COOKIE_SECURE` (`(src/auth.ts · createAuth)`, `(src/web.ts · createWeb)`); TLS itself is a deployment item (§2) |
| PR-07 | **High** | Zero security headers on any response (`src/web.ts`) | `nosniff`, `referrer-policy`, `x-frame-options: DENY`, COOP, permissions-policy on every response; HSTS when secure (`(src/web.ts · createWeb)`) |
| PR-08 | **High** | The web→gateway proxy had **no timeout**, so a hung model pinned a browser request for minutes (`src/web.ts`) | 130 s abort → `504`; other failures → `502` with stable copy; the raw upstream message is no longer echoed |
| PR-09 | **High** | The `500` page interpolated `error.message` into the HTML (`src/web.ts`) | Stable copy; the detail goes to the server log (`(src/web.ts · createWeb)`) |
| PR-10 | **High** | SQLite ran in rollback-journal mode with no WAL, so a reader could block the writer and a plain file copy under load could miss commits (`src/store.ts`) | `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000` (`(src/store.ts · SqliteStore)`) |
| PR-11 | **Medium** | The 11 MB anatomy model and every script were served `no-store`, so each page view re-downloaded them | Startup ETag + `304` revalidation; versioned CSS immutable, three.js revalidated, WebP one day, GLB one hour (`(src/web.ts · sendAsset)`) |
| PR-12 | **Medium** | Six production functions existed only for their tests (67 lines) plus their tests | Removed, with the invariants moved into the rig test (`(test/muscle-rig.test.ts)`); test count 627 → 626 |
| PR-13 | **Medium** | Legacy `mode:` memories were scanned on every `/coach-audit` render and shown as a page section | Removed from the page, the renderer and both catalogs (`(src/web-coach-states.ts · renderCoachAudit)`) |
| PR-14 | **Medium** | `POC3_*` env aliases, the `poc3.sqlite` fallback, the `poc3_lang` cookie and a hardcoded LAN model IP were all live | Removed; configuration is `MILEBOOK_*` only (`(src/index.ts · readEnv)`) |
| PR-15 | **Medium** | `docs/` was 67.8 MB in 252 files, 76 % of it iteration screenshots; 4 of 8 root documents were silently encoding-corrupted (valid UTF-8, so no tool flagged them) | Historical material removed from the release tree (git history keeps it); a maintainable wiki replaces it; `pnpm docs:check` now fails on corruption, broken links, dead anchors and missing page headers (`(tools/docs-check.mjs)`) |
| PR-16 | **Medium** | Every status number in the docs was stale or self-contradictory: 11 test counts, 8 CSS versions, two port topologies, five merged branch names | Facts now live in one place per subject (README status, OPERATIONS reference); the docs gate forbids duplicated status blocks in reference pages |
| PR-17 | **Low** | No `LICENSE`, no third-party notices, no `.env.example`, no `CHANGELOG`, `SECURITY` or `CONTRIBUTING`; `package.json` was `0.1.0`, private, with `tsx` as a dev dependency used in production | Added; version `1.0.0`; `tsx` is a runtime dependency; `packageManager` pinned (`package.json`) |
| PR-18 | **Low** | No backup existed anywhere; a failed deploy left nothing to return to | `tools/backup-db.mjs` uses `VACUUM INTO` (safe under WAL) with 14-file retention, and deploy aborts if the backup fails |
| PR-41 | **High** | The coach dock's **Ask why** button sent `source: 'coach-dock'`, which was not in the intent allow-list, so the turn was rejected with `400 unknown intent source` — the button could not reach the coach | `coach-dock` added to the source union and the allow-list, with a regression test (`(src/directives.ts · SOURCES)`, `(test/directives.test.ts)`) |
| PR-42 | **Medium** | The deploy could not see a hand-started instance on the app's own default ports (8093/8092 vs 8091/8090), so two processes could share one database and break the single-writer rule | The deploy now stops **every** process whose command line names `src/index.ts`, not only the port owners (`(tools/deploy.ps1)`) |
| PR-43 | **Medium** | A first deploy was impossible: the script threw when the database file did not exist, although the app creates it at boot | The deploy warns and lets the app create the file; a typo in `MILEBOOK_DB` is still visible in the output (`(tools/deploy.ps1)`) |
| PR-44 | **Medium** | `/health` proved only that the listener was up: a dead coach gateway looked healthy, so a green deploy could coexist with every coach turn failing | The web `/health` now probes the gateway (5 s cache) and answers `503 degraded` when it is unreachable; the deploy asserts `"gateway":"ok"` (`(src/web.ts · createWeb)`) |
| PR-45 | **Low** | The deploy always exported `MILEBOOK_MAX_ATTEMPTS=2`, overriding a `.env` value | It honours the environment unless the parameter is passed explicitly (`(tools/deploy.ps1)`) |
| PR-30 | **Medium** | The anatomy GLB build scripts and the curated mapping lived only in the gitignored `tmp/bp3d`, so the 11 MB asset could not be rebuilt or audited | Committed to `tools/anatomy/`: six scripts, `region-map.json`, `muscleview-manifest.json` and a README with the rebuild steps, the licence boundary and the known asset limits; both generators reproduce the committed JSON byte-for-byte (`(tools/anatomy/README.md)`) |
| PR-21 | **High** | Sessions could not be revoked: a 30-day stateless cookie survived a password change | `tokenVersion` on the profile, a `ver` claim in the cookie, and a mismatch check on every read; a password change bumps it and reissues a cookie for the calling device, and `POST /profile/sign-out-everywhere` ends every session |
| PR-22 | **High** | A password change did not require the current password, so a stolen session escalated to a permanent takeover | The profile form asks for the current password whenever a new one is set; the hash is verified before rotation and a wrong or missing value returns `invalid-current-password` with nothing changed (`(src/auth.ts · updateProfile)`) |
| PR-28 | **Medium** | A coach turn claimed as `in_progress` before a crash stayed that way, so a retry with the same request id got `409` forever | A 10-minute lease: an `in_progress` turn older than that is failed and reclaimed on replay (`(src/gateway.ts · TURN_LEASE_MS)`) |
| PR-29 | **Medium** | BodyParts3D attribution (CC BY 4.0) was not visible to end users | Public `/credits` page prints both third-party notices verbatim, every footer links it including sign-in, and a test asserts both strings (`(src/web.ts · renderCredits)`) |
| PR-20 | **Blocker** | No erasure path: no account deletion, no cascade, no retention for messages/turns | `POST /profile/delete` needs the current password plus the username typed exactly, then deletes all 18 user-scoped tables and the account row in one transaction and clears both cookies and the in-memory page sessions; `/privacy` states what is kept, who else receives it, how long it lives and what deletion does (`(src/store.ts · deleteAccount)`, `(src/web.ts · renderPrivacy)`) |
| PR-25 | **Medium** | Schema migrations were ad-hoc, with no `user_version` and no ordered list | Ordered steps in `src/migrations.ts`, each in its own transaction and recorded in `PRAGMA user_version`; a pre-versioning file runs the idempotent steps once on first boot, a failure rolls back and leaves the previous version, and the boot log names what ran (`(src/migrations.ts · runMigrations)`) |
| PR-26 | **Medium** | Garmin keys were stored plaintext in SQLite | AES-256-GCM with a fresh nonce per value and a self-describing `enc:v1:` envelope when `MILEBOOK_GARMIN_KEY` is set; legacy plaintext rows are sealed on boot, a wrong key reads as "no key" instead of failing pages, and the deploy validates the key before starting (`(src/secrets.ts · createSecretBox)`) |
| PR-23 | **High** | No Content-Security-Policy: ~3.2k lines of inline client JavaScript | A hash-based policy is computed per response from the exact inline script bodies: `script-src 'self'` plus one `sha256-` hash each, no `unsafe-inline`/`unsafe-eval`; the test recomputes the hashes from the body and the smoke pass checks ten pages (`(src/web.ts · contentSecurityPolicy)`) |
| PR-24 | **High** | No observability: two startup log lines, a static `/health`, no metrics, no error reporting | JSON event lines for every request, asset, coach turn and boot, with redaction by field name and truncation (`(src/log.ts · createLogger)`); `/health` now runs a `SELECT 1` and reports `db` beside `gateway` (`(src/store.ts · ping)`); the deploy refuses a red `db` and rotates the live log. Metrics, an error aggregator and alerting stay operator work |
| PR-32 | **Medium** | The chat throttle counted every coach POST, including rejected ones, and never reset | The counter is incremented only after the body, intent and activity validate, so a malformed or unauthorised request cannot burn the budget; it stays a rate cap, not a failure counter (`(src/web.ts · chatLimiter)`) |
| PR-33 | **Medium** | Behind a reverse proxy every runner shares one client address, so throttling collapses to one budget | `MILEBOOK_TRUST_PROXY=true` (deploy `-TrustProxy`) makes the throttle key the last `X-Forwarded-For` hop, so a client-rotated prefix cannot buy a fresh budget; a malformed header falls back to the socket, and the header is ignored unless the switch is on (`(src/web.ts · clientKey)`) |
| PR-34 | **Medium** | The best-efforts copy said "last 90 days, up to 100 activities" while the code scans the selected period | The string now says the numbers come from the activities stored for the period being viewed, in both locales (`(src/i18n.ts · besteffort.scope)`) |

## 2. Open blockers — must close before real users

| ID | Severity | Finding | Why it blocks | Remediation | Effort |
|---|---|---|---|---|---|
| PR-19 | **Blocker** | No TLS: the web surface speaks plain HTTP on `0.0.0.0` | Credentials, cookies, Garmin keys and health data cross the LAN in clear text | **Chosen path: Cloudflare Tunnel** — `cloudflared` dials out, Cloudflare terminates TLS, the app binds `127.0.0.1` so the LAN cannot bypass it, with `MILEBOOK_COOKIE_SECURE=true`, `MILEBOOK_TRUST_PROXY=true`, `MILEBOOK_MODEL_TIMEOUT_SECONDS=40`, `MILEBOOK_PROXY_TIMEOUT_SECONDS=95` to stay inside the 100 s edge limit (`docs/OPERATIONS.md` §9). Remaining work is the host-side tunnel, not code | S |
| PR-27 | **Medium** | `src/web.ts` is ~6.9k lines holding view builders, ~3.2k lines of inline client JS, and a 44-branch route dispatcher | Every change risks the whole surface; no linting, typing or unit testing of client code | Split into `web/routes/*`, `web/views/*`, `web/client/*.ts` with an esbuild step; add a route table | L |

## 3. Fast-follow — should close soon after release

| ID | Finding | Remediation | Effort |
|---|---|---|---|
| PR-31 | `scryptSync` blocks the single event loop; the throttle is per-process and in-memory | Async `scrypt` on a worker, or a small connection pool with a shared limiter store | M |
| PR-35 | No compression for HTML/CSS/JS; the 11 MB GLB is uncompressed | `gzip`/`brotli` for text assets, and consider Draco or gzip for the GLB | S-M |
| PR-36 | No coverage measurement or threshold in CI | Add `@vitest/coverage-v8`, publish the report, set a floor near today's number | S |
| PR-37 | CI runs `pnpm audit` on every push (the dependency-audit job); there is still no SBOM per release and no automated dependency updates | Add a CycloneDX SBOM to the release job and Dependabot/Renovate | S |
| PR-38 | Backups live on the same host and no restore drill exists | Copy backups off-host (or to a second disk), and run a monthly restore drill into a scratch file | S |
| PR-39 | Deploy stops the process before starting the new one: a failed start leaves the site down | Blue/green on a second port behind the proxy, or start-then-swap with a health gate | M |
| PR-40 | No `CODEOWNERS`, issue templates or release notes process | Add `CODEOWNERS`, issue forms, and a release checklist (see [RELEASE.md](RELEASE.md)) | S |

## 4. Accepted risks (deliberate, with an owner)

| Risk | Why accepted | Revisit when |
|---|---|---|
| Garmin key at rest without `MILEBOOK_GARMIN_KEY` | Single-tenant host, database file permissions are the control; the boot log warns and the deploy validates the key when supplied | A second tenant, an off-host backup, or the key being absent from the live environment |
| One process per database, no horizontal scaling | Traffic is small and the store is synchronous | Sustained concurrency above a few hundred requests/second |
| Model provider receives coach prompts including health-adjacent text | The product is an LLM coach; there is no local model | The `/privacy` page names the provider relationship and the deletion path; a second provider or a local model would change the page |
| No admin console | Support can use the audit page per runner and the database directly | Support needs cross-runner views |
| Two locales only | The audience is en / zh-HK | A third locale is requested |
| **Open signup** — `/signup` is unauthenticated and has no invite gate | Chosen deliberately for the tunnel launch: the URL is shared with a small group, the 40-turn/5-min coach cap bounds spend per identity, and there is no email verification to abuse | A stranger registers, model spend rises unexpectedly, or the URL is shared more widely than intended — then add an invite/allowlist gate before the next exposure |

## 5. Release gate

Ship only when all of these are true:

- [ ] `pnpm check` green (lint, typecheck, docs gate, tests).
- [ ] TLS termination live, `MILEBOOK_COOKIE_SECURE=true`, HSTS observed on a real response.
- [ ] `MILEBOOK_AUTH_SECRET` is a fresh 32-byte random value, stored outside the repo.
- [x] Account deletion and a privacy policy exist (PR-20): `POST /profile/delete` and `/privacy`.
      data-handling note.
- [x] Session revocation (PR-21) and current-password re-entry (PR-22) shipped.
- [ ] A backup exists from today, and one restore has been proven into a scratch file.
- [ ] Uptime monitoring on `/health` with an alert route that a human watches.
- [x] In-app BodyParts3D attribution shipped (PR-29).
- [ ] `docs/RELEASE.md` checklist completed and the tag pushed.

## 6. Evidence trail

The three audits, with their full tables and file-level evidence, are the source for this page. They are not shipped in
the release tree; the durable facts they established now live in the wiki pages linked from [README.md](README.md) —
notably [SECURITY.md](SECURITY.md) (controls and gaps), [LIMITS.md](LIMITS.md) (capability boundary),
[TESTING.md](TESTING.md) (coverage and gate blind spots) and [DATA-MODEL.md](DATA-MODEL.md) (retention and erasure).
