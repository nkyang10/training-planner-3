## What and why

<!-- One paragraph: what changed, and the problem it solves. Link the doc page for the area. -->

## How it was verified

- [ ] `pnpm check` green (lint, typecheck, docs gate, tests)
- [ ] Manual check (describe: route, screen, live host, throwaway account)
- [ ] Migration/rollback considered (only if the schema or config changed)

## Checklist

- [ ] New behaviour has a test; removed behaviour has its test deleted.
- [ ] Both locales (`en`, `zh-HK`) updated for every new user-visible string.
- [ ] `APP_CSS_VERSION` in `src/web.ts` bumped if the stylesheet changed.
- [ ] Docs page for the area updated with `(src/file · symbol)` anchors.
- [ ] `docs/PRODUCTION-READINESS.md` or `docs/LIMITS.md` updated if production safety or a limit changed.
- [ ] No secrets, real runner data, `data/` files, logs or build output in the diff.

## Risk

<!-- What breaks if this is wrong, who notices, and how it is rolled back. -->
