"""
Talks to the official YouTube Data API v3 only, using an API key (BYOK).
Ported from src/clients/youtube-client.ts, which wraps Google's `googleapis`
Node SDK.

This port calls the same YouTube Data API v3 REST endpoints directly via
the stdlib `urllib` instead of pulling in Google's full Python API client
(`google-api-python-client` and its own dependency chain: `google-auth`,
`httplib2`, `google-auth-httplib2`, `uritemplate`). Deliberate, documented
deviation: same official API, same endpoints, same auth mechanism (API-key
query parameter, no OAuth needed for public search), zero extra runtime
dependencies -- extending the same "official API, minimal dependency
surface" reasoning the TypeScript version's own README already applies to
its Reddit client.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

from ..auth.credential_store import YoutubeCredentials
from ..types import SearchOutcome, SearchResultItem, YoutubeSearchOptions

# Applied silently when max_results is omitted, and used as the hard
# ceiling even when max_results is passed a larger value. Documented in
# --help (cli.py) and README.md so a caller cannot be silently truncated
# without knowing more results exist -- see the truncation warning emitted
# by commands/search.py.
DEFAULT_MAX_RESULTS = 25
MAX_MAX_RESULTS = 50

API_BASE = "https://www.googleapis.com/youtube/v3"


class YoutubeClientError(RuntimeError):
    pass


def _get(path: str, params: dict) -> dict:
    url = f"{API_BASE}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise YoutubeClientError(
            f"YouTube API request to {path} failed: {error.code} {error.reason}. {detail}"
        ) from error


class YoutubeClient:
    def __init__(self, credentials: YoutubeCredentials) -> None:
        self._credentials = credentials

    def verify_credentials(self) -> None:
        """
        Issues a minimal authenticated request (1 quota unit, no query
        needed) to confirm the API key is valid. Used by
        `auditreach auth --verify` instead of running a real search.
        """
        _get(
            "videoCategories",
            {"part": "snippet", "regionCode": "US", "key": self._credentials.api_key},
        )

    def search(self, options: YoutubeSearchOptions) -> SearchOutcome:
        if not options.query and not options.channel_handle:
            raise ValueError("YouTube search requires either --query or --channel")

        max_results = min(options.max_results or DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS)

        channel_id: Optional[str] = None
        if options.channel_handle:
            handle = (
                options.channel_handle
                if options.channel_handle.startswith("@")
                else f"@{options.channel_handle}"
            )
            channel_response = _get(
                "channels",
                {"part": "id", "forHandle": handle, "key": self._credentials.api_key},
            )
            items = channel_response.get("items") or []
            channel_id = items[0]["id"] if items else None
            if not channel_id:
                raise YoutubeClientError(f'No YouTube channel found for handle "{handle}"')

        search_params = {
            "part": "snippet",
            "maxResults": str(max_results),
            "type": "video",
            "order": "date",
            "key": self._credentials.api_key,
        }
        if options.query:
            search_params["q"] = options.query
        if channel_id:
            search_params["channelId"] = channel_id
        if options.since:
            search_params["publishedAfter"] = _to_iso(options.since)

        response = _get("search", search_params)

        items = [
            SearchResultItem(
                id=(item.get("id") or {}).get("videoId", ""),
                title=(item.get("snippet") or {}).get("title", ""),
                url=f"https://www.youtube.com/watch?v={(item.get('id') or {}).get('videoId', '')}",
                created_at=(item.get("snippet") or {}).get("publishedAt", ""),
                author=(item.get("snippet") or {}).get("channelTitle"),
                score=None,
                extra={
                    "channelId": (item.get("snippet") or {}).get("channelId"),
                    "description": (item.get("snippet") or {}).get("description"),
                },
            )
            for item in response.get("items") or []
        ]

        query_params = {"maxResults": max_results}
        if options.query:
            query_params["query"] = options.query
        if options.channel_handle:
            query_params["channel"] = options.channel_handle
        if options.since:
            query_params["since"] = options.since

        return SearchOutcome(
            platform="youtube",
            endpoint="GET /youtube/v3/search",
            query_params=query_params,
            auth_scope="YouTube Data API v3, API-key auth, public search scope",
            consent_basis=(
                "YouTube API Services Terms -- public content, official API, API-key auth"
            ),
            items=items,
        )


def _to_iso(date_str: str) -> str:
    from datetime import datetime, timezone

    parsed = datetime.fromisoformat(date_str)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
