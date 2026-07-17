# Concepts

## The hash chain, exactly

Every audit-log entry (`auditreach.log.jsonl`, one JSON object per line) has
this shape (field names are identical -- already `snake_case` -- in both
the TypeScript and Python source, since this is the on-disk log schema, not
a language-idiomatic API surface):

```json
{
  "entry_id": "ar_2026-07-16_9f3c2a",
  "timestamp": "2026-07-16T14:22:00.000Z",
  "platform": "reddit",
  "endpoint": "GET /r/MachineLearning/search",
  "query_params": {
    "query": "agent memory poisoning",
    "subreddit": "MachineLearning",
    "limit": 25
  },
  "auth_scope": "OAuth script-app grant, read-only, public-subreddit scope",
  "consent_basis": "Reddit API Terms -- public content, official API, read-only script-app credentials",
  "api_key_fingerprint": "sha256:a1b2c3",
  "results_returned": 14,
  "prev_entry_hash": null,
  "entry_hash": "..."
}
```

Building `entry_hash`:

1. Take every field above **except** `entry_hash` itself.
2. Canonicalize it to JSON: recursively sort every object's keys
   alphabetically (array element order is left untouched), then serialize
   with no extra whitespace. The same logical entry always produces the
   same bytes this way, regardless of the order fields happened to be
   constructed in.
3. SHA-256 the resulting string, hex-encode it. That is `entry_hash`.

`prev_entry_hash` is the previous entry's `entry_hash` (or `null` for the
very first entry in the log) -- this is what actually chains entries
together, not the mere fact that they're appended to the same file.

**Verifying** (`auditreach verify-log`) walks the log top to bottom and, for
every entry:

1. Checks that its `prev_entry_hash` equals the actual previous entry's
   `entry_hash`. A mismatch means the chain was broken -- an entry was
   deleted, or entries were reordered.
2. Re-runs the same canonicalize-and-hash steps above over the entry's own
   stored content and checks the result against its stored `entry_hash`. A
   mismatch means that specific entry's content was edited after being
   written.

Either failure stops verification at that exact entry and reports its
index and ID, so the caller knows precisely where the log stopped being
trustworthy, not just that "something" is wrong somewhere in the file. Both
distributions implement this identically; the Python port's
`tests/test_hash_chain.py` (and the TypeScript original's
`test/hash-chain.test.ts`) each include a dedicated test for a tampered
entry, a broken chain link, and a deleted middle entry.

`credentialFingerprint`/`credential_fingerprint` is the last 6 hex
characters of the SHA-256 hash of the credential actually used for a given
query (the Reddit client secret, or the YouTube API key) -- enough to tell
"this entry used a different credential than that entry" apart, e.g. after
rotating a key, without the fingerprint itself being reversible back to the
credential.

## BYOK credential precedence

Neither distribution ever stores or transmits a credential anywhere except
the platform's own official OAuth/API endpoint.

**npm package**: OS keychain only (`@napi-rs/keyring`), no config file, no
environment variable.

**Python package**: checks a platform-specific environment variable first,
falls back to the OS keychain (`keyring` package) when the variable is
unset.

| Reddit field  | Env var                           | Keychain key          |
| ------------- | --------------------------------- | --------------------- |
| Client ID     | `AUDITREACH_REDDIT_CLIENT_ID`     | `reddit:clientId`     |
| Client secret | `AUDITREACH_REDDIT_CLIENT_SECRET` | `reddit:clientSecret` |
| Username      | `AUDITREACH_REDDIT_USERNAME`      | `reddit:username`     |
| Password      | `AUDITREACH_REDDIT_PASSWORD`      | `reddit:password`     |

| YouTube field | Env var                      | Keychain key     |
| ------------- | ---------------------------- | ---------------- |
| API key       | `AUDITREACH_YOUTUBE_API_KEY` | `youtube:apiKey` |

This is a deliberate, documented divergence between the two distributions,
not an oversight: a headless CI runner or an AI agent's execution sandbox
frequently has no interactive terminal for `auditreach auth` to prompt
against, and often no keychain daemon running at all. The env-var path
gives those callers a way to supply BYOK credentials that the npm
package's keychain-only design does not have an equivalent for.

## Official-API-only, always

Both clients (`RedditClient`, `YoutubeClient`) talk exclusively to each
platform's documented REST API:

- **Reddit**: OAuth2 password grant ("script app" flow) against
  `https://www.reddit.com/api/v1/access_token`, then authenticated GET
  requests against `https://oauth.reddit.com`.
- **YouTube**: the YouTube Data API v3 (`https://www.googleapis.com/youtube/v3`),
  authenticated with an API key.

There is no code path in either distribution that imports a browser cookie,
reuses a session token, or otherwise authenticates as if it were a logged-in
human. This is the entire reason the project exists -- see the
[project README](../README.md#why-auditreach-exists) for the compliance
rationale.

## Result limits

`--max-results <n>` is silently clamped to each platform's cap (100 for
Reddit, 50 for YouTube) and defaults to 25 when omitted. Whenever a search
returns exactly the applied limit, both CLIs print a warning to stderr (and
set `truncated: true` in `--json` output) telling the caller more results
may exist. See the [project README](../README.md#result-limits) for the
full table and the historical PRAW issue this behavior was designed to
avoid repeating.
