import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRedditCredentialsMock = vi.fn();
const getYoutubeCredentialsMock = vi.fn();
const redditSearchMock = vi.fn();
const youtubeSearchMock = vi.fn();

vi.mock("../src/auth/credential-store.js", () => ({
  getRedditCredentials: getRedditCredentialsMock,
  getYoutubeCredentials: getYoutubeCredentialsMock,
}));

vi.mock("../src/clients/reddit-client.js", () => ({
  RedditClient: vi.fn(function (this: unknown) {
    return { search: redditSearchMock };
  }),
  MAX_LIMIT: 100,
}));

vi.mock("../src/clients/youtube-client.js", () => ({
  YoutubeClient: vi.fn(function (this: unknown) {
    return { search: youtubeSearchMock };
  }),
  MAX_MAX_RESULTS: 50,
}));

const { runSearchCommand } = await import("../src/commands/search.js");

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "auditreach-search-cmd-"));
  process.chdir(tmpDir);
  getRedditCredentialsMock.mockReset();
  getYoutubeCredentialsMock.mockReset();
  redditSearchMock.mockReset();
  youtubeSearchMock.mockReset();
  vi.spyOn(console, "log")
    .mockImplementation(() => undefined)
    .mockClear();
  vi.spyOn(console, "error")
    .mockImplementation(() => undefined)
    .mockClear();
  process.exitCode = 0;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  process.exitCode = 0;
});

const sampleOutcome = {
  platform: "reddit" as const,
  endpoint: "GET /search",
  queryParams: { query: "test" },
  authScope: "OAuth script-app grant, read-only, public-subreddit scope",
  consentBasis: "Reddit API Terms -- public content, official API",
  items: [
    {
      id: "abc",
      title: "A post",
      url: "https://reddit.com/r/test/abc",
      createdAt: "2026-07-12T00:00:00.000Z",
      author: "someone",
      score: 10,
      extra: {},
    },
  ],
};

describe("runSearchCommand", () => {
  it("exits 1 with a helpful message when no Reddit credentials are stored", async () => {
    getRedditCredentialsMock.mockReturnValue(null);
    await runSearchCommand({ platform: "reddit", query: "test" });
    expect(process.exitCode).toBe(1);
    expect(redditSearchMock).not.toHaveBeenCalled();
  });

  it("exits 1 when --query is missing for a reddit search", async () => {
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: "secret",
      username: "user",
      password: "pass",
    });
    await runSearchCommand({ platform: "reddit" });
    expect(process.exitCode).toBe(1);
    expect(redditSearchMock).not.toHaveBeenCalled();
  });

  it("writes results to a JSON file and appends an audit log entry on success", async () => {
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: "my-client-secret",
      username: "user",
      password: "pass",
    });
    redditSearchMock.mockResolvedValue(sampleOutcome);

    await runSearchCommand({ platform: "reddit", query: "test", output: "results.json" });

    const written = JSON.parse(await readFile(path.join(tmpDir, "results.json"), "utf8"));
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe("abc");

    const logContent = await readFile(path.join(tmpDir, "auditreach.log.jsonl"), "utf8");
    const entry = JSON.parse(logContent.trim());
    expect(entry.platform).toBe("reddit");
    expect(entry.results_returned).toBe(1);
    expect(entry.consent_basis).toBe(sampleOutcome.consentBasis);
    expect(process.exitCode).toBe(0);
  });

  it("never writes the raw client secret into the audit log", async () => {
    const secret = "super-secret-value-should-not-leak";
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: secret,
      username: "user",
      password: "pass",
    });
    redditSearchMock.mockResolvedValue(sampleOutcome);

    await runSearchCommand({ platform: "reddit", query: "test", output: "results.json" });

    const logContent = await readFile(path.join(tmpDir, "auditreach.log.jsonl"), "utf8");
    expect(logContent).not.toContain(secret);
    const entry = JSON.parse(logContent.trim());
    expect(entry.api_key_fingerprint).toMatch(/^sha256:[0-9a-f]{6}$/);
  });

  it("chains prev_entry_hash across multiple searches", async () => {
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: "secret",
      username: "user",
      password: "pass",
    });
    redditSearchMock.mockResolvedValue(sampleOutcome);

    await runSearchCommand({ platform: "reddit", query: "first", output: "r1.json" });
    await runSearchCommand({ platform: "reddit", query: "second", output: "r2.json" });

    const logContent = await readFile(path.join(tmpDir, "auditreach.log.jsonl"), "utf8");
    const lines = logContent
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[1].prev_entry_hash).toBe(lines[0].entry_hash);
  });

  it("exits 1 with a helpful message when no YouTube credentials are stored", async () => {
    getYoutubeCredentialsMock.mockReturnValue(null);
    await runSearchCommand({ platform: "youtube", query: "test" });
    expect(process.exitCode).toBe(1);
    expect(youtubeSearchMock).not.toHaveBeenCalled();
  });

  it("runs a youtube search when credentials are present", async () => {
    getYoutubeCredentialsMock.mockReturnValue({ apiKey: "yt-key" });
    youtubeSearchMock.mockResolvedValue({ ...sampleOutcome, platform: "youtube" });

    await runSearchCommand({ platform: "youtube", query: "test", output: "yt.json" });

    expect(youtubeSearchMock).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("warns on stderr when the result count equals the applied (silent default) limit", async () => {
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: "secret",
      username: "user",
      password: "pass",
    });
    redditSearchMock.mockResolvedValue({
      ...sampleOutcome,
      queryParams: { query: "test", limit: 25 },
      items: [
        {
          id: "item-0",
          title: "A post",
          url: "https://reddit.com/r/test/item-0",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-1",
          title: "A post",
          url: "https://reddit.com/r/test/item-1",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-2",
          title: "A post",
          url: "https://reddit.com/r/test/item-2",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-3",
          title: "A post",
          url: "https://reddit.com/r/test/item-3",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-4",
          title: "A post",
          url: "https://reddit.com/r/test/item-4",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-5",
          title: "A post",
          url: "https://reddit.com/r/test/item-5",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-6",
          title: "A post",
          url: "https://reddit.com/r/test/item-6",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-7",
          title: "A post",
          url: "https://reddit.com/r/test/item-7",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-8",
          title: "A post",
          url: "https://reddit.com/r/test/item-8",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-9",
          title: "A post",
          url: "https://reddit.com/r/test/item-9",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-10",
          title: "A post",
          url: "https://reddit.com/r/test/item-10",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-11",
          title: "A post",
          url: "https://reddit.com/r/test/item-11",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-12",
          title: "A post",
          url: "https://reddit.com/r/test/item-12",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-13",
          title: "A post",
          url: "https://reddit.com/r/test/item-13",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-14",
          title: "A post",
          url: "https://reddit.com/r/test/item-14",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-15",
          title: "A post",
          url: "https://reddit.com/r/test/item-15",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-16",
          title: "A post",
          url: "https://reddit.com/r/test/item-16",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-17",
          title: "A post",
          url: "https://reddit.com/r/test/item-17",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-18",
          title: "A post",
          url: "https://reddit.com/r/test/item-18",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-19",
          title: "A post",
          url: "https://reddit.com/r/test/item-19",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-20",
          title: "A post",
          url: "https://reddit.com/r/test/item-20",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-21",
          title: "A post",
          url: "https://reddit.com/r/test/item-21",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-22",
          title: "A post",
          url: "https://reddit.com/r/test/item-22",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-23",
          title: "A post",
          url: "https://reddit.com/r/test/item-23",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-24",
          title: "A post",
          url: "https://reddit.com/r/test/item-24",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
      ],
    });

    await runSearchCommand({ platform: "reddit", query: "test", output: "results.json" });

    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const warned = errorCalls.some((call) => String(call[0]).includes("Warning"));
    expect(warned).toBe(true);
  });

  it("warns on stderr when the result count equals an explicit --max-results value", async () => {
    getYoutubeCredentialsMock.mockReturnValue({ apiKey: "yt-key" });
    youtubeSearchMock.mockResolvedValue({
      ...sampleOutcome,
      platform: "youtube",
      queryParams: { query: "test", maxResults: 5 },
      items: [
        {
          id: "item-0",
          title: "A post",
          url: "https://reddit.com/r/test/item-0",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-1",
          title: "A post",
          url: "https://reddit.com/r/test/item-1",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-2",
          title: "A post",
          url: "https://reddit.com/r/test/item-2",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-3",
          title: "A post",
          url: "https://reddit.com/r/test/item-3",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
        {
          id: "item-4",
          title: "A post",
          url: "https://reddit.com/r/test/item-4",
          createdAt: "2026-07-12T00:00:00.000Z",
          author: "someone",
          score: 10,
          extra: {},
        },
      ],
    });

    await runSearchCommand({
      platform: "youtube",
      query: "test",
      maxResults: 5,
      output: "yt.json",
    });

    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const warned = errorCalls.some((call) => String(call[0]).includes("Warning"));
    expect(warned).toBe(true);
  });

  it("does not warn when the result count is below the applied limit", async () => {
    getRedditCredentialsMock.mockReturnValue({
      clientId: "id",
      clientSecret: "secret",
      username: "user",
      password: "pass",
    });
    redditSearchMock.mockResolvedValue({
      ...sampleOutcome,
      queryParams: { query: "test", limit: 25 },
    });

    await runSearchCommand({ platform: "reddit", query: "test", output: "results.json" });

    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const warned = errorCalls.some((call) => String(call[0]).includes("Warning"));
    expect(warned).toBe(false);
  });
});
