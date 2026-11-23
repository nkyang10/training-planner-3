# Release

**Status:** current · **Owner:** release · **Updated:** 2026-11-22 · **Supersedes:** the deploy sections of the PoC-era docs

This page is both the release procedure and the answer to "what should be rearranged just before production". Work
top to bottom: §2 is the rearrangement checklist, §3 is the release itself, §4 is rollback, §5 is the first 48 hours.

## 1. Versioning

- Semantic versioning on `package.json`; the tag is `v<version>` and the CHANGELOG entry is the same version.
- `1.0.0` was the first production release; `1.0.1` added the anatomy pipeline, `1.1.0` added session revocation, current-password re-entry, abandoned-turn recovery and the credits page; `1.2.0` added account erasure and the privacy page; `1.3.0` added versioned migrations and sealed Garmin keys. Pre-1.0 history is the PoC era and stays in git history only.
- A release is a commit on `main` that passed `pnpm check`, plus a tag. Nothing else identifies a release — no branch
  names, no build numbers, no "the build from Tuesday".
- Record the deployed commit in `data/milebook-deploy.log` (the deploy does this automatically).

## 2. Rearrangement checklist — before the first production release

### 2.1 Repository shape

- [ ] **Delete every merged `dsh-*` feature branch** and its worktree (`git worktree list` shows eight). The release
      tree should have `main` and short-lived branches only.
- [ ] Remove the local agent worktree folder that lives beside the checkout (outside the repository, but it confuses
      `git status` and every absolute path in a scratch session).
- [ ] Protect `main`: require a PR, require the CI check, forbid force-push.
- [ ] Add `CODEOWNERS` for `src/`, `docs/` and `tools/`.
- [ ] Confirm `.gitignore` still covers `data/`, `.env*`, `*.sqlite`, `*.db`, logs and the scratch directory.
- [ ] Decide the 11 MB GLB: keep in git (current) or move to Git LFS. If LFS, do it **before** the tag.
- [ ] Confirm no generated or historical artifact is left in the tree: `git ls-files | Measure-Object -Line` should
      show only source, tests, docs, tools and CI.

### 2.2 Configuration

- [ ] Create a fresh `MILEBOOK_AUTH_SECRET` (32 random bytes) and store it outside the repository.
- [ ] Set `MILEBOOK_MODEL_BASE_URL`, `MILEBOOK_MODEL_NAME`, `MILEBOOK_MODEL_API_KEY`.
- [ ] Set `MILEBOOK_COOKIE_SECURE=true` **only after** TLS termination is live; verify the `Secure` attribute appears.
- [ ] Set `MILEBOOK_DB` explicitly (do not rely on the default path).
- [ ] Decide ports: the live host has used 8093/8092; keep them and put the proxy in front of 8093.
- [ ] Remove every `POC3_*` variable and any legacy data file from the host after confirming the rename is complete.

### 2.3 Data

- [ ] Take a backup with `pnpm backup` and copy it off the host.
- [ ] Run one **restore drill**: restore the backup into a scratch file and start the app against it.
- [ ] Decide the retention policy for messages, coach turns and directives (today: none) and write it down.
- [ ] Decide the account-deletion story before onboarding real users ([PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) PR-20).
- [ ] Confirm the database file's permissions allow only the service account.

### 2.4 Security

- [ ] TLS terminator live; HTTP redirects to HTTPS; HSTS observed.
- [ ] `MILEBOOK_COOKIE_SECURE=true`; session cookie shows `Secure; HttpOnly; SameSite=Lax`.
- [ ] Gateway still bound to `127.0.0.1` and unreachable from the LAN (`Test-NetConnection` from another host).
- [ ] Throttle verified on the real deployment: 11 wrong passwords in a row returns `429`.
- [ ] Password change requires the current password (or is disabled until it does).
- [ ] In-app third-party attribution for BodyParts3D is live.
- [ ] Privacy policy and a consent line exist, or the release is explicitly invite-only with a written data-handling
      note.

### 2.5 Operations

- [ ] A real service manager or scheduled task starts the app at boot and restarts it on crash; document which.
- [ ] Log rotation configured for `data/milebook-live.*.log`.
- [ ] Uptime monitor on `https://<host>/health` with an alert a human reads.
- [ ] Disk-space alert (backups + database growth).
- [ ] Runbook rehearsed once end-to-end by someone who did not write it ([OPERATIONS.md](OPERATIONS.md)).

### 2.6 Product and copy

- [ ] Walk the first-run path as a new runner: signup → empty calendar → first plan → log a run → review → muscle
      check-in. Fix anything that reads like an internal tool.
- [ ] Confirm both locales on every screen you touched (`zh-HK` is not a translation afterthought).
- [ ] Re-read the failure copy: `Could not apply`, `502`, `504`, `429`, empty states.
- [ ] Confirm the medical disclaimer is reachable (licence + muscle/state copy).
- [ ] Decide what "support" means for the first users, and where they report a problem.

### 2.7 Documentation

- [ ] `pnpm docs:check` green.
- [ ] [README.md](../README.md) status table matches reality (test count, release version, deploy state).
- [ ] [CHANGELOG.md](../CHANGELOG.md) has the release entry.
- [ ] No page describes behaviour that no longer exists; no page cites a line number.
- [ ] [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) reflects what actually shipped, with closed items removed.

## 3. Release procedure

1. **Freeze.** No new feature work on `main`; only fixes for the gate.
2. **Gate.** `pnpm check` on a clean checkout of the release commit.
3. **Version.** Bump `package.json`, move the CHANGELOG's Unreleased section to the new version, update the README
   status table.
4. **Tag.** `git tag -a v<version> -m "<version>"` and push the tag with `main`.
5. **Backup.** `pnpm backup` (the deploy also backs up; do both when the release changes schema).
6. **Deploy.** `pnpm deploy:live` and read its output: commit, health, login, stylesheet version.
7. **Verify** against the live host, as a real runner with a throwaway account:
   - signup, login, logout, session survives a refresh;
   - create, move and delete a session through the coach; undo it;
   - log a manual run and see it on the day page and the log;
   - open a run peek, a session peek, the muscle tab and the changes page;
   - export JSON and ICS;
   - delete the throwaway account's rows afterwards.
8. **Announce.** Release notes = CHANGELOG entry + the three things a runner will notice.
9. **Record.** Append the deployed commit and the verification result to the release notes (not to a doc page).

## 4. Rollback

| Failure | Action |
|---|---|
| The new process will not start | Deploy keeps the previous process stopped only after the backup; start the previous tagged commit with the same env, or restore the previous tag and redeploy |
| Health is fine but pages are broken | Roll back the code first (previous tag), because the schema did not change |
| The release changed the schema and data is wrong | Stop the process, restore the pre-release backup (`data/backups`), then deploy the previous tag |
| Only the model provider is down | Nothing to roll back: the coach returns `502`; the calendar keeps working |

A rollback is a deploy of a previous tag — never a hand-edit on the live host. After a rollback, write down what failed
and add a row to [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) so it is fixed before the next attempt.

## 5. First 48 hours

- Watch: `/health` every minute, `data/milebook-live.err.log` for the first 5xx, the deploy log for restarts.
- Measure: signups, successful logins, coach turns per runner, `429` counts (a high count means the throttle is too
  tight or a client is behind a shared address), Garmin sync failures.
- Ask the first five runners one question: what did you expect to happen that did not?
- Do not ship feature work in the first 48 hours; only fixes for what the watch found.

## 6. What not to do

- Do not deploy from a dirty working tree or an untagged commit.
- Do not edit the live database by hand without a backup taken in the same minute.
- Do not turn on `MILEBOOK_AUTO_STATES=false` to hide a detector bug; fix the detector.
- Do not copy a `-wal` file without its `-shm` and database file; use `tools/backup-db.mjs`.
- Do not add a CORS grant to the gateway "temporarily".
- Do not quote a test count, a CSS version or a branch name in a document; point at the gate and the code.
