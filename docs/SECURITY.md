# Security

**Status:** current · **Owner:** security · **Updated:** 2026-11-22 · **Supersedes:** the security sections of docs/MILEBOOK-CALENDAR.md and root README.md

This page states what the running system actually enforces, and what it does not. Items marked **open** are release
blockers or accepted risks; the ordered remediation plan is in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).
The disclosure policy is in [SECURITY.md](../SECURITY.md) at the repository root.

## 1. Authentication

| Control | State | Evidence |
|---|---|---|
| Password hashing | scrypt, 16-byte salt, 64-byte hash, constant-time compare | `(src/auth.ts · hashPassword)`, `(src/auth.ts · verifyPassword)` |
| Username policy | lowercase letters/digits/underscore, 3–24 chars, case-insensitive unique | `(src/auth.ts · normalizeUsername)` |
| Password policy | minimum 8 characters, no upper bound, no complexity rule | `(src/auth.ts · validatePassword)` |
| Timezone validation | pattern plus a real `Intl.DateTimeFormat` check | `(src/auth.ts · normalizeTimezone)` |
| Password change | requires the current password, verified against the stored hash before the hash is rotated; a wrong or missing value returns `invalid-current-password` and changes nothing | `(src/auth.ts · updateProfile)`, `(src/web.ts · createWeb)` profile POST |
| Login throttle | 10 failures per (client, route, username) per 15 min → `429`; a success clears the key | `(src/rate-limit.ts · createRateLimiter)`, `(src/web.ts · createWeb)` |
| Credential stuffing at scale | throttled per client address only; behind a proxy every runner shares the proxy address (**open**) | `(src/web.ts · clientKey)` |
| Hashing cost | synchronous `scryptSync` blocks the single event loop for tens of milliseconds per attempt (**open**) | `(src/auth.ts · hashPassword)` |

## 2. Sessions

| Control | State | Evidence |
|---|---|---|
| Cookie | `milebook_session` = base64url payload + HMAC-SHA256 signature, `HttpOnly; SameSite=Lax; Path=/` | `(src/auth.ts · cookieFor)` |
| `Secure` flag | added when `MILEBOOK_COOKIE_SECURE=true`; **default off** so a plain-HTTP dev host still works | `(src/auth.ts · createAuth)` |
| Lifetime | 30 days, stateless; the cookie dies earlier if the account's session version moves past it | `(src/auth.ts · AUTH_COOKIE_MAX_AGE_SECONDS)`, `(src/auth.ts · parsePayload)` |
| Revocation | enforced by a session version: the profile carries `tokenVersion`, the cookie carries the version it was minted with, and a mismatch invalidates the cookie. A password change bumps it and reissues a cookie for the calling device; `POST /profile/sign-out-everywhere` bumps it and clears both cookies | `(src/auth.ts · signOutEverywhere)`, `(src/auth.ts · read)` |
| Secret | `MILEBOOK_AUTH_SECRET`, required, ≥ 32 characters, process refuses to start without it | `(src/index.ts · requireEnv)` |
| Page-session cookie | `milebooksid` is an in-memory id that only gates "pull Garmin on a new browser session"; it grants no access | `(src/web.ts · startSession)` |
| Logout | clears both cookies and drops the page session | `(src/web.ts · createWeb)` |

## 3. Authorization and isolation

- Every store method takes `userId`; every query filters on it. The suite proves isolation for accounts, activities,
  change sets, states, muscle records, notifications and audit pages (`(test/store.test.ts)`, `(test/web.test.ts)`).
- `/coach-audit` and `/coach-states` are per-runner internal pages: they require the signed cookie and show only that
  runner's rows. They are not linked from the end-user navigation.
- The coach gateway has no account auth of its own; it trusts `x-milebook-user` **after** checking the shared internal
  token, and binds loopback only. Without the token a request is rejected with `401` before any store read
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
| Proxy failure | `504` on timeout, `502` on upstream failure, stable detail strings | `(src/web.ts · createWeb)` |
| Open redirect | `/language` accepts only a same-origin path; `next` params are allow-listed | `(src/web.ts · safeLanguageNext)`, `(src/web.ts · safeNext)` |
| Output escaping | every interpolated value goes through `escapeHtml`; inline JSON through `jsonForScript` | `(src/web-html.ts · escapeHtml)` |
| Gateway CORS | no grant at all; `OPTIONS` returns a bare `204` | `(src/gateway.ts · createGateway)` |

## 5. Secrets and key material

| Secret | Storage | Exposure |
|---|---|---|
| Auth secret | environment or `data/milebook-auth.secret` | never logged; rotation invalidates every session |
| Model API key | environment or `data/milebook-model.secret` | sent only to the configured endpoint |
| Internal token | generated per start, or `MILEBOOK_INTERNAL_TOKEN` | in-process only |
| Garmin personal key | sealed with AES-256-GCM (fresh 96-bit nonce, authenticated) when `MILEBOOK_GARMIN_KEY` is set; plaintext otherwise, and the boot log warns (**open** in that case) | masked to last 4 characters in the UI, never returned by export; legacy plaintext rows are sealed on the first boot after the key appears |
| Password hash | scrypt string in `users.payload` | never returned by any route |
| Logs | one JSON line per request, asset, coach turn and boot; credential-shaped field names are redacted by name and values over 300 characters truncated; the runner's message text is never logged | `(src/log.ts · createLogger)` |

`.gitignore` covers `data/`, `.env*`, `*.sqlite`, `*.db` and logs; the lint gate fails on Garmin-style and
OpenAI-style key patterns. The Garmin key is protected by database-file permissions and, when `MILEBOOK_GARMIN_KEY`
is configured, by an authenticated envelope that a copied database file cannot open without the key
`(src/secrets.ts · createSecretBox)`. The key itself lives in the environment or `data/milebook-garmin.secret`,
never in the repository.
KMS and is tracked in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

## 6. Transport and hosting

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
| Erasure | **open** — there is no account-deletion route and no cascade delete; a runner cannot remove their data |
| Retention | resolved states and events pruned after 180 days; memories windowed; proposals expire at read time; messages and turns have no retention limit |
| Third-party transfer | coach prompts (including health-adjacent text) are sent to the configured model provider; there is no privacy policy or consent surface in the app (**open**) |
| Medical posture | the product is not a medical device; the licence carries the disclaimer and the muscle/state copy routes red flags to a clinician |

## 8. What an attacker on the LAN can and cannot do today

- Cannot read another runner's data through the web surface without a valid signed cookie.
- Cannot forge a cookie without the auth secret (which is now required and ≥ 32 characters).
- Cannot reach the gateway from another host (loopback bind).
- Cannot drive the gateway from a web page (no CORS grant) or another local process (internal token).
- **Can** read traffic in clear text on the LAN while TLS is missing.
- **Can** brute-force a known username at 10 attempts per 15 minutes per client address, which is slow but not
  eliminated, and can rotate client addresses.

## 9. Rules that must not regress

1. The auth secret stays required; never reintroduce a default secret.
2. Every store method keeps `userId` scoping; every new route must prove isolation with a test.
3. The gateway stays on loopback with the internal token; never add a CORS grant.
4. Model output never writes without validation; comment-only turns never write.
5. Every interpolated value is escaped; inline JSON goes through `jsonForScript`.
6. `Secure` cookies and HSTS turn on with TLS; production must set `MILEBOOK_COOKIE_SECURE=true`.
7. Secrets never enter the repository; the lint gate and `.gitignore` stay in place.
