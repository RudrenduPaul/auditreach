import type { RedditCredentials } from "../auth/credential-store.js";
import type { RedditSearchOptions, SearchOutcome, SearchResultItem } from "../types.js";

const USER_AGENT = "auditreach-cli/0.1.0 (official-API-only compliance research tool)";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface RedditPostChild {
  data: {
    id: string;
    title: string;
    permalink: string;
    created_utc: number;
    author: string | null;
    score: number | null;
    subreddit_name_prefixed: string;
    num_comments: number;
  };
}

interface RedditListingResponse {
  data: {
    children: RedditPostChild[];
    // Reddit's Listing envelope carries the pagination cursors as siblings
    // of `children`, not inside each post. These are what a caller needs to
    // fetch the next/previous page -- see praw#614.
    after: string | null;
    before: string | null;
  };
}

/**
 * Talks to Reddit's official OAuth API only -- no cookie import, no session
 * reuse. Uses the password grant (Reddit's "script app" flow), the
 * documented mechanism for a single-user, read-only research tool.
 */
export class RedditClient {
  private readonly credentials: RedditCredentials;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(credentials: RedditCredentials) {
    this.credentials = credentials;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const basicAuth = Buffer.from(
      `${this.credentials.clientId}:${this.credentials.clientSecret}`,
    ).toString("base64");

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Reddit OAuth token request failed: ${response.status} ${response.statusText}. Check your credentials with "auditreach auth --platform reddit".`,
      );
    }

    const token = (await response.json()) as RedditTokenResponse;
    this.accessToken = token.access_token;
    // Refresh 60s before actual expiry to avoid a request failing mid-flight.
    this.tokenExpiresAt = Date.now() + (token.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async search(options: RedditSearchOptions): Promise<SearchOutcome> {
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const accessToken = await this.getAccessToken();

    const params = new URLSearchParams({
      q: options.query,
      sort: "relevance",
      limit: String(limit),
    });
    if (options.subreddit) {
      params.set("restrict_sr", "1");
    }
    // Reddit's search listing endpoint accepts standard Listing pagination
    // cursors (before/after, Reddit "fullname" ids e.g. "t3_abc123"). These
    // let a caller page past the ~1000-result search cap by walking the
    // listing forward/backward from a known item instead of relying on
    // offset-based paging, which Reddit's search API does not support.
    if (options.before) {
      params.set("before", options.before);
    }
    if (options.after) {
      params.set("after", options.after);
    }

    const path = options.subreddit
      ? `/r/${encodeURIComponent(options.subreddit)}/search`
      : "/search";

    const response = await fetch(`${API_BASE}${path}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit search request failed: ${response.status} ${response.statusText}`);
    }

    const listing = (await response.json()) as RedditListingResponse;

    const items: SearchResultItem[] = listing.data.children.map(({ data }) => ({
      id: data.id,
      title: data.title,
      url: `https://reddit.com${data.permalink}`,
      createdAt: new Date(data.created_utc * 1000).toISOString(),
      author: data.author,
      score: data.score,
      extra: {
        subreddit: data.subreddit_name_prefixed,
        num_comments: data.num_comments,
      },
    }));

    return {
      platform: "reddit",
      endpoint: options.subreddit ? `GET /r/${options.subreddit}/search` : "GET /search",
      queryParams: {
        query: options.query,
        subreddit: options.subreddit,
        limit,
        before: options.before,
        after: options.after,
      },
      authScope: "OAuth script-app grant, read-only, public-subreddit scope",
      consentBasis:
        "Reddit API Terms -- public content, official API, read-only script-app credentials",
      items,
      // Cursors read back from Reddit's own response (not an echo of the
      // request params above) -- feed `nextCursor.after` into the next
      // call's `--after`/`options.after` to walk forward through results
      // past the ~1000-result search cap, and `nextCursor.before` to walk
      // backward. This is the piece praw#614 was actually stuck on.
      nextCursor: {
        after: listing.data.after ?? null,
        before: listing.data.before ?? null,
      },
    };
  }
}
