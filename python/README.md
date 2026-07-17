# auditreach-cli (Python)

Official-API-only, BYOK CLI and library for researching Reddit and YouTube
with your own API keys and a tamper-evident, hash-chained audit log --
built for AI agents and compliance teams that can't rely on cookie-based
scraping or shared credential pools.

[![PyPI version](https://img.shields.io/pypi/v/auditreach-cli.svg)](https://pypi.org/project/auditreach-cli/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/RudrenduPaul/auditreach/blob/main/LICENSE)
[![Python versions](https://img.shields.io/pypi/pyversions/auditreach-cli.svg)](https://pypi.org/project/auditreach-cli/)
[![CI](https://github.com/RudrenduPaul/auditreach/actions/workflows/ci.yml/badge.svg)](https://github.com/RudrenduPaul/auditreach/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/auditreach-cli.svg)](https://www.npmjs.com/package/auditreach-cli)

## Why this exists

auditreach talks to Reddit and YouTube only through their official,
documented APIs, using your own API keys -- never a shared pool -- and
every single query writes a hash-chained entry to a local audit log: which
platform, which endpoint, which scope, and a plain-language line explaining
the consent/ToS basis for that specific call. No cookie import, no
session-token reuse, no code path that could pretend to be a logged-in
human. See the
[project README](https://github.com/RudrenduPaul/auditreach#why-auditreach-exists)
for the full compliance rationale. This package is the Python
distribution -- a genuine, independent port of the npm CLI's logic, not a
wrapper around the Node binary.

## Install

```bash
pip install auditreach-cli
```

or with [uv](https://docs.astral.sh/uv/):

```bash
uv add auditreach-cli
```

The complementary JS/TS distribution installs the same way on the npm side:
`npm install -g auditreach-cli` (or `npx auditreach-cli search ...` to run
it once without installing) -- see the
[project README](https://github.com/RudrenduPaul/auditreach#readme) for
that package. Both are first-class, maintained together; neither is
deprecated in favor of the other.

## Quickstart

**1. Set up credentials for the platform you want to search** (BYO-key --
your own, never shared):

```bash
auditreach auth --platform reddit
# Prompts for Client ID, Client secret, username, password.
# Create a script-app at https://www.reddit.com/prefs/apps first.

auditreach auth --platform youtube
# Prompts for an API key.
# Create one at https://console.cloud.google.com/apis/credentials
```

By default, credentials are stored in your OS keychain via the
[`keyring`](https://pypi.org/project/keyring/) package (Keychain on macOS,
Credential Manager on Windows, Secret Service/kwallet on Linux) -- the
Python-ecosystem equivalent of the npm package's `@napi-rs/keyring`
dependency. **This port additionally checks a platform-specific environment
variable first** (`AUDITREACH_REDDIT_CLIENT_ID`,
`AUDITREACH_REDDIT_CLIENT_SECRET`, `AUDITREACH_REDDIT_USERNAME`,
`AUDITREACH_REDDIT_PASSWORD`, `AUDITREACH_YOUTUBE_API_KEY`), falling back to
the keychain when unset -- a deliberate addition beyond the npm package's
keychain-only design, since a headless CI runner or an agent sandbox often
has no interactive prompt and no keychain daemon running at all. Nothing is
ever hardcoded either way; see
[docs/concepts.md](https://github.com/RudrenduPaul/auditreach/blob/main/docs/concepts.md)
for the full precedence rule.

**2. Search:**

```bash
auditreach search --platform reddit --query "your query" --subreddit some_subreddit
auditreach search --platform youtube --query "your query" --channel @SomeChannel
```

Real output:

```
AuditReach v0.1 -- Official-API Research CLI
Platform: Reddit  |  Auth: OAuth script-app grant, read-only, public-subreddit scope

Fetching... (official API, rate-limit aware)
✓ 14 results returned (Reddit API Terms -- public content, official API, read-only script-app credentials)

RESULTS (14)
[1] "How are people testing for memory poisoning in long-running agents?"
    u/some_researcher · 2026-07-05T14:22:00.000Z
    https://reddit.com/r/MachineLearning/comments/...
...

Audit log entry written: ar_2026-07-16_9f3c2a
Consent basis: Reddit API Terms -- public content, official API, read-only script-app credentials
Full results: ./auditreach-results-2026-07-16.json
Full audit trail: ./auditreach.log.jsonl
```

**3. Verify the audit log has not been tampered with:**

```bash
auditreach verify-log
```

```
Verifying ./auditreach.log.jsonl...
✓ Chain intact: 14 entries, no gaps, no tampering detected.
```

## Using the library instead of the CLI

```python
from auditreach import RedditClient, get_reddit_credentials, RedditSearchOptions

credentials = get_reddit_credentials()
if credentials is None:
    raise SystemExit("run `auditreach auth --platform reddit` first")

outcome = RedditClient(credentials).search(
    RedditSearchOptions(query="agent memory poisoning", subreddit="MachineLearning")
)
for item in outcome.items:
    print(item.title, item.url)
```

```python
from auditreach import verify_audit_log_chain

result = verify_audit_log_chain()
if not result.valid:
    print(f"Chain broken at entry {result.broken_at_index}: {result.reason}")
```

The Python library API uses idiomatic `snake_case` attribute names
(`created_at`, `client_secret`, `broken_at_index`, ...); the on-the-wire
JSON this CLI writes (the audit log file, `--output` results files, and
`--json` stdout output) uses the same field names the npm package's JSON
output uses, so a script or agent parsing either CLI's output sees
identical keys.

## Commands

`auditreach` has three subcommands, matching the npm CLI's flags exactly.

### `auditreach search`

| Flag                      | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `--platform <platform>`   | `reddit` \| `youtube` (required)                                                                |
| `--query <query>`         | search query                                                                                     |
| `--subreddit <subreddit>` | restrict search to one subreddit (Reddit only)                                                  |
| `--channel <handle>`      | restrict search to one channel, e.g. `@AnthropicAI` (YouTube only)                              |
| `--since <date>`          | only results published after this date, e.g. `2026-06-01` (YouTube only)                        |
| `--max-results <n>`       | maximum results to return (default: 25; platform caps: 100 Reddit / 50 YouTube)                 |
| `--before <fullname>`     | page results before this Reddit fullname cursor, e.g. `t3_abc123` (Reddit only)                 |
| `--after <fullname>`      | page results after this Reddit fullname cursor, e.g. `t3_abc123` (Reddit only)                  |
| `--output <path>`         | write full results JSON to this path                                                            |
| `--json`                  | print structured JSON to stdout instead of human-readable output, for scripts and agent callers |

### `auditreach auth`

| Flag                    | Description                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `--platform <platform>` | `reddit` \| `youtube` (required)                                                                   |
| `--clear`                | delete stored credentials for this platform                                                        |
| `--verify`                | verify stored credentials are valid without running a search (no results file, no audit-log entry) |
| `--json`                  | print structured JSON to stdout instead of human-readable output                                   |

### `auditreach verify-log`

| Flag            | Description                                                                  |
| --------------- | ----------------------------------------------------------------------------------- |
| `--path <path>` | path to the audit log file (defaults to `./auditreach.log.jsonl` if omitted) |
| `--json`        | print structured JSON instead of human-readable output |

Run `auditreach <command> --help` any time to see the exact flags your
installed version supports.

## How the hash chain works

Every entry in `auditreach.log.jsonl` is hash-chained -- each entry's hash
is computed from a canonical (recursively key-sorted) JSON serialization of
its own content, and the next entry references the previous entry's hash
via `prev_entry_hash`. `verify-log` re-derives every entry's hash from its
stored content and checks it against the stored `entry_hash`, then checks
every `prev_entry_hash` link against the actual previous entry. Either
check failing (a hand-edited field, a deleted entry, a reordered entry)
breaks the chain at an identifiable index. This is a faithful port of the
same algorithm (SHA-256 over canonical JSON, the same chain-link field) the
npm package's `src/audit-log/` modules implement -- see
[docs/concepts.md](https://github.com/RudrenduPaul/auditreach/blob/main/docs/concepts.md)
for the full data model, and `tests/test_hash_chain.py` in this package for
the tamper-detection tests (a mutated entry, a broken chain link, and a
deleted middle entry are each caught and pinpointed).

## Platform coverage

Same as the npm package: Reddit (OAuth2 password grant, direct REST calls
via the stdlib `urllib` instead of a third-party HTTP library) and YouTube
(YouTube Data API v3, called directly over REST instead of pulling in
Google's full `google-api-python-client` SDK and its own dependency chain)
are shipped. X (Twitter) is not yet shipped in either distribution -- see
the [project README](https://github.com/RudrenduPaul/auditreach#platform-coverage)
for why. `auditreach-cli`'s only runtime dependency is
[`keyring`](https://pypi.org/project/keyring/).

## Security

See [SECURITY.md](https://github.com/RudrenduPaul/auditreach/blob/main/SECURITY.md)
for the vulnerability disclosure policy. Credentials are never logged,
printed, or written to the audit log -- only a 6-character SHA-256
fingerprint of the credential used for a given query appears there. No
`eval`/`exec` of anything read from user input or an API response, no
shell/subprocess calls, and no third-party HTTP library in the request
path (stdlib `urllib` only).

## Contributing

See [CONTRIBUTING.md](https://github.com/RudrenduPaul/auditreach/blob/main/CONTRIBUTING.md)
for the full guide, covering both the TypeScript and Python codebases.

```bash
cd python
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## License

Apache 2.0, see [LICENSE](https://github.com/RudrenduPaul/auditreach/blob/main/LICENSE).
