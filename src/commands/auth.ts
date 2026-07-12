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
}

export async function runAuthCommand(args: AuthCommandArgs): Promise<void> {
  if (args.clear) {
    await clearCredentials(args.platform);
    return;
  }

  if (args.verify) {
    await verifyCredentials(args.platform);
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

/**
 * Standalone credential check for `auditreach auth --verify`. Reuses each
 * client's token-fetch/auth-check logic (never duplicates it) and performs
 * a single minimal authenticated request. Unlike `search`, this never
 * requires --query, never writes a results file, and never appends an
 * audit-log entry -- it only reports whether the stored credentials work.
 */
async function verifyCredentials(platform: Platform): Promise<void> {
  if (platform === "reddit") {
    const credentials = getRedditCredentials();
    if (!credentials) {
      console.error('No Reddit credentials found. Run "auditreach auth --platform reddit" first.');
      process.exitCode = 1;
      return;
    }
    try {
      await new RedditClient(credentials).verifyCredentials();
      console.log("Reddit credentials are valid.");
    } catch (error) {
      console.error(
        `Reddit credential check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  } else {
    const credentials = getYoutubeCredentials();
    if (!credentials) {
      console.error(
        'No YouTube credentials found. Run "auditreach auth --platform youtube" first.',
      );
      process.exitCode = 1;
      return;
    }
    try {
      await new YoutubeClient(credentials).verifyCredentials();
      console.log("YouTube credentials are valid.");
    } catch (error) {
      console.error(
        `YouTube credential check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}
