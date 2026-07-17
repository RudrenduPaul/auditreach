"""Ported from test/verify-log-command.test.ts."""
import json

from auditreach.audit_log.hash_chain_writer import append_audit_log_entry
from auditreach.commands.verify_log import run_verify_log_command

BASE_ENTRY = {
    "entry_id": "ar_2026-07-12_abc123",
    "timestamp": "2026-07-12T00:00:00.000Z",
    "platform": "reddit",
    "endpoint": "GET /search",
    "query_params": {"query": "test"},
    "auth_scope": "OAuth script-app grant, read-only, public-subreddit scope",
    "consent_basis": "Reddit API Terms -- public content, official API",
    "api_key_fingerprint": "sha256:abc123",
    "results_returned": 5,
    "prev_entry_hash": None,
}


def test_returns_exit_code_0_for_an_intact_chain(tmp_path, capsys):
    log_path = str(tmp_path / "auditreach.log.jsonl")
    append_audit_log_entry(BASE_ENTRY, log_path)
    assert run_verify_log_command(path=log_path) == 0


def test_returns_exit_code_1_when_the_chain_is_broken(tmp_path):
    log_path = str(tmp_path / "auditreach.log.jsonl")
    append_audit_log_entry(BASE_ENTRY, log_path)
    append_audit_log_entry(
        {**BASE_ENTRY, "entry_id": "ar_2026-07-12_def456", "prev_entry_hash": "sha256:wrong"},
        log_path,
    )
    assert run_verify_log_command(path=log_path) == 1


def test_does_not_error_on_a_log_path_that_does_not_exist_yet(tmp_path):
    log_path = str(tmp_path / "does-not-exist.jsonl")
    assert run_verify_log_command(path=log_path) == 0


class TestJsonOutput:
    def test_prints_one_parseable_json_object_for_an_intact_chain(self, tmp_path, capsys):
        log_path = str(tmp_path / "auditreach.log.jsonl")
        append_audit_log_entry(BASE_ENTRY, log_path)

        exit_code = run_verify_log_command(path=log_path, json_output=True)

        printed = json.loads(capsys.readouterr().out)
        assert printed["logPath"] == log_path
        assert printed["valid"] is True
        assert printed["total_entries"] == 1
        assert exit_code == 0

    def test_prints_break_details_for_a_broken_chain(self, tmp_path, capsys):
        log_path = str(tmp_path / "auditreach.log.jsonl")
        append_audit_log_entry(BASE_ENTRY, log_path)
        append_audit_log_entry(
            {**BASE_ENTRY, "entry_id": "ar_2026-07-12_def456", "prev_entry_hash": "sha256:wrong"},
            log_path,
        )

        exit_code = run_verify_log_command(path=log_path, json_output=True)

        printed = json.loads(capsys.readouterr().out)
        assert printed["valid"] is False
        assert printed["broken_at_entry_id"] == "ar_2026-07-12_def456"
        assert exit_code == 1
