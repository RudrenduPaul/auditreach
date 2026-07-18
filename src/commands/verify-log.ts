import { verifyAuditLogChain } from "../audit-log/chain-verifier.js";
import { DEFAULT_AUDIT_LOG_PATH } from "../audit-log/hash-chain-writer.js";
import type { ChainVerificationResult } from "../types.js";

export interface VerifyLogCommandArgs {
  path?: string;
  json?: boolean;
}

export interface VerifyLogResult extends ChainVerificationResult {
  logPath: string;
}

/**
 * The programmatic core of `verify-log`: re-derives the chain and returns
 * the structured result, with no console/stdout output of its own. Shared
 * by the CLI's `--json` mode and the MCP `verify_log` tool.
 */
export async function executeVerifyLog(path?: string): Promise<VerifyLogResult> {
  const logPath = path ?? DEFAULT_AUDIT_LOG_PATH;
  const result = await verifyAuditLogChain(logPath);
  return { logPath, ...result };
}

export async function runVerifyLogCommand(args: VerifyLogCommandArgs): Promise<void> {
  const logPath = args.path ?? DEFAULT_AUDIT_LOG_PATH;
  if (!args.json) {
    console.log(`Verifying ${logPath}...`);
  }

  const result = await executeVerifyLog(args.path);

  if (!result.valid) {
    process.exitCode = 1;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.totalEntries === 0) {
    console.log("No entries yet -- nothing to verify.");
    return;
  }

  if (result.valid) {
    console.log(`✓ Chain intact: ${result.totalEntries} entries, no gaps, no tampering detected.`);
  } else {
    console.error(
      `✗ Chain broken at entry ${result.brokenAtIndex} (${result.brokenAtEntryId ?? "unknown"}): ${result.reason}`,
    );
  }
}
