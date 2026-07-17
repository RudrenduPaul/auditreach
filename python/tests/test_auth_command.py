"""Ported from test/auth-command.test.ts."""
import json
from unittest.mock import MagicMock

import pytest

from auditreach.auth.credential_store import RedditCredentials, YoutubeCredentials
from auditreach.commands import auth as auth_cmd


@pytest.fixture()
def set_credential_mock(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(auth_cmd, "set_credential", mock)
    return mock


@pytest.fixture()
def delete_credential_mock(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(auth_cmd, "delete_credential", mock)
    return mock


def test_prompts_for_and_stores_all_four_reddit_credential_fields(monkeypatch, set_credential_mock):
    monkeypatch.setattr(
        auth_cmd, "prompt_text", MagicMock(side_effect=["client-id-value", "username-value"])
    )
    monkeypatch.setattr(
        auth_cmd, "prompt_secret", MagicMock(side_effect=["client-secret-value", "password-value"])
    )

    auth_cmd.run_auth_command(platform="reddit")

    set_credential_mock.assert_any_call("reddit", "clientId", "client-id-value")
    set_credential_mock.assert_any_call("reddit", "clientSecret", "client-secret-value")
    set_credential_mock.assert_any_call("reddit", "username", "username-value")
    set_credential_mock.assert_any_call("reddit", "password", "password-value")


def test_prompts_for_and_stores_the_youtube_api_key_via_masked_prompt(
    monkeypatch, set_credential_mock
):
    prompt_text_mock = MagicMock()
    monkeypatch.setattr(auth_cmd, "prompt_text", prompt_text_mock)
    monkeypatch.setattr(auth_cmd, "prompt_secret", MagicMock(return_value="api-key-value"))

    auth_cmd.run_auth_command(platform="youtube")

    set_credential_mock.assert_any_call("youtube", "apiKey", "api-key-value")
    prompt_text_mock.assert_not_called()


def test_uses_the_masked_prompt_for_every_secret_field(monkeypatch, set_credential_mock):
    prompt_text_mock = MagicMock(side_effect=["client-id-value", "username-value"])
    prompt_secret_mock = MagicMock(side_effect=["client-secret-value", "password-value"])
    monkeypatch.setattr(auth_cmd, "prompt_text", prompt_text_mock)
    monkeypatch.setattr(auth_cmd, "prompt_secret", prompt_secret_mock)

    auth_cmd.run_auth_command(platform="reddit")

    assert prompt_secret_mock.call_count == 2
    assert prompt_text_mock.call_count == 2


def test_clears_all_four_reddit_credential_fields_with_clear(
    delete_credential_mock, set_credential_mock
):
    auth_cmd.run_auth_command(platform="reddit", clear=True)

    delete_credential_mock.assert_any_call("reddit", "clientId")
    delete_credential_mock.assert_any_call("reddit", "clientSecret")
    delete_credential_mock.assert_any_call("reddit", "username")
    delete_credential_mock.assert_any_call("reddit", "password")
    set_credential_mock.assert_not_called()


def test_clears_the_youtube_api_key_with_clear(delete_credential_mock):
    auth_cmd.run_auth_command(platform="youtube", clear=True)
    delete_credential_mock.assert_any_call("youtube", "apiKey")


class TestVerify:
    @pytest.fixture(autouse=True)
    def _chdir_tmp(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        return tmp_path

    def test_reports_success_for_valid_reddit_credentials_with_no_side_effects(
        self, monkeypatch, tmp_path, set_credential_mock
    ):
        monkeypatch.setattr(
            auth_cmd,
            "get_reddit_credentials",
            lambda: RedditCredentials(
                client_id="id", client_secret="secret", username="user", password="pass"
            ),
        )
        mock_client = MagicMock()
        monkeypatch.setattr(auth_cmd, "RedditClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="reddit", verify=True)

        mock_client.verify_credentials.assert_called_once()
        assert exit_code == 0
        set_credential_mock.assert_not_called()
        assert list(tmp_path.iterdir()) == []

    def test_reports_a_clear_failure_message_for_invalid_reddit_credentials(
        self, monkeypatch, tmp_path, capsys
    ):
        monkeypatch.setattr(
            auth_cmd,
            "get_reddit_credentials",
            lambda: RedditCredentials(
                client_id="id", client_secret="secret", username="user", password="pass"
            ),
        )
        mock_client = MagicMock()
        mock_client.verify_credentials.side_effect = RuntimeError(
            'Reddit OAuth token request failed: 401 Unauthorized. Check your credentials '
            'with "auditreach auth --platform reddit".'
        )
        monkeypatch.setattr(auth_cmd, "RedditClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="reddit", verify=True)

        assert exit_code == 1
        assert "credential check failed" in capsys.readouterr().err
        assert list(tmp_path.iterdir()) == []

    def test_exits_1_when_no_reddit_credentials_stored_without_calling_verify(
        self, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(auth_cmd, "get_reddit_credentials", lambda: None)
        mock_client = MagicMock()
        monkeypatch.setattr(auth_cmd, "RedditClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="reddit", verify=True)

        assert exit_code == 1
        mock_client.verify_credentials.assert_not_called()
        assert list(tmp_path.iterdir()) == []

    def test_reports_success_for_valid_youtube_credentials_with_no_side_effects(
        self, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(
            auth_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="key")
        )
        mock_client = MagicMock()
        monkeypatch.setattr(auth_cmd, "YoutubeClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="youtube", verify=True)

        mock_client.verify_credentials.assert_called_once()
        assert exit_code == 0
        assert list(tmp_path.iterdir()) == []

    def test_reports_a_clear_failure_message_for_invalid_youtube_credentials(
        self, monkeypatch, capsys
    ):
        monkeypatch.setattr(
            auth_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="bad-key")
        )
        mock_client = MagicMock()
        mock_client.verify_credentials.side_effect = RuntimeError(
            "API key not valid. Please pass a valid API key."
        )
        monkeypatch.setattr(auth_cmd, "YoutubeClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="youtube", verify=True)

        assert exit_code == 1
        assert "credential check failed" in capsys.readouterr().err

    def test_exits_1_when_no_youtube_credentials_stored_without_calling_verify(self, monkeypatch):
        monkeypatch.setattr(auth_cmd, "get_youtube_credentials", lambda: None)
        mock_client = MagicMock()
        monkeypatch.setattr(auth_cmd, "YoutubeClient", lambda creds: mock_client)

        exit_code = auth_cmd.run_auth_command(platform="youtube", verify=True)

        assert exit_code == 1
        mock_client.verify_credentials.assert_not_called()

    class TestJsonOutput:
        def test_prints_one_parseable_json_object_for_valid_credentials(self, monkeypatch, capsys):
            monkeypatch.setattr(
                auth_cmd,
                "get_reddit_credentials",
                lambda: RedditCredentials(
                    client_id="id", client_secret="secret", username="user", password="pass"
                ),
            )
            mock_client = MagicMock()
            monkeypatch.setattr(auth_cmd, "RedditClient", lambda creds: mock_client)

            exit_code = auth_cmd.run_auth_command(platform="reddit", verify=True, json_output=True)

            printed = json.loads(capsys.readouterr().out)
            assert printed == {"platform": "reddit", "valid": True, "error": None}
            assert exit_code == 0

        def test_prints_one_parseable_json_object_with_the_error_never_throwing(
            self, monkeypatch, capsys
        ):
            monkeypatch.setattr(
                auth_cmd, "get_youtube_credentials", lambda: YoutubeCredentials(api_key="bad-key")
            )
            mock_client = MagicMock()
            mock_client.verify_credentials.side_effect = RuntimeError(
                "API key not valid. Please pass a valid API key."
            )
            monkeypatch.setattr(auth_cmd, "YoutubeClient", lambda creds: mock_client)

            exit_code = auth_cmd.run_auth_command(platform="youtube", verify=True, json_output=True)

            printed = json.loads(capsys.readouterr().out)
            assert printed["valid"] is False
            assert "credential check failed" in printed["error"]
            assert exit_code == 1
