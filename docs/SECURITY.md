# Security

**Status:** current · **Owner:** security · **Updated:** 2026-11-22 · **Supersedes:** the security sections of docs/MILEBOOK-CALENDAR.md and root README.md

This page states what the running system actually enforces, and what it does not. Items marked **open** are release
blockers or accepted risks; the ordered remediation plan is in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).
The disclosure policy is in [SECURITY.md](../SECURITY.md) at the repository root.

## 1. Authentication

| Control | State | Evidence |
|---|---|---|
| Password hashing | scrypt, 16-byte salt, 64-byte hash, constant-time compare, run on the libuv thread pool `(src/auth.ts · hashPassword)` | `(src/auth.ts · verifyPassword)` |
| Username policy | lowercase letters/digits/underscore, 3–24 chars, case-insensitive unique | `(src/auth.ts · normalizeUsername)` |
| Password policy | minimum 8 characters, no upper bound, no complexity rule | `(src/auth.ts · validatePassword)` |
| Timezone validation | pattern plus a real `Intl.DateTimeFormat` check | `(src/auth.ts · normalizeTimezone)` |
| Password change | requires the current password, verified against the stored hash before the hash is rotated; a wrong or missing value returns `invalid-current-password` and changes nothing | `(src/auth.ts · updateProfile)`, `(src/web.ts · createWeb)` profile POST |
| Login throttle | 10 failures per (client, route, username) per 15 min → `429`; the password is verified **before** the count is consulted, so a blocked key still admits the real credential (an attacker cannot lock a known account out) and a success clears the key. The web route keeps at most 64 characters of the attempted name, the limiter bounds any key to 128 characters and holds at most 10 000 windows, evicting the oldest | `(src/rate-limit.ts · createRateLimiter)`, `(src/web.ts · createWeb)` |
| Username enumeration | an unknown username is verified against a fixed dummy scrypt hash, so its response time matches a wrong password; the signup route maps a taken name to the generic `signup-unavailable` message. Open signup still reveals availability by succeeding — the accepted risk in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §4 | `(src/auth.ts · login)`, `(src/web.ts · createWeb)` |
| Credential stuffing at scale | throttled per client address; behind a reverse proxy set `MILEBOOK_TRUST_PROXY=true` so the **last** `X-Forwarded-For` hop (the one your proxy appended) is used instead of the shared proxy address `(src/web.ts · clientKey)`. A client-rotated prefix cannot buy a fresh budget, a malformed header falls back to the socket, and the header is ignored entirely unless the switch is on |
| Hashing cost | `scrypt` runs asynchronously on the thread pool, so a burst of sign-ins does not stall other requests; measured ~56 ms per hash and `/health` stayed at 2 ms median during eight parallel verifications | `(src/auth.ts · hashPassword)` |

## 2. Sessions

| Control | State | Evidence |
|---|---|---|
| Cookie | `milebook_session` = base64url payload + HMAC-SHA256 signature, `HttpOnly; SameSite=Lax; Path=/` | `(src/auth.ts · cookieFor)` |
| `Secure` flag | added when `MILEBOOK_COOKIE_SECURE=true`; **default off** so a plain-HTTP dev host still works | `(src/auth.ts · createAuth)` |
| Lifetime | 30 days, stateless; the cookie dies earlier if the account's session version moves past it | `(src/auth.ts · AUTH_COOKIE_MAX_AGE_SECONDS)`, `(src/auth.ts · parsePayload)` |
| Revocation | enforced by a session version: the profile carries `tokenVersion`, the cookie carries the version it was minted with, and a mismatch invalidates the cookie. A password change bumps it and reissues a cookie for the calling device; `POST /profile/sign-out-everywhere` bumps it and clears both cookies | `(src/auth.ts · signOutEverywhere)`, `(src/auth.ts · read)` |
| Secret | `MILEBOOK_AUTH_SECRET`, required, ≥ 32 characters, process refuses to start without it | `(src/index.ts · requireEnv)` |
| Page-session cookie | `milebooksid` is an in-memory id that only gates "pull Garmin on a new browser session"; it grants no access | `(src/web.ts · startSession)` |
| Logout | `POST /logout` clears both cookies and drops the page session; a `GET` is `405`, so a cross-site image or link cannot end the session | `(src/web.ts · createWeb)` |

## 3. Authorization and isolation

- Every store method takes `userId`; every query filters on it. The suite proves isolation for accounts, activities,
  change sets, states, muscle records, notifications and audit pages (`(test/store.test.ts)`, `(test/web.test.ts)`).
- `/coach-audit` and `/coach-states` are per-runner internal pages: they require the signed cookie and show only that
  runner's rows. They are not linked from the end-user navigation.
- The coach gateway has no account auth of its own; it requires the shared internal token on every route except the bare
  `/health` probe, compares it in constant time, validates `x-milebook-user` against `^[A-Za-z0-9_-]{1,64}$`, and binds
  loopback only. Without the token a request is rejected with `401` before any store read; an erased account gets `403`
  (`(src/gateway.ts · createGateway)`).
- Comment-only coach turns cannot write: the directive carries `allowCalendarWrites: false` and the gateway refuses
  calendar writes for such a turn (`(src/gateway.ts · createGateway)`).

## 4. Request hardening

| Control | State | Evidence |
|---|---|---|
| Same-origin POST check | rejects a POST whose `Origin` host differs; a request with **no** `Origin` is allowed (**partial**) | `(src/web.ts · isSameOriginPost)` |
| CSRF tokens | none; protection rests on `SameSite=Lax` plus the origin check | — |
| Body cap | 200 KB on the web surface, 2 MB on the gateway | `(src/web.ts · readJsonBody)`, `(src/gateway.ts · readJson`) |
| Security headers | `x-content-type-options: nosniff`, `referrer-policy: same-origin`, `x-frame-options: DENY`, `cross-origin-opener-policy: same-origin`, `permissions-policy`, plus HSTS when `cookieSecure` | `(src/web.ts · createWeb)` |
| Content-Security-Policy | hash-based, computed per response: `default-src 'self'`, `script-src 'self'` plus one `sha256-` hash per inline script actually sent, `style-src 'self' 'unsafe-inline'` for the markup's style attributes, `img-src 'self' data:`, `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`. No inline event handlers, no `eval`, no workers, no third-party origins, so no `unsafe-inline` or `unsafe-eval` in `script-src` | `(src/web.ts · contentSecurityPolicy)` |
| Error disclosure | the `500` page returns stable copy; the internal message goes to the server log only | `(src/web.ts · createWeb)` |
| Proxy failure | `503` on timeout and on upstream failure, with stable detail strings that never echo the upstream message | `(src/web.ts · createWeb)` |
| Open redirect | `/language` accepts only a same-origin path; `next` params are allow-listed | `(src/web.ts · safeLanguageNext)`, `(src/web.ts · safeNext)` |
| Output escaping | every interpolated value goes through `escapeHtml`; inline JSON through `jsonForScript` | `(src/web-html.ts · escapeHtml)` |
| Gateway CORS | no grant at all; `OPTIONS` returns a bare `204` | `(src/gateway.ts · createGateway)` |
| Malformed cookies | a percent escape that fails to decode is ignored instead of failing the request | `(src/web.ts · parseCookies)` |
| Garmin outbound | 15 s abort per request, `redirect: "error"`, a 2 MB body ceiling, 500-char error bodies; stored labels are capped (activity title 120, workout name 120, notes 1000) and control-stripped | `(src/garmin.ts · createGarminClient)`, `(src/garmin-workout.ts · mapGarminWorkout)` |
| Erasure marker | a `deleted_users` row is written in the same transaction as the deletes; sync and coach writes check it after every await and skip the erased id, and the cached Garmin client is dropped | `(src/store.ts · deleteAccount)`, `(src/garmin-sync.ts · createGarminSync)`, `(src/gateway.ts · applyParsedTurn)` |
| Deleted bytes | `PRAGMA secure_delete = ON` zeroes freed payloads; after sealing legacy Garmin keys the WAL is checkpointed and the file vacuumed | `(src/store.ts · SqliteStore)` |
| Schema downgrade | a file stamped by a newer build is refused before any step runs; a failing `ROLLBACK` never masks the step error | `(src/migrations.ts · runMigrations)` |

## 5. Secrets and key material

| Secret | Storage | Exposure |
|---|---|---|
| Auth secret | environment or `data/milebook-auth.secret` | never logged; rotation invalidates every session |
| Model API key | environment or `data/milebook-model.secret` | sent only to the configured endpoint |
| Internal token | generated per start, or `MILEBOOK_INTERNAL_TOKEN` | in-process only |
| Garmin personal key | sealed with AES-256-GCM (fresh 96-bit nonce, authenticated) when `MILEBOOK_GARMIN_KEY` is set; plaintext otherwise, and the boot log warns (**open** in that case) | masked to last 4 characters in the UI, never returned by export; legacy plaintext rows are sealed on the first boot after the key appears, then the WAL is checkpointed and the file vacuumed so the old bytes do not linger |
| Password hash | scrypt string in `users.payload` | never returned by any route |
| Logs | one JSON line per request, asset, coach turn and boot; credential-shaped field names are redacted by name and values over 300 characters truncated; the runner's message text is never logged | `(src/log.ts · createLogger)` |

`.gitignore` covers `data/`, `.env*`, `*.sqlite`, `*.db` and logs; the lint gate fails on Garmin-style and
OpenAI-style key patterns. The Garmin key is protected by database-file permissions and, when `MILEBOOK_GARMIN_KEY`
is configured, by an authenticated envelope that a copied database file cannot open without the key
`(src/secrets.ts · createSecretBox)`. The key itself lives in the environment or `data/milebook-garmin.secret`,
never in the repository.
KMS and is tracked in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

## 6. Transport and hosting

**Public exposure path.** The first public URL is a Cloudflare Tunnel: the app binds `127.0.0.1`, `cloudflared` dials
out, and Cloudflare terminates TLS. `MILEBOOK_COOKIE_SECURE=true` keeps the session cookie off plaintext and
`MILEBOOK_TRUST_PROXY=true` keeps throttling keyed on the viewer rather than the tunnel. Open signup is an accepted risk
with its revisit trigger in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §4.

- **TLS is not implemented in the app** (**open**). The web surface binds `0.0.0.0` in plain HTTP; production must put a
  TLS terminator in front of it and set `MILEBOOK_COOKIE_SECURE=true`.
- The gateway binds `127.0.0.1`; it must never be exposed.
- One process per database file; SQLite WAL with `busy_timeout` handles the writer lock.
- Backups contain every secret in the database: store them with the same care as the database itself.

## 7. Privacy and data protection

| Concern | State |
|---|---|
| Data inventory | profile (name, timezone, goal), plan, activities and Garmin metrics, coach messages, directives, change sets, coaching states, muscle check-ins (health-adjacent), preferences, notifications |
| Export | `/export.json` and `/export.ics`; the bundle omits the password hash, the Garmin key and coach messages (`(src/export.ts · buildExportBundle)`) |
| Erasure | **closed** — `POST /profile/delete` requires the current password and the typed username, then deletes every user-scoped row and the account in one transaction and leaves a marker so an in-flight sync or coach turn cannot recreate rows (`(src/store.ts · deleteAccount)`, `(src/web.ts · createWeb)`) |
| Retention | resolved states and events pruned after 180 days; memories windowed; proposals expire at read time; messages and turns have no retention limit |
| Third-party transfer | coach prompts (including health-adjacent text) are sent to the configured model provider; there is no privacy policy or consent surface in the app (**open**) |
| Medical posture | the product is not a medical device; the licence carries the disclaimer and the muscle/state copy routes red flags to a clinician |

## 8. What an attacker on the LAN can and cannot do today

- Cannot read another runner's data through the web surface without a valid signed cookie.
- Cannot forge a cookie without the auth secret (which is now required and ≥ 32 characters).
- Cannot reach the gateway from another host (loopback bind).
- Cannot drive the gateway from a web page (no CORS grant) or another local process (internal token).
- **Can** read traffic in clear text on the LAN while TLS is missing.
- **Can** brute-force a known username at scrypt speed; a wrong password past 10 failures per 15 minutes gets `429`, but
  the throttle never blocks the correct password, so the account cannot be locked out. Rotating client addresses buys a
  fresh budget, which is why the scrypt cost and the generic failure copy are the real controls.

## 9. Rules that must not regress

1. The auth secret stays required; never reintroduce a default secret.
2. Every store method keeps `userId` scoping; every new route must prove isolation with a test.
3. The gateway stays on loopback with the internal token; never add a CORS grant.
4. Model output never writes without validation; comment-only turns never write.
5. Every interpolated value is escaped; inline JSON goes through `jsonForScript`.
6. `Secure` cookies and HSTS turn on with TLS; production must set `MILEBOOK_COOKIE_SECURE=true`.
7. Secrets never enter the repository; the lint gate and `.gitignore` stay in place.
8. A write that resumes after an `await` checks `store.isUserDeleted(userId)` before inserting; the erasure marker is
   written in the delete transaction and must stay there.
9. The gateway's internal token stays required and constant-time compared; `/health` stays bare and pre-auth.
10. Outbound Garmin calls keep a timeout, `redirect: "error"` and the body ceiling; upstream text is capped before it is
    stored or put in a prompt.
11. The rate limiter keeps a hard window ceiling; the login route verifies the credential before consulting the count.
