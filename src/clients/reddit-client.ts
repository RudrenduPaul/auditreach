import type { RedditCredentials } from "../auth/credential-store.js";
import type { RedditSearchOptions, SearchOutcome, SearchResultItem } from "../types.js";

const USER_AGENT = "auditreach-cli/0.1.0 (official-API-only compliance research tool)";
// Applied silently when --max-results is omitted, and used as the hard
// ceiling even when --max-results is passed a larger value. Documented in
// --help (src/cli.ts) and README.md so a caller cannot be silently truncated
// without knowing more results exist -- see the truncation warning emitted
// by src/commands/search.ts.
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

// Matches a subreddit value that still carries a leading "r/" or "/r/"
// prefix, e.g. "r/MachineLearning" or "/r/MachineLearning" instead of the
// bare "MachineLearning" the Reddit search API expects. This is the most
// common cause of an otherwise-undiagnosed 400 on the search endpoint (see
// https://github.com/praw-dev/praw/issues/1939).
const LEADING_SUBREDDIT_PREFIX = /^\/?r\//i;

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

  /**
   * Builds a cause-specific suffix for a failed search request, mirroring
   * the guidance style used for token-request failures above. Returns an
   * empty string when no known cause can be diagnosed, so callers can
   * always append the result directly onto the generic error message.
   */
  private diagnoseSearchFailure(status: number, subreddit?: string): string {
    if (status === 400 && subreddit && LEADING_SUBREDDIT_PREFIX.test(subreddit)) {
      const cleaned = subreddit.replace(LEADING_SUBREDDIT_PREFIX, "");
      return ` Your --subreddit value "${subreddit}" has a leading "r/" or "/r/" prefix -- Reddit's API expects just the subreddit name (try "${cleaned}" instead).`;
    }
    return "";
  }

  /**
   * Performs the same OAuth token request used before every search, but
   * without issuing a search call. Used by `auditreach auth --verify` to
   * check credentials without requiring --query and without touching the
   * results file or audit log. Always forces a fresh token request rather
   * than reusing a cached one, so it reflects the current credential state.
   */
  async verifyCredentials(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    await this.getAccessToken();
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
      throw new Error(
        `Reddit search request failed: ${response.status} ${response.statusText}.${this.diagnoseSearchFailure(response.status, options.subreddit)}`,
      );
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
      },
      authScope: "OAuth script-app grant, read-only, public-subreddit scope",
      consentBasis:
        "Reddit API Terms -- public content, official API, read-only script-app credentials",
      items,
    };
  }
}
