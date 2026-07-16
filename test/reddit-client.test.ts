import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedditClient } from "../src/clients/reddit-client.js";
import type { RedditCredentials } from "../src/auth/credential-store.js";

const credentials: RedditCredentials = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  username: "test-user",
  password: "test-password",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

function tokenResponse(accessToken: string) {
  return jsonResponse({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    scope: "*",
  });
}

describe("RedditClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests an OAuth token before searching, then calls the search endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_abc"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    await client.search({ query: "agent skill security" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenCall[0]).toBe("https://www.reddit.com/api/v1/access_token");
    expect(tokenCall[1].method).toBe("POST");

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(searchCall[0]).toContain("https://oauth.reddit.com/search");
    const headers = searchCall[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_abc");
  });

  it("never sends the client secret or password in the search request headers", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_xyz"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    await client.search({ query: "test" });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const serializedHeaders = JSON.stringify(searchCall[1].headers);
    expect(serializedHeaders).not.toContain(credentials.clientSecret);
    expect(serializedHeaders).not.toContain(credentials.password);
  });

  it("scopes the search to a subreddit when provided", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_abc"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    const outcome = await client.search({ query: "test", subreddit: "MachineLearning" });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(searchCall[0]).toContain("/r/MachineLearning/search");
    expect(outcome.endpoint).toBe("GET /r/MachineLearning/search");
  });

  it("normalizes returned posts into SearchResultItem shape", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_abc")).mockResolvedValueOnce(
      jsonResponse({
        data: {
          children: [
            {
              data: {
                id: "abc123",
                title: "A real post",
                permalink: "/r/test/comments/abc123/a_real_post/",
                created_utc: 1_720_000_000,
                author: "some_user",
                score: 42,
                subreddit_name_prefixed: "r/test",
                num_comments: 7,
              },
            },
          ],
        },
      }),
    );

    const client = new RedditClient(credentials);
    const outcome = await client.search({ query: "test" });

    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({
      id: "abc123",
      title: "A real post",
      author: "some_user",
      score: 42,
      url: "https://reddit.com/r/test/comments/abc123/a_real_post/",
    });
  });

  it("throws a clear error when the token request fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, false, 401));

    const client = new RedditClient(credentials);
    await expect(client.search({ query: "test" })).rejects.toThrow(/OAuth token request failed/);
  });

  it("gives cause-specific guidance when the search 400s due to a leading r/ prefix on --subreddit", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));

    const client = new RedditClient(credentials);
    await expect(client.search({ query: "test", subreddit: "r/MachineLearning" })).rejects.toThrow(
      /Reddit search request failed: 400.*leading "r\/" or "\/r\/" prefix.*try "MachineLearning" instead/,
    );
  });

  it("gives the same guidance when --subreddit has a leading /r/ prefix", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));

    const client = new RedditClient(credentials);
    await expect(client.search({ query: "test", subreddit: "/r/MachineLearning" })).rejects.toThrow(
      /try "MachineLearning" instead/,
    );
  });

  it("strips ANSI/control characters from --subreddit before echoing it in the guidance message", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));

    const client = new RedditClient(credentials);
    const maliciousSubreddit = "r/\x1b[31mMachineLearning\x1b[0m";
    let thrown: Error | undefined;
    try {
      await client.search({ query: "test", subreddit: maliciousSubreddit });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeDefined();
    // The raw ESC byte (the part a terminal needs to interpret "[31m" as a
    // color code) must never reach the thrown message; the literal bracket
    // text left behind is harmless.
    expect(thrown?.message).not.toContain("\x1b");
    expect(thrown?.message).toContain('Your --subreddit value "r/[31mMachineLearning[0m" has a leading');
  });

  it("falls back to a generic message for a 400 with no leading r/ prefix on --subreddit", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));

    const client = new RedditClient(credentials);
    await expect(client.search({ query: "test", subreddit: "MachineLearning" })).rejects.toThrow(
      "Reddit search request failed: 400 Error.",
    );
  });

  it("falls back to a generic message for a 400 with no --subreddit at all", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));

    const client = new RedditClient(credentials);
    await expect(client.search({ query: "test" })).rejects.toThrow(
      "Reddit search request failed: 400 Error.",
    );
  });

  it("reuses a cached token across multiple searches instead of re-authenticating", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_cached"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    await client.search({ query: "first" });
    await client.search({ query: "second" });

    // 1 token request + 2 search requests = 3 total, not 4.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("passes before/after cursor params through to the search request when supplied", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_page"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    const outcome = await client.search({
      query: "test",
      after: "t3_abc123",
      before: "t3_def456",
    });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const requestUrl = new URL(searchCall[0]);
    expect(requestUrl.searchParams.get("after")).toBe("t3_abc123");
    expect(requestUrl.searchParams.get("before")).toBe("t3_def456");
    expect(outcome.queryParams.after).toBe("t3_abc123");
    expect(outcome.queryParams.before).toBe("t3_def456");
  });

  it("omits before/after params entirely when not supplied", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok_nopage"))
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    await client.search({ query: "test" });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const requestUrl = new URL(searchCall[0]);
    expect(requestUrl.searchParams.has("after")).toBe(false);
    expect(requestUrl.searchParams.has("before")).toBe(false);
  });

  it("extracts the after/before pagination cursors from the response listing (praw#614)", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_cursor")).mockResolvedValueOnce(
      jsonResponse({
        data: {
          after: "t3_nextpage001",
          before: "t3_prevpage002",
          children: [
            {
              data: {
                id: "xyz789",
                title: "Another post",
                permalink: "/r/test/comments/xyz789/another_post/",
                created_utc: 1_720_000_000,
                author: "another_user",
                score: 5,
                subreddit_name_prefixed: "r/test",
                num_comments: 1,
              },
            },
          ],
        },
      }),
    );

    const client = new RedditClient(credentials);
    const outcome = await client.search({ query: "test" });

    // These come from Reddit's response, not an echo of the request --
    // this is the "page 2 cursor" the reporter of praw#614 was stuck on.
    expect(outcome.nextCursor).toEqual({
      after: "t3_nextpage001",
      before: "t3_prevpage002",
    });
  });

  it("returns null cursors when the response listing has no more pages", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_lastpage")).mockResolvedValueOnce(
      jsonResponse({
        data: {
          after: null,
          before: null,
          children: [],
        },
      }),
    );

    const client = new RedditClient(credentials);
    const outcome = await client.search({ query: "test" });

    expect(outcome.nextCursor).toEqual({ after: null, before: null });
  });
});
