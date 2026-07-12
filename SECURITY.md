# Security Policy

## Scope

`auditreach` handles two categories of sensitive material:

1. **BYOK credentials** (Reddit client secret/username/password, YouTube API key) -- stored only in the local OS keychain via `@napi-rs/keyring`, never transmitted anywhere except the platform's own official OAuth/API endpoint.
2. **The local audit log** (`auditreach.log.jsonl`) -- contains query metadata and a credential _fingerprint_ (last 6 hex characters of a SHA-256 hash), never a full credential.

A vulnerability that could leak a credential, forge an audit-log entry, or bypass the hash-chain tamper check is a **security issue** under this policy, not a regular bug.

## Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability. Instead, email **security@auditreach.dev** or use GitHub's private vulnerability reporting (Security tab -> Report a vulnerability) on this repository.

Include:

- A description of the issue and its impact (credential leak, chain-forgery, etc.)
- Steps to reproduce
- The affected version (`auditreach --version`)

We aim to acknowledge reports within 48 hours.

## What's out of scope

- Vulnerabilities in Reddit's or YouTube's own APIs -- report those to the respective platform.
- Reports that require an attacker to already have local shell access to the machine running `auditreach` with the same OS user privileges (the OS keychain's own threat model already assumes local-user isolation; `auditreach` does not add a second layer of local sandboxing).

## Disclosure

We'll credit reporters (with permission) in the release notes once a fix ships. No bug bounty program exists at this time.
