#!/usr/bin/env python3
"""
Thin argument-parsing wrapper over the commands/ modules, matching
src/cli.ts's `commander`-based flag set. This port uses the stdlib
`argparse` to avoid a CLI-framework dependency (the same choice skillguard's
Python port made over TypeScript's `commander`). Console entry point:
`auditreach <command> [options]`, installed via the `auditreach`
console-script defined in python/pyproject.toml.
"""
from __future__ import annotations

import argparse
import sys
from typing import List, NoReturn

from . import __version__
from .clients.reddit_client import DEFAULT_LIMIT as REDDIT_DEFAULT_LIMIT
from .clients.reddit_client import MAX_LIMIT as REDDIT_MAX_LIMIT
from .clients.youtube_client import MAX_MAX_RESULTS as YOUTUBE_MAX_MAX_RESULTS
from .commands.auth import run_auth_command
from .commands.mcp import run_mcp_command
from .commands.search import run_search_command
from .commands.verify_log import run_verify_log_command


def _fail(message: str) -> NoReturn:
    sys.stderr.write(message + "\n")
    sys.exit(1)


def _assert_platform(value: str) -> str:
    if value not in ("reddit", "youtube"):
        sys.stderr.write(f'Unsupported platform "{value}". Supported in v0.1: reddit, youtube.\n')
        sys.stderr.write("X (Twitter) support is deferred to v0.2 -- see README for why.\n")
        sys.exit(1)
    return value


def _positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError:
        parsed = -1
    if parsed <= 0:
        raise argparse.ArgumentTypeError(f'--max-results must be a positive integer, got "{value}"')
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="auditreach",
        description="Official-API-only, BYOK research CLI with a hash-chained compliance audit log",
    )
    parser.add_argument("--version", action="version", version=f"auditreach {__version__}")

    subparsers = parser.add_subparsers(dest="command")

    search_parser = subparsers.add_parser("search", help="Search a platform using its official API only")
    search_parser.add_argument("--platform", required=True, help="reddit | youtube")
    search_parser.add_argument("--query", help="search query")
    search_parser.add_argument(
        "--subreddit", help="restrict search to one subreddit (reddit only)"
    )
    search_parser.add_argument(
        "--channel", help="restrict search to one channel, e.g. @AnthropicAI (youtube only)"
    )
    search_parser.add_argument(
        "--since",
        help="only results published after this date, e.g. 2026-06-01 (youtube only)",
    )
    search_parser.add_argument(
        "--max-results",
        type=_positive_int,
        help=(
            f"maximum results to return (default: {REDDIT_DEFAULT_LIMIT}; platform caps: "
            f"{REDDIT_MAX_LIMIT} Reddit / {YOUTUBE_MAX_MAX_RESULTS} YouTube)"
        ),
    )
    search_parser.add_argument(
        "--before", help="page results before this Reddit fullname cursor, e.g. t3_abc123 (reddit only)"
    )
    search_parser.add_argument(
        "--after", help="page results after this Reddit fullname cursor, e.g. t3_abc123 (reddit only)"
    )
    search_parser.add_argument("--output", help="write full results JSON to this path")
    search_parser.add_argument(
        "--json",
        action="store_true",
        help=(
            "print a single structured JSON object to stdout instead of human-readable "
            "text (for scripts and agents)"
        ),
    )

    auth_parser = subparsers.add_parser(
        "auth", help="Set up or clear BYOK credentials for a platform (stored in your OS keychain)"
    )
    auth_parser.add_argument("--platform", required=True, help="reddit | youtube")
    auth_parser.add_argument(
        "--clear", action="store_true", help="delete stored credentials for this platform"
    )
    auth_parser.add_argument(
        "--verify",
        action="store_true",
        help=(
            "verify stored credentials are valid without running a search (no results "
            "file, no audit-log entry)"
        ),
    )
    auth_parser.add_argument(
        "--json",
        action="store_true",
        help="with --verify, print a structured JSON result instead of human-readable text (for scripts and agents)",
    )

    verify_log_parser = subparsers.add_parser(
        "verify-log", help="Verify the local hash-chained audit log has not been tampered with"
    )
    verify_log_parser.add_argument("--path", help="path to the audit log file")
    verify_log_parser.add_argument(
        "--json",
        action="store_true",
        help="print a structured JSON result instead of human-readable text (for scripts and agents)",
    )

    subparsers.add_parser(
        "mcp",
        help=(
            "Run an MCP (Model Context Protocol) server over stdio, exposing "
            "search / auth_status / verify_log as agent-callable tools"
        ),
    )

    return parser


def run_cli(argv: List[str]) -> int:
    """
    `argv` follows the sys.argv convention: argv[0] is the program name, the
    real arguments start at argv[1]. Returns the process exit code.
    """
    parser = build_parser()
    args = parser.parse_args(argv[1:])

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "search":
        platform = _assert_platform(args.platform)
        return run_search_command(
            platform=platform,
            query=args.query,
            subreddit=args.subreddit,
            channel=args.channel,
            since=args.since,
            max_results=args.max_results,
            before=args.before,
            after=args.after,
            output=args.output,
            json_output=args.json,
        )

    if args.command == "auth":
        platform = _assert_platform(args.platform)
        return run_auth_command(
            platform=platform, clear=args.clear, verify=args.verify, json_output=args.json
        )

    if args.command == "verify-log":
        return run_verify_log_command(path=args.path, json_output=args.json)

    if args.command == "mcp":
        return run_mcp_command()

    parser.print_help()
    return 0


def main() -> None:
    try:
        code = run_cli(sys.argv)
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 -- top-level crash guard, mirrors src/cli.ts's catch-all
        sys.stderr.write(str(error) + "\n")
        sys.exit(1)
    else:
        sys.exit(code)


if __name__ == "__main__":
    main()
