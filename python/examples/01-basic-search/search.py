#!/usr/bin/env python3
"""
01 -- basic search.

The simplest possible use of the auditreach library: fetch stored BYOK
credentials, call RedditClient.search() (falling back to YoutubeClient if
only YouTube credentials are configured), and print the results.

This makes a real network call against Reddit's or YouTube's official API,
so it needs real credentials to actually run:

    auditreach auth --platform reddit
    # or
    auditreach auth --platform youtube
    # or set AUDITREACH_REDDIT_CLIENT_ID / AUDITREACH_REDDIT_CLIENT_SECRET /
    # AUDITREACH_REDDIT_USERNAME / AUDITREACH_REDDIT_PASSWORD, or
    # AUDITREACH_YOUTUBE_API_KEY, in the environment.

If neither is configured, this script prints setup instructions and exits
cleanly (code 0) rather than failing -- there is no bundled fixture to fall
back to, since auditreach is an API client, not a local scanner.

Run:
    python3 examples/01-basic-search/search.py
"""
from auditreach import (
    RedditClient,
    RedditSearchOptions,
    YoutubeClient,
    YoutubeSearchOptions,
    get_reddit_credentials,
    get_youtube_credentials,
)


def main() -> None:
    reddit_credentials = get_reddit_credentials()
    youtube_credentials = get_youtube_credentials()

    if not reddit_credentials and not youtube_credentials:
        print("No BYOK credentials configured for either platform.")
        print("Run `auditreach auth --platform reddit` or `auditreach auth --platform youtube`,")
        print("or set the AUDITREACH_REDDIT_* / AUDITREACH_YOUTUBE_API_KEY env vars, then re-run this script.")
        return

    if reddit_credentials:
        print("--- Reddit search ---")
        outcome = RedditClient(reddit_credentials).search(
            RedditSearchOptions(query="agent memory poisoning", subreddit="MachineLearning")
        )
        _print_outcome(outcome)

    if youtube_credentials:
        print("--- YouTube search ---")
        outcome = YoutubeClient(youtube_credentials).search(
            YoutubeSearchOptions(query="agent memory poisoning")
        )
        _print_outcome(outcome)


def _print_outcome(outcome) -> None:
    print(f"endpoint:      {outcome.endpoint}")
    print(f"consent basis: {outcome.consent_basis}")
    print(f"results:       {len(outcome.items)}")
    for item in outcome.items[:5]:
        print(f"  - {item.title!r} ({item.url})")
    print()


if __name__ == "__main__":
    main()
