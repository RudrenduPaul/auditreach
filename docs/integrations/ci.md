# CI integrations

Both distributions support the same flags, so a `verify-log` check (or a
scheduled search) is a straightforward CI step regardless of which
toolchain your pipeline already uses.

## Verifying the audit log in CI (npm)

```yaml
name: Verify audit log
on: [push]

jobs:
  verify-log:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g auditreach-cli
      - run: auditreach verify-log --json
```

`verify-log` exits `0` when the chain is intact (or empty) and `1` when it
finds tampering, so the job fails automatically on a broken chain -- no
extra `if` logic needed.

## Verifying the audit log in CI (Python)

```yaml
name: Verify audit log
on: [push]

jobs:
  verify-log:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install auditreach-cli
      - run: auditreach verify-log --json
```

Same exit-code contract: `0` intact/empty, `1` tampered.

## Running a scheduled search in CI (Python), with env-var credentials

Since the Python package checks `AUDITREACH_*` environment variables before
falling back to the OS keychain (see
[concepts.md](../concepts.md#byok-credential-precedence)), a CI runner
(which has neither an interactive terminal nor a keychain daemon) can
supply BYOK credentials as repository secrets:

```yaml
name: Scheduled research search
on:
  schedule:
    - cron: "0 9 * * 1" # every Monday at 09:00 UTC

jobs:
  search:
    runs-on: ubuntu-latest
    env:
      AUDITREACH_REDDIT_CLIENT_ID: ${{ secrets.AUDITREACH_REDDIT_CLIENT_ID }}
      AUDITREACH_REDDIT_CLIENT_SECRET: ${{ secrets.AUDITREACH_REDDIT_CLIENT_SECRET }}
      AUDITREACH_REDDIT_USERNAME: ${{ secrets.AUDITREACH_REDDIT_USERNAME }}
      AUDITREACH_REDDIT_PASSWORD: ${{ secrets.AUDITREACH_REDDIT_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install auditreach-cli
      - run: auditreach search --platform reddit --query "your query" --json > results.json
      - uses: actions/upload-artifact@v4
        with:
          name: search-results
          path: |
            results.json
            auditreach.log.jsonl
```

The npm package has no equivalent env-var credential path yet (it is
keychain-only) -- a Node-based pipeline that needs non-interactive BYOK
credentials should use the Python CLI for this specific step, or run
`auditreach auth --platform reddit` once against a persistent runner with a
keychain available.
