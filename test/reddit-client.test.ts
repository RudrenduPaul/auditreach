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
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
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
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_xyz",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
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
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    const outcome = await client.search({ query: "test", subreddit: "MachineLearning" });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(searchCall[0]).toContain("/r/MachineLearning/search");
    expect(outcome.endpoint).toBe("GET /r/MachineLearning/search");
  });

  it("normalizes returned posts into SearchResultItem shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_abc",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(
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

  it("reuses a cached token across multiple searches instead of re-authenticating", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_cached",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
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
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_page",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
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
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "tok_nopage",
          token_type: "bearer",
          expires_in: 3600,
          scope: "*",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

    const client = new RedditClient(credentials);
    await client.search({ query: "test" });

    const searchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const requestUrl = new URL(searchCall[0]);
    expect(requestUrl.searchParams.has("after")).toBe(false);
    expect(requestUrl.searchParams.has("before")).toBe(false);
  });
});
