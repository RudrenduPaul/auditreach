"""Ported from src/commands/auth.ts."""
from __future__ import annotations

import json
import sys
from typing import Optional

from ..auth.credential_store import (
    delete_credential,
    get_reddit_credentials,
    get_youtube_credentials,
    set_credential,
)
from ..clients.reddit_client import RedditClient
from ..clients.youtube_client import YoutubeClient
from ..types import Platform
from ..util.prompt import prompt_secret, prompt_text


def run_auth_command(
    platform: Platform,
    clear: bool = False,
    verify: bool = False,
    json_output: bool = False,
) -> int:
    if clear:
        _clear_credentials(platform)
        return 0

    if verify:
        return _verify_credentials(platform, json_output)

    if platform == "reddit":
        print("Setting up Reddit API credentials (OAuth script app).")
        print('Create one at https://www.reddit.com/prefs/apps -- choose app type "script".\n')
        client_id = prompt_text("Client ID: ")
        client_secret = prompt_secret("Client secret: ")
        username = prompt_text("Reddit username: ")
        password = prompt_secret("Reddit password: ")

        set_credential("reddit", "clientId", client_id)
        set_credential("reddit", "clientSecret", client_secret)
        set_credential("reddit", "username", username)
        set_credential("reddit", "password", password)

        print("\nReddit credentials stored in your OS keychain.")
        print("Rate limits: Reddit's official API is generally workable for most research volumes.")
    else:
        print("Setting up YouTube Data API v3 credentials.")
        print("Create an API key at https://console.cloud.google.com/apis/credentials\n")
        api_key = prompt_secret("API key: ")
        set_credential("youtube", "apiKey", api_key)

        print("\nYouTube credentials stored in your OS keychain.")
        print("Rate limits: quota-based (10,000 units/day default), generally workable.")

    return 0


def _clear_credentials(platform: Platform) -> None:
    if platform == "reddit":
        delete_credential("reddit", "clientId")
        delete_credential("reddit", "clientSecret")
        delete_credential("reddit", "username")
        delete_credential("reddit", "password")
    else:
        delete_credential("youtube", "apiKey")
    print(f"Cleared stored credentials for {platform}.")


def _verify_credentials(platform: Platform, json_output: bool) -> int:
    """
    Standalone credential check for `auditreach auth --verify`. Reuses each
    client's token-fetch/auth-check logic (never duplicates it) and performs
    a single minimal authenticated request. Unlike `search`, this never
    requires --query, never writes a results file, and never appends an
    audit-log entry -- it only reports whether the stored credentials work.
    """
    try:
        if platform == "reddit":
            credentials = get_reddit_credentials()
            if not credentials:
                _report(
                    json_output,
                    platform,
                    False,
                    'No Reddit credentials found. Run "auditreach auth --platform reddit" first.',
                )
                return 1
            RedditClient(credentials).verify_credentials()
        else:
            youtube_credentials = get_youtube_credentials()
            if not youtube_credentials:
                _report(
                    json_output,
                    platform,
                    False,
                    'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
                )
                return 1
            YoutubeClient(youtube_credentials).verify_credentials()
        _report(json_output, platform, True)
        return 0
    except Exception as error:  # noqa: BLE001 -- mirrors src/commands/auth.ts's catch-all
        _report(
            json_output,
            platform,
            False,
            f"{platform.capitalize()} credential check failed: {error}",
        )
        return 1


def _report(json_output: bool, platform: Platform, valid: bool, error: Optional[str] = None) -> None:
    if json_output:
        sys.stdout.write(
            json.dumps({"platform": platform, "valid": valid, "error": error}, indent=2) + "\n"
        )
        return
    if valid:
        print(f"{platform.capitalize()} credentials are valid.")
    else:
        print(error, file=sys.stderr)
