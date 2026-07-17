# Security Policy

This policy covers both distributions: the npm package (`auditreach-cli`,
TypeScript, repo root) and the PyPI package (`auditreach-cli`, Python,
`python/`).

## Supported versions

| Package                 | Version | Supported |
| ----------------------- | ------- | --------- |
| `auditreach-cli` (npm)  | 0.1.x   | Yes       |
| `auditreach-cli` (PyPI) | 0.1.x   | Yes       |

Both distributions are pre-1.0 and under active development. Security fixes
land on the latest `0.1.x` release of each; there is no older supported
line to backport to yet.

## Scope

`auditreach` handles two categories of sensitive material, in both distributions:

1. **BYOK credentials** (Reddit client secret/username/password, YouTube API key). The npm package stores these only in the local OS keychain via `@napi-rs/keyring`. The Python package stores them in the local OS keychain via the `keyring` package by default, and additionally checks a platform-specific environment variable first (`AUDITREACH_REDDIT_CLIENT_ID`, `AUDITREACH_REDDIT_CLIENT_SECRET`, `AUDITREACH_REDDIT_USERNAME`, `AUDITREACH_REDDIT_PASSWORD`, `AUDITREACH_YOUTUBE_API_KEY`) -- see `docs/concepts.md`. Neither distribution transmits a credential anywhere except the platform's own official OAuth/API endpoint.
2. **The local audit log** (`auditreach.log.jsonl`) -- contains query metadata and a credential _fingerprint_ (last 6 hex characters of a SHA-256 hash), never a full credential, in either distribution.

A vulnerability that could leak a credential, forge an audit-log entry, or bypass the hash-chain tamper check is a **security issue** under this policy, not a regular bug, regardless of which distribution it's found in.

## Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability. Instead, email **security@auditreach.dev** or use GitHub's private vulnerability reporting (Security tab -> Report a vulnerability) on this repository.

Include:

- Which distribution is affected (npm package, PyPI package, or both).
- A description of the issue and its impact (credential leak, chain-forgery, etc.)
- Steps to reproduce
- The affected version (`auditreach --version`)

We aim to acknowledge reports within 48 hours.

## What's out of scope

- Vulnerabilities in Reddit's or YouTube's own APIs -- report those to the respective platform.
- Reports that require an attacker to already have local shell access to the machine running `auditreach` with the same OS user privileges (the OS keychain's own threat model already assumes local-user isolation; `auditreach` does not add a second layer of local sandboxing). This applies equally to the Python package's `AUDITREACH_*` env-var credential path -- an attacker who can already set environment variables in the process that runs `auditreach` has the same level of access as one who can already read the OS keychain.

## Disclosure

We'll credit reporters (with permission) in the release notes once a fix ships. No bug bounty program exists at this time.
