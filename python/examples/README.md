# Python examples

Each numbered subdirectory is a real, runnable script against the actual
`auditreach` Python library (`from auditreach import ...`), not pseudocode.

Install the package first (editable install from this checkout, or `pip
install auditreach-cli` from PyPI both work identically):

```bash
cd python
pip install -e .
```

Then run any example directly:

```bash
python3 examples/01-basic-search/search.py
python3 examples/02-verify-audit-log/verify.py
python3 examples/03-agent-native-json/agent_report.py
```

| Example | What it demonstrates | Needs real credentials? |
| --- | --- | --- |
| [01-basic-search](./01-basic-search/) | The core library call: `RedditClient.search()` / `YoutubeClient.search()`, reading back `outcome.items`. | Yes -- run `auditreach auth --platform reddit` (or `--platform youtube`) first, or set the `AUDITREACH_*` env vars. Prints setup instructions and exits cleanly if neither is configured. |
| [02-verify-audit-log](./02-verify-audit-log/) | The tamper-evidence guarantee end to end: builds a small hash-chained log with `append_audit_log_entry()`, verifies it with `verify_audit_log_chain()`, then hand-edits one entry and re-verifies to show the exact break point. | No -- fully self-contained, uses a temp directory. |
| [03-agent-native-json](./03-agent-native-json/) | The agent-native use case: calling `search()` in-process (no CLI subprocess), serializing a structured pre-fetch decision to JSON, and demonstrating the BYOK credential precedence (env var checked before the OS keychain). | Partially -- the credential-precedence demo is self-contained; the actual search call needs real credentials, same as example 01. |
