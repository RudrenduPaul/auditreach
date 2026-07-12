import { google } from "googleapis";
import type { YoutubeCredentials } from "../auth/credential-store.js";
import type { SearchOutcome, SearchResultItem, YoutubeSearchOptions } from "../types.js";

// Applied silently when --max-results is omitted, and used as the hard
// ceiling even when --max-results is passed a larger value. Documented in
// --help (src/cli.ts) and README.md so a caller cannot be silently truncated
// without knowing more results exist -- see the truncation warning emitted
// by src/commands/search.ts.
export const DEFAULT_MAX_RESULTS = 25;
export const MAX_MAX_RESULTS = 50;

export class YoutubeClient {
  private readonly youtube: ReturnType<typeof google.youtube>;

  constructor(credentials: YoutubeCredentials) {
    this.youtube = google.youtube({ version: "v3", auth: credentials.apiKey });
  }

  /**
   * Issues a minimal authenticated request (1 quota unit, no query needed)
   * to confirm the API key is valid. Used by `auditreach auth --verify`
   * instead of running a real search.
   */
  async verifyCredentials(): Promise<void> {
    await this.youtube.videoCategories.list({ part: ["snippet"], regionCode: "US" });
  }

  async search(options: YoutubeSearchOptions): Promise<SearchOutcome> {
    if (!options.query && !options.channelHandle) {
      throw new Error("YouTube search requires either --query or --channel");
    }

    const maxResults = Math.min(options.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);

    let channelId: string | undefined;
    if (options.channelHandle) {
      const handle = options.channelHandle.startsWith("@")
        ? options.channelHandle
        : `@${options.channelHandle}`;
      const channelResponse = await this.youtube.channels.list({
        part: ["id"],
        forHandle: handle,
      });
      channelId = channelResponse.data.items?.[0]?.id ?? undefined;
      if (!channelId) {
        throw new Error(`No YouTube channel found for handle "${handle}"`);
      }
    }

    const response = await this.youtube.search.list({
      part: ["snippet"],
      q: options.query,
      channelId,
      publishedAfter: options.since ? new Date(options.since).toISOString() : undefined,
      maxResults,
      type: ["video"],
      order: "date",
    });

    const items: SearchResultItem[] = (response.data.items ?? []).map((item) => ({
      id: item.id?.videoId ?? "",
      title: item.snippet?.title ?? "",
      url: `https://www.youtube.com/watch?v=${item.id?.videoId ?? ""}`,
      createdAt: item.snippet?.publishedAt ?? "",
      author: item.snippet?.channelTitle ?? null,
      score: null,
      extra: {
        channelId: item.snippet?.channelId,
        description: item.snippet?.description,
      },
    }));

    return {
      platform: "youtube",
      endpoint: "GET /youtube/v3/search",
      queryParams: {
        query: options.query,
        channel: options.channelHandle,
        since: options.since,
        maxResults,
      },
      authScope: "YouTube Data API v3, API-key auth, public search scope",
      consentBasis: "YouTube API Services Terms -- public content, official API, API-key auth",
      items,
    };
  }
}
