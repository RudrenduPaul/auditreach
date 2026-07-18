import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { executeSearch } from "./search.js";
import { checkAuthStatus } from "./auth.js";
import { executeVerifyLog } from "./verify-log.js";
import {
  DEFAULT_LIMIT as REDDIT_DEFAULT_LIMIT,
  MAX_LIMIT as REDDIT_MAX_LIMIT,
} from "../clients/reddit-client.js";
import { MAX_MAX_RESULTS as YOUTUBE_MAX_MAX_RESULTS } from "../clients/youtube-client.js";

export interface McpCommandArgs {
  /** The published package version, read once by the caller (src/cli.ts) so this module does not need its own package.json path resolution. */
  version: string;
}

function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/**
 * Builds the MCP server exposing exactly 3 tools, each a thin wrapper
 * around the same programmatic core the `search` / `auth` / `verify-log`
 * CLI commands use -- no search/auth/audit-log logic is reimplemented here.
 *
 * `auth_status` is deliberately read-only: it wraps `checkAuthStatus`, the
 * same check behind `auditreach auth --verify`, and has no counterpart for
 * setting or clearing credentials. Setting/clearing BYOK credentials stays
 * a local-CLI-only, human-driven action (`auditreach auth --platform <p>` /
 * `--clear`) -- deliberately never reachable from an MCP tool call, since a
 * calling agent should never be able to provision or wipe a user's stored
 * API credentials on its own.
 */
export function buildMcpServer(args: McpCommandArgs): McpServer {
  const server = new McpServer({ name: "auditreach", version: args.version });

  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Search Reddit or YouTube using the platform's official API only, with the caller's own BYOK credentials (no scraping, no shared credential pool). Writes the full results to a local JSON file and appends a hash-chained audit-log entry, exactly like `auditreach search`.",
      inputSchema: {
        platform: z.enum(["reddit", "youtube"]).describe("Platform to search: reddit | youtube"),
        query: z.string().optional().describe("Search query"),
        subreddit: z
          .string()
          .optional()
          .describe("Restrict search to one subreddit, e.g. MachineLearning (reddit only)"),
        channel: z
          .string()
          .optional()
          .describe("Restrict search to one channel, e.g. @AnthropicAI (youtube only)"),
        since: z
          .string()
          .optional()
          .describe("Only results published after this date, e.g. 2026-06-01 (youtube only)"),
        maxResults: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            `Maximum results to return (default ${REDDIT_DEFAULT_LIMIT}; platform caps: ${REDDIT_MAX_LIMIT} Reddit / ${YOUTUBE_MAX_MAX_RESULTS} YouTube)`,
          ),
        before: z
          .string()
          .optional()
          .describe(
            "Page results before this Reddit fullname cursor, e.g. t3_abc123 (reddit only)",
          ),
        after: z
          .string()
          .optional()
          .describe("Page results after this Reddit fullname cursor, e.g. t3_abc123 (reddit only)"),
      },
    },
    async (input) => {
      try {
        const result = await executeSearch({
          platform: input.platform,
          query: input.query,
          subreddit: input.subreddit,
          channel: input.channel,
          since: input.since,
          maxResults: input.maxResults,
          before: input.before,
          after: input.after,
        });
        return jsonResult({
          platform: result.outcome.platform,
          endpoint: result.outcome.endpoint,
          queryParams: result.outcome.queryParams,
          authScope: result.outcome.authScope,
          consentBasis: result.outcome.consentBasis,
          items: result.outcome.items,
          nextCursor: result.outcome.nextCursor ?? null,
          truncated: result.truncated,
          auditLogEntryId: result.auditLogEntryId,
          resultsFile: result.resultsFile,
          auditLogFile: result.auditLogFile,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "auth_status",
    {
      title: "Auth status",
      description:
        "Read-only check of whether stored BYOK credentials for a platform are currently valid, equivalent to `auditreach auth --platform <platform> --verify --json`. Cannot set or clear credentials -- run `auditreach auth --platform <platform>` locally to set them up, and `auditreach auth --platform <platform> --clear` to remove them.",
      inputSchema: {
        platform: z.enum(["reddit", "youtube"]).describe("Platform to check: reddit | youtube"),
      },
    },
    async (input) => {
      const result = await checkAuthStatus(input.platform);
      return jsonResult(result);
    },
  );

  server.registerTool(
    "verify_log",
    {
      title: "Verify audit log",
      description:
        "Verify the local hash-chained audit log has not been tampered with, equivalent to `auditreach verify-log --json`.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Path to the audit log file (defaults to ./auditreach.log.jsonl)"),
      },
    },
    async (input) => {
      try {
        const result = await executeVerifyLog(input.path);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

/**
 * Runs the MCP server over stdio. This is the only place in the codebase
 * that touches stdout for protocol framing rather than human/JSON CLI
 * output, which is why `search` / `auth_status` / `verify_log` above call
 * into the same executeSearch/checkAuthStatus/executeVerifyLog cores the
 * CLI commands use, rather than the CLI commands themselves -- those write
 * directly to console/stdout, which would corrupt the JSON-RPC stream.
 */
export async function runMcpServerCommand(args: McpCommandArgs): Promise<void> {
  const server = buildMcpServer(args);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
