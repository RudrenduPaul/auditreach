# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - Unreleased

### Added

- Initial CLI: `auditreach search`, `auditreach auth`, `auditreach verify-log`.
- Official-API-only clients for Reddit (OAuth2 password grant, direct REST) and YouTube (Data API v3 via `googleapis`). X (Twitter) is deferred to a future release -- see README for why.
- BYOK credential storage backed by the OS keychain (`@napi-rs/keyring`).
- Local, hash-chained audit log (`auditreach.log.jsonl`) recording platform, endpoint, query parameters, auth scope, consent basis, and a credential fingerprint (never the full credential) for every query.
- `auditreach verify-log` -- re-derives every entry's hash and checks the chain link, detecting both single-entry tampering and entry deletion/reordering.
- CI: lint, format check, build, typecheck, coverage-gated tests, dependency audit.

### Fixed

- Resolved a transitive `uuid` CVE ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), CVSS 7.5) noted as deferred in the pre-launch security review by bumping `googleapis` 144.0.0 -> 173.0.0. `npm audit` now reports 0 vulnerabilities.

### Security

- Made the repository public.
- Enabled branch protection on `main`: pull request + 1 approving review + a passing `ci` status check required before merge, no force-pushes, no branch deletion.
- SHA-pinned `actions/checkout` and `actions/setup-node` in CI (previously pinned to the floating `v4` tag).
- Enabled GitHub's native secret scanning, secret scanning push protection, and Dependabot security updates -- none of these turn on automatically just from making a repo public.
