import { appendFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { canonicalJson, sha256Hex } from "../util/crypto.js";
import type { AuditLogEntry, UnhashedAuditLogEntry } from "../types.js";

export const DEFAULT_AUDIT_LOG_PATH = "./auditreach.log.jsonl";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the last line of the log file to find the previous entry's hash.
 * Returns null if the log doesn't exist yet or is empty -- that's the
 * legitimate state for the very first entry in a chain.
 */
export async function getLastEntryHash(
  logPath: string = DEFAULT_AUDIT_LOG_PATH,
): Promise<string | null> {
  if (!(await fileExists(logPath))) {
    return null;
  }
  const content = await readFile(logPath, "utf8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }
  const lastLine = lines[lines.length - 1] as string;
  const lastEntry = JSON.parse(lastLine) as AuditLogEntry;
  return lastEntry.entry_hash;
}

export function computeEntryHash(entry: UnhashedAuditLogEntry): string {
  // prev_entry_hash is already a field on `entry`, so canonicalJson alone
  // links this entry to the previous one -- no need to fold it in twice.
  return sha256Hex(canonicalJson(entry));
}

/**
 * Appends one hash-chained entry to the local audit log. This is the only
 * write path into the log -- entries are never edited or deleted in place,
 * which is what makes `verify-log` a meaningful tamper check.
 */
export async function appendAuditLogEntry(
  entryWithoutHash: UnhashedAuditLogEntry,
  logPath: string = DEFAULT_AUDIT_LOG_PATH,
): Promise<AuditLogEntry> {
  const entry_hash = computeEntryHash(entryWithoutHash);
  const fullEntry: AuditLogEntry = { ...entryWithoutHash, entry_hash };
  await appendFile(logPath, JSON.stringify(fullEntry) + "\n", "utf8");
  return fullEntry;
}
