# CLAUDE.md -- auditreach

## Project Identity

- **Idea:** Free OSS, official-API-only, BYOK research CLI for AI agents. v0.1 covers Reddit
  and YouTube (X is deferred to a future release -- its official API pricing/rate limits are a
  real, disclosed risk to the "usable at real research volume" claim, so it's not shipped until
  a real design partner asks for it). Every query writes a local hash-chained audit log entry
  recording what was queried and under what consent/ToS basis. A paid hosted layer (team
  audit-log sync, signed compliance reports, retention policy, per-seat access) is a v0.2+ idea,
  gated on a WTP test -- not built yet.
- **Repo:** RudrenduPaul/auditreach
- **npm package:** auditreach-cli
- **Language:** TypeScript/Node (single package, not a workspaces monorepo -- v0.1 has no
  separate library/action package need)
- **License:** Apache 2.0
- **Repo goal:** Become the default official-API-only research CLI for compliance-conscious
  AI-agent research workflows. Every demand or coverage claim in this repo must be sourced, not
  asserted -- the underlying strategy doc scored this idea 43/75, Phase-F verdict WOUNDED, with
  an explicit cherry-pick flag on the two GitHub-issue demand citations it's built against.

## Git Workflow

When asked to commit, push, or "update GitHub" -- just do it. No questions.

- `git add` relevant files -> `git commit` -> `git push origin main` in one shot
- Every commit message ends with:
  Built by Rudrendu Paul, developed with Claude Code
- Never use `Co-Authored-By:` lines.

## Engineering Standards (block all tasks until these pass)

1. **Lint:** `npm run lint` (ESLint, flat config, `tsconfig.eslint.json` covers src + test)
2. **Format:** `npm run format` (Prettier check)
3. **Types:** `npm run typecheck` (`tsc --noEmit --strict`) -- zero errors
4. **Tests:** `npm run test:coverage` -- 80% lines/statements/functions, 75% branches, enforced
   globally except `src/cli.ts`, `src/index.ts` (thin wiring) and `src/util/prompt.ts` (raw
   terminal I/O, validated manually against the compiled CLI instead of unit-tested)
5. **Security:** `npm audit --audit-level=high` -- no unfixed HIGH/CRITICAL CVEs. (Known
   residual: 4 moderate-severity advisories in `googleapis`'s own transitive deps -- tracked via
   Dependabot, not force-fixed since `--force` would downgrade the official Google SDK.)
6. **Build:** `npm run build` must succeed before any release or `npm publish`.

Do NOT mark a task complete if any of these fail. Fix the root cause. Do not suppress errors or
add `@ts-ignore` patches without a comment explaining why.

## Planning Rules

Enter plan mode for any task that:

- Touches more than 2 files
- Changes the `AuditLogEntry` schema or the hash-chain verification logic (`src/audit-log/`)
- Adds a new platform client
- Modifies credential storage or the auth flow (`src/auth/`, `src/commands/auth.ts`)

Write the plan before touching code. If something goes wrong mid-task, stop and re-plan.

## Anti-Sycophancy Rules

These override default behavior in every session:

1. **No "compliance-safe" or "ToS-compliant" claim without citing the specific platform API
   terms it's based on.** Every `consent_basis` string and every README claim about compliance
   must trace to a real, linkable section of the platform's actual developer terms.
2. **No demand claim without a citation.** This idea's own scoring flagged a cherry-pick on its
   founding demand evidence. Never restate "users are asking for this" without linking the
   actual issue, PR, or pilot conversation that says so.
3. **No rate-limit or "usable at scale" claim without a real API-quota test.** Before claiming
   auditreach handles a given research volume, run an actual query volume against the live API
   (respecting its terms) and report the real numbers hit -- not a theoretical ceiling read off
   documentation.
4. **Comparison claims require specificity.** Any comparison to Agent-Reach, Tavily, or Exa must
   specify exactly what's different (official-API-only vs. cookie-harvesting/pay-per-call
   scraping, BYOK vs. hosted-key billing) -- "we're compliant, they're not" is not enough alone.
5. **Platform-dependency honesty check.** Before shipping a new platform integration, ask: "If
   this platform tightens its official API terms next quarter, what breaks?" Document the
   answer in the platform's row of the README coverage table, don't bury it.

## What Claude Must Never Do

- Log, transmit, or persist a user's full API key, client secret, or password anywhere other
  than the local OS-keychain-backed credential store (`src/auth/credential-store.ts`)
- Add a code path that authenticates as a logged-in human user (cookie import, session-token
  reuse, headless-browser login) -- this is the exact pattern the entire product exists to avoid
- State a demand or WTP number without a named source (issue link, pilot conversation,
  pre-commitment)
- Commit with `--no-verify`
- Claim "verified compliant" as an absolute -- the audit log proves _what was queried and under
  what stated basis_, never that the basis was legally sufficient for the user's jurisdiction

## Key Files

| File                                 | Purpose                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `src/types.ts`                       | Shared types -- `AuditLogEntry`, `SearchOutcome`, `Platform`, etc.        |
| `src/util/crypto.ts`                 | Canonical JSON, SHA-256, credential fingerprinting                        |
| `src/util/prompt.ts`                 | Masked-input terminal prompts for secrets                                 |
| `src/auth/credential-store.ts`       | BYOK credential I/O -- the only module allowed to touch a raw secret      |
| `src/clients/reddit-client.ts`       | Reddit OAuth2 password-grant flow + search, via native `fetch`            |
| `src/clients/youtube-client.ts`      | YouTube Data API v3 search, via `googleapis`                              |
| `src/audit-log/hash-chain-writer.ts` | Appends a hash-chained entry to `auditreach.log.jsonl`                    |
| `src/audit-log/chain-verifier.ts`    | Re-derives every entry's hash and checks chain links                      |
| `src/commands/`                      | CLI command implementations (`search`, `auth`, `verify-log`)              |
| `src/cli.ts`                         | Commander wiring -- the `bin` entry point                                 |
| `CONTRIBUTING.md`                    | Read before adding a new platform client or touching the audit-log schema |
| `SECURITY.md`                        | Vulnerability disclosure policy                                           |

## Session Start Checklist

1. Run `git status` and `git log --oneline -5` to understand current state
2. Run `npm test` to confirm baseline is green before touching anything
3. Read `CHANGELOG.md`'s last entry to understand what changed recently
4. If a bug is reported: write a failing test case first, then fix it
5. Check: has Reddit's or YouTube's official API terms, rate limits, or pricing changed? If
   yes, update the platform coverage table in the README and the relevant client immediately --
   this is a live-dependency risk, not a one-time integration.
