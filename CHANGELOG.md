# Changelog

All notable changes to Milebook. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The proof-of-concept history (2026-11-06 → 2026-11-22) is preserved in git history; it is not reproduced here because
it described a product that no longer exists in this shape. This changelog starts at the first production release.

## [Unreleased]

### Planned before the next release

- TLS termination, cookie `Secure` and HSTS verified on the live host.
- Content-Security-Policy after extracting the inline client scripts.
- Schema migrations with `PRAGMA user_version`.

See [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md) for the ordered plan.

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
