"""
Re-derives every entry's hash from its own content and checks it against the
stored hash, then checks each entry's prev_entry_hash against the previous
entry's actual hash. Either check failing means the log was edited,
reordered, or an entry was deleted after the fact. Ported faithfully from
src/audit-log/chain-verifier.ts.
"""
from __future__ import annotations

import json
import os

from .hash_chain_writer import DEFAULT_AUDIT_LOG_PATH, compute_entry_hash
from ..types import ChainVerificationResult


def verify_audit_log_chain(
    log_path: str = DEFAULT_AUDIT_LOG_PATH,
) -> ChainVerificationResult:
    if not os.path.exists(log_path):
        return ChainVerificationResult(
            valid=True,
            total_entries=0,
            broken_at_entry_id=None,
            broken_at_index=None,
            reason="no log file yet -- nothing to verify",
        )

    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()
    lines = [line for line in content.split("\n") if line.strip()]

    expected_prev_hash = None

    for i, line in enumerate(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return ChainVerificationResult(
                valid=False,
                total_entries=len(lines),
                broken_at_entry_id=None,
                broken_at_index=i,
                reason=f"line {i + 1} is not valid JSON",
            )

        if entry.get("prev_entry_hash") != expected_prev_hash:
            return ChainVerificationResult(
                valid=False,
                total_entries=len(lines),
                broken_at_entry_id=entry.get("entry_id"),
                broken_at_index=i,
                reason=(
                    f"entry {entry.get('entry_id')} references prev_entry_hash that does "
                    "not match the actual prior entry -- chain broken or reordered"
                ),
            )

        entry_hash = entry.get("entry_hash")
        rest = {k: v for k, v in entry.items() if k != "entry_hash"}
        recomputed = compute_entry_hash(rest)
        if recomputed != entry_hash:
            return ChainVerificationResult(
                valid=False,
                total_entries=len(lines),
                broken_at_entry_id=entry.get("entry_id"),
                broken_at_index=i,
                reason=(
                    f"entry {entry.get('entry_id')} hash does not match its own content "
                    "-- entry was edited after being written"
                ),
            )

        expected_prev_hash = entry_hash

    return ChainVerificationResult(
        valid=True,
        total_entries=len(lines),
        broken_at_entry_id=None,
        broken_at_index=None,
        reason=None,
    )
