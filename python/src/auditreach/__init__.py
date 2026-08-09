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
from importlib import metadata as _importlib_metadata

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

try:
    # Read the version from the installed package's own metadata rather than
    # a hand-maintained string here, which silently drifted from the real
    # pyproject.toml version (this constant was still "0.2.0" while the
    # package had shipped 0.2.2 on PyPI, so `auditreach --version` reported
    # a stale, wrong version to every user and agent that checked it).
    __version__ = _importlib_metadata.version("auditreach-cli")
except _importlib_metadata.PackageNotFoundError:
    # Not installed (e.g. running straight from a source checkout without
    # `pip install -e .`) -- fall back to a clearly-labeled placeholder
    # instead of a number that can silently go stale again.
    __version__ = "0.0.0-dev"

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
