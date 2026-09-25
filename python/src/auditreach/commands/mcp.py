"""
MCP (Model Context Protocol) server exposing auditreach's existing command
logic as agent-callable tools over stdio. Ported conceptually from the
TypeScript distribution's equivalent `mcp` subcommand -- both distributions
expose the same 3 tools (`search`, `auth_status`, `verify_log`) with the
same read-only `auth_status` semantics: this server never exposes
credential set/clear over MCP, only the local, human-driven
`auditreach auth` command can do that.

Built on the official MCP Python SDK (https://pypi.org/project/mcp/, PyPI
package `mcp`) -- never a hand-rolled JSON-RPC transport. Every tool below
is a thin wrapper that captures the stdout/stderr of the real
`run_*_command` function from this package's `commands/` modules and
reshapes it into a structured dict; none of the three commands' underlying
logic is reimplemented here.
"""
from __future__ import annotations

import contextlib
import io
import json
from typing import Any, Dict, Optional

from ..types import Platform
from .auth import run_auth_command
from .search import run_search_command
from .verify_log import run_verify_log_command

SUPPORTED_PLATFORMS = ("reddit", "youtube")


def _unsupported_platform_error(platform: str) -> Dict[str, Any]:
    return {
        "success": False,
        "exitCode": 1,
        "error": (
            f'Unsupported platform "{platform}". Supported in v0.1: reddit, youtube. '
            "X (Twitter) support is deferred to v0.2 -- see README for why."
        ),
    }


def _run_json_command(command, **kwargs: Any) -> Dict[str, Any]:
    """
    Runs one of the existing `run_*_command` functions with `json_output`
    forced on and its stdout/stderr captured instead of printed to the
    terminal, then reshapes the result into a dict an MCP tool handler can
    return as structured content. Some commands (e.g. `search`, on a
    missing-credentials or missing-query error) exit non-zero without ever
    printing JSON -- that path is reported as `{"success": False, "error":
    <stderr text>}` rather than raising, since a tool call failing is a
    normal, expected outcome for an MCP client to handle, not a server
    crash.
    """
    stdout = io.StringIO()
    stderr = io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        exit_code = command(json_output=True, **kwargs)

    out_text = stdout.getvalue().strip()
    if out_text:
        try:
            payload = json.loads(out_text)
        except json.JSONDecodeError:
            payload = {"raw": out_text}
        if isinstance(payload, dict):
            payload.setdefault("success", exit_code == 0)
            payload.setdefault("exitCode", exit_code)
            return payload
        return {"success": exit_code == 0, "exitCode": exit_code, "result": payload}

    return {
        "success": exit_code == 0,
        "exitCode": exit_code,
        "error": stderr.getvalue().strip() or None,
    }


def search_tool(
    platform: str,
    query: Optional[str] = None,
    subreddit: Optional[str] = None,
    channel: Optional[str] = None,
    since: Optional[str] = None,
    max_results: Optional[int] = None,
    before: Optional[str] = None,
    after: Optional[str] = None,
    output: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search a platform using its official API only. Same parameters and
    behavior as the CLI's `auditreach search` command (see
    `auditreach.commands.search.run_search_command`), including writing a
    results file and appending a hash-chained audit-log entry on success.
    Returns the same structured shape as `search --json`.
    """
    if platform not in SUPPORTED_PLATFORMS:
        return _unsupported_platform_error(platform)
    return _run_json_command(
        run_search_command,
        platform=platform,
        query=query,
        subreddit=subreddit,
        channel=channel,
        since=since,
        max_results=max_results,
        before=before,
        after=after,
        output=output,
    )


def auth_status_tool(platform: str) -> Dict[str, Any]:
    """
    Read-only check of whether BYOK credentials are already stored and
    valid for a platform -- the MCP equivalent of `auditreach auth
    --platform <p> --verify --json`. Deliberately takes no `clear` or
    credential-setting parameter: setting or clearing stored credentials
    stays a local-CLI-only, human-driven action and is never exposed over
    MCP.
    """
    if platform not in SUPPORTED_PLATFORMS:
        return _unsupported_platform_error(platform)
    return _run_json_command(run_auth_command, platform=platform, verify=True)


def verify_log_tool(path: Optional[str] = None) -> Dict[str, Any]:
    """
    Verify the local hash-chained audit log has not been tampered with.
    Same as the CLI's `auditreach verify-log --json`
    (see `auditreach.commands.verify_log.run_verify_log_command`).
    """
    return _run_json_command(run_verify_log_command, path=path)


def build_mcp_server() -> "Any":
    """
    Builds (but does not run) the FastMCP server exposing exactly the 3
    tools above. Split out from `run_mcp_command` so tests can construct
    and introspect the server (e.g. `list_tools()`) without blocking on a
    stdio transport.
    """
    # Imported lazily (not at module top) so that `import auditreach` and
    # the other 3 subcommands never pay the mcp SDK's import cost (it pulls
    # in anyio, pydantic, etc.) -- only `auditreach mcp` itself does.
    try:
        from mcp.server.mcpserver import MCPServer as FastMCP  # mcp 2.x
    except ImportError:
        from mcp.server.fastmcp import FastMCP  # mcp 1.x

    server = FastMCP(
        name="auditreach",
        instructions=(
            "Official-API-only, BYOK research tools for Reddit and YouTube, backed by "
            "a local, tamper-evident, hash-chained audit log. Credentials must already "
            "be configured locally via `auditreach auth` -- this server never sets or "
            "clears credentials."
        ),
    )

    server.add_tool(
        search_tool,
        name="search",
        description=(
            "Search Reddit or YouTube through its official, documented API only "
            "(no scraping, no cookie import, no logged-in-human impersonation) using "
            "your own BYOK credentials, and return matching posts/videos as structured "
            "JSON. Call this whenever an agent needs recent or historical public "
            "content from one of these two platforms for research, monitoring, or "
            "compliance review; do not call it for platforms other than reddit/youtube "
            "(it returns a clear unsupported-platform error rather than guessing) or "
            "when you only need to check whether credentials work (use auth_status "
            "for that, it's cheaper and makes no search API call). "
            "Prerequisite: BYOK credentials for the target platform must already be "
            "stored locally via `auditreach auth --platform <platform>` -- this tool "
            "never sets up credentials itself and will fail fast with a "
            "'No <platform> credentials found' error if they are missing. "
            "Side effects: makes a live network call to Reddit's or YouTube's official "
            "API (consuming that platform's rate limit/quota), and on success appends "
            "one tamper-evident, hash-chained entry to the local audit log recording "
            "platform, endpoint, scope, and timestamp -- this tool is not read-only and "
            "not idempotent in the sense that every successful call grows the audit "
            "log by one entry, though repeating an identical search is otherwise safe "
            "and does not mutate any remote state. If `output` is given, the full "
            "result set is also written to that local file path. "
            "Parameters: platform (required, 'reddit' or 'youtube'); query (search "
            "terms, required for reddit, optional for youtube); subreddit (reddit "
            "only, restrict to one subreddit, e.g. 'MachineLearning'); channel "
            "(youtube only, restrict to one channel handle, e.g. '@AnthropicAI'); "
            "since (youtube only, ISO date like '2026-06-01', only results published "
            "after this date); max_results (int, default 25, capped at 100 for reddit "
            "and 50 for youtube); before/after (reddit only, fullname pagination "
            "cursors like 't3_abc123'); output (optional local file path to also write "
            "the full JSON results to). "
            "Example calls: {\"platform\": \"reddit\", \"query\": \"prompt injection\", "
            "\"subreddit\": \"MachineLearning\", \"max_results\": 20}; "
            "{\"platform\": \"youtube\", \"channel\": \"@AnthropicAI\", \"since\": "
            "\"2026-06-01\", \"max_results\": 10}. "
            "Returns a JSON object with `success` (bool), `exitCode` (int), and on "
            "success a `results` array of items shaped like {id, title, url, "
            "createdAt, author, score, extra}; on failure an `error` string explains "
            "what went wrong (missing credentials, missing query, unsupported "
            "platform, or an upstream API error) instead of raising an exception."
        ),
    )
    server.add_tool(
        auth_status_tool,
        name="auth_status",
        description=(
            "Read-only check of whether BYOK credentials are already stored and "
            "still valid for a platform (equivalent to `auditreach auth --platform "
            "<p> --verify --json`). Call this before `search` to confirm credentials "
            "are configured and working, or whenever an agent needs to report "
            "connection health without touching the search API or the audit log. "
            "This tool deliberately exposes no way to set or clear credentials over "
            "MCP -- provisioning or wiping stored credentials stays a local, "
            "human-driven action via `auditreach auth --platform <p>` on the "
            "machine's own terminal, never something a calling agent can trigger "
            "remotely. Behaviorally, this is read-only: it makes a lightweight "
            "verification call against the platform's API to confirm the stored "
            "credential still works, but it never writes to the audit log and never "
            "mutates local credential storage. It is idempotent and safe to call "
            "repeatedly. "
            "Parameters: platform (required, 'reddit' or 'youtube'; any other value "
            "returns a structured unsupported-platform error rather than failing "
            "silently). Example calls: {\"platform\": \"reddit\"}; "
            "{\"platform\": \"youtube\"}. "
            "Returns a JSON object with `success` (bool) and `exitCode` (int); on "
            "success the payload confirms credentials are present and valid, on "
            "failure `error` explains what's missing (e.g. no credentials stored, or "
            "the stored credential was rejected by the platform)."
        ),
    )
    server.add_tool(
        verify_log_tool,
        name="verify_log",
        description=(
            "Verify that the local hash-chained audit log has not been tampered "
            "with, by walking every entry and confirming each one's hash correctly "
            "chains to the previous entry (equivalent to `auditreach verify-log "
            "--json`). Call this to prove compliance/audit integrity before sharing "
            "the log with a third party, after any manual edit to the log file, or "
            "periodically as a trust check -- it does not need to run before every "
            "search. This tool is fully read-only: it opens and reads the log file "
            "but never writes to it, is idempotent, and produces the same verdict on "
            "repeated calls against an unchanged file. Prerequisite: an audit log "
            "file must already exist (one is created automatically the first time "
            "`search` succeeds); pointing this at a path with no log file returns a "
            "structured failure rather than raising. "
            "Parameters: path (optional string; defaults to `./auditreach.log.jsonl` "
            "in the current working directory if omitted). Example calls: {} (verify "
            "the default log); {\"path\": \"./auditreach.log.jsonl\"}. "
            "Returns a JSON object with `success` (bool, true only if the entire "
            "chain verifies intact) and `exitCode` (int); on failure `error` "
            "describes the problem, such as a broken hash link at a specific entry "
            "index or a missing/unreadable log file."
        ),
    )

    return server


def run_mcp_command() -> int:
    """
    Starts the MCP server over stdio and blocks until the client
    disconnects or the process is signaled to stop. Console entry point for
    `auditreach mcp` / `python -m auditreach mcp`.
    """
    server = build_mcp_server()
    server.run(transport="stdio")
    return 0
