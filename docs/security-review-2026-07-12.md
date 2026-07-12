# Security Review -- 2026-07-12

Threat model applied before the v0.1 code was pushed public: OWASP Top 10 + STRIDE, zero-noise discipline (8/10+ confidence gate), concrete-exploit-scenario requirement per finding.

## Scope

- `src/auth/credential-store.ts` -- BYOK credential I/O (the only module allowed to touch a raw secret)
- `src/clients/reddit-client.ts` -- Reddit OAuth2 password-grant flow, native `fetch`
- `src/clients/youtube-client.ts` -- YouTube Data API v3, `googleapis` SDK
- `src/audit-log/hash-chain-writer.ts`, `chain-verifier.ts` -- tamper-evidence
- `src/commands/*.ts` -- CLI command handlers
- `src/util/prompt.ts` -- masked secret input
- `src/cli.ts` -- entry point
- Dependency tree (`npm audit`)

## Attack surface

This is a local CLI with no server component, no listening port, and no code path that executes untrusted remote input. The attack surface is narrow: (1) credential storage and transmission, (2) audit-log integrity, (3) the dependency tree.

## Findings at the 8/10+ confidence gate

**None.** No CRITICAL or HIGH finding survived active verification.

Specifically checked and cleared:

- No `child_process`, `eval()`, or `new Function()` anywhere in `src/`.
- No hardcoded credentials or credential-shaped literals in source.
- No `console.log`/`console.error` call touches a variable named or containing `secret`, `password`, `token`, or `apikey`.
- Traced every write path into `auditreach.log.jsonl`: `query_params`, `auth_scope`, and `consent_basis` are the only free-text fields, and none of them are ever populated from a raw credential -- confirmed by reading `search.ts`'s `outcome.queryParams` construction in both `reddit-client.ts` and `youtube-client.ts`, neither of which includes the credential.
- Traced the credential fingerprint path (`credentialFingerprint()` in `src/util/crypto.ts`): only the last 6 hex characters of a SHA-256 hash are ever written anywhere, never the secret itself.
- Reddit's OAuth2 password-grant flow (transmitting the user's own Reddit username/password to Reddit's own official token endpoint) is the platform's own documented "script app" mechanism, not something this code introduces as a weaker alternative -- credentials are stored locally via `@napi-rs/keyring` (OS keychain) and sent only to `https://www.reddit.com/api/v1/access_token`, never anywhere else.
- CI workflow (`.github/workflows/ci.yml`) has no `pull_request_target`, no secrets, and standard official actions.

## Supply chain

`npm audit --audit-level=high` passes clean (0 HIGH/CRITICAL). 4 MODERATE advisories remain, all the same root cause:

| Package                                                                          | Advisory                                                                                                                                                              | Reachability                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid` (<11.1.1, transitive via `googleapis` -> `googleapis-common` -> `gaxios`) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) -- missing buffer bounds check in `uuid` v3/v5/v6 _when a custom `buf` argument is supplied_ | **UNVERIFIED / not directly reachable.** This codebase never calls `uuid` directly, and `googleapis`'s internal usage does not pass a custom `buf` argument to the vulnerable functions. Fixing requires `npm audit fix --force`, which bumps `googleapis` to a new major version (173.0.0) -- deferred rather than force-upgraded blind. Tracked via Dependabot. |

Note on `snoowrap`: the original design considered `snoowrap` for the Reddit client. It was rejected during this build specifically because it is deprecated (publisher-flagged "no longer supported") and its dependency chain (`request`, `form-data`, `qs`) carried **4 CRITICAL** advisories. Rewritten as a direct `fetch`-based OAuth2 client against Reddit's documented REST endpoints instead -- zero dependency, zero of those CVEs, and arguably a better fit for a "official-API-only, fully transparent" product anyway.

`keytar` was considered and also rejected (archived by its maintainer, requires `node-gyp` native compilation that frequently fails across platforms/CI) in favor of `@napi-rs/keyring` (actively maintained, ships prebuilt binaries).

## STRIDE pass

| Category               | Assessment                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | N/A -- local single-user CLI, no network identity to spoof                                                                                                                                                                                 |
| Tampering              | Mitigated by design: the hash-chained audit log (SHA-256, canonical JSON) detects both single-entry edits and entry deletion/reordering -- verified with real tamper tests against the compiled CLI, not just unit tests (see build notes) |
| Repudiation            | This is the audit log's actual purpose -- a positive property, not a gap                                                                                                                                                                   |
| Information Disclosure | Credentials never leave OS keychain except to the platform's own official auth endpoint; audit log never contains a raw secret (verified above)                                                                                            |
| Denial of Service      | Out of scope for a local CLI with no shared resource                                                                                                                                                                                       |
| Elevation of Privilege | N/A -- no privilege boundary beyond the OS user already running the process                                                                                                                                                                |

## Result

**PASS.** No blocking findings. Proceeding to README/benchmark and ship.

## Post-review updates (2026-07-12, after the repo went public)

A follow-up audit was run against the live, public repo, both immediately before flipping
visibility and again immediately after. Findings and fixes, in order:

1. **Pre-public audit** confirmed no leaked secrets or API keys anywhere in git history (full
   19-commit depth scanned for AWS/OpenAI/Anthropic/GitHub/Slack key patterns and PEM private
   keys), no `.env` ever tracked, no audit-log or results files ever committed. One string that
   looked secret-shaped in a test fixture was independently verified as a benign placeholder
   (34 chars, no digits, no known key-prefix format, contains the literal word "secret").
2. **The `uuid` CVE this review left deferred** ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq))
   is now resolved: `googleapis` bumped 144.0.0 -> 173.0.0. `npm audit` returns 0 vulnerabilities
   (was 4 MODERATE). Typecheck, lint, build, and the full test suite were re-verified unaffected.
3. **Branch protection applied to `main`** ahead of going public: PR + 1 approving review + a
   passing `ci` status check required, no force-pushes, no branch deletion, admin bypass left on
   for solo-maintainer commits (`enforce_admins: false`). See `docs/branch-protection.md`.
4. **CI hardening**: `actions/checkout` and `actions/setup-node` SHA-pinned to their latest
   release commits (previously pinned to the floating `v4` tag).
5. **Post-public re-audit caught a real gap the pre-public pass could not have found**: GitHub's
   native secret scanning, secret scanning push protection, and Dependabot security updates do
   not turn on automatically just because a repo's visibility flips to public -- all three were
   off. All three are now enabled. (`secret_scanning_validity_checks` and
   `secret_scanning_non_provider_patterns` remain unavailable -- GitHub Advanced Security
   features gated behind a paid tier, not a fixable gap.)

Current posture as of this update: 0 npm vulnerabilities, branch protection live, secret
scanning + push protection + Dependabot live, no leaked credentials found at any point across
two independent audit passes.

---

_This review is an AI-assisted first pass, not a substitute for a professional security audit. It catches common vulnerability patterns in a narrow-surface local CLI; it does not replace a qualified penetration test, especially before handling any data more sensitive than public social-media research content._
