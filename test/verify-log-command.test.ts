import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runVerifyLogCommand } from "../src/commands/verify-log.js";
import { appendAuditLogEntry } from "../src/audit-log/hash-chain-writer.js";
import type { UnhashedAuditLogEntry } from "../src/types.js";

let tmpDir: string;
let logPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "auditreach-verify-cmd-"));
  logPath = path.join(tmpDir, "auditreach.log.jsonl");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.exitCode = 0;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const baseEntry: UnhashedAuditLogEntry = {
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
};

describe("runVerifyLogCommand", () => {
  it("does not set an exit code for an intact chain", async () => {
    await appendAuditLogEntry(baseEntry, logPath);
    await runVerifyLogCommand({ path: logPath });
    expect(process.exitCode).toBe(0);
  });

  it("sets exitCode 1 when the chain is broken", async () => {
    await appendAuditLogEntry(baseEntry, logPath);
    await appendAuditLogEntry(
      { ...baseEntry, entry_id: "ar_2026-07-12_def456", prev_entry_hash: "sha256:wrong" },
      logPath,
    );
    await runVerifyLogCommand({ path: logPath });
    expect(process.exitCode).toBe(1);
  });

  it("does not error on a log path that does not exist yet", async () => {
    await runVerifyLogCommand({ path: path.join(tmpDir, "does-not-exist.jsonl") });
    expect(process.exitCode).toBe(0);
  });
});
