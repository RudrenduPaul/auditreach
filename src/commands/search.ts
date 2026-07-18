import { writeFile } from "node:fs/promises";
import { RedditClient, MAX_LIMIT as REDDIT_MAX_LIMIT } from "../clients/reddit-client.js";
import {
  YoutubeClient,
  MAX_MAX_RESULTS as YOUTUBE_MAX_MAX_RESULTS,
} from "../clients/youtube-client.js";
import { getRedditCredentials, getYoutubeCredentials } from "../auth/credential-store.js";
import { appendAuditLogEntry, getLastEntryHash } from "../audit-log/hash-chain-writer.js";
import { credentialFingerprint, generateEntryId } from "../util/crypto.js";
import type { Platform, SearchOutcome } from "../types.js";

export interface SearchCommandArgs {
  platform: Platform;
  query?: string;
  subreddit?: string;
  channel?: string;
  since?: string;
  maxResults?: number;
  before?: string;
  after?: string;
  output?: string;
  json?: boolean;
}

/** Raised for expected, user-actionable failures (missing credentials, missing --query). Callers translate this into their own reporting: `runSearchCommand` prints to stderr and sets `process.exitCode`, the MCP `search` tool returns it as a structured tool error. */
export class SearchCommandError extends Error {}

export interface SearchExecutionResult {
  outcome: SearchOutcome;
  truncated: boolean;
  auditLogEntryId: string;
  resultsFile: string;
  auditLogFile: string;
}

/**
 * The programmatic core of `search`: runs the platform search, writes the
 * full results file, and appends the hash-chained audit-log entry. Contains
 * no console/stdout output of its own, so it is safe to call from contexts
 * that must not write to stdout outside a controlled protocol -- notably
 * the MCP `search` tool, which shares stdout with the JSON-RPC transport.
 * `runSearchCommand` below is the CLI wrapper that adds human-readable and
 * `--json` printing on top of this.
 */
export async function executeSearch(
  args: Omit<SearchCommandArgs, "json">,
): Promise<SearchExecutionResult> {
  let outcome: SearchOutcome;
  let fingerprintSource: string;

  if (args.platform === "reddit") {
    const credentials = getRedditCredentials();
    if (!credentials) {
      throw new SearchCommandError(
        'No Reddit credentials found. Run "auditreach auth --platform reddit" first.',
      );
    }
    if (!args.query) {
      throw new SearchCommandError('Reddit search requires --query "<search terms>".');
    }
    const client = new RedditClient(credentials);
    outcome = await client.search({
      query: args.query,
      subreddit: args.subreddit,
      limit: args.maxResults,
      before: args.before,
      after: args.after,
    });
    fingerprintSource = credentials.clientSecret;
  } else {
    const credentials = getYoutubeCredentials();
    if (!credentials) {
      throw new SearchCommandError(
        'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
      );
    }
    const client = new YoutubeClient(credentials);
    outcome = await client.search({
      query: args.query,
      channelHandle: args.channel,
      since: args.since,
      maxResults: args.maxResults,
    });
    fingerprintSource = credentials.apiKey;
  }

  const outputPath = args.output ?? defaultOutputPath();
  await writeFile(outputPath, JSON.stringify(outcome.items, null, 2), "utf8");

  const prevHash = await getLastEntryHash();
  const entry = await appendAuditLogEntry({
    entry_id: generateEntryId(),
    timestamp: new Date().toISOString(),
    platform: outcome.platform,
    endpoint: outcome.endpoint,
    query_params: outcome.queryParams,
    auth_scope: outcome.authScope,
    consent_basis: outcome.consentBasis,
    api_key_fingerprint: `sha256:${credentialFingerprint(fingerprintSource)}`,
    results_returned: outcome.items.length,
    prev_entry_hash: prevHash,
  });

  return {
    outcome,
    truncated: isTruncated(outcome),
    auditLogEntryId: entry.entry_id,
    resultsFile: outputPath,
    auditLogFile: "./auditreach.log.jsonl",
  };
}

export async function runSearchCommand(args: SearchCommandArgs): Promise<void> {
  let result: SearchExecutionResult;
  try {
    result = await executeSearch(args);
  } catch (error) {
    if (error instanceof SearchCommandError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const { outcome, truncated, auditLogEntryId, resultsFile, auditLogFile } = result;

  if (!args.json) {
    printResults(outcome);
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          platform: outcome.platform,
          endpoint: outcome.endpoint,
          queryParams: outcome.queryParams,
          authScope: outcome.authScope,
          consentBasis: outcome.consentBasis,
          items: outcome.items,
          nextCursor: outcome.nextCursor ?? null,
          truncated,
          auditLogEntryId,
          resultsFile,
          auditLogFile,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  console.log(`\nAudit log entry written: ${auditLogEntryId}`);
  console.log(`Consent basis: ${outcome.consentBasis}`);
  console.log(`Full results: ${resultsFile}`);
  console.log(`Full audit trail: ${auditLogFile}`);
}

function defaultOutputPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `./auditreach-results-${date}.json`;
}

function printResults(outcome: SearchOutcome): void {
  console.log(`\nAuditReach v0.1 -- Official-API Research CLI`);
  console.log(`Platform: ${capitalize(outcome.platform)}  |  Auth: ${outcome.authScope}`);
  console.log(`\nFetching... (official API, rate-limit aware)`);
  console.log(`✓ ${outcome.items.length} results returned (${outcome.consentBasis})\n`);
  console.log(`RESULTS (${outcome.items.length})`);
  outcome.items.slice(0, 10).forEach((item, i) => {
    console.log(`[${i + 1}] "${item.title}"`);
    console.log(`    ${item.author ?? "unknown"} · ${item.createdAt}`);
    console.log(`    ${item.url}`);
  });
  if (outcome.items.length > 10) {
    console.log(`... and ${outcome.items.length - 10} more (see output file)`);
  }
  if (outcome.nextCursor?.after) {
    console.log(`\nNext page: rerun with --after ${outcome.nextCursor.after}`);
  }
  if (outcome.nextCursor?.before) {
    console.log(`Previous page: rerun with --before ${outcome.nextCursor.before}`);
  }
  warnIfTruncated(outcome);
}

function warnIfTruncated(outcome: SearchOutcome): void {
  if (!isTruncated(outcome)) {
    return;
  }
  const appliedLimit =
    outcome.platform === "reddit" ? outcome.queryParams.limit : outcome.queryParams.maxResults;
  const cap = outcome.platform === "reddit" ? REDDIT_MAX_LIMIT : YOUTUBE_MAX_MAX_RESULTS;
  const platformName = capitalize(outcome.platform);
  if (typeof appliedLimit === "number" && appliedLimit < cap) {
    console.error(
      `\nWarning: returned exactly ${outcome.items.length} results, the limit applied for this search -- more results may exist. Pass --max-results <n> (up to ${cap} for ${platformName}) to request more.`,
    );
  } else {
    console.error(
      `\nWarning: returned exactly ${outcome.items.length} results, ${platformName}'s per-request maximum -- more results may exist beyond what a single search call can return.`,
    );
  }
}

/** True when the result count exactly hits the applied limit, meaning more results may exist beyond what this single call returned. Shared by the human-readable warning and the --json `truncated` field so both reflect the same signal. */
function isTruncated(outcome: SearchOutcome): boolean {
  const appliedLimit =
    outcome.platform === "reddit" ? outcome.queryParams.limit : outcome.queryParams.maxResults;
  return typeof appliedLimit === "number" && outcome.items.length >= appliedLimit;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
