import { writeFile } from "node:fs/promises";
import { RedditClient } from "../clients/reddit-client.js";
import { YoutubeClient } from "../clients/youtube-client.js";
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
  output?: string;
}

export async function runSearchCommand(args: SearchCommandArgs): Promise<void> {
  let outcome: SearchOutcome;
  let fingerprintSource: string;

  if (args.platform === "reddit") {
    const credentials = getRedditCredentials();
    if (!credentials) {
      console.error('No Reddit credentials found. Run "auditreach auth --platform reddit" first.');
      process.exitCode = 1;
      return;
    }
    if (!args.query) {
      console.error('Reddit search requires --query "<search terms>".');
      process.exitCode = 1;
      return;
    }
    const client = new RedditClient(credentials);
    outcome = await client.search({
      query: args.query,
      subreddit: args.subreddit,
      limit: args.maxResults,
    });
    fingerprintSource = credentials.clientSecret;
  } else {
    const credentials = getYoutubeCredentials();
    if (!credentials) {
      console.error(
        'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
      );
      process.exitCode = 1;
      return;
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

  printResults(outcome);

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

  console.log(`\nAudit log entry written: ${entry.entry_id}`);
  console.log(`Consent basis: ${entry.consent_basis}`);
  console.log(`Full results: ${outputPath}`);
  console.log(`Full audit trail: ./auditreach.log.jsonl`);
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
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
