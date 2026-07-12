import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendAuditLogEntry, getLastEntryHash } from "../src/audit-log/hash-chain-writer.js";
import { verifyAuditLogChain } from "../src/audit-log/chain-verifier.js";
import type { UnhashedAuditLogEntry } from "../src/types.js";

let tmpDir: string;
let logPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "auditreach-test-"));
  logPath = path.join(tmpDir, "auditreach.log.jsonl");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<UnhashedAuditLogEntry> = {}): UnhashedAuditLogEntry {
  return {
    entry_id: "ar_2026-07-12_abc123",
    timestamp: "2026-07-12T00:00:00.000Z",
    platform: "reddit",
    endpoint: "GET /search",
    query_params: { query: "test" },
    auth_scope: "OAuth script-app grant, read-only, public-subreddit scope",
    consent_basis: "Reddit API Terms -- public content, official API",
    api_key_fingerprint: "sha256:abc123",
    results_returned: 5,
    prev_entry_hash: null,
    ...overrides,
  };
}

describe("getLastEntryHash", () => {
  it("returns null when the log file does not exist yet", async () => {
    expect(await getLastEntryHash(logPath)).toBeNull();
  });

  it("returns the hash of the most recently appended entry", async () => {
    const first = await appendAuditLogEntry(makeEntry(), logPath);
    expect(await getLastEntryHash(logPath)).toBe(first.entry_hash);

    const second = await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_def456", prev_entry_hash: first.entry_hash }),
      logPath,
    );
    expect(await getLastEntryHash(logPath)).toBe(second.entry_hash);
  });
});

describe("appendAuditLogEntry + verifyAuditLogChain", () => {
  it("reports a fresh, nonexistent log as valid with zero entries", async () => {
    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it("verifies a single-entry chain as valid", async () => {
    await appendAuditLogEntry(makeEntry(), logPath);
    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(1);
  });

  it("verifies a multi-entry chain as valid when correctly linked", async () => {
    const first = await appendAuditLogEntry(makeEntry(), logPath);
    const second = await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_def456", prev_entry_hash: first.entry_hash }),
      logPath,
    );
    await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_ghi789", prev_entry_hash: second.entry_hash }),
      logPath,
    );

    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
  });

  it("detects a tampered entry (content edited after being written)", async () => {
    const first = await appendAuditLogEntry(makeEntry(), logPath);
    await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_def456", prev_entry_hash: first.entry_hash }),
      logPath,
    );

    // Simulate tampering: rewrite the first line with a different results_returned
    // value but leave its stored entry_hash untouched.
    const { readFile, writeFile } = await import("node:fs/promises");
    const lines = (await readFile(logPath, "utf8")).split("\n").filter(Boolean);
    const tampered = JSON.parse(lines[0] as string);
    tampered.results_returned = 999;
    lines[0] = JSON.stringify(tampered);
    await writeFile(logPath, lines.join("\n") + "\n", "utf8");

    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
    expect(result.reason).toMatch(/edited after being written/);
  });

  it("detects a broken chain link (prev_entry_hash mismatch)", async () => {
    await appendAuditLogEntry(makeEntry(), logPath);
    // Second entry claims a prev_entry_hash that doesn't match the first entry's real hash.
    await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_def456", prev_entry_hash: "sha256:not-the-real-hash" }),
      logPath,
    );

    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
    expect(result.reason).toMatch(/chain broken or reordered/);
  });

  it("detects a deleted middle entry", async () => {
    const first = await appendAuditLogEntry(makeEntry(), logPath);
    const second = await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_def456", prev_entry_hash: first.entry_hash }),
      logPath,
    );
    await appendAuditLogEntry(
      makeEntry({ entry_id: "ar_2026-07-12_ghi789", prev_entry_hash: second.entry_hash }),
      logPath,
    );

    const { readFile, writeFile } = await import("node:fs/promises");
    const lines = (await readFile(logPath, "utf8")).split("\n").filter(Boolean);
    lines.splice(1, 1); // delete the middle entry
    await writeFile(logPath, lines.join("\n") + "\n", "utf8");

    const result = await verifyAuditLogChain(logPath);
    expect(result.valid).toBe(false);
  });
});
