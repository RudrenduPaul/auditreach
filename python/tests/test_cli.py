"""CLI-level argument-parsing tests, matching src/cli.ts's `commander` flag
set and its assertPlatform()/positive-integer validation behavior."""
import pytest

from auditreach import __version__
from auditreach.cli import build_parser, run_cli


def test_version_flag_prints_the_package_version(capsys):
    with pytest.raises(SystemExit) as exc_info:
        run_cli(["auditreach", "--version"])
    assert exc_info.value.code == 0
    assert __version__ in capsys.readouterr().out


def test_no_command_prints_help_and_returns_0(capsys):
    exit_code = run_cli(["auditreach"])
    assert exit_code == 0
    assert "usage" in capsys.readouterr().out.lower()


def test_rejects_an_unsupported_platform(capsys):
    with pytest.raises(SystemExit) as exc_info:
        run_cli(["auditreach", "search", "--platform", "twitter", "--query", "x"])
    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "Unsupported platform" in err
    assert "twitter" in err


def test_rejects_a_non_positive_max_results(capsys):
    with pytest.raises(SystemExit) as exc_info:
        run_cli(
            ["auditreach", "search", "--platform", "reddit", "--query", "x", "--max-results", "0"]
        )
    assert exc_info.value.code == 2  # argparse's own usage-error exit code


def test_verify_log_on_a_fresh_directory_reports_zero_entries(tmp_path, capsys):
    log_path = str(tmp_path / "auditreach.log.jsonl")
    exit_code = run_cli(["auditreach", "verify-log", "--path", log_path])
    assert exit_code == 0
    assert "nothing to verify" in capsys.readouterr().out


def test_search_requires_platform_flag():
    with pytest.raises(SystemExit) as exc_info:
        run_cli(["auditreach", "search", "--query", "x"])
    assert exc_info.value.code == 2


def test_auth_requires_platform_flag():
    with pytest.raises(SystemExit) as exc_info:
        run_cli(["auditreach", "auth"])
    assert exc_info.value.code == 2


def test_parser_recognizes_the_mcp_subcommand():
    """
    Only exercises argument parsing, not `run_cli` -- dispatching "mcp"
    through `run_cli` starts a real stdio MCP server that blocks waiting
    for a client, which would hang the test suite. The server's own tool
    logic is covered by test_mcp_command.py.
    """
    args = build_parser().parse_args(["mcp"])
    assert args.command == "mcp"

