#!/usr/bin/env python3
"""
02 -- verify audit log (tamper detection, end to end).

Fully self-contained -- no real credentials or network calls needed. Builds
a small three-entry hash-chained log with the same append_audit_log_entry()
function `auditreach search` uses internally, verifies it's intact, then
hand-edits one entry's content (leaving its stored hash untouched, exactly
what a tamper attempt would do) and re-verifies to show verify_audit_log_chain()
pinpointing the exact broken entry. This is the core security claim this
project makes, demonstrated directly against the real library code.

Run:
    python3 examples/02-verify-audit-log/verify.py
"""
import json
import tempfile
from pathlib import Path

from auditreach import append_audit_log_entry, verify_audit_log_chain
from auditreach.crypto import generate_entry_id


def make_entry(prev_hash, query):
    return {
        "entry_id": generate_entry_id(),
        "timestamp": "2026-07-16T00:00:00.000Z",
        "platform": "reddit",
        "endpoint": "GET /search",
        "query_params": {"query": query},
        "auth_scope": "OAuth script-app grant, read-only, public-subreddit scope",
        "consent_basis": "Reddit API Terms -- public content, official API",
        "api_key_fingerprint": "sha256:abc123",
        "results_returned": 3,
        "prev_entry_hash": prev_hash,
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="auditreach-example-") as tmp:
        log_path = str(Path(tmp) / "auditreach.log.jsonl")

        print("--- writing 3 chained entries ---")
        prev_hash = None
        for query in ("first query", "second query", "third query"):
            entry = append_audit_log_entry(make_entry(prev_hash, query), log_path)
            print(f"  wrote {entry['entry_id']}  hash={entry['entry_hash'][:12]}...")
            prev_hash = entry["entry_hash"]

        print("\n--- verifying the intact chain ---")
        result = verify_audit_log_chain(log_path)
        print(f"  valid: {result.valid}  total_entries: {result.total_entries}")

        print("\n--- tampering with the first entry (results_returned: 3 -> 999) ---")
        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line for line in f.read().split("\n") if line]
        tampered = json.loads(lines[0])
        tampered["results_returned"] = 999  # entry_hash is left untouched, as a real tamper attempt would
        lines[0] = json.dumps(tampered)
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        print("--- re-verifying after tampering ---")
        result = verify_audit_log_chain(log_path)
        print(f"  valid: {result.valid}")
        print(f"  broken at index: {result.broken_at_index} (entry {result.broken_at_entry_id})")
        print(f"  reason: {result.reason}")


if __name__ == "__main__":
    main()
