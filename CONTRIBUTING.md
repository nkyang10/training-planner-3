# Contributing

## Before you start

- Node.js **24+** and **pnpm 12** (the exact package manager version is pinned in `package.json`).
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PRODUCT.md](docs/PRODUCT.md) first; then the page for
  the area you are touching (`docs/COACH-CONTRACT.md`, `docs/DATA-MODEL.md`, `docs/HTTP-API.md`, `docs/UI-GRAMMAR.md`,
  `docs/TRAINING-LOG.md`, `docs/MUSCLE-DOMAIN.md`, `docs/COACHING-STATES.md`, `docs/GARMIN.md`).
- Copy `.env.example` to `.env` and fill in `MILEBOOK_AUTH_SECRET`, `MILEBOOK_MODEL_BASE_URL` and
  `MILEBOOK_MODEL_NAME`. The app refuses to start without them; there are no development secrets baked in.

```powershell
pnpm install
pnpm dev            # calendar on :8091, gateway on :8090
```

## The gate

Every change must pass the same gate CI runs:

```powershell
pnpm check          # lint + typecheck + docs:check + test
```

- `pnpm lint` — no `console.log`/`console.debug` outside `src/index.ts`, no TODO/FIXME, no `any`, no key patterns.
- `pnpm typecheck` — `tsc --noEmit`, strict, `noUncheckedIndexedAccess`.
- `pnpm docs:check` — every relative doc link resolves, every `(src/coach.ts · parseCoachTurn)`-style anchor names a
  real file and symbol, no encoding corruption, every reference page carries a status header.
- `pnpm test` — the Vitest suite. Do not quote a test count in prose or docs; say "run `pnpm check`".

## Code conventions

- **TypeScript strictness is not negotiable.** No `any`, no `as unknown as`, no non-null `!`. Model absence with
  `undefined` and handle it.
- **Escape at the edge.** Every interpolated value in HTML goes through `escapeHtml` from `src/web-html.ts`. Every
  inline `<script>` payload goes through `jsonForScript`.
- **The server validates; the model proposes.** Any new model-authored write goes through the turn validator in
  `src/coach.ts` and lands as a change set. Never write a session from a client-supplied payload.
- **Per-user scope everywhere.** Every store method takes `userId`; every query filters on it. Add a test that a
  second account cannot see the row.
- **Both locales, always.** A new user-visible string needs an `en` and a `zh-HK` catalog entry in `src/i18n.ts`.
  Client scripts receive strings through `clientStrings`.
- **Bump `APP_CSS_VERSION` in `src/web.ts`** whenever the stylesheet changes. The deploy verifies the served page
  references that exact version.
- **Dates go through `src/time.ts`.** Do not re-implement day arithmetic; timezone correctness is a product rule.
- **Static assets are served from memory** with an ETag. Add new assets to the static table in `src/web.ts`, not to
  a filesystem handler.

## Tests

- Add or extend a test for every behaviour change. HTTP-level tests live in `test/web.test.ts` and drive a real
  server; the gateway contract lives in `test/gateway.test.ts`; domain rules live next to their module's test file.
- Use `:memory:` stores, inject `now()`, inject `fetchImpl` for the model, and `garminFactory` for Garmin. Never
  call the network from a test.
- If a change removes a behaviour, delete its test in the same commit.

## Documentation

- The docs are reference pages, not a diary. Put the current behaviour in the page for its area; do not append a
  change log to it.
- Cite code by symbol, never by line number: `(src/coach.ts · parseCoachTurn)`. `pnpm docs:check` verifies every
  anchor resolves.
- Every reference page starts with `**Status:** … · **Owner:** … · **Updated:** YYYY-MM-DD`.
- Product decisions go in an ADR under `docs/adr/`; copy `docs/adr/TEMPLATE.md` and number it next.

## Commits and branches

- Short, imperative subject that names the area, then a body that says what changed and how it was verified.
  Example: `Coach: bound the muscle-suggestion channel to six per turn; 626 tests`.
- Keep a change reviewable: one concern per commit, no unrelated formatting churn.
- Branch from `main`, keep the branch short-lived, and squash on merge.

## Pull request checklist

- [ ] `pnpm check` is green locally.
- [ ] New behaviour has a test; removed behaviour has its test deleted.
- [ ] Both locales updated for every new string.
- [ ] `APP_CSS_VERSION` bumped if the stylesheet changed.
- [ ] Docs page for the area updated, with symbol anchors.
- [ ] No secrets, real runner data, `data/` files or build output in the diff.
- [ ] If the change affects production safety, update `docs/PRODUCTION-READINESS.md` or `docs/LIMITS.md`.

## Releasing

Follow [docs/RELEASE.md](docs/RELEASE.md): version bump, CHANGELOG entry, gate, tag, deploy, post-deploy verification.
