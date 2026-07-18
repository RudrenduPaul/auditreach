"""
Tests for the `auditreach mcp` subcommand's tool wrappers
(auditreach.commands.mcp). These wrappers call straight through to the same
`run_*_command` functions the `search` / `auth` / `verify-log` CLI
subcommands use, so the mocking pattern here mirrors
test_search_command.py / test_auth_command.py / test_verify_log_command.py:
monkeypatch the collaborators (`get_reddit_credentials`, `RedditClient`,
etc.) on the *owning* command module (`commands.search`, `commands.auth`),
not on `commands.mcp` -- `mcp.py` imports the `run_*_command` functions by
reference, so patching the owning module's globals is what those functions
actually see when they run.
"""
import asyncio

import pytest

from auditreach.auth.credential_store import RedditCredentials, YoutubeCredentials
from auditreach.commands import auth as auth_cmd
from auditreach.commands import mcp as mcp_cmd
from auditreach.commands import search as search_cmd
from auditreach.types import SearchOutcome, SearchResultItem
from unittest.mock import MagicMock


@pytest.fixture(autouse=True)
def _chdir_tmp(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def sample_outcome():
    return SearchOutcome(
        platform="reddit",
        endpoint="GET /search",
        query_params={"query": "test"},
        auth_scope="OAuth script-app grant, read-only, public-subreddit scope",
        consent_basis="Reddit API Terms -- public content, official API",
        items=[
            SearchResultItem(
                id="abc",
                title="A post",
                url="https://reddit.com/r/test/abc",
                created_at="2026-07-12T00:00:00.000Z",
                author="someone",
                score=10,
                extra={},
            )
        ],
    )


class TestSearchTool:
    def test_rejects_an_unsupported_platform_without_calling_the_real_command(self, monkeypatch):
        mock = MagicMock()
        monkeypatch.setattr(mcp_cmd, "run_search_command", mock)

        result = mcp_cmd.search_tool(platform="twitter", query="x")

        assert result["success"] is False
        assert "Unsupported platform" in result["error"]
        mock.assert_not_called()

    def test_reports_a_structured_error_when_no_credentials_are_stored(self, monkeypatch):
        monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: None)

        result = mcp_cmd.search_tool(platform="reddit", query="test")

        assert result["success"] is False
        assert result["exitCode"] == 1
        assert "No Reddit credentials found" in result["error"]

    def test_returns_the_same_structured_payload_as_search_json_on_success(
        self, monkeypatch, tmp_path
    ):
        credentials = RedditCredentials(
            client_id="id", client_secret="secret", username="user", password="pass"
        )
        monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: credentials)
        mock_client = MagicMock()
        mock_client.search.return_value = sample_outcome()
        monkeypatch.setattr(search_cmd, "RedditClient", lambda creds: mock_client)

        result = mcp_cmd.search_tool(platform="reddit", query="test", output="results.json")

        assert result["success"] is True
        assert result["exitCode"] == 0
        assert result["platform"] == "reddit"
        assert len(result["items"]) == 1
        assert result["items"][0]["id"] == "abc"
        assert isinstance(result["auditLogEntryId"], str)
        assert (tmp_path / "results.json").exists()
        assert (tmp_path / "auditreach.log.jsonl").exists()

    def test_never_prints_to_the_real_stdout_or_stderr(self, monkeypatch, capsys):
        monkeypatch.setattr(search_cmd, "get_reddit_credentials", lambda: None)

        mcp_cmd.search_tool(platform="reddit", query="test")

        captured = capsys.readouterr()
        assert captured.out == ""
        assert captured.err == ""


class TestAuthStatusTool:
    def test_rejects_an_unsupported_platform(self):
        result = mcp_cmd.auth_status_tool(platform="twitter")
        assert result["success"] is False
        assert "Unsupported platform" in result["error"]

    def test_reports_valid_true_for_working_credentials_with_no_side_effects(
        self, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(
            auth_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="key")
        )
        mock_client = MagicMock()
        monkeypatch.setattr(auth_cmd, "YoutubeClient", lambda creds: mock_client)

        result = mcp_cmd.auth_status_tool(platform="youtube")

        assert result == {"platform": "youtube", "valid": True, "error": None, "success": True, "exitCode": 0}
        mock_client.verify_credentials.assert_called_once()
        assert list(tmp_path.iterdir()) == []

    def test_reports_valid_false_with_an_error_message_for_bad_credentials(self, monkeypatch):
        monkeypatch.setattr(
            auth_cmd, "get_reddit_credentials", lambda: RedditCredentials(
                client_id="id", client_secret="secret", username="user", password="pass"
            ),
        )
        mock_client = MagicMock()
        mock_client.verify_credentials.side_effect = RuntimeError("401 Unauthorized")
        monkeypatch.setattr(auth_cmd, "RedditClient", lambda creds: mock_client)

        result = mcp_cmd.auth_status_tool(platform="reddit")

        assert result["valid"] is False
        assert result["success"] is False
        assert "credential check failed" in result["error"]

    def test_has_no_clear_or_credential_setting_parameter(self):
        """
        auth_status_tool must never be able to set or clear stored
        credentials over MCP -- that stays a local-CLI-only, human-driven
        action via `auditreach auth`.
        """
        import inspect

        params = inspect.signature(mcp_cmd.auth_status_tool).parameters
        assert set(params) == {"platform"}


class TestVerifyLogTool:
    def test_reports_zero_entries_on_a_fresh_path(self, tmp_path):
        log_path = str(tmp_path / "auditreach.log.jsonl")
        result = mcp_cmd.verify_log_tool(path=log_path)
        assert result["valid"] is True
        assert result["total_entries"] == 0
        assert result["success"] is True

    def test_reports_a_broken_chain(self, tmp_path):
        from auditreach.audit_log.hash_chain_writer import append_audit_log_entry

        log_path = str(tmp_path / "auditreach.log.jsonl")
        base_entry = {
            "entry_id": "ar_2026-07-12_abc123",
            "timestamp": "2026-07-12T00:00:00.000Z",
            "platform": "reddit",
            "endpoint": "GET /search",
            "query_params": {"query": "test"},
            "auth_scope": "OAuth script-app grant, read-only, public-subreddit scope",
            "consent_basis": "Reddit API Terms -- public content, official API",
            "api_key_fingerprint": "sha256:abc123",
            "results_returned": 5,
            "prev_entry_hash": None,
        }
        append_audit_log_entry(base_entry, log_path)
        append_audit_log_entry(
            {**base_entry, "entry_id": "ar_2026-07-12_def456", "prev_entry_hash": "sha256:wrong"},
            log_path,
        )

        result = mcp_cmd.verify_log_tool(path=log_path)

        assert result["valid"] is False
        assert result["success"] is False
        assert result["broken_at_entry_id"] == "ar_2026-07-12_def456"


class TestBuildMcpServer:
    def test_exposes_exactly_the_three_documented_tools(self):
        server = mcp_cmd.build_mcp_server()
        tools = asyncio.run(server.list_tools())
        names = {t.name for t in tools}
        assert names == {"search", "auth_status", "verify_log"}

    def test_none_of_the_tools_expose_credential_set_or_clear(self):
        server = mcp_cmd.build_mcp_server()
        tools = asyncio.run(server.list_tools())
        for tool in tools:
            properties = tool.inputSchema.get("properties", {})
            assert "clear" not in properties
            assert "client_secret" not in properties
            assert "password" not in properties
            assert "api_key" not in properties
