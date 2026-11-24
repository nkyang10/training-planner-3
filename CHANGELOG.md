# Changelog

All notable changes to Milebook. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The proof-of-concept history (2026-11-06 → 2026-11-22) is preserved in git history; it is not reproduced here because
it described a product that no longer exists in this shape. This changelog starts at the first production release.

## [Unreleased]

### Planned before the next release

- TLS termination, cookie `Secure` and HSTS verified on the live host.

See [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md) for the ordered plan.

## [1.12.0] — 2026-11-24

Security hardening from the 2026-11-24 audit, and a coach failure the tunnel used to hide.

### Security

- Model output can no longer resolve runner-set or sensitive coaching states; prompt notes are JSON-encoded and
  directive ids are charset-validated; the credential limiter is bounded and verifies the password before counting;
  the erasure marker stops an in-flight sync or turn from resurrecting rows; real-day validation and ICS escaping;
  `secure_delete`/`VACUUM` hardening. Full list in `SECURITY-AUDIT-2026-11-24.md` (721 tests).

### Fixed

- **The coach failure copy now survives Cloudflare.** An origin `502`/`504` is replaced by Cloudflare with its own HTML
  error page, so behind the tunnel a failed turn read as a network error. Both coach failures answer `503` with distinct
  details, and the bubble treats a non-JSON body as the failure branch instead of "Network error".

### Verified

- Status passthrough probed through a fresh quick tunnel: `200`, `400`, `404`, `500` and `503` arrive unchanged; `502`
  and `504` become Cloudflare pages.


## [1.11.0] — 2026-11-23

A backup that leaves the host, an SBOM per build, and a deploy path that accepts absolute paths.

### Added

- **`-BackupTarget`** copies the newest backup to another disk or a UNC share after every deploy, compares byte counts,
  and records `offsite=ok|failed` in the deploy line; a failed copy is a loud warning, never a silent success.
- **`pnpm sbom:cyclonedx`** wraps pnpm's own `sbom` command: CycloneDX 1.5, `--sbom-type application`, every locked package
  (110 today, dev included — a superset is the honest shape for supply-chain tracking) and CI uploads it on every push.

### Fixed

- **`-Database` accepts an absolute path.** It was joined onto the checkout root, so `sqlite:D:\milebook\data\…` became a
  nonsense path and the deploy refused to run; rooted paths are now used as given.


## [1.10.0] — 2026-11-23

Password hashing off the event loop.

### Changed

- **`crypto.scrypt` replaces `scryptSync`.** `hashPassword` and `verifyPassword` are async and run on the libuv thread
  pool, so a burst of sign-ins no longer freezes every other request; `signup`, `login`, `updateProfile` and
  `confirmPassword` return promises and the web handlers await them `(src/auth.ts · hashPassword)`.

### Measured

- One hash: ~56 ms. Eight parallel verifications: 65 ms total. `/health` during the burst: 2 ms median, 11 ms worst —
  the same requests against `scryptSync` would have queued behind ~450 ms of blocked loop.

### Notes

- The auth throttle is still in-memory and per-process; that half of PR-31 stays a known limit for a multi-process
  deployment, which this host is not.


## [1.9.0] — 2026-11-23

Compression on the wire, measured rather than assumed.

### Added

- **gzip for textual responses.** HTML, CSS, JavaScript, JSON and SVG are compressed when the client sends
  `accept-encoding: gzip`; images and the anatomy GLB are not, because they are already compressed containers
  (`(src/compress.ts · encodeBody)`). Measured on a scratch instance: `/static/app.css` 123,857 → 23,342 bytes
  (−81.2 %), `/login` 30,908 → 8,681 bytes (−71.9 %).

### Changed

- **The ETag carries the variant.** A compressed response answers `vary: accept-encoding` and an ETag with `-gzip`
  inside the quotes, so a revalidating client gets `304` only for the encoding it actually holds. The CSP is still
  computed from the uncompressed markup, so every inline-script hash keeps matching after the browser decompresses.
- Static assets are compressed once and cached under their validator; a rendered page is compressed per response, which
  costs a millisecond or two on a page that spends far longer in SQLite.


## [1.8.0] — 2026-11-23

Backups that are proven, coverage that has a floor, and the repo hygiene the audit asked for.

### Added

- **`pnpm restore-drill`** (`tools/restore-drill.ts`). Copies the newest backup to a scratch directory, opens it through
  the same `createStore` path the app uses at boot — migrations and sealed-key handling included — then asserts
  `PRAGMA integrity_check = ok`, that the file reports the current schema version, and that the app's tables answer.
  Prints row counts and deletes the scratch copy; `--file` drills one backup, `--keep` leaves it. Against the live backup
  set it reports integrity ok, schema 2, 7 users / 64 sessions / 106 activities.
- **Coverage floors.** `pnpm test:coverage` measures `src/` only (the suite, tools and `src/vendor` are excluded) and
  enforces statements 90, branches 78, functions 95, lines 90 — today it reads 94.9 / 84.9 / 98.9 / 94.9. CI runs it as
  its own job and uploads the lcov report.
- **Dependabot** (`.github/dependabot.yml`) opens grouped weekly PRs for npm and GitHub Actions, with `@types/node`
  majors left alone because a Node jump is a separate decision.
- **`CODEOWNERS`** (`.github/CODEOWNERS`) routes the files that carry the production contract: migrations, secrets, auth,
  the store, the deploy script and the workflows.

### Notes

- PR-36 and PR-40 are closed. PR-38 is narrowed to what still hurts: the drill proves the backups restore, but no copy
  leaves the host. PR-37 is narrowed to the missing CycloneDX SBOM per release.


## [1.7.1] — 2026-11-23

A post-deploy smoke check, and the deploy trap that cost an outage during this session.

### Added

- **`tools/smoke.mjs` (`pnpm smoke`)** verifies a running instance the way an operator would: `/health` fields, the
  stylesheet version the source declares, the CSP hashes recomputed from the markup actually served, the
  `Secure`/`HttpOnly` cookie, signup, six gated pages, one coach turn, and account erasure — the throwaway account
  deletes itself, so the database is left as it was. Exit `0`/`1`/`2`; `--allow-coach-failure` turns a dead model into
  a warning.
- **The deploy runs it as step 9.** A coach that cannot answer is a warning, fatal with `-RequireCoach`; any other
  failed check aborts the deploy, and the deploy line records `smoke=ok|coach-down`.

### Fixed

- **Documented the pipeline trap that took the live site down.** `pnpm deploy:live | Select-Object` never returns: the
  long-running child keeps an inherited pipe open, so the caller waits forever while the deploy has already finished —
  and killing that caller kills the new process. The contract now says to redirect to a file (`*> data/deploy-run.log`),
  and the deploy header repeats it.


## [1.7.0] — 2026-11-23

Tunnel-ready: loopback binding and timeouts that fit under an edge limit.

### Added

- **`MILEBOOK_WEB_HOST`** (deploy `-WebHost`). The calendar surface can bind `127.0.0.1` so the only way in is the
  tunnel and the LAN cannot bypass TLS on `:8093`. Default stays `0.0.0.0`.
- **`MILEBOOK_MODEL_TIMEOUT_SECONDS`** (default 120) and **`MILEBOOK_PROXY_TIMEOUT_SECONDS`** (default 130). Both
  budgets were hardcoded; they are now configuration, so a deployment behind an edge proxy can keep a full turn inside
  the edge limit.
- **`docs/OPERATIONS.md` §9** documents the chosen public path — Cloudflare Tunnel — with the exact settings: loopback
  bind, `Secure` cookies, trusted proxy, model timeout 40 s, proxy timeout 95 s against Cloudflare's 100 s edge limit,
  so the runner gets the app's own `504` instead of a `524`.

### Changed

- Open signup is recorded as an **accepted risk** with its revisit trigger (`docs/PRODUCTION-READINESS.md` §4), since the
  tunnel URL is public and `/signup` has no invite gate.
- PR-19 now names the Cloudflare Tunnel path as the decision; what remains is the host-side tunnel, not code.

### Notes

- CloudFront was reviewed and rejected for this shape: it cannot reach a LAN origin without a public port or an AWS VPC,
  its origin timeout is 60 s, and it appends `X-Forwarded-For` — which is why 1.6.1 keys on the last hop.


## [1.6.1] — 2026-11-23

Proxy-aware throttling: key on the hop the proxy appended, not the client's claim.

### Fixed

- With `MILEBOOK_TRUST_PROXY=true` the throttle key was the **first** `X-Forwarded-For` entry. Every proxy worth
  trusting — CloudFront, nginx, Caddy, ALB — *appends* the address it actually saw to whatever the client sent, so the
  first entry is the client's own claim and a runner could rotate its budget by sending a header. The key is now the
  **last** entry; a client-rotated prefix no longer buys a fresh budget `(src/web.ts · clientKey)`.

### Notes

- Found while reviewing a CloudFront-in-front plan: CloudFront appends the viewer address, which would have made the
  first-entry key spoofable on the very deployment the switch exists for.


## [1.6.0] — 2026-11-23

Throttling that survives a reverse proxy, and a chat budget that counts only real turns.

### Added

- **`MILEBOOK_TRUST_PROXY`.** Behind a reverse proxy every runner shares the proxy address, so a single runner's failed
  logins would throttle everyone. With the switch on, the throttle key is the first `X-Forwarded-For` entry; a malformed
  header falls back to the socket and the header is ignored entirely unless the switch is on `(src/web.ts · clientKey)`.
  The deploy exposes it as `-TrustProxy`.

### Changed

- **The coach budget counts only model-bound turns.** The counter is incremented after the body, intent and activity
  validate, so a malformed or unauthorised request can no longer spend the runner's 40-turn budget.
- **Best-efforts copy matches the code.** It said "last 90 days, up to 100 activities" while the numbers come from the
  activities stored for the period being viewed; both locales now say so.

### Notes

- The remaining fast-follow list is honest about what is left: CI audits dependencies but ships no SBOM and no automated
  dependency updates (`docs/PRODUCTION-READINESS.md` §3).


## [1.5.0] — 2026-11-23

Observability: structured logs and a health check that proves the database.

### Added

- **JSON event log.** One line per request, asset, coach turn and boot `(src/log.ts · createLogger)`:
  `{ts, level, event, ...fields}`. Credential-shaped field names (`pass`, `secret`, `token`, `key`, `authorization`,
  `cookie`, `session`) are redacted **by name**, values over 300 characters are truncated, and the runner's message
  text is never logged. `MILEBOOK_LOG_LEVEL` selects the threshold; assets log at `debug` so `info` stays readable.
- **`/health` proves the database.** It now runs a trivial `SELECT 1` and answers
  `{"status":"ok","gateway":"ok","db":"ok"}`, or `503 degraded` with the failing field set to `down`
  `(src/store.ts · ping)`. The deploy refuses a red `db` as well as a red gateway.

### Changed

- The deploy rotates `data/milebook-live.out.log` past 10 MB and keeps five generations instead of deleting the only
  incident record at every start.
- The request-failure handler logs `http.failed` with the message and stack instead of writing to stderr.

### Notes

- Still missing, and now stated plainly in `docs/OPERATIONS.md`: no metrics endpoint, no error aggregator and no
  alerting. An operator tails the log, greps for `"level":"error"` and watches `/health` from outside.


## [1.4.0] — 2026-11-23

Content-Security-Policy without extracting the client scripts.

### Added

- **Hash-based CSP on every HTML response.** The policy is computed from the exact inline `<script>` bodies the response
  is about to send, so `script-src 'self'` plus one `sha256-` hash per script is always in step with the markup. No
  `unsafe-inline` and no `unsafe-eval` in `script-src`; `style-src` keeps `'unsafe-inline'` for the markup's style
  attributes, `img-src` allows `data:` for the CSS-embedded icon, and `frame-ancestors 'none'`, `base-uri 'none'` and
  `object-src 'none'` close the usual bypasses.

### Notes

- No inline event handlers, `eval`, workers or third-party origins exist in the app, which is why a hash-only policy is
  possible without the client-script extraction PR-27 still tracks.
- A policy that silently blocks a script would break a page with no server error, so the smoke pass checks ten pages by
  recomputing every hash from the body; that gap is recorded in `docs/TESTING.md`.


## [1.3.0] — 2026-11-23

Data-layer hardening: versioned migrations and Garmin keys sealed at rest.

### Added

- **Versioned schema migrations.** `src/migrations.ts` holds ordered steps, each applied in its own `BEGIN IMMEDIATE`
  and recorded in `PRAGMA user_version`. A database created before versioning reports 0 and runs the two idempotent
  steps once on first boot; a failing step rolls back and leaves the previous version, with a message naming the step.
  The boot log prints `schema N -> M (step; step)` only when something ran.
- **Garmin keys sealed at rest.** With `MILEBOOK_GARMIN_KEY` (32 bytes base64) the key is stored as an authenticated
  AES-256-GCM envelope (`enc:v1:<iv>:<tag>:<data>`), legacy plaintext rows are sealed on the first boot, and a value
  the current key cannot open reads as "no key" so the runner re-enters it instead of every page failing. The deploy
  validates the key before starting and warns when it is absent.

### Changed

- The deploy accepts `-GarminKeyFile` (default `data/milebook-garmin.secret`) and refuses a key that is not 32 bytes.
- `createStore` takes optional `StoreOptions`; `StoreHandle` reports what the migration runner applied.

### Notes

- Without `MILEBOOK_GARMIN_KEY` the store behaves exactly as before and the boot log warns; the database file and its
  backups stay readable, which is the accepted single-tenant risk.


## [1.2.0] — 2026-11-23

Account erasure and the privacy statement: the last legal blocker before real users can hold an account.

### Added

- **Account deletion.** `POST /profile/delete` requires the current password and the username typed exactly, then
  deletes all 18 user-scoped tables and the account row in one transaction, drops every in-memory page session for
  the account and clears both cookies. The confirmation page carries no account detail, and a repeated delete is a
  no-op rather than an error.
- **`/privacy`.** A public, server-rendered statement written against the schema: what is stored, who else receives
  it (the configured model endpoint and Garmin), how long it lives (the pruning constants), the export and sign-out
  choices, and what deletion actually removes - including the honest note that a host backup can hold a copy until
  it is pruned. Linked from every footer and from the sign-in page.

### Notes

- The erasure test seeds one row per table for two accounts, deletes one through the store and audits the file with
  a second connection, so a table added without joining the erasure list fails the gate instead of leaking rows.
- `/privacy` names no contact address: the deployment owner publishes one.


## [1.1.0] — 2026-11-23

Session security and licence compliance. No product behaviour changed for a signed-in runner except that a password
change now asks for the current password.

### Added

- **Credits page.** `GET /credits` is public and server-rendered: it prints the three.js MIT notice and the
  BodyParts3D CC BY 4.0 attribution verbatim, names the source database, states the changes made, and points at
  `THIRD-PARTY-NOTICES.md`. Every footer links it, including the sign-in page, and a test asserts both strings, so
  the CC BY duty is met by the running app rather than by a file in the clone.
- **Sign out everywhere.** `POST /profile/sign-out-everywhere` bumps the session version, which invalidates every
  device's cookie, then clears both cookies.

### Changed

- **Sessions are revocable.** The profile carries `tokenVersion`, the cookie carries the `ver` it was minted with, and
  a mismatch is rejected on every read. A password change bumps the version and reissues a cookie for the device that
  made the change, so other devices are signed out.
- **A password change requires the current password.** It is verified against the stored hash before rotation; a
  missing or wrong value returns `invalid-current-password` and changes nothing.
- **An abandoned coach turn no longer wedges its request id.** A turn claimed `in_progress` for more than ten minutes
  is treated as left by a crash, failed, and reclaimed on the retry instead of returning `409` forever.
- Profile page: current-password field and a ghost "sign out everywhere" form; `app.css` v34.

### Notes

- Cookies minted before 1.1 read as session version 0, so they keep working until the account's version moves; no
  forced sign-out on upgrade.
- The credit lines are deliberately untranslated: an attribution that changes with the interface language is not an
  attribution.


## [1.0.1] — 2026-11-23

Release engineering only: the product behaviour is unchanged from 1.0.0.

### Added

- **Anatomy pipeline in the repository** — the six build scripts, the curated `region-map.json` and the
  `muscleview-manifest.json` extraction manifest now live in `tools/anatomy/` with a README covering the rebuild
  steps, the licence boundary and the known asset limits. Both generators reproduce the committed JSON
  byte-for-byte, so the 11 MB muscle asset is auditable and rebuildable; the BodyParts3D download itself stays
  external.

### Fixed

- `package.json` pointed at a placeholder repository URL.

## [1.0.0] — 2026-11-22

The first production release. This is the point where the PoC-era documentation was replaced by a maintained wiki, the
configuration stopped being fail-open, and the coach gateway was closed to everything except the web surface.

### Added

- **Documentation wiki** replacing the chronological PoC docs: product, architecture, data model, HTTP API, coach
  contract, coaching states, training log, muscle domain, Garmin, UI grammar, asset provenance, operations, security,
  limits, testing, release and roadmap pages, plus an ADR template.
- **`pnpm docs:check` gate** — verifies relative links, `(src/file · symbol)` code anchors, encoding corruption, page
  status headers, scratch paths and absolute paths.
- **Credential and spend throttling** — 10 failed sign-ins per client/route/username per 15 minutes (`429`), 40 coach
  turns per runner per 5 minutes (`429`).
- **Gateway internal token** — the web surface presents a per-start shared secret; the gateway rejects anything else
  with `401` before touching the store.
- **Security headers** — `nosniff`, `referrer-policy`, `x-frame-options: DENY`, COOP, permissions-policy on every
  response; HSTS when the deployment is secure.
- **`Secure` session cookies** behind `MILEBOOK_COOKIE_SECURE`.
- **Online database backup** — `tools/backup-db.mjs` (`VACUUM INTO`, 14-file retention), wired into the deploy.
- **`.env` loading** for local development and single-host deployment; real environment variables always win.
- **Static asset validators** — startup-computed ETags, `304` revalidation for the 11 MB anatomy model and the scripts.
- **Release hygiene** — `LICENSE` (proprietary), `THIRD-PARTY-NOTICES.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `.env.example`, pull-request template, ADR template, CI on Linux **and** Windows.

### Changed

- **Configuration fails closed.** `MILEBOOK_AUTH_SECRET` (≥ 32 characters), `MILEBOOK_MODEL_BASE_URL` and
  `MILEBOOK_MODEL_NAME` are required; there are no development secrets, LAN IPs or legacy `POC3_*` aliases left.
- **SQLite runs in WAL mode** with `synchronous=NORMAL` and a 5 s busy timeout.
- **The coach proxy has a 130 s budget** and returns `504` on timeout and `502` on upstream failure with stable copy.
- **The `500` page no longer echoes the internal error message**; the detail goes to the server log.
- **Deployment is a real procedure**: back up, refuse to kill a foreign process, start
  `node --import tsx src/index.ts`, verify `/health`, `/login` and `APP_CSS_VERSION` read from the source, and record the
  deployed commit.
- **`package.json`** is `1.0.0`, pins the package manager, and declares `tsx` as a runtime dependency.
- **Docs cite symbols, not line numbers**, so they survive refactors.

### Removed

- **67.8 MB of PoC-era material** (27 analysis records, 180 iteration screenshots, probe dumps) from the release tree.
- **Legacy `mode:` memories** and the audit page section that scanned for them.
- **Six test-only production functions** and their tests; the rig invariants moved into the test that asserts them. The
  suite is 638 tests in 23 files, including new coverage for the failure limiter, the security headers, `Secure`
  cookies, ETag revalidation, the gateway token, the proxy `502` path and the sign-in throttle.
- **`POC3_*` environment aliases**, the `data/poc3.sqlite` fallback and the legacy `poc3_lang` cookie.
- **The wildcard CORS grant on the coach gateway.**

### Fixed

- **The coach dock's "Ask why" button was dead**: it sent an intent source that the allow-list rejected, so the turn
  failed with `400 unknown intent source`. The source is now accepted and covered by a regression test.
- **A hand-started instance could share the live database**: the deploy only stopped the process holding its own ports,
  so an instance started on the app defaults (8091/8090) survived a deploy and became a second writer. The deploy now
  stops every process whose command line names `src/index.ts`.
- **A first deploy could not create the database**: the script refused to run when the file was absent. It now warns and
  lets the app create it.
- **`/health` could not see a dead coach**: the web surface now probes the gateway and answers `503 degraded` when it is
  unreachable, and the deploy requires `"gateway":"ok"`.
- The deploy gate asserted `app.css?v=32` while the source declared 33, so a healthy deploy failed.
- A hardcoded LAN model endpoint was the default when no environment was set.
- `reviewSessions` and a dead local in the history page.
- The architecture diagram, the JSON examples and the validator bounds that had been destroyed by a GBK encoding
  round trip in the old documentation.
