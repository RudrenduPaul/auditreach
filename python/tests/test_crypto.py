"""Ported from test/crypto.test.ts."""
import re

from auditreach.crypto import canonical_json, credential_fingerprint, generate_entry_id, sha256_hex


def test_canonical_json_ignores_key_insertion_order():
    a = {"b": 1, "a": 2, "c": {"z": 1, "y": 2}}
    b = {"a": 2, "c": {"y": 2, "z": 1}, "b": 1}
    assert canonical_json(a) == canonical_json(b)


def test_canonical_json_sorts_nested_array_of_object_keys_too():
    value = {"list": [{"b": 1, "a": 2}]}
    assert canonical_json(value) == '{"list":[{"a":2,"b":1}]}'


def test_canonical_json_preserves_array_element_order():
    a = {"list": [3, 1, 2]}
    b = {"list": [1, 2, 3]}
    assert canonical_json(a) != canonical_json(b)


def test_sha256_hex_matches_known_vector():
    # sha256("abc") is a well-known test vector.
    assert sha256_hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_credential_fingerprint_never_returns_the_input_secret_itself():
    secret = "super-secret-api-key-value"
    fingerprint = credential_fingerprint(secret)
    assert secret not in fingerprint
    assert len(fingerprint) == 6


def test_credential_fingerprint_is_deterministic():
    assert credential_fingerprint("same-key") == credential_fingerprint("same-key")


def test_credential_fingerprint_differs_for_different_inputs():
    assert credential_fingerprint("key-a") != credential_fingerprint("key-b")


def test_generate_entry_id_produces_unique_ids_across_calls():
    ids = {generate_entry_id() for _ in range(50)}
    assert len(ids) == 50


def test_generate_entry_id_starts_with_ar_prefix_by_default():
    assert re.match(r"^ar_\d{4}-\d{2}-\d{2}_[0-9a-f]{6}$", generate_entry_id())
