"""
Talks to Reddit's official OAuth API only -- no cookie import, no session
reuse. Uses the password grant (Reddit's "script app" flow), the documented
mechanism for a single-user, read-only research tool. Ported from
src/clients/reddit-client.ts.

Uses the stdlib `urllib` for HTTP instead of a third-party HTTP library,
matching the TypeScript version's own choice to use native `fetch` instead
of a Reddit SDK (see that file's comment on `snoowrap`'s abandoned,
CVE-carrying dependency chain) -- same "zero extra runtime dependencies"
reasoning applied to this port.
"""
from __future__ import annotations

import base64
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

from ..auth.credential_store import RedditCredentials
from ..types import RedditSearchOptions, SearchCursor, SearchOutcome, SearchResultItem

USER_AGENT = "auditreach-cli/0.1.0 (official-API-only compliance research tool, Python port)"

# Applied silently when max_results is omitted, and used as the hard
# ceiling even when max_results is passed a larger value. Documented in
# --help (cli.py) and README.md so a caller cannot be silently truncated
# without knowing more results exist -- see the truncation warning emitted
# by commands/search.py.
DEFAULT_LIMIT = 25
MAX_LIMIT = 100
TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
API_BASE = "https://oauth.reddit.com"

# Matches a subreddit value that still carries a leading "r/" or "/r/"
# prefix, e.g. "r/MachineLearning" or "/r/MachineLearning" instead of the
# bare "MachineLearning" the Reddit search API expects. This is the most
# common cause of an otherwise-undiagnosed 400 on the search endpoint (see
# https://github.com/praw-dev/praw/issues/1939).
LEADING_SUBREDDIT_PREFIX = re.compile(r"^/?r/", re.IGNORECASE)

# Strips ASCII control characters -- including the ESC byte (0x1B) that
# starts an ANSI escape sequence -- before a user-supplied CLI argument is
# echoed back into a message printed to the terminal.
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def _strip_control_chars(value: str) -> str:
    return _CONTROL_CHARS.sub("", value)


class RedditClientError(RuntimeError):
    pass


class RedditClient:
    def __init__(self, credentials: RedditCredentials) -> None:
        self._credentials = credentials
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def _get_access_token(self) -> str:
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        basic_auth = base64.b64encode(
            f"{self._credentials.client_id}:{self._credentials.client_secret}".encode("utf-8")
        ).decode("ascii")

        body = urllib.parse.urlencode(
            {
                "grant_type": "password",
                "username": self._credentials.username,
                "password": self._credentials.password,
            }
        ).encode("utf-8")

        request = urllib.request.Request(
            TOKEN_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Basic {basic_auth}",
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(request) as response:
                token = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise RedditClientError(
                f'Reddit OAuth token request failed: {error.code} {error.reason}. '
                'Check your credentials with "auditreach auth --platform reddit".'
            ) from error

        self._access_token = token["access_token"]
        # Refresh 60s before actual expiry to avoid a request failing mid-flight.
        self._token_expires_at = time.time() + (token["expires_in"] - 60)
        return self._access_token

    def _diagnose_search_failure(self, status: int, subreddit: Optional[str]) -> str:
        """
        Builds a cause-specific suffix for a failed search request, mirroring
        the guidance style used for token-request failures above. Returns an
        empty string when no known cause can be diagnosed, so callers can
        always append the result directly onto the generic error message.
        """
        if status == 400 and subreddit and LEADING_SUBREDDIT_PREFIX.search(subreddit):
            safe_subreddit = _strip_control_chars(subreddit)
            cleaned = _strip_control_chars(LEADING_SUBREDDIT_PREFIX.sub("", subreddit))
            return (
                f' Your --subreddit value "{safe_subreddit}" has a leading "r/" or "/r/" '
                f'prefix -- Reddit\'s API expects just the subreddit name (try "{cleaned}" instead).'
            )
        return ""

    def verify_credentials(self) -> None:
        """
        Performs the same OAuth token request used before every search, but
        without issuing a search call. Used by `auditreach auth --verify` to
        check credentials without requiring --query and without touching the
        results file or audit log. Always forces a fresh token request
        rather than reusing a cached one, so it reflects the current
        credential state.
        """
        self._access_token = None
        self._token_expires_at = 0.0
        self._get_access_token()

    def search(self, options: RedditSearchOptions) -> SearchOutcome:
        limit = min(options.limit or DEFAULT_LIMIT, MAX_LIMIT)
        access_token = self._get_access_token()

        params = {"q": options.query, "sort": "relevance", "limit": str(limit)}
        if options.subreddit:
            params["restrict_sr"] = "1"
        # Reddit's search listing endpoint accepts standard Listing pagination
        # cursors (before/after, Reddit "fullname" ids e.g. "t3_abc123"). These
        # walk forward/backward through a search's result set instead of
        # relying on offset-based paging, which Reddit's search API does not
        # support. They do NOT let a caller retrieve results beyond Reddit's
        # ~1,000-item search cap -- past that point Reddit's API returns no
        # before/after cursor at all, cursor-based paging or not (confirmed
        # directly in the praw#614 thread this fix is based on). Getting past
        # the 1,000-item cap requires cloudsearch timestamp-window
        # re-querying, not implemented yet.
        if options.before:
            params["before"] = options.before
        if options.after:
            params["after"] = options.after

        path = f"/r/{urllib.parse.quote(options.subreddit)}/search" if options.subreddit else "/search"
        url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"

        request = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(request) as response:
                listing = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            suffix = self._diagnose_search_failure(error.code, options.subreddit)
            raise RedditClientError(
                f"Reddit search request failed: {error.code} {error.reason}.{suffix}"
            ) from error

        children = listing["data"]["children"]
        items = [
            SearchResultItem(
                id=child["data"]["id"],
                title=child["data"]["title"],
                url=f"https://reddit.com{child['data']['permalink']}",
                created_at=_iso_from_epoch(child["data"]["created_utc"]),
                author=child["data"].get("author"),
                score=child["data"].get("score"),
                extra={
                    "subreddit": child["data"].get("subreddit_name_prefixed"),
                    "num_comments": child["data"].get("num_comments"),
                },
            )
            for child in children
        ]

        query_params = {"query": options.query, "limit": limit}
        if options.subreddit:
            query_params["subreddit"] = options.subreddit
        if options.before:
            query_params["before"] = options.before
        if options.after:
            query_params["after"] = options.after

        return SearchOutcome(
            platform="reddit",
            endpoint=(
                f"GET /r/{options.subreddit}/search" if options.subreddit else "GET /search"
            ),
            query_params=query_params,
            auth_scope="OAuth script-app grant, read-only, public-subreddit scope",
            consent_basis=(
                "Reddit API Terms -- public content, official API, read-only "
                "script-app credentials"
            ),
            items=items,
            # Cursors read back from Reddit's own response (not an echo of the
            # request params above) -- feed `next_cursor.after` into the next
            # call's `--after`/`options.after` to walk forward through the
            # current search's result set, and `next_cursor.before` to walk
            # backward. This does not extend past Reddit's ~1,000-item search
            # cap -- see the note above search() for why.
            next_cursor=SearchCursor(
                after=listing["data"].get("after"),
                before=listing["data"].get("before"),
            ),
        )


def _iso_from_epoch(epoch_seconds: float) -> str:
    from datetime import datetime, timezone

    return (
        datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
