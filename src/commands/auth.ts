import {
  setCredential,
  deleteCredential,
  getRedditCredentials,
  getYoutubeCredentials,
} from "../auth/credential-store.js";
import { promptText, promptSecret } from "../util/prompt.js";
import { RedditClient } from "../clients/reddit-client.js";
import { YoutubeClient } from "../clients/youtube-client.js";
import type { Platform } from "../types.js";

export interface AuthCommandArgs {
  platform: Platform;
  clear?: boolean;
  verify?: boolean;
  json?: boolean;
}

export async function runAuthCommand(args: AuthCommandArgs): Promise<void> {
  if (args.clear) {
    await clearCredentials(args.platform);
    return;
  }

  if (args.verify) {
    await verifyCredentials(args.platform, Boolean(args.json));
    return;
  }

  if (args.platform === "reddit") {
    console.log("Setting up Reddit API credentials (OAuth script app).");
    console.log('Create one at https://www.reddit.com/prefs/apps -- choose app type "script".\n');
    const clientId = await promptText("Client ID: ");
    const clientSecret = await promptSecret("Client secret: ");
    const username = await promptText("Reddit username: ");
    const password = await promptSecret("Reddit password: ");

    setCredential("reddit", "clientId", clientId);
    setCredential("reddit", "clientSecret", clientSecret);
    setCredential("reddit", "username", username);
    setCredential("reddit", "password", password);

    console.log("\nReddit credentials stored in your OS keychain.");
    console.log(
      "Rate limits: Reddit's official API is generally workable for most research volumes.",
    );
  } else {
    console.log("Setting up YouTube Data API v3 credentials.");
    console.log("Create an API key at https://console.cloud.google.com/apis/credentials\n");
    const apiKey = await promptSecret("API key: ");
    setCredential("youtube", "apiKey", apiKey);

    console.log("\nYouTube credentials stored in your OS keychain.");
    console.log("Rate limits: quota-based (10,000 units/day default), generally workable.");
  }
}

async function clearCredentials(platform: Platform): Promise<void> {
  if (platform === "reddit") {
    deleteCredential("reddit", "clientId");
    deleteCredential("reddit", "clientSecret");
    deleteCredential("reddit", "username");
    deleteCredential("reddit", "password");
  } else {
    deleteCredential("youtube", "apiKey");
  }
  console.log(`Cleared stored credentials for ${platform}.`);
}

export interface AuthStatusResult {
  platform: Platform;
  valid: boolean;
  error: string | null;
}

/**
 * The programmatic core behind `auditreach auth --verify`, and the only
 * auth-related logic exposed over MCP (as the read-only `auth_status`
 * tool). Reuses each client's token-fetch/auth-check logic (never
 * duplicates it) and performs a single minimal authenticated request.
 * Unlike `search`, this never requires --query, never writes a results
 * file, and never appends an audit-log entry -- it only reports whether the
 * stored credentials work. Deliberately has no counterpart for setting or
 * clearing credentials: that stays a local-CLI-only, human-driven action
 * (`auditreach auth --platform <p>` / `--clear`), never reachable from an
 * MCP tool call.
 */
export async function checkAuthStatus(platform: Platform): Promise<AuthStatusResult> {
  try {
    if (platform === "reddit") {
      const credentials = getRedditCredentials();
      if (!credentials) {
        return {
          platform,
          valid: false,
          error: 'No Reddit credentials found. Run "auditreach auth --platform reddit" first.',
        };
      }
      await new RedditClient(credentials).verifyCredentials();
    } else {
      const credentials = getYoutubeCredentials();
      if (!credentials) {
        return {
          platform,
          valid: false,
          error: 'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
        };
      }
      await new YoutubeClient(credentials).verifyCredentials();
    }
    return { platform, valid: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform,
      valid: false,
      error: `${capitalize(platform)} credential check failed: ${message}`,
    };
  }
}

/**
 * CLI wrapper around `checkAuthStatus` for `auditreach auth --verify`: adds
 * human-readable / `--json` printing and the exit-code convention the rest
 * of the CLI uses.
 */
async function verifyCredentials(platform: Platform, json: boolean): Promise<void> {
  const result = await checkAuthStatus(platform);
  report(json, result.platform, result.valid, result.error ?? undefined);
  if (!result.valid) {
    process.exitCode = 1;
  }
}

function report(json: boolean, platform: Platform, valid: boolean, error?: string): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ platform, valid, error: error ?? null }, null, 2)}\n`);
    return;
  }
  if (valid) {
    console.log(`${capitalize(platform)} credentials are valid.`);
  } else {
    console.error(error);
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
