"""
Canonicalization and hashing utilities the audit-log hash chain depends on.
Ported faithfully from src/util/crypto.ts -- the algorithm (recursive
key-sorting before serialization, SHA-256 over the resulting bytes) must
match exactly, since this is the integrity mechanism the tamper-evidence
claim rests on.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Any


def _sort_keys_deep(value: Any) -> Any:
    """
    Recursively sorts dict keys so the same logical value always produces
    the same JSON bytes regardless of key insertion order. Array (list)
    element order is preserved -- only object/dict keys are sorted, mirroring
    src/util/crypto.ts's sortKeysDeep.
    """
    if isinstance(value, list):
        return [_sort_keys_deep(item) for item in value]
    if isinstance(value, dict):
        return {key: _sort_keys_deep(value[key]) for key in sorted(value.keys())}
    return value


def canonical_json(value: Any) -> str:
    """
    Canonical JSON: sorts object keys recursively so the same logical entry
    always serializes to the same bytes, regardless of insertion order. This
    is required for the audit-log hash chain to verify deterministically.

    Uses compact separators (no whitespace) to match the TypeScript
    original's `JSON.stringify` default output shape, and `ensure_ascii=False`
    so UTF-8 content is encoded literally rather than \\uXXXX-escaped, the
    same behavior `JSON.stringify` has by default.
    """
    return json.dumps(_sort_keys_deep(value), separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def credential_fingerprint(secret: str) -> str:
    """
    A fingerprint proves which credential made a query without ever storing
    or logging the credential itself. Only the last 6 hex characters of the
    hash are kept -- enough to distinguish rotated keys in a local audit log,
    not enough to be a partial credential leak.
    """
    return sha256_hex(secret)[-6:]


def generate_entry_id(prefix: str = "ar") -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rand = secrets.token_hex(3)
    return f"{prefix}_{date}_{rand}"
