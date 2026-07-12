import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  credentialFingerprint,
  generateEntryId,
  sha256Hex,
} from "../src/util/crypto.js";

describe("canonicalJson", () => {
  it("produces identical output regardless of key insertion order", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("sorts nested array-of-object keys too", () => {
    const value = { list: [{ b: 1, a: 2 }] };
    expect(canonicalJson(value)).toBe('{"list":[{"a":2,"b":1}]}');
  });

  it("preserves array element order (arrays are not sorted)", () => {
    const a = { list: [3, 1, 2] };
    const b = { list: [1, 2, 3] };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });
});

describe("sha256Hex", () => {
  it("matches a known SHA-256 vector", () => {
    // sha256("abc") is a well-known test vector.
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("credentialFingerprint", () => {
  it("never returns the input secret itself", () => {
    const secret = "super-secret-api-key-value";
    const fingerprint = credentialFingerprint(secret);
    expect(fingerprint).not.toContain(secret);
    expect(fingerprint.length).toBe(6);
  });

  it("is deterministic for the same input", () => {
    expect(credentialFingerprint("same-key")).toBe(credentialFingerprint("same-key"));
  });

  it("differs for different inputs", () => {
    expect(credentialFingerprint("key-a")).not.toBe(credentialFingerprint("key-b"));
  });
});

describe("generateEntryId", () => {
  it("produces unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateEntryId()));
    expect(ids.size).toBe(50);
  });

  it("starts with the ar_ prefix by default", () => {
    expect(generateEntryId()).toMatch(/^ar_\d{4}-\d{2}-\d{2}_[0-9a-f]{6}$/);
  });
});
