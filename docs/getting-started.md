# Getting started

auditreach searches Reddit and YouTube using only their official,
documented APIs and your own API keys, writing a tamper-evident,
hash-chained entry to a local audit log for every query. It ships as two
independent, equally first-class packages: an npm package (`auditreach-cli`,
JavaScript/TypeScript) and a PyPI package (`auditreach-cli`, Python). Pick
whichever fits your toolchain, or install both.

## Install

**npm (JS/TS CLI):**

```bash
npm install -g auditreach-cli
# or run it once without installing:
npx auditreach-cli search --platform reddit --query "your query"
```

**pip (Python library + CLI):**

```bash
pip install auditreach-cli
```

## BYOK credentials

Both distributions are bring-your-own-key: nothing works until you supply
your own Reddit and/or YouTube API credentials. Neither distribution ever
proxies a request through a shared credential pool.

**Reddit** needs a "script app" (OAuth2 password grant) created at
<https://www.reddit.com/prefs/apps>: a Client ID, a client secret, and the
Reddit account username/password the script app is registered against.

**YouTube** needs a Data API v3 key created at
<https://console.cloud.google.com/apis/credentials>.

Set them up interactively:

```bash
auditreach auth --platform reddit
auditreach auth --platform youtube
```

**Where credentials are stored** differs slightly by distribution:

- **npm package**: exclusively in your OS keychain, via `@napi-rs/keyring`.
  No config file, no environment variable, no code path that writes a raw
  credential to disk.
- **Python package**: the OS keychain is still the default (via the
  [`keyring`](https://pypi.org/project/keyring/) package), but the Python
  port additionally checks a platform-specific environment variable first
  (`AUDITREACH_REDDIT_CLIENT_ID`, `AUDITREACH_REDDIT_CLIENT_SECRET`,
  `AUDITREACH_REDDIT_USERNAME`, `AUDITREACH_REDDIT_PASSWORD`,
  `AUDITREACH_YOUTUBE_API_KEY`), falling back to the keychain when a
  variable is unset. This is a deliberate addition beyond the npm package's
  keychain-only design: a headless CI runner or an AI agent's sandbox often
  has no interactive terminal for `auditreach auth` to prompt against, and
  frequently no keychain daemon running at all. Nothing is ever hardcoded
  in either path -- both require the caller to have already provisioned
  the credential.

Verify stored credentials without running a real search:

```bash
auditreach auth --platform reddit --verify
```

## Your first search

```bash
auditreach search --platform reddit --query "agent memory poisoning" --subreddit MachineLearning
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

Every search writes two files: a results JSON file (`--output` to control
the path) and an append-only line in `auditreach.log.jsonl`.

## Verifying the audit log

```bash
auditreach verify-log
```

```
Verifying ./auditreach.log.jsonl...
✓ Chain intact: 14 entries, no gaps, no tampering detected.
```

If any entry in the log was hand-edited, deleted, or reordered after being
written, `verify-log` reports exactly which entry broke the chain and why:

```
Verifying ./auditreach.log.jsonl...
✗ Chain broken at entry 3 (ar_2026-07-16_9f3c2a): entry ar_2026-07-16_9f3c2a
  hash does not match its own content -- entry was edited after being written
```

See [concepts.md](./concepts.md) for exactly how the hash chain is built
and what each failure mode means.

## Using the library instead of the CLI

**TypeScript:**

```ts
import { RedditClient, getRedditCredentials } from "auditreach-cli";

const credentials = getRedditCredentials();
if (!credentials) throw new Error("run `auditreach auth --platform reddit` first");

const outcome = await new RedditClient(credentials).search({
  query: "agent memory poisoning",
  subreddit: "MachineLearning",
});
```

**Python:**

```python
from auditreach import RedditClient, get_reddit_credentials, RedditSearchOptions

credentials = get_reddit_credentials()
if credentials is None:
    raise SystemExit("run `auditreach auth --platform reddit` first")

outcome = RedditClient(credentials).search(
    RedditSearchOptions(query="agent memory poisoning", subreddit="MachineLearning")
)
```

## Next steps

- [concepts.md](./concepts.md) -- the hash-chain algorithm, the BYOK
  credential precedence rule, and the audit-log entry schema.
- [integrations/ci.md](./integrations/ci.md) -- running a search or a
  `verify-log` check as a CI step.
- The [project README](../README.md) for the full platform-coverage table
  and result-limit reference.
