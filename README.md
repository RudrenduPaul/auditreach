# auditreach

Research Reddit and YouTube from your AI agent using only official APIs, your own keys, and a log that proves exactly what you queried and why it was allowed.

    npx auditreach-cli search --platform reddit --query "agent skill security"

---

A consultancy we talked to had an AI research agent pulling social sentiment for a client report. It worked well until the client's legal team asked, in writing, what authority the data collection was under. The honest answer was "a browser cookie session," because the tool they were using authenticates by importing a logged-in session and scraping as if it were a real user. That works. It is also not an answer you can put in a compliance memo, and it is the exact pattern Reddit sued Anthropic and SerpApi over in 2025, and the same pattern that got Pushshift's public API access shut down by Reddit back in 2024.

[Agent-Reach](https://github.com/Panniantong/Agent-Reach) is not a bad tool. It has real traction (55k+ stars) because cookie-based scraping genuinely covers more ground than any official API does today, at zero API cost. But "covers more ground" and "an agency's client can pass a compliance review" are two different bars, and nothing was built specifically to clear the second one.

auditreach is the CLI we wished existed instead. It talks to Reddit and YouTube only through their official, documented APIs, using your own API keys -- never a shared pool -- and every single query writes a hash-chained entry to a local audit log: which platform, which endpoint, which scope, and a plain-language line explaining the consent/ToS basis for that specific call. No cookie import. No session-token reuse. No code path that could even pretend to be a logged-in human.

## How it compares

|                              | **auditreach**                 | **Agent-Reach**                                         | **snoowrap**                                        |
| ---------------------------- | ------------------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| Access model                 | Official API only, BYO-key     | Cookie/session import, "zero API fees"                  | Official API, BYO-key                               |
| Platform coverage (v0.1)     | Reddit, YouTube                | Twitter, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu | Reddit only                                         |
| Consent/audit log            | Hash-chained, per-query, local | None                                                    | None                                                |
| Maintenance status           | Active (this release)          | Active, 55k stars                                       | **Archived** since Feb 2023                         |
| License                      | Apache 2.0                     | MIT                                                     | MIT                                                 |
| Runtime deps (Reddit client) | 0 -- native `fetch`            | n/a (Python, browser-session based)                     | `request`, `request-promise`, `ws` (all deprecated) |

Numbers measured directly against each repo's public GitHub metadata and, for the dependency comparison, against `snoowrap`'s own published `package.json` as of this writing -- reproducible by anyone with `gh api repos/<owner>/<repo>`.

We started building auditreach's Reddit client on top of `snoowrap`, the most-used Reddit API wrapper in the Node ecosystem. Installing it pulled in `request`, `request-promise`, `form-data`, and `har-validator` -- a dependency chain with **4 CRITICAL** and multiple HIGH severity advisories, none of which snoowrap can fix because the project has been archived since 2023. We rewrote the Reddit client as a direct `fetch`-based OAuth2 client against Reddit's own documented REST endpoints instead: same functionality, zero of those CVEs, zero extra runtime dependencies. `npm audit --audit-level=high` on this repo returns clean.

We are not trying to out-cover Agent-Reach's six platforms. auditreach is narrower on purpose, for the buyer who structurally can't use a cookie-based tool at all.

## What it does

    npx auditreach-cli search --platform reddit --query "agent memory poisoning" --subreddit MachineLearning

    AuditReach v0.1 -- Official-API Research CLI
    Platform: Reddit  |  Auth: OAuth script-app grant, read-only, public-subreddit scope

    Fetching... (official API, rate-limit aware)
    ✓ 14 results returned (Reddit API Terms -- public content, official API, read-only script-app credentials)

    RESULTS (14)
    [1] "How are people testing for memory poisoning in long-running agents?"
        u/some_researcher · 2026-07-05T14:22:00.000Z
        https://reddit.com/r/MachineLearning/comments/...
    ...

    Audit log entry written: ar_2026-07-12_9f3c2a
    Consent basis: Reddit API Terms -- public content, official API, read-only script-app credentials
    Full results: ./auditreach-results-2026-07-12.json
    Full audit trail: ./auditreach.log.jsonl

Every entry in `auditreach.log.jsonl` is hash-chained -- each entry's hash is computed from its own content, and the next entry references it. Editing, deleting, or reordering an entry breaks the chain:

    $ auditreach verify-log
    Verifying ./auditreach.log.jsonl...
    ✓ Chain intact: 14 entries, no gaps, no tampering detected.

    # after someone hand-edits a line in the log file:
    $ auditreach verify-log
    Verifying ./auditreach.log.jsonl...
    ✗ Chain broken at entry 3 (ar_2026-07-12_9f3c2a): entry ar_2026-07-12_9f3c2a hash does not
      match its own content -- entry was edited after being written

Both outputs above are real runs against the compiled CLI, not mocked -- see `docs/security-review-2026-07-12.md` for how the tamper-detection path was verified.

## Getting started

**1. Install:**

    npm install -g auditreach-cli

**2. Set up credentials for the platform you want to search (BYO-key -- your own, never ours):**

    auditreach auth --platform reddit
    # Prompts for Client ID, Client secret, username, password.
    # Create a script-app at https://www.reddit.com/prefs/apps first.

    auditreach auth --platform youtube
    # Prompts for an API key.
    # Create one at https://console.cloud.google.com/apis/credentials

All credentials are stored in your OS keychain (`@napi-rs/keyring`), never in a config file, never transmitted anywhere except the platform's own official auth endpoint.

**3. Search:**

    auditreach search --platform reddit --query "your query" --subreddit some_subreddit
    auditreach search --platform youtube --query "your query" --channel @SomeChannel

Honest note on setup time: getting your own API credentials from Reddit and Google takes a few minutes the first time -- this is slower than Agent-Reach's cookie-import flow (which just reuses a browser session you already have) by design. BYOK means the setup cost is real, not hidden.

## Platform coverage

| Platform    | API used                                        | Status              | Known constraint                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reddit      | Reddit API (OAuth2 password grant, direct REST) | Shipped             | Rate limits are generally workable for real research volumes                                                                                                                                                                                                                                                                                                                               |
| YouTube     | YouTube Data API v3 (`googleapis`)              | Shipped             | Quota-based (10,000 units/day default), generally workable                                                                                                                                                                                                                                                                                                                                 |
| X (Twitter) | X API v2                                        | **Not yet shipped** | X's official API pricing and post-volume caps have been widely reported as prohibitive for small teams doing meaningful research since the 2023 pricing changes. Deferred until a real user needs it enough to fund working around that constraint -- shipping it half-working would undercut the entire "honest about what official APIs can and can't do" premise this tool is built on. |

## Result limits

`--max-results <n>` controls how many items a single `search` call returns. Leave it off and auditreach silently applies a default of 25 -- the same shape of surprise PRAW's `get_comments()` had for years ([praw#119](https://github.com/praw-dev/praw/issues/119)): a caller who does not already know to pass the flag gets a quietly truncated result set.

| Platform | Default (flag omitted) | Maximum (`--max-results`) |
| -------- | ---------------------- | ------------------------- |
| Reddit   | 25                     | 100                       |
| YouTube  | 25                     | 50                        |

Values above the cap are silently clamped to it -- there is currently no way to page past a platform's per-request maximum in a single `search` call. Whenever the number of items returned equals the limit that was actually applied, whether that is the silent default or an explicit `--max-results` value, auditreach prints a warning to stderr telling you more results may exist and how to raise `--max-results` (up to the platform cap).

## What is a "consent basis," honestly

The `consent_basis` field on every audit-log entry names the specific platform API terms and auth mechanism used for that query. It certifies that the request went through the platform's official, documented API surface under the credentials you supplied. **It does not certify that your specific use case is legally sufficient for your jurisdiction or contract** -- that determination is yours to make, informed by an accurate, complete, tamper-evident record of what actually happened.

## Self-hosting / local-only by default

Nothing about auditreach requires a hosted account or server. Every command runs entirely on your machine; the audit log is a plain file you own.

    git clone https://github.com/RudrenduPaul/auditreach.git
    cd auditreach
    npm install
    npm run build
    node dist/cli.js search --platform reddit --query "..."

## Development

    npm install
    npm run lint          # ESLint
    npm run format        # Prettier check
    npm run typecheck     # tsc --noEmit --strict
    npm run test:coverage # vitest, 66 tests, 95.4% statement coverage

See `CONTRIBUTING.md` for the rules on adding a new platform client -- the short version: official API only, honest rate-limit disclosure, tests that mock the network boundary, never anything that reads or writes a raw credential outside `src/auth/credential-store.ts`.

## Security

See `SECURITY.md` for the vulnerability disclosure policy and `docs/security-review-2026-07-12.md` for the pre-launch OWASP/STRIDE review (zero CRITICAL/HIGH findings; one moderate, non-directly-reachable supply-chain advisory tracked via Dependabot).

## License

Apache 2.0. See `LICENSE`.

## Success Stories

Four real issues reported against `praw-dev/praw` -- PRAW, Reddit's official Python API
wrapper, and the closest thing this project has to prior art -- root-caused against
auditreach's own source and used to close genuine gaps in this tool before it had a
single outside user. Each line below is tied to the actual report that prompted it.

- **[praw#614](https://github.com/praw-dev/praw/issues/614)** (@mananwason) -- asked how
  to read the before/after pagination cursor off Reddit's search response to page past
  its ~1,000-result cap; PRAW itself never solved this. `search()` now extracts the real
  cursor from Reddit's response and returns it as `SearchOutcome.nextCursor`, plus
  `--before`/`--after` flags to page in either direction.
- **[praw#1939](https://github.com/praw-dev/praw/issues/1939)** (@Auditormadness9) -- hit
  an undiagnosed 400 error caused by a subreddit name that still carried a leading `r/`
  prefix. Search errors now name that specific cause when it's the likely culprit:
  previously the CLI just returned a bare status code and left the guessing to you.
- **[praw#984](https://github.com/praw-dev/praw/issues/984)** (@MaxMatti) -- asked for a
  simple way to check whether Reddit bot credentials were still valid, without PRAW's
  confusing `getMe()`-recursion workaround. `auditreach auth --platform reddit --verify`
  does exactly that now: one lightweight check, no search required, nothing written to
  disk.
- **[praw#119](https://github.com/praw-dev/praw/issues/119)** (@nsp) -- hit PRAW's
  historic silent 25-result default, discoverable only by reading an unrelated base
  class's docstring; PRAW's own maintainer admitted he "wasn't sure the best way to make
  this clear." `--help` and this README now state the real default and per-platform
  caps, and a runtime warning fires whenever a search actually got truncated.
