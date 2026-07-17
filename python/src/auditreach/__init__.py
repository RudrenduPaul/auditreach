"""
Programmatic / agent-native entry point.

    from auditreach import RedditClient, get_reddit_credentials, verify_audit_log_chain

    credentials = get_reddit_credentials()
    outcome = RedditClient(credentials).search(RedditSearchOptions(query="agent memory poisoning"))

This is the Python port of the auditreach-cli npm package
(https://www.npmjs.com/package/auditreach-cli). Both distributions talk to
Reddit and YouTube only through their official, documented APIs using your
own API keys, and both write the same shape of hash-chained, tamper-evident
audit-log entry for every query. See
https://github.com/RudrenduPaul/auditreach for the canonical documentation,
the original TypeScript source, and the compliance rationale.
"""
from .audit_log.chain_verifier import verify_audit_log_chain
from .audit_log.hash_chain_writer import (
    DEFAULT_AUDIT_LOG_PATH,
    append_audit_log_entry,
    compute_entry_hash,
    get_last_entry_hash,
)
from .auth.credential_store import (
    RedditCredentials,
    YoutubeCredentials,
    delete_credential,
    get_credential,
    get_reddit_credentials,
    get_youtube_credentials,
    set_credential,
)
from .clients.reddit_client import RedditClient
from .clients.youtube_client import YoutubeClient
from .crypto import canonical_json, credential_fingerprint, sha256_hex
from .types import (
    AuditLogEntry,
    ChainVerificationResult,
    Platform,
    RedditSearchOptions,
    SearchCursor,
    SearchOutcome,
    SearchResultItem,
    UnhashedAuditLogEntry,
    YoutubeSearchOptions,
)

__version__ = "0.1.0"

__all__ = [
    "RedditClient",
    "YoutubeClient",
    "RedditCredentials",
    "YoutubeCredentials",
    "get_credential",
    "set_credential",
    "delete_credential",
    "get_reddit_credentials",
    "get_youtube_credentials",
    "append_audit_log_entry",
    "get_last_entry_hash",
    "compute_entry_hash",
    "verify_audit_log_chain",
    "DEFAULT_AUDIT_LOG_PATH",
    "credential_fingerprint",
    "canonical_json",
    "sha256_hex",
    "Platform",
    "AuditLogEntry",
    "UnhashedAuditLogEntry",
    "ChainVerificationResult",
    "SearchResultItem",
    "SearchCursor",
    "SearchOutcome",
    "RedditSearchOptions",
    "YoutubeSearchOptions",
    "__version__",
]
