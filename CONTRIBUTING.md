# Contributing to auditreach

Thanks for taking a look. auditreach ships two independently maintained,
equally first-class distributions of the same tool: an npm package
(`auditreach-cli`, TypeScript, repo root) and a PyPI package
(`auditreach-cli`, Python, `python/`). Both implement the same hash-chain
algorithm and BYOK model against the same official Reddit/YouTube APIs.
Contribution overhead is intentionally light for either.

## Working on the TypeScript package (repo root)

```bash
git clone https://github.com/RudrenduPaul/auditreach.git
cd auditreach
npm install
npm run build
npm test
```

### Before opening a PR

All four must pass locally -- CI runs the same checks:

```bash
npm run lint
npm run format
npm run typecheck
npm run test:coverage
```

Coverage thresholds are 80% lines/statements/functions, 75% branches, enforced globally except `src/cli.ts`, `src/index.ts` (thin wiring) and `src/util/prompt.ts` (raw terminal I/O, validated manually).

## Working on the Python package (`python/`)

```bash
cd python
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

- Source lives under `python/src/auditreach/`, laid out to mirror the
  TypeScript module structure (`audit_log/`, `auth/`, `clients/`,
  `commands/`, `util/`, `cli.py`, `types.py`) so a change in one codebase
  has an obvious counterpart to check in the other.
- Tests use `pytest` (`python/tests/test_*.py`), one file per module, same
  pattern as the TypeScript `vitest` suite.
- A hash-chain algorithm change (canonicalization, the hash function, the
  chain-link field, or a tamper check) must be made **identically** in
  both `src/audit-log/` (TypeScript) and `python/src/auditreach/audit_log/`
  (Python), with equivalent tamper-detection tests added to both suites --
  this is the project's core integrity claim, and a divergence here is a
  silent security regression, not a cosmetic difference.
- Build and verify a real install before opening a PR that touches
  packaging:
  ```bash
  python3 -m build python --outdir /tmp/auditreach-dist
  python3 -m venv /tmp/auditreach-verify && /tmp/auditreach-verify/bin/pip install /tmp/auditreach-dist/*.whl
  /tmp/auditreach-verify/bin/auditreach --version
  ```

## Adding a new platform client

Every platform client (`src/clients/*.ts` and `python/src/auditreach/clients/*.py`) must:

1. Use **only the platform's official, documented API** -- no cookie import, no session-token reuse, no headless-browser login. This is the entire reason this project exists; a client that breaks this rule does not belong here, in either language.
2. Return a `SearchOutcome` (`src/types.ts` / `python/src/auditreach/types.py`) with an honest `consentBasis`/`consent_basis` string that traces to a real, linkable section of the platform's actual developer terms -- never a vibes-based "this should be fine."
3. Document the platform's real rate-limit or pricing constraints in the README's platform coverage table, even if they're unflattering. `auditreach` is positioned on being the compliance-safe _and honest_ option -- a client that quietly hides a rate-limit wall undermines that.
4. Never authenticate with anything other than the credentials the user explicitly supplied via `auditreach auth` (env var or keychain, on the Python side). No hosted key pool, no fallback to a shared account.
5. Ship with tests that mock the network boundary -- `fetch` for the TypeScript REST client, the SDK's own client object for SDK-based clients like `googleapis` (see `test/reddit-client.test.ts` and `test/youtube-client.test.ts`); `urllib.request.urlopen` (Reddit) or this module's own `_get` REST helper (YouTube) on the Python side (see `python/tests/test_reddit_client.py` and `python/tests/test_youtube_client.py`).

## Adding a new audit-log field

Changes to the `AuditLogEntry` schema (`src/types.ts` / `python/src/auditreach/types.py`) are backward-compatibility-sensitive -- existing users have log files on disk with the old schema, in either distribution. If you need a new field:

- Add it as optional, or give it a safe default when reading older entries.
- Update `computeEntryHash`/`compute_entry_hash` and the chain-verifier tests (both languages) to confirm old-format entries still verify.
- Call this out explicitly in the PR description.

## Credential handling (non-negotiable)

- Never log, print, or serialize a full API key, client secret, or password anywhere -- not to the audit log, not to stdout, not to an error message, in either distribution.
- The only representation of a credential that may appear in output is its `credentialFingerprint`/`credential_fingerprint` (last 6 hex characters of its SHA-256 hash) -- see `src/util/crypto.ts` / `python/src/auditreach/crypto.py`.
- If you're touching `src/auth/` or `src/commands/auth.ts` (or their Python equivalents `python/src/auditreach/auth/` and `python/src/auditreach/commands/auth.py`), add a test proving no secret leaks into a log, file, or console call.
- The Python package's env-var credential path (`AUDITREACH_REDDIT_*`, `AUDITREACH_YOUTUBE_API_KEY`) is documented, opt-in, and never silently substitutes for an unset keychain value with anything other than what the caller explicitly set -- keep it that way if you touch `python/src/auditreach/auth/credential_store.py`.

## Filing an issue

Bug reports: include which distribution (npm or PyPI), your OS, Node/Python version, and the exact command you ran (redact any real API keys). Feature requests: say which platform coverage table row it affects, or which part of the audit-log schema.
