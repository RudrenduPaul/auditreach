# Changelog

All notable changes to this project are documented in this file. This
changelog covers both distributions -- the npm package (`auditreach-cli`,
JS/TS) and the PyPI package (`auditreach-cli`, Python) -- since they
implement the same hash-chain algorithm and BYOK model; entries note which
distribution they apply to.

## [0.2.0] - 2026-07-18 (npm + Python)

Both distributions add an `mcp` subcommand and a shared `.well-known/agent.json`
discovery manifest at the repo root, unified across npm and PyPI in the same file
(the manifest lists both `npx auditreach-cli mcp` and `pipx run auditreach-cli mcp` /
`auditreach mcp` invocation forms). This is a minor version bump on both
distributions -- npm adds `@modelcontextprotocol/sdk` and `zod` as new runtime
dependencies; Python adds `mcp` and raises its minimum supported version.

### Added (npm)

- `auditreach mcp` -- runs a real Model Context Protocol server over stdio (built on `@modelcontextprotocol/sdk`, not a hand-rolled JSON-RPC layer), exposing exactly 3 tools so an AI agent can call this CLI without shelling out and parsing stdout: `search` (same parameters as `auditreach search`: platform, query, subreddit/channel, since, maxResults, before/after), `auth_status` (read-only credential check, equivalent to `auditreach auth --verify --json`), and `verify_log` (equivalent to `auditreach verify-log --json`). All 3 tools call the same programmatic core the CLI commands use (`executeSearch`, `checkAuthStatus`, `executeVerifyLog`, newly extracted and exported from `src/index.ts`) -- no search/auth/audit-log logic is duplicated for MCP.
- `auth_status` is deliberately read-only: there is no MCP tool to set or clear BYOK credentials. Provisioning (`auditreach auth --platform <platform>`) and clearing (`--clear`) stay local-CLI-only, human-driven actions.

### Added (Python)

- `auditreach mcp` -- the same MCP server and 3 tools as the npm distribution, built
  on the official MCP Python SDK (PyPI package `mcp`), calling straight through to
  the existing `run_*_command` functions rather than reimplementing their logic.
  `auth_status` carries the same read-only guarantee as the npm side.

### Added (shared)

- `.well-known/agent.json` -- one discovery manifest at the repo root, shipped in
  both the published npm and PyPI packages, describing the BYOK auth requirement,
  the 3 MCP tools with their real parameter schemas, the `mcp`/`stdio` protocol,
  and invocation forms for both distributions (`npx auditreach-cli mcp`,
  `auditreach mcp`, `pipx run auditreach-cli mcp`). Rate limits are intentionally
  not stated as a number -- the manifest notes they're inherited from Reddit's/
  YouTube's own official API limits, not measured or claimed by this package.

### Changed (Python)

- Minimum supported Python version raised from 3.9 to 3.10, since the
  official `mcp` SDK itself requires Python >=3.10 (Python 3.9 reached
  end of life in October 2025).

## [Python 0.1.0] - 2026-07-17

Initial public release of the Python port, published to PyPI as
`auditreach-cli` (`pip install auditreach-cli`). Complementary to, not a
replacement for, the existing npm package -- both are first-class and
maintained together. See `python/README.md` for Python-specific usage.

### Added

- `auditreach search`, `auditreach auth`, `auditreach verify-log` CLI
  (console script `auditreach`, package `auditreach`), with the same flags
  as the npm CLI.
- Programmatic library API: `from auditreach import RedditClient,
YoutubeClient, get_reddit_credentials, verify_audit_log_chain, ...`.
- Official-API-only clients for Reddit (OAuth2 password grant, direct REST
  via the stdlib `urllib`) and YouTube (Data API v3, called directly over
  REST instead of the `googleapis`/`google-api-python-client` SDK, to keep
  the only runtime dependency at `keyring`). Same official endpoints, same
  auth mechanisms as the npm package's clients.
- The same hash-chain algorithm as the npm package, ported faithfully:
  canonical (recursively key-sorted) JSON, SHA-256 over the result,
  `prev_entry_hash` chain links, and the same two tamper checks
  (`entry_hash` mismatch -> edited entry; `prev_entry_hash` mismatch ->
  broken/reordered/deleted entry).
- BYOK credential storage via the `keyring` package (the Python-ecosystem
  equivalent of `@napi-rs/keyring`), **plus** an env-var override checked
  first (`AUDITREACH_REDDIT_CLIENT_ID`, `AUDITREACH_REDDIT_CLIENT_SECRET`,
  `AUDITREACH_REDDIT_USERNAME`, `AUDITREACH_REDDIT_PASSWORD`,
  `AUDITREACH_YOUTUBE_API_KEY`) -- a deliberate addition beyond the npm
  package's keychain-only design, for headless CI/agent-sandbox use where
  no interactive prompt or keychain daemon is available. See
  `docs/concepts.md` for the precedence rule.
- Full pytest suite (82 tests) ported from the TypeScript vitest suite,
  covering `crypto`, the hash-chain writer/verifier (including the tamper-
  detection tests -- a mutated entry, a broken chain link, a deleted middle
  entry), the credential store (including the added env-var precedence
  path), both API clients (network boundary mocked), and all three
  commands (`search`, `auth`, `verify-log`), plus CLI argument-parsing
  tests.

### Notes

- Verified end to end: a built wheel installed into a fresh venv, the
  `auditreach` console script resolving and running `--version`/`--help`/
  `verify-log` correctly, and `auditreach auth --platform youtube --verify`
  making a real request to the live YouTube Data API v3 with an
  intentionally invalid key -- confirming the client calls the genuine
  official API (a real `API_KEY_INVALID` response came back), not a mock.
  No live Reddit/YouTube API keys were available in the build environment
  for a full successful search run; this is stated honestly rather than
  fabricated.
- `examples/02-verify-audit-log/verify.py` demonstrates the tamper-
  detection guarantee fully offline: it builds a real hash-chained log,
  verifies it, hand-edits one entry, and re-verifies to show the exact
  break point -- run directly as part of this release's verification.

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
