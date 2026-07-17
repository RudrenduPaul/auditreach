"""Ported from test/hash-chain.test.ts. These are the tests that back this
project's core security claim: a log entry edited after the fact, or a log
entry deleted/reordered, must be detected by verify_audit_log_chain."""
import json

import pytest

from auditreach.audit_log.chain_verifier import verify_audit_log_chain
from auditreach.audit_log.hash_chain_writer import append_audit_log_entry, get_last_entry_hash


@pytest.fixture()
def log_path(tmp_path):
    return str(tmp_path / "auditreach.log.jsonl")


def make_entry(**overrides):
    entry = {
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
    entry.update(overrides)
    return entry


class TestGetLastEntryHash:
    def test_returns_none_when_log_file_does_not_exist_yet(self, log_path):
        assert get_last_entry_hash(log_path) is None

    def test_returns_hash_of_most_recently_appended_entry(self, log_path):
        first = append_audit_log_entry(make_entry(), log_path)
        assert get_last_entry_hash(log_path) == first["entry_hash"]

        second = append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_def456", prev_entry_hash=first["entry_hash"]),
            log_path,
        )
        assert get_last_entry_hash(log_path) == second["entry_hash"]


class TestAppendAndVerify:
    def test_fresh_nonexistent_log_is_valid_with_zero_entries(self, log_path):
        result = verify_audit_log_chain(log_path)
        assert result.valid is True
        assert result.total_entries == 0

    def test_verifies_a_single_entry_chain_as_valid(self, log_path):
        append_audit_log_entry(make_entry(), log_path)
        result = verify_audit_log_chain(log_path)
        assert result.valid is True
        assert result.total_entries == 1

    def test_verifies_a_multi_entry_chain_as_valid_when_correctly_linked(self, log_path):
        first = append_audit_log_entry(make_entry(), log_path)
        second = append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_def456", prev_entry_hash=first["entry_hash"]),
            log_path,
        )
        append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_ghi789", prev_entry_hash=second["entry_hash"]),
            log_path,
        )

        result = verify_audit_log_chain(log_path)
        assert result.valid is True
        assert result.total_entries == 3

    def test_detects_a_tampered_entry_content_edited_after_being_written(self, log_path):
        append_audit_log_entry(make_entry(), log_path)
        append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_def456", prev_entry_hash="placeholder"), log_path
        )

        # Simulate tampering: rewrite the first line with a different
        # results_returned value but leave its stored entry_hash untouched.
        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line for line in f.read().split("\n") if line]
        tampered = json.loads(lines[0])
        tampered["results_returned"] = 999
        lines[0] = json.dumps(tampered)
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        result = verify_audit_log_chain(log_path)
        assert result.valid is False
        assert result.broken_at_index == 0
        assert "edited after being written" in result.reason

    def test_detects_a_broken_chain_link_prev_entry_hash_mismatch(self, log_path):
        append_audit_log_entry(make_entry(), log_path)
        # Second entry claims a prev_entry_hash that doesn't match the first entry's real hash.
        append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_def456", prev_entry_hash="sha256:not-the-real-hash"),
            log_path,
        )

        result = verify_audit_log_chain(log_path)
        assert result.valid is False
        assert result.broken_at_index == 1
        assert "chain broken or reordered" in result.reason

    def test_detects_a_deleted_middle_entry(self, log_path):
        first = append_audit_log_entry(make_entry(), log_path)
        second = append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_def456", prev_entry_hash=first["entry_hash"]),
            log_path,
        )
        append_audit_log_entry(
            make_entry(entry_id="ar_2026-07-12_ghi789", prev_entry_hash=second["entry_hash"]),
            log_path,
        )

        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line for line in f.read().split("\n") if line]
        del lines[1]  # delete the middle entry
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        result = verify_audit_log_chain(log_path)
        assert result.valid is False
