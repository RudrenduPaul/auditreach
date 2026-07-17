#!/usr/bin/env python3
"""
03 -- agent-native JSON + BYOK credential precedence.

Two parts:

1. credential_precedence_demo() -- fully self-contained, no network calls.
   Demonstrates this port's env-var-before-keychain precedence rule (see
   docs/concepts.md#byok-credential-precedence): an AUDITREACH_YOUTUBE_API_KEY
   env var set for this process is read back by get_credential() even
   though nothing was ever written to the OS keychain.

2. agent_report() -- the use case auditreach's --json output and this
   library API are actually designed for: an agent framework calling
   search() in-process (no CLI subprocess) and turning the structured
   result into a pre-fetch decision it can act on programmatically. Needs
   real Reddit or YouTube credentials to run (same as example 01) -- prints
   setup instructions and returns early if none are configured.

Run:
    python3 examples/03-agent-native-json/agent_report.py
"""
import json
import os

from auditreach import (
    RedditClient,
    RedditSearchOptions,
    get_credential,
    get_reddit_credentials,
    get_youtube_credentials,
)


def credential_precedence_demo() -> None:
    print("--- BYOK credential precedence (env var before OS keychain) ---")
    os.environ["AUDITREACH_YOUTUBE_API_KEY"] = "demo-key-from-env-var"
    try:
        # No keychain entry exists for this account -- get_credential() still
        # returns a value because the env var is checked first.
        value = get_credential("youtube", "apiKey")
        print(f"get_credential('youtube', 'apiKey') -> {value!r} (read from AUDITREACH_YOUTUBE_API_KEY)")
    finally:
        del os.environ["AUDITREACH_YOUTUBE_API_KEY"]
    print()


def agent_report() -> None:
    print("--- agent-native pre-fetch report ---")
    reddit_credentials = get_reddit_credentials()
    youtube_credentials = get_youtube_credentials()

    if not reddit_credentials and not youtube_credentials:
        print("No BYOK credentials configured -- skipping the live search call.")
        print("Run `auditreach auth --platform reddit` or set the AUDITREACH_REDDIT_* env vars to try this part.")
        return

    if not reddit_credentials:
        print("No Reddit credentials configured -- skipping (this example only covers Reddit).")
        return

    outcome = RedditClient(reddit_credentials).search(
        RedditSearchOptions(query="agent memory poisoning", subreddit="MachineLearning")
    )

    report = {
        "platform": outcome.platform,
        "consent_basis": outcome.consent_basis,
        "result_count": len(outcome.items),
        "top_result": (
            {"title": outcome.items[0].title, "url": outcome.items[0].url}
            if outcome.items
            else None
        ),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    credential_precedence_demo()
    agent_report()
