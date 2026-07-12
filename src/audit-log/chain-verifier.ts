import { readFile } from "node:fs/promises";
import { access, constants } from "node:fs";
import { promisify } from "node:util";
import { computeEntryHash } from "./hash-chain-writer.js";
import { DEFAULT_AUDIT_LOG_PATH } from "./hash-chain-writer.js";
import type { AuditLogEntry, ChainVerificationResult } from "../types.js";

const accessAsync = promisify(access);

async function fileExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-derives every entry's hash from its own content and checks it against
 * the stored hash, then checks each entry's prev_entry_hash against the
 * previous entry's actual hash. Either check failing means the log was
 * edited, reordered, or an entry was deleted after the fact.
 */
export async function verifyAuditLogChain(
  logPath: string = DEFAULT_AUDIT_LOG_PATH,
): Promise<ChainVerificationResult> {
  if (!(await fileExists(logPath))) {
    return {
      valid: true,
      totalEntries: 0,
      brokenAtEntryId: null,
      brokenAtIndex: null,
      reason: "no log file yet -- nothing to verify",
    };
  }

  const content = await readFile(logPath, "utf8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  let expectedPrevHash: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    let entry: AuditLogEntry;
    try {
      entry = JSON.parse(lines[i] as string) as AuditLogEntry;
    } catch {
      return {
        valid: false,
        totalEntries: lines.length,
        brokenAtEntryId: null,
        brokenAtIndex: i,
        reason: `line ${i + 1} is not valid JSON`,
      };
    }

    if (entry.prev_entry_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: lines.length,
        brokenAtEntryId: entry.entry_id,
        brokenAtIndex: i,
        reason: `entry ${entry.entry_id} references prev_entry_hash that does not match the actual prior entry -- chain broken or reordered`,
      };
    }

    const { entry_hash, ...rest } = entry;
    const recomputed = computeEntryHash(rest);
    if (recomputed !== entry_hash) {
      return {
        valid: false,
        totalEntries: lines.length,
        brokenAtEntryId: entry.entry_id,
        brokenAtIndex: i,
        reason: `entry ${entry.entry_id} hash does not match its own content -- entry was edited after being written`,
      };
    }

    expectedPrevHash = entry_hash;
  }

  return {
    valid: true,
    totalEntries: lines.length,
    brokenAtEntryId: null,
    brokenAtIndex: null,
    reason: null,
  };
}
