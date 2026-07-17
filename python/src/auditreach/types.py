"""
Shared types for auditreach's search + audit-log pipeline. Used by both the
CLI (auditreach/cli.py) and the programmatic library API
(auditreach/__init__.py).

Python port of the TypeScript original's src/types.ts. Field names follow
Python (snake_case) convention; the JSON written to the audit log file and
to --json stdout output uses the same field names as the TypeScript
version's on-disk format (entry_id, prev_entry_hash, etc. are already
snake_case in the original -- see src/types.ts -- so no key translation is
needed there).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Union

Platform = Literal["reddit", "youtube"]

QueryParamValue = Union[str, int, float, bool, None]


@dataclass
class AuditLogEntry:
    entry_id: str
    timestamp: str
    platform: Platform
    endpoint: str
    query_params: Dict[str, QueryParamValue]
    auth_scope: str
    consent_basis: str
    api_key_fingerprint: str
    results_returned: int
    prev_entry_hash: Optional[str]
    entry_hash: str


@dataclass
class UnhashedAuditLogEntry:
    entry_id: str
    timestamp: str
    platform: Platform
    endpoint: str
    query_params: Dict[str, QueryParamValue]
    auth_scope: str
    consent_basis: str
    api_key_fingerprint: str
    results_returned: int
    prev_entry_hash: Optional[str]


@dataclass
class ChainVerificationResult:
    valid: bool
    total_entries: int
    broken_at_entry_id: Optional[str]
    broken_at_index: Optional[int]
    reason: Optional[str]


@dataclass
class SearchResultItem:
    id: str
    title: str
    url: str
    created_at: str
    author: Optional[str]
    score: Optional[float]
    extra: Dict[str, object]


@dataclass
class SearchCursor:
    """Cursor fullnames read back from a platform's response, for requesting the next/previous page."""

    after: Optional[str]
    before: Optional[str]


@dataclass
class SearchOutcome:
    platform: Platform
    endpoint: str
    query_params: Dict[str, QueryParamValue]
    auth_scope: str
    consent_basis: str
    items: List[SearchResultItem]
    next_cursor: Optional[SearchCursor] = None
    """Pagination cursors extracted from the response itself (not an echo of the request params). Populated when the platform's API exposes them."""


@dataclass
class RedditSearchOptions:
    query: str
    subreddit: Optional[str] = None
    limit: Optional[int] = None
    before: Optional[str] = None
    """Reddit fullname (e.g. "t3_abc123") to page results before, for paginating past the ~1000-result search cap."""
    after: Optional[str] = None
    """Reddit fullname (e.g. "t3_abc123") to page results after, for paginating past the ~1000-result search cap."""


@dataclass
class YoutubeSearchOptions:
    query: Optional[str] = None
    channel_handle: Optional[str] = None
    since: Optional[str] = None
    max_results: Optional[int] = None
