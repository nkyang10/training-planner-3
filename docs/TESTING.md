# Testing
**Status:** current · **Owner:** quality gate · **Updated:** 2026-11-22 · **Supersedes:** the test sections of docs/MILEBOOK-CALENDAR.md and docs/MUSCLE-TAB.md

Milebook has no build step, so the suite is the only executable spec. This page is the durable reference for the four gate commands, the 22-file suite map, the conventions every new test must copy, and the surfaces the gate does not touch. Every count here was measured on 2026-11-22 with `pnpm test`; treat counts as volatile, never as prose.

## 1. The gate

| Command | Runs | Reads | Fails when |
|---|---|---|---|
| `pnpm lint` | `node tools/lint.mjs` (tools/lint.mjs) | every `.ts` file under `src/` and `test/` | console output outside `src/index.ts`, TODO/FIXME, the word `any`, two secret prefixes (§6) |
| `pnpm typecheck` | `tsc -p tsconfig.json --noEmit` (tsconfig.json) | `src/**/*.ts`, `test/**/*.ts`, `tools/**/*.ts` | any `strict` + `noUncheckedIndexedAccess` error; nothing is emitted |
| `pnpm test` | `vitest run` (vitest.config.ts) | `test/**/*.test.ts`, node environment, 15 s per test | any failing assertion or unhandled rejection |
| `pnpm check` | `pnpm lint && pnpm typecheck && pnpm test` (package.json) | all of the above | the first failing step; `&&` stops the rest |

**Rule: never quote a test count in prose; run `pnpm check`.** Counts drift faster than docs: the HEAD commit message for the all-changes work says 627 tests, while `pnpm test` reported **626 tests in 22 files** on 2026-11-22 (~9 s wall, re-run twice; `pnpm typecheck` exit 0). A number copied into a doc, a PR body or a screenshot caption is stale by the next commit.

Observed 2026-11-22 in the working tree: a doc comment containing the word "any" in `src/gateway.ts` failed `pnpm lint` — the rule is word-based, not type-based (§6), so prose alone can turn the gate red.

## 2. The suite map

One row per test file, grouped by the domain it protects. Read a file's `describe` blocks before adding a case there.

| Domain | File | Tests | Protects |
|---|---|---|---|
| web HTTP surface | `test/web.test.ts` | 137 | auth pages, private calendar, run/session peek, account menu, erasure and privacy pages, Garmin connect/notifications/session sync, training log, workout surfaces, metric trend picker, in-calendar bubble, coach audit, history after refresh, month navigation/picker, coach-states page, involve-the-coach actions, page titles, honest demo slice |
| gateway contract | `test/gateway.test.ts` | 84 | completions, schedule CRUD, batched CRUD, change history/revert, schema echo repair, validation feedback loop, idempotent turns, hidden and discuss directives, coaching states, muscle check-ins, muscle-condition suggestions, prefill cache + snapshots (LL-3), silent preference profile (LL-5) |
| coach prompt/parsing | `test/coach.test.ts` | 71 | turn parsing, reply-style contract (LL-1), prompt segment A, context snapshot B/C, turn suffix E, conversation assembly, prompt epoch (LL-3), silent profile updates (LL-5), suggestions, schedule actions, revert, state proposals, muscle-condition suggestions, extended race horizon |
| coach prompt/parsing | `test/directives.test.ts` | 14 | coach intents, directives, muscle-review intents/directives, directive-hash stability |
| store | `test/store.test.ts` | 57 | messages, memories, account erasure across all 19 tables, coach preferences, prompt snapshots, sessions, activities, activity workouts, sync state, Garmin keys, notifications, persistence, user isolation, session CRUD for coach actions, users, change sets, transactions, coach turn audit, muscle check-ins/proposals/status controls |
| auth | `test/auth.test.ts` | 16 | signup and login, profile, validation, password-hash exposure, session versioning and revocation |
| coach states | `test/coach-states.test.ts` | 33 | catalog, deterministic detection, lifecycle, state proposals, guardrails |
| muscles · domain | `test/muscles.test.ts` | 23 | catalog, check-in validation, interpretation rules, drill suggestions, muscles worked, coach prompt facts, condition catalog |
| muscles · status | `test/muscle-status.test.ts` | 24 | day helpers, soreness decay curve, current statuses, shared status line, coach prompt facts |
| muscles · proposals | `test/muscle-proposals.test.ts` | 28 | draft parsing, build/list, confirm, dismiss, honest partition (F5/F14), run link (F11), undo dismissal (F7), prompt rendering |
| muscles · web | `test/muscle-web.test.ts` | 48 | muscle tab page, status layer, coach, muscle suggestions on the page and the decision endpoint |
| muscles · rig | `test/muscle-rig.test.ts` | 5 | 3D rig covers the catalog, mirrored parts, bounds, shape kinds, trunk lathe |
| muscles · anatomy | `test/muscle-anatomy.test.ts` | 3 | vendored anatomy asset: a material per catalog region, mesh names, BodyParts3D attribution |
| training math | `test/training.test.ts` | 20 | plan-vs-actual matching, weekly load summary, personal bests |
| Garmin · client | `test/garmin.test.ts` | 20 | client, activity mapping, splits, laps, token response variants |
| Garmin · sync | `test/garmin-sync.test.ts` | 9 | `createGarminSync`, workout enrichment |
| Garmin · workout | `test/garmin-workout.test.ts` | 10 | `mapGarminWorkout`, `failedGarminWorkout` |
| Garmin · errors | `test/garmin-errors.test.ts` | 5 | `describeGarminError` |
| i18n | `test/i18n.test.ts` | 17 | locale registry, `resolveLocale`, `createTranslator`, `DateFormat`, `clientStrings`, `languageCookie` |
| export | `test/export.test.ts` | 3 | export bundle, calendar ICS |
| manual activity | `test/manual-activity.test.ts` | 10 | manual activity record |
| calendar items | `test/calendar-items.test.ts` | 7 | calendar item rows |
| rate limiting | `test/rate-limit.test.ts` | 5 | window arithmetic, block after the limit, reset on success, prune |

**23 files, 649 tests.** `test/rate-limit.test.ts` exercises the limiter directly and `test/store.test.ts` audits an erasure table by table with a second connection; no test runs a browser, a real model or a real Garmin account, and the two proxy budgets (130 s web, 120 s gateway) are read from source rather than driven.

## 3. Test conventions

| Pattern | Where it lives | Why |
|---|---|---|
| `node:sqlite :memory:` store | `createStore(":memory:")` in every store-touching test; a file DB (`createStore("sqlite:<tmp>")`) only for persistence and migration tests | each test gets an isolated schema; no cleanup of shared state |
| injected `now()` clock | `now: () => "<day>T08:00:00.000Z"` on `createAuth`, `createWeb`, `createGateway` | dated features (soreness decay, TTL states, sync freshness) are deterministic; nothing reads the wall clock |
| injected `fetchImpl` for the model | `queueModel()` in `test/gateway.test.ts`; `vi.fn<typeof fetch>()` in `test/garmin.test.ts` | the gateway's model and Garmin HTTP are replaced at the seam; `http://model.test` / `https://garmin.test` never resolve |
| real `createServer` + `fetch` for HTTP | `start()` in `test/web.test.ts` and `test/muscle-web.test.ts`: listen on `127.0.0.1:0`, fetch over loopback, close in `afterEach` | exercises the real router, cookies and headers instead of calling handlers directly |
| fake Garmin clients via `garminFactory` | `fakeGarminFactory({ activities })` passed to `createWeb` | per-runner key handling and sync paths run without the Garmin API |
| seeded runners | `start({ seed })`, `seedSession` / `seedActivity` / `seedCoachState` / `seedNotification`, user `demo_runner` / `Demo Runner` | the fixture is a fake demo runner with synthetic dates (`TODAY = "2026-11-05"`) |
| no network, no sleeps | nothing in `test/` calls `setTimeout`; background pulls are awaited with `web.whenSynced()` | the suite is offline and order-independent; no flaky waits |

```ts
// test/store.test.ts — throwaway database per test, closed in afterEach
const handle = createStore(":memory:");
handles.push(handle);
```

```ts
// test/gateway.test.ts — fixed clock and a queued model answer, no model HTTP
const { handle, url } = await base(model.fetchImpl, { now: () => "2026-11-11T16:30:00.000Z" });
model.answers.push(VALID);
```

```ts
// test/gateway.test.ts — queueModel(): fetchImpl stands in for the model
const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
  prompts.push(JSON.parse(String(init?.body)).messages);   // every prompt is captured
  return modelResponse(answers.shift());                   // one queued answer per call
}) as typeof fetch;                                        // abridged from queueModel()
```

```ts
// test/web.test.ts — a real server on an ephemeral port; requests go over loopback
await new Promise<void>((resolve) => web.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${port}`;
const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
```

```ts
// test/web.test.ts — a fake Garmin client, keyed by the runner's saved key
const web = createWeb({ store, auth, garminFactory: fakeGarminFactory({ activities: [garminActivity] }), now: () => `${TODAY}T08:00:00.000Z` });
```

```ts
// test/web.test.ts — seeded runner: the seed hook runs before the server starts
await start({ seed: (store, runner) => seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Morning run", 5) });
```

## 4. What the gate does not cover

Verified by grepping `test/` and `src/` on 2026-11-22; absence of a test here is not a bug report, it is an explicit risk you accept when shipping.

| Surface | Evidence | Risk if it breaks |
|---|---|---|
| CSRF beyond the Origin check | `isSameOriginPost` (src/web.ts) allows a request with no `Origin`; one test covers one route (`rejects a cross-origin state POST`) | a non-browser client or an untested POST route has no token defence |
| web→gateway proxy timeout | 130 s `AbortController` in `createWeb`, 120 s in `createGateway`; no test drives either budget | a hung gateway pins a browser request for two minutes with no regression alarm |
| 504 page | the `/chat` proxy's timeout branch in `createWeb`; the 502 branch is tested, the 504 branch is not | a hung coach shows unverified copy in the bubble |
| migrations beyond one | `migrateActivitiesTable` has a legacy-DB test; `migrateCoachTurnsDirectiveHash` (src/store.ts) has none | an old live database can lose directive-hash idempotency records with a green gate |
| session eviction | `pruneSessions` / `SESSION_TTL_MS` in `createWeb`; auth tests cover cookie expiry and revocation, not the in-memory page-session map | unbounded session-map growth is untested |
| CSP | no `Content-Security-Policy` header is set: `createWeb` sets nosniff, referrer, frame, COOP and permissions only | the inline scripts (7 on the calendar page) have no nonce policy; XSS has no second line of defence |
| deploy script correctness | `tools/deploy.ps1` and `tools/deploy-task.ps1` are outside vitest and CI | the only path to the Windows live process is never exercised |
| inline client JS execution | `test/web.test.ts` extracts the 7 `<script>` blocks and compiles each with `new Function` — syntax only, never a DOM | a runtime `ReferenceError` or DOM-wiring bug ships green |

## 5. How to add a test

| Change | File and harness | Assert |
|---|---|---|
| new route | `test/web.test.ts`, `start()` then `fetch`; `redirect: "manual"` for a 303 | status, `location`, and a body fragment; add the session cookie for a private page |
| new gateway validation rule | `test/gateway.test.ts`, `base(model.fetchImpl)` + `model.answers.push(turn({ ... }))` | `body.milebook.outcome` / error code, the repair prompt in `model.prompts`, and that `handle.store` wrote nothing |
| new store column | `test/store.test.ts`, `memoryStore()` for reads/writes; `createStore("sqlite:<tmp>")` for reopen | value round-trips and per-user scoping; if an existing table changes, add a legacy fixture like the old `activities` primary-key test |
| new i18n key | `test/i18n.test.ts`; add the key to both catalogs in `src/i18n.ts` | en and zh-HK strings differ, `js.*` keys appear in `clientStrings`, placeholders interpolate |
| new CSS-only interaction | `test/web.test.ts`: fetch `/static/app.css` and the page HTML | the selector in the CSS and its hook (`id`, class or `data-`) in the HTML; no DOM runs, so also verify by eye (§8) |

## 6. Lint gate rules and blind spots

`tools/lint.mjs` is dependency-free so it can run before install. It walks `src/` and `test/` only (skipping `node_modules`, `.git`, `data`), keeps `.ts` files, and exits 1 listing every problem:

```js
/console\.(log|debug)\(/          // src only, except src/index.ts
/\bTODO\b|\bFIXME\b/              // src + test
/\bany\b/                         // src + test
/GCDC_[A-Za-z0-9+/=.-]{20,}/      // looks like a Garmin key
/sk-[A-Za-z0-9]{20,}/             // looks like an API key
```

| Enforces | Misses |
|---|---|
| no `console.log` / `console.debug` in `src` outside `src/index.ts` | `console.error` / `warn` / `info` / `trace` everywhere; the console rule exempts `src/index.ts` entirely |
| no TODO/FIXME anywhere in `src` or `test` | lowercase `todo:` / `HACK` (the match is case-sensitive) |
| no `any` anywhere in `src` or `test` | `as unknown as`, `@ts-ignore`, `Function`; conversely the rule over-matches prose and strings, so a comment containing "any" fails the gate |
| two secret prefixes (Garmin `GCDC_`, OpenAI `sk-`) | `.env` files, GitHub/AWS/private keys, high-entropy strings, anything under `tools/` or `.github/` |
| `.ts` files only under `src/` and `test/` | `.mjs` (including `tools/lint.mjs` and `tools/backup-db.mjs`), `.ps1`, `.md`, `.json`, and no CSS/format check of strings inside `.ts` |
| fail with all problems at once | no formatting, import-order, unused-variable or test-quality rule; `test/` may log freely |

## 7. CI

`.github/workflows/ci.yml` runs one job on every push to `main` and every pull request:

| Step | Value |
|---|---|
| runner | `ubuntu-latest` |
| toolchain | pnpm 12.16.1 (`pnpm/action-setup`), Node 24 (`actions/setup-node`), pnpm cache |
| install | `pnpm install --frozen-lockfile` |
| gate | `pnpm check` — the same lint, typecheck and test as local |

Gaps, all verified against the workflow file: no build (none exists), no coverage provider, no `pnpm audit`, no artifact or log retention, no doc or link check, no concurrency group or timeout.

| Gap | Risk |
|---|---|
| no coverage | the section 4 surfaces are invisible; a passing run says nothing about what it never executed |
| no artifact or log retention | a red run's vitest output is gone once the job ends |
| no concurrency group or timeout | parallel pushes repeat the full check and a hung job can occupy a runner |
| no browser and no live model | the suite asserts strings and statuses; rendering, layout and a real model turn stay manual (section 8) |

## 8. Manual verification that cannot be automated

- **Real model turn:** one live `POST /chat` through the gateway with the real model; confirm the reply, the change set and the directive audit row.
- **Real Garmin pull:** connect a real key and pull a real activity; confirm mapping, split/lap data and workout enrichment.
- **Visual breakpoints:** 320, 390, 768, 980, 1024, 1280, 1440 px, forced-colors, no-JS and `zh-HK` — the suite asserts strings, not layout.
- **Screen-reader pass:** dock disclosure, inert background, focus order and live regions on the calendar, muscle and states pages.
- **Evidence convention:** a fake demo runner (`Demo Runner`), synthetic dates and no production data or real keys; captures go under `docs/design/` and the test fixtures stay in `test/`.

## Related

[HTTP-API.md](HTTP-API.md) · [COACH-CONTRACT.md](COACH-CONTRACT.md) · [OPERATIONS.md](OPERATIONS.md) · [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)
