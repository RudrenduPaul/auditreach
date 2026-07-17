"""Ported from test/search-command.test.ts."""
import json
from unittest.mock import MagicMock

import pytest

from auditreach.auth.credential_store import RedditCredentials, YoutubeCredentials
from auditreach.commands import search as search_cmd
from auditreach.types import SearchOutcome, SearchResultItem

REDDIT_CREDENTIALS = RedditCredentials(
    client_id="id", client_secret="secret", username="user", password="pass"
)


def sample_outcome(platform="reddit", n_items=1, query_params=None):
    items = [
        SearchResultItem(
            id=f"item-{i}" if n_items > 1 else "abc",
            title="A post",
            url=f"https://reddit.com/r/test/item-{i}",
            created_at="2026-07-12T00:00:00.000Z",
            author="someone",
            score=10,
            extra={},
        )
        for i in range(n_items)
    ]
    return SearchOutcome(
        platform=platform,
        endpoint="GET /search",
        query_params=query_params or {"query": "test"},
        auth_scope="OAuth script-app grant, read-only, public-subreddit scope",
        consent_basis="Reddit API Terms -- public content, official API",
        items=items,
    )


@pytest.fixture(autouse=True)
def _chdir_tmp(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_exits_1_with_helpful_message_when_no_reddit_credentials(monkeypatch, capsys):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: None)
    exit_code = search_cmd.run_search_command(platform="reddit", query="test")
    assert exit_code == 1
    assert "No Reddit credentials found" in capsys.readouterr().err


def test_exits_1_when_query_missing_for_reddit_search(monkeypatch):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
    exit_code = search_cmd.run_search_command(platform="reddit")
    assert exit_code == 1


def test_writes_results_file_and_appends_audit_log_entry_on_success(monkeypatch, tmp_path):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome()
    monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

    exit_code = search_cmd.run_search_command(platform="reddit", query="test", output="results.json")
    assert exit_code == 0

    written = json.loads((tmp_path / "results.json").read_text())
    assert len(written) == 1
    assert written[0]["id"] == "abc"

    entry = json.loads((tmp_path / "auditreach.log.jsonl").read_text().strip())
    assert entry["platform"] == "reddit"
    assert entry["results_returned"] == 1
    assert entry["consent_basis"] == "Reddit API Terms -- public content, official API"


def test_never_writes_the_raw_client_secret_into_the_audit_log(monkeypatch, tmp_path):
    secret = "super-secret-value-should-not-leak"
    credentials = RedditCredentials(
        client_id="id", client_secret=secret, username="user", password="pass"
    )
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: credentials)
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome()
    monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

    search_cmd.run_search_command(platform="reddit", query="test", output="results.json")

    log_content = (tmp_path / "auditreach.log.jsonl").read_text()
    assert secret not in log_content
    entry = json.loads(log_content.strip())
    assert entry["api_key_fingerprint"].startswith("sha256:")
    assert len(entry["api_key_fingerprint"]) == len("sha256:") + 6


def test_chains_prev_entry_hash_across_multiple_searches(monkeypatch, tmp_path):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome()
    monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

    search_cmd.run_search_command(platform="reddit", query="first", output="r1.json")
    search_cmd.run_search_command(platform="reddit", query="second", output="r2.json")

    lines = (tmp_path / "auditreach.log.jsonl").read_text().strip().split("\n")
    entries = [json.loads(line) for line in lines]
    assert len(entries) == 2
    assert entries[1]["prev_entry_hash"] == entries[0]["entry_hash"]


def test_exits_1_with_helpful_message_when_no_youtube_credentials(monkeypatch, capsys):
    monkeypatch.setattr(search_cmd, "get_youtube_credentials", lambda: None)
    exit_code = search_cmd.run_search_command(platform="youtube", query="test")
    assert exit_code == 1
    assert "No YouTube credentials found" in capsys.readouterr().err


def test_runs_a_youtube_search_when_credentials_are_present(monkeypatch):
    monkeypatch.setattr(
        search_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="yt-key")
    )
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome(platform="youtube")
    monkeypatch.setattr(search_cmd, "YoutubeClient", lambda creds: mock_client)

    exit_code = search_cmd.run_search_command(platform="youtube", query="test", output="yt.json")
    assert exit_code == 0
    mock_client.search.assert_called_once()


def test_warns_on_stderr_when_result_count_equals_the_applied_silent_default_limit(
    monkeypatch, capsys
):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome(n_items=25, query_params={"query": "test", "limit": 25})
    monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

    search_cmd.run_search_command(platform="reddit", query="test", output="results.json")

    assert "Warning" in capsys.readouterr().err


def test_warns_on_stderr_when_result_count_equals_explicit_max_results(monkeypatch, capsys):
    monkeypatch.setattr(
        search_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="yt-key")
    )
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome(
        platform="youtube", n_items=5, query_params={"query": "test", "maxResults": 5}
    )
    monkeypatch.setattr(search_cmd, "YoutubeClient", lambda creds: mock_client)

    search_cmd.run_search_command(
        platform="youtube", query="test", max_results=5, output="yt.json"
    )

    assert "Warning" in capsys.readouterr().err


def test_does_not_warn_when_result_count_is_below_the_applied_limit(monkeypatch, capsys):
    monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
    mock_client = MagicMock()
    mock_client.search.return_value = sample_outcome(query_params={"query": "test", "limit": 25})
    monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

    search_cmd.run_search_command(platform="reddit", query="test", output="results.json")

    assert "Warning" not in capsys.readouterr().err


class TestJsonOutput:
    def test_prints_one_parseable_json_object_and_still_writes_results_and_log(
        self, monkeypatch, capsys, tmp_path
    ):
        monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
        mock_client = MagicMock()
        mock_client.search.return_value = sample_outcome()
        monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

        search_cmd.run_search_command(
            platform="reddit", query="test", output="results.json", json_output=True
        )

        out = capsys.readouterr().out
        printed = json.loads(out)
        assert printed["platform"] == "reddit"
        assert len(printed["items"]) == 1
        assert printed["items"][0]["id"] == "abc"
        assert isinstance(printed["auditLogEntryId"], str)
        assert "results.json" in printed["resultsFile"]

        written = json.loads((tmp_path / "results.json").read_text())
        assert len(written) == 1
        entry = json.loads((tmp_path / "auditreach.log.jsonl").read_text().strip())
        assert entry["results_returned"] == 1

    def test_reports_truncated_true_when_result_count_hits_the_applied_limit(
        self, monkeypatch, capsys
    ):
        monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: REDDIT_CREDENTIALS)
        mock_client = MagicMock()
        mock_client.search.return_value = sample_outcome(query_params={"query": "test", "limit": 1})
        monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

        search_cmd.run_search_command(
            platform="reddit", query="test", output="results.json", json_output=True
        )

        printed = json.loads(capsys.readouterr().out)
        assert printed["truncated"] is True
