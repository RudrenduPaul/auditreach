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
    from mcp.server.fastmcp import FastMCP

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
        description="Search Reddit or YouTube using its official API only, with your own BYOK credentials.",
    )
    server.add_tool(
        auth_status_tool,
        name="auth_status",
        description="Read-only check of whether BYOK credentials are stored and valid for a platform.",
    )
    server.add_tool(
        verify_log_tool,
        name="verify_log",
        description="Verify the local hash-chained audit log has not been tampered with.",
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
