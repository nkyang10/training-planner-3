# Operations
**Status:** current · **Owner:** deployment/runtime · **Updated:** 2026-11-22 · **Supersedes:** the runbook sections of docs/MILEBOOK-CALENDAR.md and root README.md

The operator's page for the hardened tree: configuration, start, deploy, backup, verification and recovery on the Windows
host. Topology [ARCHITECTURE.md](ARCHITECTURE.md) · controls [SECURITY.md](SECURITY.md) · schema [DATA-MODEL.md](DATA-MODEL.md) ·
gates [TESTING.md](TESTING.md) · open gaps [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md), [LIMITS.md](LIMITS.md).

## 1. Runtime shape

One `node` process (`src/index.ts`) starts two `http` servers over one SQLite file. No proxy, worker, queue or client build.

| Surface | Binds | Entry | Serves |
|---|---|---|---|
| Web (calendar) | `0.0.0.0:${MILEBOOK_WEB_PORT:-8091}` | `(src/web.ts · createWeb)` | accounts, every page, `/chat` proxy, `/static/*`, `/health` |
| Coach gateway | `127.0.0.1:${MILEBOOK_GATEWAY_PORT:-8090}` | `(src/gateway.ts · createGateway)` | `/v1/models`, `/v1/chat/completions`, `/health` |
| Store | one file, default `data/milebook.sqlite` | `(src/store.ts · createStore)` | every table, one writer |

- **Single writer.** The `SqliteStore` constructor sets WAL, `synchronous = NORMAL`, `busy_timeout = 5000`
  `(src/store.ts · SqliteStore)`; the throttles are in-process maps `(src/rate-limit.ts · createRateLimiter)`. Two
  processes on one file would double-write and double-count: one process per database file, always.
- **Why the gateway is loopback.** It takes the runner from the `x-milebook-user` header `(src/gateway.ts · createGateway)`
  and gates writes only on the shared internal token, so on `0.0.0.0` any LAN host could act as any runner and spend the
  model budget. The browser never calls it directly (`/chat` proxies through the web surface) and no CORS grant is sent.
- **The web surface is the only public one and terminates no TLS.** `COOKIE_SECURE=true` adds `Secure` and HSTS
  `(src/web.ts · createWeb)`; TLS must sit in front of it.
- **Shutdown.** `SIGINT`/`SIGTERM` drain both servers and exit 0; a 15 s deadline forces exit 1 `(src/index.ts · shutdown)`.
  `taskkill /F` delivers no signal, so the drain path only runs for Ctrl+C or a real SIGTERM.

## 2. Configuration reference

Read once at boot by `readEnv`/`requireEnv` `(src/index.ts · requireEnv)`. Twenty variables, all `MILEBOOK_*`.

| Variable | Required | Default | Effect | Failure mode |
|---|---|---|---|---|
| `MILEBOOK_DB` | no | `sqlite:data/milebook.sqlite` | SQLite spec; only `sqlite:` is honored; parent directory created at boot | default is used; a non-`sqlite:` spec fails inside `createStore` |
| `MILEBOOK_AUTH_SECRET` | **yes** | — | HMAC-SHA256 key signing `milebook_session` `(src/auth.ts · cookieFor)` | process exits; fewer than 32 chars also exits |
| `MILEBOOK_WEB_PORT` | no | `8091` | calendar port | non-integer or outside 1–65535 → exits |
| `MILEBOOK_WEB_HOST` | no | `0.0.0.0` | bind address for the calendar surface `(src/index.ts)` | set `127.0.0.1` when a tunnel is the only intended path in, so the LAN cannot bypass TLS |
| `MILEBOOK_GATEWAY_PORT` | no | `8090` | gateway port | same validation |
| `MILEBOOK_GATEWAY_URL` | no | `http://127.0.0.1:${GATEWAY_PORT}` | where the web surface sends `/chat` | wrong value → every coach turn 502 or 504 |
| `MILEBOOK_MODEL_BASE_URL` | **yes** | — | OpenAI-compatible base; `/chat/completions` appended | process exits |
| `MILEBOOK_MODEL_API_KEY` | no | `""` | `Authorization: Bearer` on model calls | empty bearer; the provider rejects → 502 |
| `MILEBOOK_MODEL_NAME` | **yes** | — | `model` field of every model call | process exits |
| `MILEBOOK_MODEL_ID` | no | `milebook-coach` | id advertised on `/v1/models` and in payloads | cosmetic only |
| `MILEBOOK_MAX_ATTEMPTS` | no | `2` | initial call plus repairs; floored at 1 | non-numeric → 2 |
| `MILEBOOK_GARMIN_KEY` | no | — | 32 bytes base64; seals Garmin API keys at rest and re-seals legacy plaintext rows on boot `(src/secrets.ts · parseSecretKey)` | invalid length → exits; unset → keys stay plaintext and the boot log warns |
| `MILEBOOK_LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` or `silent`; lines below it are dropped `(src/log.ts · parseLogLevel)` | an unknown value falls back to `info` rather than silencing the log |
| `MILEBOOK_TRUST_PROXY` | no | `false` | `true` takes the last `X-Forwarded-For` hop your proxy appended as the throttle key, for a host behind a reverse proxy `(src/web.ts · clientKey)` | leave it off unless a proxy you control overwrites the header; otherwise a client could rotate its own budget |
| `MILEBOOK_MODEL_TIMEOUT_SECONDS` | no | `120` | per-call model abort `(src/gateway.ts · callModel)` | lower it when an edge proxy cuts the response earlier |
| `MILEBOOK_PROXY_TIMEOUT_SECONDS` | no | `130` | how long the web proxy waits before answering its own `504` `(src/web.ts · createWeb)` | keep it above model timeout × attempts and below any edge timeout |
| `MILEBOOK_AUTO_STATES` | no | `true` | deterministic coaching-state detection; `false` keeps manual/chat states | any value but `true`/`1` reads false |
| `MILEBOOK_DEFAULT_USER` | no | `system` | identity for a gateway request with no `x-milebook-user` header | never fails; a headerless turn lands under an id with no account |
| `MILEBOOK_INTERNAL_TOKEN` | no | random 32 bytes per start | shared web→gateway secret | a restart rotates it; set it only to pin the value |
| `MILEBOOK_COOKIE_SECURE` | no | `false` | `Secure` cookie plus HSTS `(src/web.ts · createWeb)` | left false behind TLS → the cookie also travels on plain HTTP |

- **Legacy names are gone.** `readEnv` only reads `MILEBOOK_*` `(src/index.ts · readEnv)`; no `POC3_*` fallback and no
  development default secret — the three required variables stop the process before any port is bound.
- **`.env` is optional.** `loadDotEnv(".env")` fills keys not already set; real environment variables win
  `(src/index.ts · loadDotEnv)`. It is read relative to the working directory and is gitignored.
- **The template is untracked.** `.gitignore`'s `.env.*` pattern also matches `.env.example`, so a fresh clone has no copy
  (`git ls-files` returns nothing for it) — recreate it from this table.
- **Booleans are strict:** only `true` and `1` are true `(src/index.ts · readBoolean)`; `yes`, `TRUE`, `1.0` are false. And
  because `tools/deploy.ps1` always exports `MILEBOOK_COOKIE_SECURE` and `MILEBOOK_MAX_ATTEMPTS`, a `.env`-only value for
  either is overridden (use `-CookieSecure`, `-MaxAttempts`).

## 3. First run / local development

**Prerequisites:** Node 24+ (`engines.node`; the store and `tools/backup-db.mjs` use `node:sqlite` `DatabaseSync`), pnpm
(CI pins 12.16.1 `(.github/workflows/ci.yml)`), PowerShell for the deploy scripts.

```powershell
pnpm install
Copy-Item .env.example .env      # recreate from §2 if the clone has none
# fill MILEBOOK_AUTH_SECRET (>=32 chars), MILEBOOK_MODEL_BASE_URL, MILEBOOK_MODEL_NAME
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
pnpm dev                         # = tsx src/index.ts
```

URLs: `http://127.0.0.1:8091/signup` → `/login` → `/calendar` (create the runner, then the calendar), `/muscle` (third
app-bar tab), and the gateway at `http://127.0.0.1:8090/health` (`{"status":"ok","model":"…"}`). First boot creates the
database and logs `milebook: creating a new database at …` `(src/index.ts)`.

**Demo expectations.** There is no seed script in the shipped app: a fresh database is empty and the demo runner is the one
you create at `/signup`. The calendar shows its empty state until the coach books sessions, and booking needs a reachable
`MILEBOOK_MODEL_BASE_URL` and `MILEBOOK_MODEL_NAME` — without them the app is a calendar and every `/chat` returns 502.
Seeded fixtures (`start({ seed })`, `seedSession`, user `demo_runner`) exist only under `test/` `(docs/TESTING.md)`.

## 4. Production start

The deploy runs exactly this, from the checkout root `(tools/deploy.ps1)`:

```powershell
node --import tsx src/index.ts
```

- **Why not `pnpm dev`.** It runs the `tsx` shim; the deploy needs a `node.exe` whose command line names `src/index.ts`
  (the `Test-IsThisApp` pattern) with redirectable stdio and a recordable pid — pnpm would add a wrapper in between.
- **Working directory matters twice:** `.env` is read relative to it `(src/index.ts · loadDotEnv)` and the default database
  path is relative (`sqlite:data/milebook.sqlite`).
- **The schema is applied at boot, in order.** `CREATE TABLE IF NOT EXISTS` for every table, then the versioned
  migration list, each step in its own transaction and recorded in `PRAGMA user_version`
  `(src/migrations.ts · runMigrations)`; a boot with pending steps logs `schema N -> M (step; step)`, a boot with
  none logs nothing. There is no migrate command and no down-migration: rolling code back past a schema change
  needs a restore.
- **Environment and ports.** The deploy exports nine variables itself (DB, both ports, gateway URL, model base/key/name,
  max attempts, cookie secure, auth secret) and inherits the rest; it resolves `8093` (web) and `8092` (gateway) when
  neither a parameter nor `MILEBOOK_*_PORT` is set, so the live process never uses the app's 8091/8090 defaults.

## 5. Deploy contract (`tools/deploy.ps1`)

| # | Step | Detail |
|---|---|---|
| 1 | Resolve settings | parameter → environment → default; secrets from `data/milebook-auth.secret` and `data/milebook-model.secret`, plus the optional `data/milebook-garmin.secret`; the DB spec must start with `sqlite:` and the file must already exist |
| 2 | Read the stylesheet version | regex `APP_CSS_VERSION\s*=\s*(\d+)` over `src/web.ts` — never hardcoded (a hardcoded gate shipped broken once) |
| 3 | Back up | `node tools/backup-db.mjs <db> data/backups <BackupKeep>`; a non-zero exit aborts before anything is stopped; `-SkipBackup` skips it |
| 4 | Refuse to kill | listeners on the two resolved ports are stopped only when `Test-IsThisApp` proves the command line names `src/index.ts` or the recorded pid is in the ancestry (12 levels); otherwise it throws and touches nothing |
| 5 | Stop | `taskkill /PID <pid> /T /F`, then wait up to 20 s for both ports to be free |
| 6 | Start | rotate the live log past 10 MB (five generations kept), then delete both live logs, export the environment, `Start-Process node.exe --import tsx src/index.ts -WorkingDirectory <root> -WindowStyle Hidden -PassThru` |
| 7 | Record | pid → `data/milebook-live.pid`; one line appended to `data/milebook-deploy.log` |
| 8 | Verify | gateway `/health`, web `/health` (must report `"gateway":"ok"` **and** `"db":"ok"`), web `/login`, web `/static/app.css`; `/login` must contain `app.css?v=<APP_CSS_VERSION>` (read from source) and the brand |

**Parameters** (default): `-WebPort` (0 → 8093), `-GatewayPort` (0 → 8092), `-Database` ('' → env),
`-SecretFile` (`data/milebook-auth.secret`), `-ModelKeyFile` (`data/milebook-model.secret`), `-GarminKeyFile` (`data/milebook-garmin.secret`), `-ModelBaseUrl` ('' → env),
`-ModelName` ('' → env), `-MaxAttempts` (2, exported), `-TimeoutSeconds` (60), `-BackupKeep` (14), `-CookieSecure` (off),
`-SkipBackup` (off), `-TrustProxy` (off, exports `MILEBOOK_TRUST_PROXY=true`), `-WebHost` ('' → `0.0.0.0`),
`-ModelTimeoutSeconds` (120), `-ProxyTimeoutSeconds` (130).

**Deploy log line** — appended, never rewritten, the only surviving deploy history:

```
2026-11-22T22:41:07.1234567+08:00 deploy commit=<sha> web=8093 gateway=8092 db=sqlite:data/milebook.sqlite css=v33 secure=false pid=24188
```

| Field | Meaning |
|---|---|
| leading stamp + `deploy` | local start time (`o` format) and a literal |
| `commit=` / `web=` / `gateway=` | short HEAD (or `unknown` outside git) and the ports actually resolved |
| `db=` / `css=v<N>` | full database spec; `APP_CSS_VERSION` read from source |
| `secure=` / `pid=` | exported cookie flag and the started process id |

**Pid file.** `data/milebook-live.pid`, ASCII decimal, rewritten each deploy, read by the ancestry check — a note, not a
lock. **Not done here:** no `pnpm install`, no `pnpm check`, no task registration, no rotation, no rollback; both live logs
are deleted, and a missing database or secret file is an error rather than a first run.

## 6. Backup and restore

```powershell
node tools/backup-db.mjs data/milebook.sqlite data/backups 14
```

`VACUUM INTO` writes one fully checkpointed copy while the app keeps serving `(tools/backup-db.mjs)`. Names are
`milebook-<ISO stamp>.sqlite` with `:` and `.` in the stamp replaced by `-` (e.g. `milebook-2026-11-22T14-30-00-000Z.sqlite`);
an existing target is refused (exit 3). It prints the size in MiB, keeps the newest `keep` files matching
`<name>-*.sqlite`, prunes the rest and logs each. Exit codes: `0` ok, `2` usage or argument problem, `3` backup failed.

**Why not a plain copy under WAL.** The app runs WAL, so committed pages can still live in `milebook.sqlite-wal`; copying the
`.sqlite` alone can miss recent commits. Stop the process and copy all three files, or use `VACUUM INTO`.

| # | Restore step |
|---|---|
| 1 | Stop: `taskkill /PID (Get-Content data/milebook-live.pid) /T /F`, then confirm no listener on the ports |
| 2 | Move the current database and its `-wal`/`-shm` sidecars aside as evidence |
| 3 | Copy the chosen backup to `data/milebook.sqlite`; leave no stale sidecar behind |
| 4 | Start: `pnpm deploy:live`, or the §4 command with the environment exported |
| 5 | Verify `/health` on both ports, `/login`, one sign-in, one calendar month, one coach turn |
| 6 | Record the backup name, the reason and the outcome in the ops notes |

Restoring is the only data rollback: migrations are forward-only, so rolling code back past a schema change needs the
matching backup. Backups contain every secret in the database - password hashes and, when no at-rest key is configured, plaintext Garmin keys - so
`data/backups` deserves the same care as the database `(docs/SECURITY.md)`.

**Monthly drill (30–45 min).** Restore the newest backup into a scratch file and start it on spare ports with a throwaway
secret (`MILEBOOK_WEB_PORT=18091`, `MILEBOOK_GATEWAY_PORT=18090`, `MILEBOOK_DB=sqlite:data/drill.sqlite`), then sign in, open
a calendar month, send one coach turn, delete the scratch database. If that fails the backup policy is unproven; a full
rehearsal on the live file uses the same steps inside a window.

## 7. Health and observability

| Endpoint | Server | Returns | Auth | Proves |
|---|---|---|---|---|
| `/health` | web | `{"status":"ok","gateway":"ok","db":"ok"}` (503 `degraded` with the failing field `down`) | none — answered before the session read | the listener accepts connections, the coach gateway is reachable, **and** a trivial `SELECT 1` succeeds |
| `/health` | gateway | `{"status":"ok","model":"<MODEL_NAME>"}` | none — answered before the internal-token check, so it also reveals the model name | the process bound |
| `/login` | web | 200 HTML | none | the real deploy gate: brand plus the `APP_CSS_VERSION` reference |

**What `/health` proves, and what it does not.** The web `/health` answers `{"status":"ok","gateway":"ok","db":"ok"}`
when the process is up, it can reach the coach gateway (the probe is cached for 5 s) and a database query answers; it
answers `503` with `"status":"degraded"` and the failing field set to `"down"` otherwise `(src/store.ts · ping)`. It
still does **not** prove model reachability (a bad base URL or key answers 200), token agreement between the two servers,
or any latency/queue signal.

## 8. Logs

Every request, coach turn and boot line is a **JSON object on one line** `(src/log.ts · createLogger)`:

```json
{"ts":"2026-11-23T02:00:00.000Z","level":"info","event":"http.request","component":"web","method":"GET","path":"/calendar","status":200,"ms":12}
{"ts":"2026-11-23T02:00:01.000Z","level":"info","event":"coach.turn","component":"gateway","requestId":"req-1","status":"completed","attempts":1,"outcome":"committed","validationCode":null,"replyChars":812}
```

| Event | Level | When |
|---|---|---|
| `boot` | info | one line per server once it is listening, carrying the port and the log level |
| `http.request` | info | one line per non-asset response, with status and duration |
| `http.asset` | debug | one line per `/static/*` or favicon response, so info stays readable |
| `http.failed` | error | the handler threw; carries the message and stack, never the runner's text |
| `coach.turn` / `coach.turn.failed` | info / error | one line per turn with attempts, outcome, validation code and reply size |

**Redaction is by field name, not by value.** A field whose name matches `pass`, `secret`, `token`, `key`,
`authorization`, `cookie` or `session` is written as `[redacted]`, so a renamed key still cannot leak; values longer than
300 characters are truncated so one request cannot become a megabyte of log. The runner's message text is never logged.

| Log | Written by | Holds | Caveat |
|---|---|---|---|
| `data/milebook-live.out.log` | `Start-Process` stdout | boot lines plus the JSON event lines | rotated past 10 MB, five generations kept, then replaced at each deploy |
| `data/milebook-live.err.log` | stderr | unhandled rejection / uncaught exception text | replaced at each deploy |
| `data/milebook-deploy.log` | `deploy.ps1`, appended | one line per deploy | the only history that survives |
| `data/milebook-deploy-task.log` / `.err.log` | the scheduled-task wrapper | deploy console, including refusals | only on the task path |

**What is still missing.** No metrics endpoint, no error aggregator and no alerting: an operator tails the log, greps for
`"level":"error"`, and watches `/health` from outside. The 5xx rate is visible in the log but nothing pages a human.
`console.log`/`console.debug` anywhere in `src/` except `src/index.ts`, so the only in-`src` channel for new diagnostics is
`console.error` (which lands in `.err.log`) or a line in `src/index.ts`. No request id, no timing, no error counter, no
rotation — and a failed coach turn prints nothing: it shows only as the HTTP response (502/504) and the SQLite turn row.

## 9. Public access through Cloudflare Tunnel

The host is not exposed: `cloudflared` dials out, and Cloudflare terminates TLS at its edge. This is the chosen path for
the first public URL — it needs no port forward, no certificate on the host, and no inbound firewall rule.

| Step | Command / setting | Why |
|---|---|---|
| 1. Install | `winget install --id Cloudflare.cloudflared` | the daemon runs beside Milebook |
| 2. Temporary URL | `cloudflared tunnel --url http://127.0.0.1:8093` | prints `https://<random>.trycloudflare.com`; no account needed |
| 3. Deploy | `pnpm deploy:live -- -WebHost 127.0.0.1 -CookieSecure -TrustProxy -ModelTimeoutSeconds 40 -ProxyTimeoutSeconds 95` | see the table below |
| 4. Verify | open the printed URL, sign up, load the calendar, send one coach message | end-to-end through the edge |
| 5. Stable hostname | `cloudflared tunnel create milebook`, ingress `hostname → http://127.0.0.1:8093`, `cloudflared tunnel run milebook` | needs a Cloudflare account and DNS for the domain |

| Setting | Value | Why |
|---|---|---|
| `MILEBOOK_WEB_HOST` | `127.0.0.1` | the only way in is the tunnel; the LAN cannot bypass TLS on `:8093` |
| `MILEBOOK_COOKIE_SECURE` | `true` | session cookies carry `Secure` and the app sends HSTS |
| `MILEBOOK_TRUST_PROXY` | `true` | throttling keys on the last `X-Forwarded-For` hop, which is the viewer, not the tunnel |
| `MILEBOOK_MODEL_TIMEOUT_SECONDS` | `40` | two attempts fit in 80 s, under the edge limit |
| `MILEBOOK_PROXY_TIMEOUT_SECONDS` | `95` | the app answers its own `504` before Cloudflare's **100 s** edge timeout turns it into a `524` |

**What the runner sees when the model is slow.** With the two budgets above, the bubble receives the app's JSON
`504` ("the coach did not answer in time") instead of a Cloudflare error page, and the turn row records the failure.

**Edge limits to respect.** Cloudflare cuts a proxied response at 100 s; a full turn is `MODEL_TIMEOUT_SECONDS ×
`MAX_ATTEMPTS` plus overhead. Raising either budget past that ceiling moves the failure from the app to the edge, where
it is invisible to the logs.

**Exposure.** The URL is public and `/signup` is open — that is an accepted risk with a revisit trigger in
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §4. Share the URL narrowly, watch the `http.request` log for
unexpected signups, and add an invite gate before the audience widens.

## 10. Rollback

- **Code.** Read the last good line of `data/milebook-deploy.log`, `git checkout <commit>`, then `pnpm deploy:live` — the
  deploy backs up first, so a rollback is itself reversible. This checkout has no tags yet (`git tag --list` is empty); the
  recorded short sha is the handle until a release tag (`v<version>`, [RELEASE.md](RELEASE.md)) exists.
- **Data.** Restore a backup (§6). Migrations only move forward, so a code rollback past one without a restore is unsupported.
- **What a failed deploy leaves.** The old process stopped (ports free), a fresh backup in `data/backups`, possibly a new
  process running but unverified — pid recorded, deploy-log line already appended — exit code 1, and 40-line log tails
  printed. Nothing rolls back automatically: fix and redeploy, or restore.

## 11. Routine runbook

| Task | How | Consequence / note |
|---|---|---|
| Restart | `pnpm deploy:live` | same contract: backup, guarded stop, start, verify |
| Rotate the auth secret | write a new ≥32-char value to `data/milebook-auth.secret` (or export it) and redeploy | **every `milebook_session` cookie is invalidated immediately** — all runners are signed out; sessions last 30 days, so this is the only way to force a reset |
| Rotate the model key | replace `data/milebook-model.secret` or `MILEBOOK_MODEL_API_KEY`, redeploy | used only as the bearer on model calls; confirm with one coach turn |
| Rotate a Garmin key | per runner, `/garmin/key` in the app | stored in `garmin_keys` `(src/store.ts · SqliteStore)`, masked in the UI `(src/web.ts · maskKey)`; there is no deployment-wide key, so nothing to redeploy |
| Prune backups | automatic on every backup run; manual: the §6 command | keeps the newest 14 by default; never delete the newest |
| Check disk | `src/vendor/anatomy-muscles.glb` is 11 271 460 B (10.75 MiB), served from memory | pressure comes from the database, its `-wal` and `data/backups` (up to 14 × database size) |

## 12. Incident playbook

| Symptom | First checks | Likely cause | Action |
|---|---|---|---|
| Site down, connection refused | pid file plus `Get-Process -Id`; `Get-NetTCPConnection -State Listen -LocalPort 8093`; tail `data/milebook-live.err.log`; last deploy-log line | process exited (uncaught exception → shutdown, exit 1), port taken, or a failed deploy stopped it | `pnpm deploy:live` (backs up first) |
| Coach silent / 504 | gateway `/health`; one direct gateway call with the internal token; provider status; `MILEBOOK_MODEL_BASE_URL` reachable from the host | `/chat` aborts at 130 s `(src/web.ts · createWeb)`, the gateway aborts its model call at 120 s; with `MAX_ATTEMPTS=2` a slow attempt plus a repair can pass the proxy budget, so 504 while the gateway still works | lower attempts, fix provider latency, retry |
| Gateway 401 | body `{"error":{"code":"unauthorized","detail":"missing or invalid internal token"}}` `(src/gateway.ts · createGateway)`; list processes listening on 8092 | impossible inside the single deployed process: two processes with different `MILEBOOK_INTERNAL_TOKEN` (a stale generation still on the port) or a stray client | kill the duplicate, redeploy; the deploy's `/health` gate cannot see this |
| Login 429 | throttle page on `/login`; client address; whether a proxy fronts the site | 10 failures per (client address, route, username) per 15 min `(src/web.ts · createWeb)`; a success clears the key; behind a proxy every runner shares one bucket `(docs/SECURITY.md)` | wait out the window, or restart the process (the map is in memory) |
| DB locked / slow | duplicate listeners; `Get-ChildItem data\milebook.sqlite*` for a large `-wal`; a concurrent backup | `busy_timeout = 5000` only covers short waits `(src/store.ts · SqliteStore)`; a second process on the file is the usual cause | enforce one process per file; a large `-wal` means a long-lived reader — restart cleanly |

## Windows host notes

- **Scheduled task wrapper.** The task runs `tools/deploy-task.ps1`, which starts `deploy.ps1` in a child `powershell.exe`
  with `-NoProfile -ExecutionPolicy Bypass`, captures its console to `data/milebook-deploy-task.log` and `.err.log`, waits,
  and propagates the exit code. The live app is started by `deploy.ps1`'s own `Start-Process`, so its tree belongs to Task
  Scheduler, not to the shell that launched the deploy.
- **Execution policy.** Both scripts launch with `-ExecutionPolicy Bypass`; a task that invokes `deploy.ps1` directly on a
  locked-down host (`AllSigned`, `RemoteSigned` with an unsigned file) is blocked — that is why the wrapper exists.
- **Survival across logoff is not solved.** `-WindowStyle Hidden` keeps the app off the console, but the process dies with
  the task's session when the task is registered "run only when user is logged on", and a logoff ends that session. Survival
  needs the task to run as a service account with "run whether user is logged on or not" — a Task Scheduler setting that is
  not in this repository (no `schtasks` or `Register-ScheduledTask` call exists under `tools/`). Nothing restarts the app
  after a crash either: `uncaughtException` shuts down with exit 1 `(src/index.ts · shutdown)`, and only the next deploy
  starts it again.
- **Recommendation.** Move to a real service manager (WinSW/NSSM or a container) with restart-on-failure, a `/health` probe
  and log rotation; ordered work [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md), limits [LIMITS.md](LIMITS.md).

Related pages: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [DATA-MODEL.md](DATA-MODEL.md) · [TESTING.md](TESTING.md) · [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) · [RELEASE.md](RELEASE.md) · [LIMITS.md](LIMITS.md)
