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
