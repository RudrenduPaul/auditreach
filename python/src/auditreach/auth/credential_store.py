"""
All credential I/O goes through this module. It is the one place allowed
to touch a raw secret -- callers get it back only to hand directly to an
API client's constructor, never to log, print, or serialize it.

Ported from src/auth/credential-store.ts, which stores credentials
exclusively in the OS keychain via the `@napi-rs/keyring` npm package. This
Python port uses the `keyring` package (the standard cross-platform OS
keychain library for Python -- Keychain on macOS, Credential Manager on
Windows, Secret Service/kwallet on Linux), the direct Python equivalent of
`@napi-rs/keyring`.

Deliberate, documented addition beyond the TypeScript version: this port
also checks a platform-specific environment variable *before* falling back
to the OS keychain (AUDITREACH_REDDIT_CLIENT_ID, AUDITREACH_REDDIT_CLIENT_SECRET,
AUDITREACH_REDDIT_USERNAME, AUDITREACH_REDDIT_PASSWORD, AUDITREACH_YOUTUBE_API_KEY).
The OS keychain has no meaningful equivalent in a headless CI runner or a
containerized agent sandbox, where `auditreach auth` can't run an
interactive prompt and there is often no keychain daemon running at all --
the env var path lets those callers supply BYOK credentials without one.
Nothing is ever hardcoded; both paths require the caller to have already
provisioned the credential themselves. See docs/concepts.md for the full
precedence rule.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import keyring
import keyring.errors

from ..types import Platform

SERVICE_NAME = "auditreach"

_ENV_VAR_NAMES = {
    ("reddit", "clientId"): "AUDITREACH_REDDIT_CLIENT_ID",
    ("reddit", "clientSecret"): "AUDITREACH_REDDIT_CLIENT_SECRET",
    ("reddit", "username"): "AUDITREACH_REDDIT_USERNAME",
    ("reddit", "password"): "AUDITREACH_REDDIT_PASSWORD",
    ("youtube", "apiKey"): "AUDITREACH_YOUTUBE_API_KEY",
}


def _account_name(platform: Platform, key: str) -> str:
    return f"{platform}:{key}"


def set_credential(platform: Platform, key: str, value: str) -> None:
    keyring.set_password(SERVICE_NAME, _account_name(platform, key), value)


def get_credential(platform: Platform, key: str) -> Optional[str]:
    env_var = _ENV_VAR_NAMES.get((platform, key))
    if env_var:
        from_env = os.environ.get(env_var)
        if from_env:
            return from_env
    try:
        return keyring.get_password(SERVICE_NAME, _account_name(platform, key))
    except keyring.errors.KeyringError:
        return None


def delete_credential(platform: Platform, key: str) -> bool:
    try:
        keyring.delete_password(SERVICE_NAME, _account_name(platform, key))
        return True
    except keyring.errors.KeyringError:
        return False


@dataclass
class RedditCredentials:
    client_id: str
    client_secret: str
    username: str
    password: str


@dataclass
class YoutubeCredentials:
    api_key: str


def get_reddit_credentials() -> Optional[RedditCredentials]:
    client_id = get_credential("reddit", "clientId")
    client_secret = get_credential("reddit", "clientSecret")
    username = get_credential("reddit", "username")
    password = get_credential("reddit", "password")
    if not client_id or not client_secret or not username or not password:
        return None
    return RedditCredentials(
        client_id=client_id, client_secret=client_secret, username=username, password=password
    )


def get_youtube_credentials() -> Optional[YoutubeCredentials]:
    api_key = get_credential("youtube", "apiKey")
    if not api_key:
        return None
    return YoutubeCredentials(api_key=api_key)
