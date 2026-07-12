#!/usr/bin/env node
import { Command } from "commander";
import { runSearchCommand } from "./commands/search.js";
import { runAuthCommand } from "./commands/auth.js";
import { runVerifyLogCommand } from "./commands/verify-log.js";
import type { Platform } from "./types.js";
import {
  DEFAULT_LIMIT as REDDIT_DEFAULT_LIMIT,
  MAX_LIMIT as REDDIT_MAX_LIMIT,
} from "./clients/reddit-client.js";
import { MAX_MAX_RESULTS as YOUTUBE_MAX_MAX_RESULTS } from "./clients/youtube-client.js";

const VERSION = "0.1.0";

function assertPlatform(value: string): asserts value is Platform {
  if (value !== "reddit" && value !== "youtube") {
    console.error(`Unsupported platform "${value}". Supported in v0.1: reddit, youtube.`);
    console.error("X (Twitter) support is deferred to v0.2 -- see README for why.");
    process.exit(1);
  }
}

const program = new Command();

program
  .name("auditreach")
  .description("Official-API-only, BYOK research CLI with a hash-chained compliance audit log")
  .version(VERSION);

program
  .command("search")
  .description("Search a platform using its official API only")
  .requiredOption("--platform <platform>", "reddit | youtube")
  .option("--query <query>", "search query")
  .option("--subreddit <subreddit>", "restrict search to one subreddit (reddit only)")
  .option("--channel <handle>", "restrict search to one channel, e.g. @AnthropicAI (youtube only)")
  .option(
    "--since <date>",
    "only results published after this date, e.g. 2026-06-01 (youtube only)",
  )
  .option(
    "--max-results <n>",
    `maximum results to return (default: ${REDDIT_DEFAULT_LIMIT}; platform caps: ${REDDIT_MAX_LIMIT} Reddit / ${YOUTUBE_MAX_MAX_RESULTS} YouTube)`,
    (v) => {
      const parsed = parseInt(v, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--max-results must be a positive integer, got "${v}"`);
      }
      return parsed;
    },
  )
  .option(
    "--before <fullname>",
    "page results before this Reddit fullname cursor, e.g. t3_abc123 (reddit only)",
  )
  .option(
    "--after <fullname>",
    "page results after this Reddit fullname cursor, e.g. t3_abc123 (reddit only)",
  )
  .option("--output <path>", "write full results JSON to this path")
  .action(async (opts) => {
    assertPlatform(opts.platform);
    await runSearchCommand({
      platform: opts.platform,
      query: opts.query,
      subreddit: opts.subreddit,
      channel: opts.channel,
      since: opts.since,
      maxResults: opts.maxResults,
      before: opts.before,
      after: opts.after,
      output: opts.output,
    });
  });

program
  .command("auth")
  .description("Set up or clear BYOK credentials for a platform (stored in your OS keychain)")
  .requiredOption("--platform <platform>", "reddit | youtube")
  .option("--clear", "delete stored credentials for this platform")
  .option(
    "--verify",
    "verify stored credentials are valid without running a search (no results file, no audit-log entry)",
  )
  .action(async (opts) => {
    assertPlatform(opts.platform);
    await runAuthCommand({ platform: opts.platform, clear: opts.clear, verify: opts.verify });
  });

program
  .command("verify-log")
  .description("Verify the local hash-chained audit log has not been tampered with")
  .option("--path <path>", "path to the audit log file")
  .action(async (opts) => {
    await runVerifyLogCommand({ path: opts.path });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
