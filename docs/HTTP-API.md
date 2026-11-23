# HTTP API
**Status:** current · **Owner:** web/gateway HTTP surface · **Updated:** 2026-11-22 · **Supersedes:** docs/MILEBOOK-CALENDAR.md §10

Two HTTP servers share one SQLite store: the **web surface** (pages, JSON, static assets) and the **coach gateway**
(OpenAI-compatible, loopback only). The browser only ever talks to the web surface; the gateway is reached through the
web server's `/chat` proxy. Accounts: [SECURITY.md](SECURITY.md) · processes: [OPERATIONS.md](OPERATIONS.md) · rows:
[DATA-MODEL.md](DATA-MODEL.md) · turn contract: [COACH-CONTRACT.md](COACH-CONTRACT.md) · tests: [TESTING.md](TESTING.md).

Citations are symbol anchors (`(src/web.ts · createWeb)`), never line numbers; every web route is matched in that one dispatcher.

## 1. Two servers

| Surface | Bind | Default port | Who can reach it | Owns |
|---|---|---|---|---|
| Web | `0.0.0.0` | `8091` (`MILEBOOK_WEB_PORT`) | the browser, LAN, any client | accounts, sessions, pages, JSON, static assets, the coach proxy |
| Gateway | `127.0.0.1` | `8090` (`MILEBOOK_GATEWAY_PORT`) | local processes only | the coach turn, the model call, calendar writes |

`(src/index.ts · web.server.listen)`, `(src/index.ts · gateway.server.listen)`, `(src/index.ts · readPort)`

- The gateway has **no account authentication**: it believes `x-milebook-user` and falls back to
  `MILEBOOK_DEFAULT_USER`; it is safe only because it binds loopback. `(src/gateway.ts · createGateway)`
- `MILEBOOK_INTERNAL_TOKEN` (generated per start when unset) closes that hole: every route except `GET /health` then
  needs `x-milebook-internal-token` or gets `401`. `(src/gateway.ts · createGateway)`, `(src/index.ts · internalToken)`
- The web server resolves the signed cookie to a `userId` and puts **that** in `x-milebook-user`; the browser never
  sends the header and never sees the gateway. `(src/web.ts · createWeb)`
- Browser → gateway: `POST /chat` → `fetch(gatewayUrl + "/v1/chat/completions")`, `MILEBOOK_GATEWAY_URL` defaulting to
  `http://127.0.0.1:8090`. `(src/web.ts · createWeb)`

## 2. Conventions

**Content types** — HTML pages (`text/html; charset=utf-8`, including the 403/404/405/429/500 pages)
`(src/web.ts · sendHtml)`; JSON (`application/json; charset=utf-8`) for `/notifications`, `/notifications/read`,
`/calendar/data`, `/chat`, `/chat/history`, both peeks and `/muscle/attention.json` `(src/web.ts · sendJson)`;
`text/css`, `text/javascript`, `image/webp`, `model/gltf-binary` for `/static/*` `(src/web.ts · sendAsset)`; and
`text/calendar; charset=utf-8` for `/export.ics` `(src/export.ts · buildCalendarIcs)`.

**Caching**

- `sendHtml`/`sendJson` send `cache-control: no-store`; the exports add `content-disposition: attachment`. `(src/web.ts · sendJson)`
- Web `GET /health` is the one JSON response without `cache-control`, and its type is bare `application/json`. `(src/web.ts · createWeb)`
- `sendAsset` sends a strong `etag` and answers a matching `if-none-match` with `304`. app.css is
  `public, max-age=31536000, immutable`; three.js builds `no-cache`; WebP `public, max-age=86400`; the GLB `max-age=3600`.
  `(src/web.ts · sendAsset)`
- HTML links the sheet as `/static/app.css?v=${APP_CSS_VERSION}` (`33`); the server ignores the query. `(src/web.ts · APP_CSS_VERSION)`

**Cookies**

| Cookie | Set by | Value | Flags | Lifetime |
|---|---|---|---|---|
| `milebook_session` | `createAuth` | `base64url({userId,exp,ver}).` + HMAC-SHA256 signature; `ver` is the session version it was minted with | `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `MILEBOOK_COOKIE_SECURE=true` | 30 days, cut short when the profile's `tokenVersion` moves past `ver` `(src/auth.ts · AUTH_COOKIE_MAX_AGE_SECONDS)` |
| `milebooksid` | `createWeb` | random UUID page-session id, held in memory (max 500, LRU-evicted) | `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `cookieSecure` | 24 h `(src/web.ts · SESSION_TTL_MS)` |
| `milebook_lang` | `/language` | locale code | `SameSite=Lax; Path=/` (readable by scripts) | 1 year `(src/i18n.ts · languageCookie)` |

The signed cookie is verified with `timingSafeEqual`, and rejected when `exp` has passed or the user row is gone: a valid cookie alone cannot invent a user. `(src/auth.ts · read)`

**Redirects and bodies**

- Every state-changing POST answers `303` with `location`, never a body. `(src/web.ts · redirect)`
- Non-`/chat` POSTs are form-encoded and read with `URLSearchParams`; the content-type is not checked. `(src/web.ts · readForm)`
- `POST /chat` is the only JSON reader. `(src/web.ts · readJsonBody)`
- Both readers cap the body at **200 000 bytes**: a form route turns the throw into the 500 page, `/chat` into `400 invalid body`. `(src/web.ts · readJsonBody)`
- `isSameOriginPost` runs before routing on every POST: no `Origin` passes, a mismatched host gets the 403 page. `(src/web.ts · isSameOriginPost)`

**Response headers on every web response** (set before routing, so errors carry them too): `x-content-type-options:
nosniff`, `referrer-policy: same-origin`, `x-frame-options: DENY`, `cross-origin-opener-policy: same-origin`,
`permissions-policy: camera=(), microphone=(), geolocation=()`, plus `strict-transport-security` when `cookieSecure`. `(src/web.ts · createWeb)`

**Method guards are not uniform.** `/`, `/calendar`, `/history`, `/day/:day`, `/activity/:id`, `/language`, `/health`,
`/favicon.ico` and every `/static/*` path have **no method check**: a POST renders or serves like a GET (the same-origin
check still applies). `(src/web.ts · createWeb)`

## 3. Web surface routes

Legend — **Auth**: `public` = no cookie needed; `cookie` = signed cookie required, else `303 /login`; `cookie+SO` = the
same, and the POST also passes `isSameOriginPost`.

### 3.1 Public and diagnostics

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| any | `/health` | public | — | `200 {"status":"ok"}` | no `cache-control`; no session cookie issued | `(src/web.ts · createWeb)` |
| any | `/favicon.ico` | public | — | `204`, empty body | avoids a 404 in the log | `(src/web.ts · createWeb)` |
| any | `/language` | public | query `locale`, `next` | `303` to `next`, else the `Referer` path+query, else `/calendar` | sets `milebook_lang` only when `locale` is a known locale; `next` must be a same-origin absolute path | `(src/i18n.ts · languageCookie)`, `(src/web.ts · safeLanguageNext)` |

### 3.2 Accounts

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| GET | `/login` | public | query `error` | `200` login page, or `303 /calendar` when already signed in | error codes render from the query, no state written | `(src/web.ts · createWeb)` |
| POST | `/login` | public+SO | form `username`, `password` | `303 /calendar` + `milebook_session` + `milebooksid`; failure `303 /login?error=<code>` | starts a background Garmin sync when a key is saved; 10 failed attempts per 15 min per IP+username get `429` | `(src/web.ts · authLimiter)` |
| GET | `/signup` | public | query `error` | `200` signup page, or `303 /calendar` when already signed in | — | `(src/web.ts · createWeb)` |
| POST | `/signup` | public+SO | form `username`, `displayName`, `password`, `timezone`, `goal` | `303 /calendar` + both cookies; failure `303 /signup?error=<code>` | `timezone` defaults to `Asia/Hong_Kong`; same 429 limiter, keyed `signup` | `(src/web.ts · authLimiter)` |
| GET | `/logout` | public | — | `303 /login` | drops the in-memory page session and clears both cookies | `(src/web.ts · clearSessionCookie)` |
| POST | `/profile/sign-out-everywhere` | cookie+SO | — | `303 /login` | bumps `tokenVersion`, so every device's cookie stops validating, then clears both cookies `(src/auth.ts · signOutEverywhere)` | `(src/web.ts · createWeb)` |
| POST | `/profile/delete` | cookie+SO | form `currentPassword`, `confirm` (the username, typed) | `303 /goodbye` on success; `303 /profile?error=invalid-current-password` or `?error=confirm-mismatch` otherwise | deletes all 18 user-scoped tables and the account row in one transaction, drops every in-memory page session for the account and clears both cookies `(src/store.ts · deleteAccount)` | `(src/web.ts · createWeb)` |
| GET | `/privacy` | public | — | `200` page | what is stored, who else receives it, retention, export/delete choices; both locales `(src/web.ts · renderPrivacy)` | `(src/web.ts · renderPrivacy)` |
| GET | `/goodbye` | public | — | `200` page | post-erasure confirmation; carries no account detail `(src/web.ts · renderGoodbye)` | `(src/web.ts · renderGoodbye)` |
| GET | `/credits` | public | — | `200` page | third-party notices in both locales: three.js MIT and BodyParts3D CC BY 4.0, printed verbatim `(src/web.ts · renderCredits)` | `(src/web.ts · renderCredits)` |
| GET / POST | `/profile` | cookie+SO | GET query `saved`, `goal`, `error`; POST form `displayName`, `timezone`, `goal`, `password`, `currentPassword` (required when `password` is set) | GET `200` page; POST `303 /profile?saved=1` (plus `&goal=1` when the goal was newly set) or `303 /profile?error=<code>` | a password change verifies `currentPassword`, bumps `tokenVersion` and reissues the session cookie for this device; the error code is `invalid-current-password` when it does not match | `(src/web.ts · createWeb)` |

### 3.3 Calendar and days

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| any | `/` | cookie | as `/calendar` | `200` calendar page | alias of `/calendar`, renders instead of redirecting | `(src/web.ts · createWeb)` |
| any | `/calendar` | cookie | query `month`, `garmin`, `keyError`, plus flash params `synced`, `syncError`, `newest`, `logged`, `review`, `undone`, `undoError`, `logError` | `200` month grid | invalid `month` falls back to the current month; runs the throttled auto-sync and the workout backfill before rendering; `?garmin=setup` only opens the key modal client-side | `(src/web.ts · createWeb)` |
| GET | `/calendar/data` | cookie | query `month` | `200 {month, days:{<day>:{items,html}}}` | same fallback; the `400 month must be YYYY-MM` branch is unreachable because the fallback already matched | `(src/web.ts · createWeb)` |
| POST | `/calendar/changes/:id/revert` | cookie+SO | form `next`; `:id` URL-encoded | `303 <next>?undone=<n>#recent-changes`, else `303 <next>?undoError=<reason>` | reasons: `invalid change id`, `that change no longer exists`, `that change was already undone`, `the calendar could not be restored`; scoped to the runner | `(src/history.ts · applyRevert)` |
| any | `/day/:day` | cookie | path `YYYY-MM-DD` | `200` day page; `404` page for a malformed day | carries the manual-log form and flash params | `(src/web.ts · createWeb)` |

### 3.4 Training log and runs

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| any | `/history` | cookie | query `view` (`week`/`month`/`year`), `period`, `tab` (`review`) | `200` log page | `view` defaults to `week`; a bad `period` falls back to the current week/month/year | `(src/web.ts · createWeb)` |
| any | `/activity/:id` | cookie | path activity id | `200` detail page; `404` page when unknown | `/activity/<id>/peek` is matched first, so a peek never reaches this page | `(src/web.ts · createWeb)` |
| GET | `/activity/:id/peek` | cookie | path activity id | `200 {peek}` JSON | `404 {error:{detail:"activity not found"}}`; any other method `405` JSON | `(src/web.ts · buildActivityPeek)` |
| GET | `/session/:id/peek` | cookie | path session id | `200 {peek}` JSON | `404 {error:{detail:"session not found"}}`; any other method `405` JSON | `(src/web.ts · buildSessionPeek)` |
| GET | `/changes` | cookie | query `type` (`schedule`/`activity`/`muscle`) | `200` changes page | `type` defaults to `all`; a projection over existing rows, not a new table | `(src/web.ts · createWeb)` |

### 3.5 Coach, states and notifications

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| POST | `/chat` | cookie+SO | JSON `{message, intent?}` | `200` JSON (keys below), or `400`/`404`/`429`/`502`/`504` | `message` must be 1–1000 chars; `intent` is a typed `CoachIntent`; 40 messages per 5 min per user get `429`; 130 s proxy budget | `(src/web.ts · createWeb)`, `(src/web.ts · chatLimiter)` |
| GET | `/chat/history` | cookie | — | `200 {messages, states, changes, muscleProposals}` | 40 visible messages oldest-first; a server-authored greeting is added when the log is empty; hidden directives are never included | `(src/web.ts · createWeb)` |
| GET | `/coach-states` | cookie | query `tab` (`current`/`set`/`history`), `error` | `200` states page | GET never writes | `(src/web.ts · createWeb)` |
| POST | `/coach-states` | cookie+SO | form `key`, `ttlDays`, `note` | `303 /coach-states`, else `303 /coach-states?error=<code>` | codes: `invalid-key`, `invalid-ttl` (1–365), `invalid-note` (>200 chars) | `(src/coach-states.ts · setManualCoachState)` |
| POST | `/coach-states/refresh` | cookie+SO | — | `303 /coach-states` | runs detection once and persists; `MILEBOOK_AUTO_STATES=false` disables detection, not the route | `(src/coach-states.ts · refreshCoachStates)` |
| POST | `/coach-states/:id/confirm` | cookie+SO | path state id | `303 /coach-states`, else `303 /coach-states?error=not-found` | observing → active; expired ids are rejected | `(src/coach-states.ts · confirmCoachState)` |
| POST | `/coach-states/:id/resolve` | cookie+SO | path state id | `303 /coach-states`, else `303 /coach-states?error=not-found` | writes status `resolved` with source `user` | `(src/coach-states.ts · resolveCoachState)` |
| GET | `/coach-audit` | cookie | — | `200` audit page | unlinked internal page: directives, blocked-write stats, states, state events, `mode:` memories, prompt snapshots | `(src/web.ts · createWeb)` |
| GET | `/notifications` | cookie | — | `200 {unread, notifications}` | newest 20 notifications for the runner | `(src/web.ts · createWeb)` |
| POST | `/notifications/read` | cookie+SO | — | `200 {unread:0}` | marks every unread row read | `(src/web.ts · createWeb)` |

`POST /chat` answers `{reply, sessions, changes, suggestions, failures, changeSetId, reverted, memories, attempts,
outcome, validationCode, mode, writesAllowed, blockedWrites, directiveId, states, muscleProposals, blockedByStates,
prefill}`: the gateway's `milebook` block, with states and proposals re-read from the store. `(src/web.ts · createWeb)`

### 3.6 Muscle

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| GET | `/muscle` | cookie | query `day`, `proposal`, `activity`, `focus`, `saved`, `error` | `200` muscle page | every query param is a validated deep link; `saved` is `1`, `status`, `proposal` or `dismissed` | `(src/web.ts · createWeb)` |
| POST | `/muscle/checkin` | cookie+SO | form `day`, `activityId`, `note`, `hold`, `musclesJson` **or** `muscleIds[]`, `soreness`, `conditions[]`, `side`, `warmUp` | `303 /muscle?saved=1`, else `303 /muscle?error=<code>` | codes: `day`, `activity`, `note`, `conditions`, `empty`, `too-many`, `severity`, `muscles`; a linked run must belong to the check-in day; resets the status period per muscle | `(src/web.ts · createWeb)` |
| POST | `/muscle/status` | cookie+SO | form `action` (`resolve`/`hold`/`release`/`resolve-all`), `muscleId` | `303 /muscle?saved=status`, else `303 /muscle?error=<code>` | codes: `muscles`, `conditions`; `resolve-all` marks every computed status resolved | `(src/web.ts · createWeb)` |
| GET | `/muscle/attention.json` | cookie | — | `200 {count, items:[{muscleId,name,current,level,hold,href}]}` | the app-bar badge feed; labels come from the request locale | `(src/web.ts · createWeb)` |
| POST | `/muscle/proposals/:id/confirm` | cookie+SO | path proposal id | `303 /muscle?saved=proposal`; JSON `200 {ok:true, decision}` when `Accept` contains `application/json` | JSON failure `404 {ok:false, detail}` or `409 {ok:false, detail}`; redirect codes `proposal-expired`, `proposal-status`, `proposal-missing` | `(src/muscle-proposals.ts · confirmMuscleProposal)` |
| POST | `/muscle/proposals/:id/dismiss` | cookie+SO | path proposal id | `303 /muscle?saved=dismissed&proposal=<id>` | same JSON/redirect split | `(src/muscle-proposals.ts · dismissMuscleProposal)` |
| POST | `/muscle/proposals/:id/restore` | cookie+SO | path proposal id | `303 /muscle` | undoes a dismissal inside the proposal window | `(src/muscle-proposals.ts · restoreMuscleProposal)` |

### 3.7 Garmin, sync, export

| Method | Path | Auth | Input | Output / redirect | Notes | Source |
|---|---|---|---|---|---|---|
| POST | `/sync` | cookie+SO | form `next` | `303 <next>?synced=<n>[&newest=<id>]`, `303 <next>?syncError=<detail>`, or `303 <next>?garmin=setup` | no saved key → setup popup; session start skips its own background sync for this route | `(src/web.ts · createWeb)` |
| POST | `/garmin/key` | cookie+SO | form `key`, `next` | `303 <next>?synced=…` or `303 <next>?garmin=setup&keyError=<detail>` | key must be 10–512 printable ASCII; verified against Garmin before it is saved; then syncs immediately | `(src/web.ts · isPlausibleGarminKey)` |
| POST | `/garmin/key/delete` | cookie+SO | form `next` | `303 <next>?garmin=deleted` | drops the saved key and the cached client | `(src/web.ts · createWeb)` |
| POST | `/activities` | cookie+SO | form `day`, `title`, `distanceKm`, `durationMin`, `rpe`, `requestId`, `next` | `303 <next>?logged=1&review=<activityId>`, else `303 <next>?logError=<detail>` | rejects a future day, impossible amounts and a blank distance+duration; a repeated `requestId` reuses the activity id | `(src/manual-activity.ts · buildManualActivity)` |
| GET | `/export.json` | cookie | — | `200` JSON attachment `milebook-export-<today>.json` | profile (no hash), sessions, activities, change sets, muscle check-ins, status controls, proposals | `(src/export.ts · buildExportBundle)` |
| GET | `/export.ics` | cookie | — | `200 text/calendar` attachment `milebook-calendar-<today>.ics` | planned sessions as all-day events | `(src/export.ts · buildCalendarIcs)` |

`next` is never trusted raw: `safeNext` allows `/calendar`, `/history`, `/muscle`, `/changes` (with query) and `/day/YYYY-MM-DD`, else `/calendar`. `(src/web.ts · safeNext)`

### 3.8 Static assets

All twelve go through `sendAsset` with an ETag; the table gives the cache policy. `(src/web.ts · sendAsset)`

| Path | `content-type` | `cache-control` |
|---|---|---|
| `/static/app.css` | `text/css; charset=utf-8` | `public, max-age=31536000, immutable` |
| `/static/three.module.js` | `text/javascript; charset=utf-8` | `no-cache` |
| `/static/orbit-controls.js` | `text/javascript; charset=utf-8` | `no-cache` |
| `/static/gltf-loader.js` | `text/javascript; charset=utf-8` | `no-cache` |
| `/static/utils/BufferGeometryUtils.js` | `text/javascript; charset=utf-8` | `no-cache` |
| `/static/auth-hero.webp` | `image/webp` | `public, max-age=86400` |
| `/static/calendar-object.webp` | `image/webp` | `public, max-age=86400` |
| `/static/paper-grain.webp` | `image/webp` | `public, max-age=86400` |
| `/static/calendar-empty.webp` | `image/webp` | `public, max-age=86400` |
| `/static/calendar-wash.webp` | `image/webp` | `public, max-age=86400` |
| `/static/coach-token.webp` | `image/webp` | `public, max-age=86400` |
| `/static/anatomy-muscles.glb` | `model/gltf-binary` | `public, max-age=3600` |

## 4. Gateway API

| Method | Path | Auth | Input | Output | Notes | Source |
|---|---|---|---|---|---|---|
| OPTIONS | any path | none | — | `204`, only `cache-control: no-store` | answered before the token check; **no CORS grant** is sent and no preflight target is advertised | `(src/gateway.ts · createGateway)` |
| GET | `/health` | none | — | `200 {status:"ok", model}` | the only route that stays open when an internal token is set | `(src/gateway.ts · createGateway)` |
| GET | `/v1/models` | token | — | `200 {object:"list", data:[{id, object:"model", created, owned_by:"milebook"}]}` | OpenAI-compatible shape; `id` is `MILEBOOK_MODEL_ID` (default `milebook-coach`) | `(src/gateway.ts · createGateway)` |
| POST | `/v1/chat/completions` | token | JSON (below) | `200` completion JSON, or SSE when `stream:true` | the only write route; any other path **or method** on the gateway gets `404 not-found` | `(src/gateway.ts · createGateway)` |

**Request** — `{"model","stream","messages":[{"role":"user","content"}],"milebook":{"directive"},"request_id"}` `(src/gateway.ts · createGateway)`

- Only the last user message's `content` is used; an empty one is `400 no-question`. `(src/gateway.ts · lastUserText)`
- `milebook.directive` is validated before the model call and its references re-resolved **per user**, so a foreign id is
  `404 reference-not-found`. `(src/gateway.ts · resolveDirectiveReferences)`
- Idempotency: `x-milebook-request-id` header or body `request_id`, `^[A-Za-z0-9._:-]{1,100}$`; `stream:true` disables it.
  `(src/gateway.ts · requestIdFrom)`
- Body cap 2 000 000 bytes → `400 invalid-body`. `(src/gateway.ts · readJson)`

**Response** — `{id, object:"chat.completion", created, model, choices:[{index,message:{role,content},
finish_reason:"stop"}], usage:{...0}, milebook:{...}}`. `(src/gateway.ts · completionBody)`

`milebook` carries `sessions, memories, changes, changeSetId, reverted, suggestions, failures, attempts, outcome,
validationCode, mode, writesAllowed, blockedWrites, directiveId, states, muscleProposals, blockedByStates, prefill`.
`stream:true` answers `text/event-stream` with two `chat.completion.chunk` frames and `data: [DONE]`, with no `milebook`
metadata. `(src/gateway.ts · streamChunk)`

**Headers** — `x-milebook-user` (identity, defaults to `MILEBOOK_DEFAULT_USER`), `x-milebook-request-id`,
`x-milebook-internal-token`, and `x-milebook-idempotent-replay: true` on a replayed completion.
`(src/gateway.ts · createGateway)`

**Error envelope** — `{"error":{"code","detail"}}` on every gateway failure; `sendJson` also sends `content-length`,
`cache-control: no-store` and `x-content-type-options: nosniff`. `(src/gateway.ts · sendJson)`

| Status | `code` | When |
|---|---|---|
| 400 | `invalid-body` | unparseable JSON, non-object body, over 2 MB |
| 400 | `no-question` | the last user message is empty |
| 400 | `invalid-directive` | `milebook.directive` fails validation |
| 401 | `unauthorized` | internal token required and missing or wrong |
| 404 | `not-found` / `reference-not-found` | any other path or method; a directive reference is missing or foreign |
| 409 | `directive-mismatch` / `turn-in-progress` | replay of a request id with a different directive hash, or while the first turn still runs |
| 502 | `model-failed` | the upstream model call threw or was aborted |
| 500 | `gateway-failed` | the handler failed before replying |

**Upstream abort** — `callModel` aborts the model request after **120 s**; the abort surfaces as `502 model-failed`. `(src/gateway.ts · callModel)`

## 5. Auth model

| Class | Routes | Behaviour without a valid signed cookie |
|---|---|---|
| Public | `/health`, `/favicon.ico`, `/static/*`, `/language`, `/login`, `/signup`, `/logout`, `/credits`, `/privacy`, `/goodbye` | served normally; these are matched before `options.auth.read` |
| Cookie | every other page and JSON route | `303 /login` (no `error` param, no body) |
| Per-user | every cookie route | the handler only ever reads `user.userId`; ids in the URL or body are re-checked against that user and a miss is `404` |

The gate runs after `/login`, `/signup` and `/logout`, so those three are reachable while signed in (the first two then
redirect to `/calendar`); a cookieless request for an unknown path gets the login redirect, not a 404. A valid cookie
also slides the page session: `resolveSession` issues a fresh `milebooksid` when it is missing or expired, except on
`/logout` and login/signup POSTs. `(src/web.ts · resolveSession)`

## 6. Errors and edge behaviour

| Status | Where | Body |
|---|---|---|
| 403 | any POST whose `Origin.host` differs from `Host` | HTML page, `error.crossOrigin` |
| 404 | unknown path, unknown activity, malformed day | HTML page |
| 404 | peeks, `/chat` with an unknown `review-activity` id, proposal JSON | JSON `{error:{detail}}` or `{ok:false, detail}` |
| 405 | wrong method on `/login`, `/signup`, `/logout`, `/profile`, `/profile/sign-out-everywhere`, `/profile/delete`, `/credits`, `/privacy`, `/goodbye`, `/coach-audit`, `/coach-states`, `/coach-states/refresh`, `/coach-states/:id/*`, `/muscle`, `/changes`, or either peek | HTML page, or JSON `{error:{detail:"method not allowed"}}` for the peeks |
| 429 | 10 failed logins per 15 min per IP+username; 40 coach messages per 5 min per user | HTML page (`error.tooManyAttempts`) or JSON `{error:{detail:"too many coach messages, try again in a few minutes"}}` |
| 500 | any uncaught handler error | HTML page; the message is `error.message` interpolated into the page (HTML-escaped), so internal text can reach the browser |
| 502 | `/chat` when the gateway answers non-OK, has no reply, or is unreachable | JSON `{error:{detail:"the coach service is unavailable"}}` |
| 504 | `/chat` when the proxy's 130 s budget expires | JSON `{error:{detail:"the coach did not answer in time"}}` |

A non-POST to `/chat`, `/sync`, `/garmin/key`, `/garmin/key/delete`, `/activities`, `/notifications/read`, `/calendar/data`, `/export.json`, `/export.ics` or `/muscle/attention.json` is not a 405 — it falls to the final 404. `(src/web.ts · createWeb)`

## 7. Undocumented and legacy surfaces

- `/coach-audit` is reachable but in no nav item; it shows directives, the learned preference profile, prompt snapshots
  and coaching states. `(src/web.ts · createWeb)`
- `/` is a second name for `/calendar` and appears in no link; `/changes` is linked from the account menu and the coach
  dock's Changes tab, not the nav. `(src/web.ts · renderAccountMenu)`
- `/muscle/attention.json` and both peeks are called by scripts, never linked.
- Only `milebook_lang` is read or written for locale; the pre-rename `poc3_lang` cookie is no longer consulted.
  `(src/web.ts · createWeb)`
- `POC3_*` environment aliases are gone: only `MILEBOOK_*` names are read. `(src/index.ts · readEnv)`
- Gateway `OPTIONS` exists for probes and never carries CORS headers; the browser never calls the gateway.
- `/export.json` is now a superset of the old contract: it adds muscle check-ins, status controls and proposals.

## 8. Changing this surface

1. Add the branch inside `createWeb`'s dispatcher in the right tier: before `options.auth.read` only if truly public,
   otherwise after it, using `user.userId`. `(src/web.ts · createWeb)`
2. Re-check every id from the URL or body against `user.userId`; return 404, never 403, for a foreign row.
3. POST handlers read with `readForm`/`readJsonBody`, write, then `303` with a flash param; never render on POST.
4. Add the i18n keys for every visible string and every `error` code in `src/i18n.ts`, in both locales.
5. Link it from the nav or the account menu if a runner is meant to find it.
6. Cover it in `test/web.test.ts` (auth redirect, 404/405, cross-origin 403, happy path) or `test/gateway.test.ts`.
7. Update this page, plus [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md) if the trust boundary moved,
   then run `pnpm check` (lint, typecheck, tests).

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [DATA-MODEL.md](DATA-MODEL.md) ·
[COACH-CONTRACT.md](COACH-CONTRACT.md) · [TESTING.md](TESTING.md) · [OPERATIONS.md](OPERATIONS.md)
