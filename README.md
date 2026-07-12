<div align="center">

# auditreach

Research Reddit and YouTube from your AI agent using only official APIs, your own keys, and a log that proves exactly what you queried and why it was allowed.

[![CI](https://github.com/RudrenduPaul/auditreach/actions/workflows/ci.yml/badge.svg)](https://github.com/RudrenduPaul/auditreach/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/auditreach-cli)](https://www.npmjs.com/package/auditreach-cli)
[![License: Apache 2.0](https://img.shields.io/github/license/RudrenduPaul/auditreach)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

</div>

<!-- TODO: record a real terminal demo (asciinema or a short GIF) and embed it here.
     Capture script: run the two commands under "What it does" below against a real
     Reddit search-app credential, in a clean terminal, ~15-20s total. Save as
     docs/demo.gif and replace this comment with:
     ![auditreach demo: running a Reddit search and verifying the audit log](docs/demo.gif) -->

## Install

```sh
npx auditreach-cli search --platform reddit --query "your query"
```

Or install it globally:

```sh
npm install -g auditreach-cli
auditreach search --platform reddit --query "your query"
```

Building from source works the same way, if you want to read or modify the code first:

```sh
git clone https://github.com/RudrenduPaul/auditreach.git
cd auditreach
npm install
npm run build
node dist/cli.js search --platform reddit --query "your query"
```

## Table of contents

- [Why auditreach exists](#why-auditreach-exists)
- [How it compares](#how-it-compares)
- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Commands](#commands)
- [Library API reference](#library-api-reference)
- [Platform coverage](#platform-coverage)
- [Result limits](#result-limits)
- [What is a "consent basis," honestly](#what-is-a-consent-basis-honestly)
- [FAQ](#faq)
- [Self-hosting / local-only by default](#self-hosting--local-only-by-default)
- [Development](#development)
- [Security](#security)
- [Success stories](#success-stories)
- [Contributing](#contributing)
- [License](#license)

## Why auditreach exists

A consultancy we talked to had an AI research agent pulling social sentiment for a client report. It worked well until the client's legal team asked, in writing, what authority the data collection was under. The honest answer was "a browser cookie session," because the tool they were using authenticates by importing a logged-in session and scraping as if it were a real user. That works. It is also not an answer you can put in a compliance memo, and it is the exact pattern Reddit sued Anthropic and SerpApi over in 2025, and the same pattern that got Pushshift's public API access shut down by Reddit back in 2024.

[Agent-Reach](https://github.com/Panniantong/Agent-Reach) is not a bad tool. It has real traction (55k+ stars) because cookie-based scraping genuinely covers more ground than any official API does today, at zero API cost. But "covers more ground" and "an agency's client can pass a compliance review" are two different bars, and nothing was built specifically to clear the second one.

auditreach is the CLI we wished existed instead. It talks to Reddit and YouTube only through their official, documented APIs, using your own API keys -- never a shared pool -- and every single query writes a hash-chained entry to a local audit log: which platform, which endpoint, which scope, and a plain-language line explaining the consent/ToS basis for that specific call. No cookie import. No session-token reuse. No code path that could even pretend to be a logged-in human.

We are not trying to out-cover Agent-Reach's six platforms. auditreach is narrower on purpose, for the buyer who structurally can't use a cookie-based tool at all.

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

## What it does

    node dist/cli.js search --platform reddit --query "agent memory poisoning" --subreddit MachineLearning

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

    $ node dist/cli.js verify-log
    Verifying ./auditreach.log.jsonl...
    ✓ Chain intact: 14 entries, no gaps, no tampering detected.

    # after someone hand-edits a line in the log file:
    $ node dist/cli.js verify-log
    Verifying ./auditreach.log.jsonl...
    ✗ Chain broken at entry 3 (ar_2026-07-12_9f3c2a): entry ar_2026-07-12_9f3c2a hash does not
      match its own content -- entry was edited after being written

See `docs/security-review-2026-07-12.md` for how the tamper-detection path was verified.

## Getting started

**1. Install:** see [Install](#install) above -- `npx auditreach-cli`, `npm install -g auditreach-cli`, or clone and build from source.

**2. Set up credentials for the platform you want to search (BYO-key -- your own, never ours):**

    node dist/cli.js auth --platform reddit
    # Prompts for Client ID, Client secret, username, password.
    # Create a script-app at https://www.reddit.com/prefs/apps first.

    node dist/cli.js auth --platform youtube
    # Prompts for an API key.
    # Create one at https://console.cloud.google.com/apis/credentials

All credentials are stored in your OS keychain (`@napi-rs/keyring`), never in a config file, never transmitted anywhere except the platform's own official auth endpoint. Once credentials are set, verify them without running a real search:

    node dist/cli.js auth --platform reddit --verify

**3. Search:**

    node dist/cli.js search --platform reddit --query "your query" --subreddit some_subreddit
    node dist/cli.js search --platform youtube --query "your query" --channel @SomeChannel

Honest note on setup time: getting your own API credentials from Reddit and Google takes a few minutes the first time -- this is slower than Agent-Reach's cookie-import flow (which just reuses a browser session you already have) by design. BYOK means the setup cost is real, not hidden.

## Commands

`auditreach` has three subcommands. Every flag below is pulled directly from the CLI's own `--help` output, not from memory of what it used to support.

### `auditreach search`

Search a platform using its official API only.

| Flag                      | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `--platform <platform>`   | `reddit` \| `youtube` (required)                                                |
| `--query <query>`         | search query (required)                                                         |
| `--subreddit <subreddit>` | restrict search to one subreddit (Reddit only)                                  |
| `--channel <handle>`      | restrict search to one channel, e.g. `@AnthropicAI` (YouTube only)              |
| `--since <date>`          | only results published after this date, e.g. `2026-06-01` (YouTube only)        |
| `--max-results <n>`       | maximum results to return (default: 25; platform caps: 100 Reddit / 50 YouTube) |
| `--before <fullname>`     | page results before this Reddit fullname cursor, e.g. `t3_abc123` (Reddit only) |
| `--after <fullname>`      | page results after this Reddit fullname cursor, e.g. `t3_abc123` (Reddit only)  |
| `--output <path>`         | write full results JSON to this path                                            |

    node dist/cli.js search --platform reddit --query "agent memory poisoning" --subreddit MachineLearning --max-results 50

### `auditreach auth`

Set up, verify, or clear BYOK credentials for a platform (stored in your OS keychain).

| Flag                    | Description                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `--platform <platform>` | `reddit` \| `youtube` (required)                                                                   |
| `--clear`               | delete stored credentials for this platform                                                        |
| `--verify`              | verify stored credentials are valid without running a search (no results file, no audit-log entry) |

    node dist/cli.js auth --platform reddit --verify

### `auditreach verify-log`

Verify the local hash-chained audit log has not been tampered with.

| Flag            | Description                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| `--path <path>` | path to the audit log file (defaults to `./auditreach.log.jsonl` if omitted) |

    node dist/cli.js verify-log --path ./auditreach.log.jsonl

Run `auditreach <command> --help` any time to see the exact flags your installed version supports.

## Library API reference

`auditreach-cli` is also importable as a library, not just a CLI. Every export below comes straight from `dist/index.d.ts` in the published package.

```ts
import {
  RedditClient,
  YoutubeClient,
  getCredential,
  setCredential,
  deleteCredential,
  getRedditCredentials,
  getYoutubeCredentials,
  appendAuditLogEntry,
  getLastEntryHash,
  computeEntryHash,
  verifyAuditLogChain,
  credentialFingerprint,
  canonicalJson,
  sha256Hex,
  DEFAULT_AUDIT_LOG_PATH,
} from "auditreach-cli";
```

**Clients**

- `new RedditClient(credentials: RedditCredentials)` -- talks to Reddit's official OAuth API only, using the password grant ("script app" flow). `.search(options: RedditSearchOptions): Promise<SearchOutcome>`, `.verifyCredentials(): Promise<void>`.
- `new YoutubeClient(credentials: YoutubeCredentials)` -- wraps the official YouTube Data API v3. `.search(options: YoutubeSearchOptions): Promise<SearchOutcome>`, `.verifyCredentials(): Promise<void>` (a 1-quota-unit call, no query needed).

```ts
const credentials = getRedditCredentials();
if (!credentials) throw new Error("run `auditreach auth --platform reddit` first");

const client = new RedditClient(credentials);
const outcome = await client.search({
  query: "agent memory poisoning",
  subreddit: "MachineLearning",
});
```

**Credentials** (`setCredential` / `getCredential` / `deleteCredential` / `getRedditCredentials` / `getYoutubeCredentials`) -- all credential I/O goes through this module. It's the one place allowed to touch a raw secret; values come back only to hand directly to a client's constructor, never to log or print.

**Audit log**

- `appendAuditLogEntry(entryWithoutHash: UnhashedAuditLogEntry, logPath?: string): Promise<AuditLogEntry>` -- the only write path into the log; entries are never edited or deleted in place.
- `getLastEntryHash(logPath?: string): Promise<string | null>`
- `computeEntryHash(entry: UnhashedAuditLogEntry): string`
- `verifyAuditLogChain(logPath?: string): Promise<ChainVerificationResult>` -- re-derives every entry's hash and checks the chain end to end.
- `DEFAULT_AUDIT_LOG_PATH` -- `"./auditreach.log.jsonl"`

```ts
const result = await verifyAuditLogChain();
if (!result.valid) {
  console.error(`Chain broken at entry ${result.brokenAtIndex}: ${result.reason}`);
}
```

**Crypto utilities**

- `canonicalJson(value: unknown): string` -- recursively sorts object keys so the same logical entry always serializes to the same bytes, which the hash chain depends on to verify deterministically.
- `sha256Hex(input: string): string`
- `credentialFingerprint(secret: string): string` -- keeps only the last 6 hex characters of the hash, enough to distinguish rotated keys in a local audit log, never enough to be a partial credential leak.

No generated API docs site exists yet (no TypeDoc build wired into CI) -- the exports above are the complete public surface. Check `dist/index.d.ts` in the published package for exact types.

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

Values above the cap are silently clamped to it. For Reddit, `--before`/`--after` let you page past a single call's results using the real cursor Reddit's own response returns (see [Success stories](#success-stories)); YouTube has no equivalent yet. Whenever the number of items returned equals the limit that was actually applied, whether that is the silent default or an explicit `--max-results` value, auditreach prints a warning to stderr telling you more results may exist and how to raise `--max-results` (up to the platform cap).

## What is a "consent basis," honestly

The `consent_basis` field on every audit-log entry names the specific platform API terms and auth mechanism used for that query. It certifies that the request went through the platform's official, documented API surface under the credentials you supplied. **It does not certify that your specific use case is legally sufficient for your jurisdiction or contract** -- that determination is yours to make, informed by an accurate, complete, tamper-evident record of what actually happened.

## FAQ

**Does auditreach store my Reddit or YouTube credentials anywhere?**
No. Credentials go straight into your OS keychain through `@napi-rs/keyring` (`src/auth/credential-store.ts`). There is no config file, no environment variable, and no code path that writes a raw credential to disk.

**How many results does a search return by default, and can I get more?**
25, silently, unless you pass `--max-results` -- see [Result limits](#result-limits). The hard cap is 100 for Reddit and 50 for YouTube. A stderr warning fires whenever a search actually hits the applied limit, whether that's the silent default or an explicit value you passed.

**Can I page past Reddit's result cap?**
Yes, for Reddit: `search()` reads the real `after`/`before` cursor out of Reddit's own response and exposes `--before`/`--after` flags to page in either direction. See the [praw#614 success story](#success-stories) for why this exists.

**Does auditreach support X (Twitter)?**
Not yet. X API v2's pricing and post-volume caps have been prohibitive for small teams doing real research since the 2023 changes. See [Platform coverage](#platform-coverage) for the full reasoning.

**How do I check my credentials are still valid without running a real search?**
`node dist/cli.js auth --platform reddit --verify` (or `--platform youtube`). It performs the minimal authenticated check and reports pass or fail, with no `--query` needed, no results file written, and no audit-log entry appended.

**Is the audit log actually tamper-evident, or just a log file?**
Tamper-evident: each entry's hash is computed from its own content and the next entry references it, so `verify-log` can point to the exact entry a hand-edit broke. See the demo under [What it does](#what-it-does).

## Self-hosting / local-only by default

Nothing about auditreach requires a hosted account or server. Every command runs entirely on your machine; the audit log is a plain file you own. This is the same flow as [Install](#install) above:

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

See `SECURITY.md` for the vulnerability disclosure policy and `docs/security-review-2026-07-12.md` for the pre-launch OWASP/STRIDE review (zero CRITICAL/HIGH findings; one moderate, non-directly-reachable supply-chain advisory that has since been resolved -- `npm audit` on this repo currently returns zero vulnerabilities). GitHub secret scanning and push protection are enabled on this repo.

## Success stories

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

## Contributing

See `CONTRIBUTING.md` for the rules on adding a new platform client. Short version: official API only, honest rate-limit disclosure, tests that mock the network boundary, never a code path that reads or writes a raw credential outside `src/auth/credential-store.ts`.

## License

Apache 2.0. See `LICENSE`.
