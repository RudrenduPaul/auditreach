# Contributing to auditreach

Thanks for taking a look. This is a small, focused CLI, so contribution overhead is intentionally light.

## Setup

```bash
git clone https://github.com/RudrenduPaul/auditreach.git
cd auditreach
npm install
npm run build
npm test
```

## Before opening a PR

All four must pass locally -- CI runs the same checks:

```bash
npm run lint
npm run format
npm run typecheck
npm run test:coverage
```

Coverage thresholds are 80% lines/statements/functions, 75% branches, enforced globally except `src/cli.ts`, `src/index.ts` (thin wiring) and `src/util/prompt.ts` (raw terminal I/O, validated manually).

## Adding a new platform client

Every platform client (`src/clients/*.ts`) must:

1. Use **only the platform's official, documented API** -- no cookie import, no session-token reuse, no headless-browser login. This is the entire reason this project exists; a client that breaks this rule does not belong here.
2. Return a `SearchOutcome` (see `src/types.ts`) with an honest `consentBasis` string that traces to a real, linkable section of the platform's actual developer terms -- never a vibes-based "this should be fine."
3. Document the platform's real rate-limit or pricing constraints in the README's platform coverage table, even if they're unflattering. `auditreach` is positioned on being the compliance-safe _and honest_ option -- a client that quietly hides a rate-limit wall undermines that.
4. Never authenticate with anything other than the credentials the user explicitly supplied via `auditreach auth`. No hosted key pool, no fallback to a shared account.
5. Ship with tests that mock the network boundary (`fetch` for REST clients, the SDK's own client object for SDK-based clients like `googleapis`) -- see `test/reddit-client.test.ts` and `test/youtube-client.test.ts` for the pattern.

## Adding a new audit-log field

Changes to the `AuditLogEntry` schema (`src/types.ts`) are backward-compatibility-sensitive -- existing users have log files on disk with the old schema. If you need a new field:

- Add it as optional, or give it a safe default when reading older entries.
- Update `computeEntryHash` and the chain-verifier tests to confirm old-format entries still verify.
- Call this out explicitly in the PR description.

## Credential handling (non-negotiable)

- Never log, print, or serialize a full API key, client secret, or password anywhere -- not to the audit log, not to stdout, not to an error message.
- The only representation of a credential that may appear in output is its `credentialFingerprint` (last 6 hex characters of its SHA-256 hash) -- see `src/util/crypto.ts`.
- If you're touching `src/auth/` or `src/commands/auth.ts`, add a test proving no secret leaks into a log, file, or console call.

## Filing an issue

Bug reports: include your OS, Node version, and the exact command you ran (redact any real API keys). Feature requests: say which platform coverage table row it affects, or which part of the audit-log schema.
