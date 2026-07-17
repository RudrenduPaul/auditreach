"""Ported from test/youtube-client.test.ts. Mocks this module's own `_get`
REST helper (the network boundary), the same way the TypeScript suite mocks
the `googleapis` SDK boundary rather than raw `fetch`."""
from unittest.mock import patch

import pytest

from auditreach.auth.credential_store import YoutubeCredentials
from auditreach.clients import youtube_client as yt
from auditreach.clients.youtube_client import YoutubeClient, YoutubeClientError
from auditreach.types import YoutubeSearchOptions

CREDENTIALS = YoutubeCredentials(api_key="test-key")


def test_throws_when_neither_query_nor_channel_is_provided():
    client = YoutubeClient(CREDENTIALS)
    with pytest.raises(ValueError, match="requires either --query or --channel"):
        client.search(YoutubeSearchOptions())


def test_searches_by_query_and_normalizes_results():
    with patch.object(yt, "_get") as mock_get:
        mock_get.return_value = {
            "items": [
                {
                    "id": {"videoId": "vid123"},
                    "snippet": {
                        "title": "Agent skill security explained",
                        "publishedAt": "2026-07-01T00:00:00Z",
                        "channelTitle": "Some Channel",
                        "channelId": "chan1",
                        "description": "desc",
                    },
                }
            ]
        }

        client = YoutubeClient(CREDENTIALS)
        outcome = client.search(YoutubeSearchOptions(query="agent skill security"))

        assert len(outcome.items) == 1
        item = outcome.items[0]
        assert item.id == "vid123"
        assert item.title == "Agent skill security explained"
        assert item.url == "https://www.youtube.com/watch?v=vid123"
        assert item.author == "Some Channel"
        mock_get.assert_called_once()
        assert mock_get.call_args[0][0] == "search"


def test_resolves_a_channel_handle_to_a_channel_id_before_searching():
    with patch.object(yt, "_get") as mock_get:
        mock_get.side_effect = [{"items": [{"id": "UCxxxx"}]}, {"items": []}]

        client = YoutubeClient(CREDENTIALS)
        client.search(YoutubeSearchOptions(channel_handle="AnthropicAI"))

        channels_call = mock_get.call_args_list[0]
        assert channels_call[0][0] == "channels"
        assert channels_call[0][1]["forHandle"] == "@AnthropicAI"

        search_call = mock_get.call_args_list[1]
        assert search_call[0][0] == "search"
        assert search_call[0][1]["channelId"] == "UCxxxx"


def test_throws_a_clear_error_when_a_channel_handle_does_not_resolve():
    with patch.object(yt, "_get") as mock_get:
        mock_get.return_value = {"items": []}

        client = YoutubeClient(CREDENTIALS)
        with pytest.raises(YoutubeClientError, match="No YouTube channel found"):
            client.search(YoutubeSearchOptions(channel_handle="doesnotexist"))


def test_caps_max_results_at_the_platform_maximum():
    with patch.object(yt, "_get") as mock_get:
        mock_get.return_value = {"items": []}

        client = YoutubeClient(CREDENTIALS)
        client.search(YoutubeSearchOptions(query="test", max_results=500))

        search_call = mock_get.call_args_list[0]
        assert search_call[0][1]["maxResults"] == "50"
