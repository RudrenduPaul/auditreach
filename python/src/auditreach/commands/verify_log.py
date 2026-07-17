"""Ported from src/commands/verify-log.ts."""
from __future__ import annotations

import dataclasses
import json
import sys
from typing import Optional

from ..audit_log.chain_verifier import verify_audit_log_chain
from ..audit_log.hash_chain_writer import DEFAULT_AUDIT_LOG_PATH


def run_verify_log_command(path: Optional[str] = None, json_output: bool = False) -> int:
    """Returns the process exit code (0 valid / 1 tampered)."""
    log_path = path or DEFAULT_AUDIT_LOG_PATH
    if not json_output:
        print(f"Verifying {log_path}...")

    result = verify_audit_log_chain(log_path)
    exit_code = 0 if result.valid else 1

    if json_output:
        payload = {"logPath": log_path, **dataclasses.asdict(result)}
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
        return exit_code

    if result.total_entries == 0:
        print("No entries yet -- nothing to verify.")
        return exit_code

    if result.valid:
        print(f"✓ Chain intact: {result.total_entries} entries, no gaps, no tampering detected.")
    else:
        print(
            f"✗ Chain broken at entry {result.broken_at_index} "
            f"({result.broken_at_entry_id or 'unknown'}): {result.reason}",
            file=sys.stderr,
        )

    return exit_code
