# Security policy

Milebook stores personal training data and, per runner, a Garmin Personal API key. Treat vulnerabilities as
high-impact even when the affected feature looks minor.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (current production line) | Yes — fixes are released on the current minor |
| Anything older | No — upgrade before reporting |

## Reporting a vulnerability

Report privately to the repository owner. **Set the contact address here before publishing this repository.**
Do not open a public issue, and do not include real runner data, session cookies or Garmin keys in a report.

Include: affected route or module, reproduction steps against a local instance with a throwaway account, the impact
you believe it has, and whether the data of other accounts is reachable.

Expect an acknowledgement within 3 working days and a remediation plan within 10 working days. Please give us a
reasonable window to ship a fix before any public write-up; we will credit reporters who want credit.

## In scope

- Authentication and session handling (`src/auth.ts`, cookie flags, session lifetime, throttling).
- Per-runner data isolation: any query path where one account can read or write another account's rows.
- The coach gateway trust boundary (`src/gateway.ts`): the `x-milebook-user` header, the internal token, and the
  loopback bind.
- Prompt-injection and tool-call abuse through the coach contract: anything that makes the server write calendar
  rows, states or muscle records that the runner did not ask for.
- Injection and escaping on every rendered surface (`src/web-html.ts` and the inline client scripts).
- Secret handling: `MILEBOOK_AUTH_SECRET`, the model API key, stored Garmin keys, and the backup files.
- Cross-site request forgery, clickjacking, and the absence of security headers.
- Denial of service through unbounded work: model turns, Garmin syncs, request bodies.

## Out of scope

- Findings that require the attacker to already hold the host's filesystem or an administrator session.
- Missing hardening on a deployment that runs without TLS — that is a deployment defect; report it, but the fix is
  in `docs/OPERATIONS.md`.
- Third-party services (the model provider, Garmin) — report those to the provider.
- Social engineering, physical access, and spam.
- Rate-limit or brute-force findings on a test instance you deliberately overloaded.

## Security posture of the current release

The authoritative description of the controls, and of the known gaps that are still open, is
[docs/SECURITY.md](docs/SECURITY.md). The release-blocking items and their remediation order are in
[docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md).

## Handling secrets in the repository

- Never commit `data/`, `.env`, `*.sqlite`, `*.secret` or a real key. The lint gate fails on Garmin-style and
  OpenAI-style key patterns, and `.gitignore` covers the data directory.
- Rotate `MILEBOOK_AUTH_SECRET` if it may have leaked: every existing session cookie becomes invalid immediately.
- Rotate a runner's Garmin key from the account menu; removing it deletes the stored row and stops sync.
