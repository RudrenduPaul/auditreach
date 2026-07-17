"""
Append-only writer for the local hash-chained audit log. Ported faithfully
from src/audit-log/hash-chain-writer.ts. Entries are plain dicts (not
dataclasses) here, since this module's whole job is JSON I/O -- the dict
shape matches types.UnhashedAuditLogEntry / types.AuditLogEntry field for
field, using the same on-disk field names (entry_id, prev_entry_hash, ...)
as the TypeScript version.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from ..crypto import canonical_json, sha256_hex

DEFAULT_AUDIT_LOG_PATH = "./auditreach.log.jsonl"


def get_last_entry_hash(log_path: str = DEFAULT_AUDIT_LOG_PATH) -> Optional[str]:
    """
    Reads the last line of the log file to find the previous entry's hash.
    Returns None if the log doesn't exist yet or is empty -- that's the
    legitimate state for the very first entry in a chain.
    """
    if not os.path.exists(log_path):
        return None
    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()
    lines = [line for line in content.split("\n") if line.strip()]
    if not lines:
        return None
    last_entry = json.loads(lines[-1])
    return last_entry["entry_hash"]


def compute_entry_hash(entry: Dict[str, Any]) -> str:
    """
    `entry` must not contain an `entry_hash` key -- prev_entry_hash is
    already a field on the entry, so canonical_json alone links this entry
    to the previous one, no need to fold it in twice.
    """
    return sha256_hex(canonical_json(entry))


def append_audit_log_entry(
    entry_without_hash: Dict[str, Any], log_path: str = DEFAULT_AUDIT_LOG_PATH
) -> Dict[str, Any]:
    """
    Appends one hash-chained entry to the local audit log. This is the only
    write path into the log -- entries are never edited or deleted in
    place, which is what makes `verify-log` a meaningful tamper check.
    """
    entry_hash = compute_entry_hash(entry_without_hash)
    full_entry = {**entry_without_hash, "entry_hash": entry_hash}
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(full_entry, ensure_ascii=False) + "\n")
    return full_entry
