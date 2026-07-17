"""Ported from src/commands/search.ts."""
from __future__ import annotations

import dataclasses
import json
import sys
from datetime import datetime, timezone
from typing import Optional

from ..audit_log.hash_chain_writer import append_audit_log_entry, get_last_entry_hash
from ..auth.credential_store import get_reddit_credentials, get_youtube_credentials
from ..clients.reddit_client import MAX_LIMIT as REDDIT_MAX_LIMIT
from ..clients.reddit_client import RedditClient
from ..clients.youtube_client import MAX_MAX_RESULTS as YOUTUBE_MAX_MAX_RESULTS
from ..clients.youtube_client import YoutubeClient
from ..crypto import credential_fingerprint, generate_entry_id
from ..types import Platform, RedditSearchOptions, SearchOutcome, SearchResultItem, YoutubeSearchOptions


def _item_to_wire(item: SearchResultItem) -> dict:
    """
    Serializes a SearchResultItem to the same camelCase JSON shape the
    TypeScript CLI's --output results file and --json stdout output use
    (id, title, url, createdAt, author, score, extra) -- the Python library
    API (auditreach.SearchResultItem) keeps idiomatic snake_case attributes;
    only the on-the-wire JSON this command writes is re-cased, so a script
    or agent parsing either CLI's output sees the same field names.
    """
    return {
        "id": item.id,
        "title": item.title,
        "url": item.url,
        "createdAt": item.created_at,
        "author": item.author,
        "score": item.score,
        "extra": item.extra,
    }


def run_search_command(
    platform: Platform,
    query: Optional[str] = None,
    subreddit: Optional[str] = None,
    channel: Optional[str] = None,
    since: Optional[str] = None,
    max_results: Optional[int] = None,
    before: Optional[str] = None,
    after: Optional[str] = None,
    output: Optional[str] = None,
    json_output: bool = False,
) -> int:
    if platform == "reddit":
        credentials = get_reddit_credentials()
        if not credentials:
            print(
                'No Reddit credentials found. Run "auditreach auth --platform reddit" first.',
                file=sys.stderr,
            )
            return 1
        if not query:
            print('Reddit search requires --query "<search terms>".', file=sys.stderr)
            return 1
        outcome = RedditClient(credentials).search(
            RedditSearchOptions(
                query=query, subreddit=subreddit, limit=max_results, before=before, after=after
            )
        )
        fingerprint_source = credentials.client_secret
    else:
        youtube_credentials = get_youtube_credentials()
        if not youtube_credentials:
            print(
                'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
                file=sys.stderr,
            )
            return 1
        outcome = YoutubeClient(youtube_credentials).search(
            YoutubeSearchOptions(
                query=query, channel_handle=channel, since=since, max_results=max_results
            )
        )
        fingerprint_source = youtube_credentials.api_key

    if not json_output:
        _print_results(outcome)

    output_path = output or _default_output_path()
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump([_item_to_wire(item) for item in outcome.items], f, indent=2)

    prev_hash = get_last_entry_hash()
    entry = append_audit_log_entry(
        {
            "entry_id": generate_entry_id(),
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"
            ),
            "platform": outcome.platform,
            "endpoint": outcome.endpoint,
            "query_params": outcome.query_params,
            "auth_scope": outcome.auth_scope,
            "consent_basis": outcome.consent_basis,
            "api_key_fingerprint": f"sha256:{credential_fingerprint(fingerprint_source)}",
            "results_returned": len(outcome.items),
            "prev_entry_hash": prev_hash,
        }
    )

    if json_output:
        sys.stdout.write(
            json.dumps(
                {
                    "platform": outcome.platform,
                    "endpoint": outcome.endpoint,
                    "queryParams": outcome.query_params,
                    "authScope": outcome.auth_scope,
                    "consentBasis": outcome.consent_basis,
                    "items": [_item_to_wire(item) for item in outcome.items],
                    "nextCursor": (
                        dataclasses.asdict(outcome.next_cursor) if outcome.next_cursor else None
                    ),
                    "truncated": _is_truncated(outcome),
                    "auditLogEntryId": entry["entry_id"],
                    "resultsFile": output_path,
                    "auditLogFile": "./auditreach.log.jsonl",
                },
                indent=2,
            )
            + "\n"
        )
        return 0

    print(f"\nAudit log entry written: {entry['entry_id']}")
    print(f"Consent basis: {entry['consent_basis']}")
    print(f"Full results: {output_path}")
    print("Full audit trail: ./auditreach.log.jsonl")
    return 0


def _default_output_path() -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"./auditreach-results-{date}.json"


def _print_results(outcome: SearchOutcome) -> None:
    print("\nAuditReach v0.1 -- Official-API Research CLI")
    print(f"Platform: {outcome.platform.capitalize()}  |  Auth: {outcome.auth_scope}")
    print("\nFetching... (official API, rate-limit aware)")
    print(f"✓ {len(outcome.items)} results returned ({outcome.consent_basis})\n")
    print(f"RESULTS ({len(outcome.items)})")
    for i, item in enumerate(outcome.items[:10]):
        print(f'[{i + 1}] "{item.title}"')
        print(f"    {item.author or 'unknown'} · {item.created_at}")
        print(f"    {item.url}")
    if len(outcome.items) > 10:
        print(f"... and {len(outcome.items) - 10} more (see output file)")
    if outcome.next_cursor and outcome.next_cursor.after:
        print(f"\nNext page: rerun with --after {outcome.next_cursor.after}")
    if outcome.next_cursor and outcome.next_cursor.before:
        print(f"Previous page: rerun with --before {outcome.next_cursor.before}")
    _warn_if_truncated(outcome)


def _warn_if_truncated(outcome: SearchOutcome) -> None:
    if not _is_truncated(outcome):
        return
    applied_limit = (
        outcome.query_params.get("limit")
        if outcome.platform == "reddit"
        else outcome.query_params.get("maxResults")
    )
    cap = REDDIT_MAX_LIMIT if outcome.platform == "reddit" else YOUTUBE_MAX_MAX_RESULTS
    platform_name = outcome.platform.capitalize()
    if isinstance(applied_limit, int) and applied_limit < cap:
        print(
            f"\nWarning: returned exactly {len(outcome.items)} results, the limit applied "
            f"for this search -- more results may exist. Pass --max-results <n> (up to {cap} "
            f"for {platform_name}) to request more.",
            file=sys.stderr,
        )
    else:
        print(
            f"\nWarning: returned exactly {len(outcome.items)} results, {platform_name}'s "
            "per-request maximum -- more results may exist beyond what a single search "
            "call can return.",
            file=sys.stderr,
        )


def _is_truncated(outcome: SearchOutcome) -> bool:
    """
    True when the result count exactly hits the applied limit, meaning more
    results may exist beyond what this single call returned. Shared by the
    human-readable warning and the --json `truncated` field so both reflect
    the same signal.
    """
    applied_limit = (
        outcome.query_params.get("limit")
        if outcome.platform == "reddit"
        else outcome.query_params.get("maxResults")
    )
    return isinstance(applied_limit, int) and len(outcome.items) >= applied_limit
