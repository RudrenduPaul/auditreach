"""Ported from test/credential-store.test.ts, plus coverage for this port's
added env-var override path (not present in the TypeScript original)."""
import os

import keyring
import keyring.errors
import pytest

from auditreach.auth.credential_store import (
    delete_credential,
    get_credential,
    get_reddit_credentials,
    get_youtube_credentials,
    set_credential,
)


class FakeKeyring:
    """In-memory stand-in for the OS keychain backend, matching the TS test
    suite's own Map-backed mock of @napi-rs/keyring's Entry."""

    def __init__(self):
        self.store = {}

    def set_password(self, service, account, value):
        self.store[(service, account)] = value

    def get_password(self, service, account):
        key = (service, account)
        if key not in self.store:
            raise keyring.errors.PasswordDeleteError("no password found")
        return self.store[key]

    def delete_password(self, service, account):
        self.store.pop((service, account), None)


@pytest.fixture()
def fake_keyring(monkeypatch):
    fake = FakeKeyring()
    monkeypatch.setattr(keyring, "set_password", fake.set_password)
    monkeypatch.setattr(keyring, "get_password", fake.get_password)
    monkeypatch.setattr(keyring, "delete_password", fake.delete_password)
    return fake


def test_round_trips_a_stored_credential(fake_keyring):
    set_credential("youtube", "apiKey", "my-secret-key")
    assert get_credential("youtube", "apiKey") == "my-secret-key"


def test_returns_none_for_a_credential_that_was_never_set(fake_keyring):
    assert get_credential("reddit", "clientId") is None


def test_returns_none_after_a_credential_is_deleted(fake_keyring):
    set_credential("reddit", "clientId", "abc")
    delete_credential("reddit", "clientId")
    assert get_credential("reddit", "clientId") is None


def test_get_reddit_credentials_returns_none_unless_all_four_fields_are_set(fake_keyring):
    set_credential("reddit", "clientId", "id")
    set_credential("reddit", "clientSecret", "secret")
    assert get_reddit_credentials() is None

    set_credential("reddit", "username", "user")
    set_credential("reddit", "password", "pass")
    creds = get_reddit_credentials()
    assert creds is not None
    assert creds.client_id == "id"
    assert creds.client_secret == "secret"
    assert creds.username == "user"
    assert creds.password == "pass"


def test_get_youtube_credentials_returns_none_unless_api_key_is_set(fake_keyring):
    assert get_youtube_credentials() is None
    set_credential("youtube", "apiKey", "key123")
    assert get_youtube_credentials().api_key == "key123"


def test_namespaces_credentials_by_platform(fake_keyring):
    set_credential("reddit", "clientId", "reddit-value")
    set_credential("youtube", "apiKey", "youtube-value")
    assert get_credential("reddit", "clientId") == "reddit-value"
    assert get_credential("youtube", "apiKey") == "youtube-value"


def test_env_var_override_is_checked_before_the_keychain(fake_keyring, monkeypatch):
    """
    Python-port-only behavior: an env var takes precedence over whatever is
    stored in the OS keychain, so a headless CI runner or agent sandbox
    (neither of which has an interactive `auditreach auth` prompt or
    necessarily a keychain daemon at all) can still supply BYOK credentials.
    """
    set_credential("youtube", "apiKey", "from-keychain")
    monkeypatch.setenv("AUDITREACH_YOUTUBE_API_KEY", "from-env")
    assert get_credential("youtube", "apiKey") == "from-env"


def test_falls_back_to_keychain_when_env_var_is_unset(fake_keyring):
    set_credential("youtube", "apiKey", "from-keychain")
    assert os.environ.get("AUDITREACH_YOUTUBE_API_KEY") is None
    assert get_credential("youtube", "apiKey") == "from-keychain"
