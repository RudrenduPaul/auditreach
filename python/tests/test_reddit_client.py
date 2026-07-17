"""Ported from test/reddit-client.test.ts."""
import json
import urllib.error
import urllib.request
from io import BytesIO
from unittest.mock import patch

import pytest

from auditreach.auth.credential_store import RedditCredentials
from auditreach.clients.reddit_client import RedditClient, RedditClientError
from auditreach.types import RedditSearchOptions

CREDENTIALS = RedditCredentials(
    client_id="test-client-id",
    client_secret="test-client-secret",
    username="test-user",
    password="test-password",
)


class FakeResponse:
    def __init__(self, body: dict):
        self._body = json.dumps(body).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def token_response(access_token="tok_abc"):
    return FakeResponse(
        {"access_token": access_token, "token_type": "bearer", "expires_in": 3600, "scope": "*"}
    )


def http_error(status, reason="Error"):
    return urllib.error.HTTPError(
        "https://example.invalid", status, reason, {}, BytesIO(b"{}")
    )


@pytest.fixture()
def mock_urlopen():
    with patch("urllib.request.urlopen") as mock:
        yield mock


def test_requests_oauth_token_before_searching(mock_urlopen):
    mock_urlopen.side_effect = [token_response("tok_abc"), FakeResponse({"data": {"children": []}})]

    client = RedditClient(CREDENTIALS)
    client.search(RedditSearchOptions(query="agent skill security"))

    assert mock_urlopen.call_count == 2
    token_request = mock_urlopen.call_args_list[0][0][0]
    assert token_request.full_url == "https://www.reddit.com/api/v1/access_token"
    assert token_request.get_method() == "POST"

    search_request = mock_urlopen.call_args_list[1][0][0]
    assert search_request.full_url.startswith("https://oauth.reddit.com/search")
    assert search_request.get_header("Authorization") == "Bearer tok_abc"


def test_never_sends_client_secret_or_password_in_search_headers(mock_urlopen):
    mock_urlopen.side_effect = [token_response("tok_xyz"), FakeResponse({"data": {"children": []}})]

    client = RedditClient(CREDENTIALS)
    client.search(RedditSearchOptions(query="test"))

    search_request = mock_urlopen.call_args_list[1][0][0]
    serialized_headers = json.dumps(dict(search_request.header_items()))
    assert CREDENTIALS.client_secret not in serialized_headers
    assert CREDENTIALS.password not in serialized_headers


def test_scopes_the_search_to_a_subreddit_when_provided(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), FakeResponse({"data": {"children": []}})]

    client = RedditClient(CREDENTIALS)
    outcome = client.search(RedditSearchOptions(query="test", subreddit="MachineLearning"))

    search_request = mock_urlopen.call_args_list[1][0][0]
    assert "/r/MachineLearning/search" in search_request.full_url
    assert outcome.endpoint == "GET /r/MachineLearning/search"


def test_normalizes_returned_posts_into_search_result_item_shape(mock_urlopen):
    mock_urlopen.side_effect = [
        token_response(),
        FakeResponse(
            {
                "data": {
                    "children": [
                        {
                            "data": {
                                "id": "abc123",
                                "title": "A real post",
                                "permalink": "/r/test/comments/abc123/a_real_post/",
                                "created_utc": 1_720_000_000,
                                "author": "some_user",
                                "score": 42,
                                "subreddit_name_prefixed": "r/test",
                                "num_comments": 7,
                            }
                        }
                    ]
                }
            }
        ),
    ]

    client = RedditClient(CREDENTIALS)
    outcome = client.search(RedditSearchOptions(query="test"))

    assert len(outcome.items) == 1
    item = outcome.items[0]
    assert item.id == "abc123"
    assert item.title == "A real post"
    assert item.author == "some_user"
    assert item.score == 42
    assert item.url == "https://reddit.com/r/test/comments/abc123/a_real_post/"


def test_throws_a_clear_error_when_the_token_request_fails(mock_urlopen):
    mock_urlopen.side_effect = [http_error(401)]

    client = RedditClient(CREDENTIALS)
    with pytest.raises(RedditClientError, match="OAuth token request failed"):
        client.search(RedditSearchOptions(query="test"))


def test_gives_cause_specific_guidance_for_leading_r_slash_prefix(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), http_error(400)]

    client = RedditClient(CREDENTIALS)
    with pytest.raises(RedditClientError) as exc_info:
        client.search(RedditSearchOptions(query="test", subreddit="r/MachineLearning"))
    message = str(exc_info.value)
    assert "Reddit search request failed: 400" in message
    assert 'leading "r/" or "/r/" prefix' in message
    assert 'try "MachineLearning" instead' in message


def test_gives_same_guidance_for_leading_slash_r_slash_prefix(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), http_error(400)]

    client = RedditClient(CREDENTIALS)
    with pytest.raises(RedditClientError, match='try "MachineLearning" instead'):
        client.search(RedditSearchOptions(query="test", subreddit="/r/MachineLearning"))


def test_strips_ansi_control_characters_from_subreddit_in_guidance_message(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), http_error(400)]

    client = RedditClient(CREDENTIALS)
    malicious_subreddit = "r/\x1b[31mMachineLearning\x1b[0m"
    with pytest.raises(RedditClientError) as exc_info:
        client.search(RedditSearchOptions(query="test", subreddit=malicious_subreddit))

    message = str(exc_info.value)
    assert "\x1b" not in message
    assert 'Your --subreddit value "r/[31mMachineLearning[0m" has a leading' in message


def test_falls_back_to_generic_message_for_400_with_no_leading_prefix(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), http_error(400)]

    client = RedditClient(CREDENTIALS)
    with pytest.raises(RedditClientError, match=r"Reddit search request failed: 400 Error\."):
        client.search(RedditSearchOptions(query="test", subreddit="MachineLearning"))


def test_falls_back_to_generic_message_for_400_with_no_subreddit(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), http_error(400)]

    client = RedditClient(CREDENTIALS)
    with pytest.raises(RedditClientError, match=r"Reddit search request failed: 400 Error\."):
        client.search(RedditSearchOptions(query="test"))


def test_reuses_a_cached_token_across_multiple_searches(mock_urlopen):
    mock_urlopen.side_effect = [
        token_response("tok_cached"),
        FakeResponse({"data": {"children": []}}),
        FakeResponse({"data": {"children": []}}),
    ]

    client = RedditClient(CREDENTIALS)
    client.search(RedditSearchOptions(query="first"))
    client.search(RedditSearchOptions(query="second"))

    # 1 token request + 2 search requests = 3 total, not 4.
    assert mock_urlopen.call_count == 3


def test_passes_before_after_cursor_params_through_when_supplied(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), FakeResponse({"data": {"children": []}})]

    client = RedditClient(CREDENTIALS)
    outcome = client.search(
        RedditSearchOptions(query="test", after="t3_abc123", before="t3_def456")
    )

    search_request = mock_urlopen.call_args_list[1][0][0]
    assert "after=t3_abc123" in search_request.full_url
    assert "before=t3_def456" in search_request.full_url
    assert outcome.query_params["after"] == "t3_abc123"
    assert outcome.query_params["before"] == "t3_def456"


def test_omits_before_after_params_entirely_when_not_supplied(mock_urlopen):
    mock_urlopen.side_effect = [token_response(), FakeResponse({"data": {"children": []}})]

    client = RedditClient(CREDENTIALS)
    client.search(RedditSearchOptions(query="test"))

    search_request = mock_urlopen.call_args_list[1][0][0]
    assert "after=" not in search_request.full_url
    assert "before=" not in search_request.full_url


def test_extracts_after_before_pagination_cursors_from_response(mock_urlopen):
    mock_urlopen.side_effect = [
        token_response(),
        FakeResponse(
            {
                "data": {
                    "after": "t3_nextpage001",
                    "before": "t3_prevpage002",
                    "children": [
                        {
                            "data": {
                                "id": "xyz789",
                                "title": "Another post",
                                "permalink": "/r/test/comments/xyz789/another_post/",
                                "created_utc": 1_720_000_000,
                                "author": "another_user",
                                "score": 5,
                                "subreddit_name_prefixed": "r/test",
                                "num_comments": 1,
                            }
                        }
                    ],
                }
            }
        ),
    ]

    client = RedditClient(CREDENTIALS)
    outcome = client.search(RedditSearchOptions(query="test"))

    assert outcome.next_cursor.after == "t3_nextpage001"
    assert outcome.next_cursor.before == "t3_prevpage002"


def test_returns_none_cursors_when_response_has_no_more_pages(mock_urlopen):
    mock_urlopen.side_effect = [
        token_response(),
        FakeResponse({"data": {"after": None, "before": None, "children": []}}),
    ]

    client = RedditClient(CREDENTIALS)
    outcome = client.search(RedditSearchOptions(query="test"))

    assert outcome.next_cursor.after is None
    assert outcome.next_cursor.before is None
