import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const getRedditCredentialsMock = vi.fn();
const getYoutubeCredentialsMock = vi.fn();
const redditSearchMock = vi.fn();
const youtubeSearchMock = vi.fn();
const redditVerifyMock = vi.fn();
const youtubeVerifyMock = vi.fn();

vi.mock("../src/auth/credential-store.js", () => ({
  getRedditCredentials: getRedditCredentialsMock,
  getYoutubeCredentials: getYoutubeCredentialsMock,
}));

vi.mock("../src/clients/reddit-client.js", () => ({
  RedditClient: vi.fn(function (this: unknown) {
    return { search: redditSearchMock, verifyCredentials: redditVerifyMock };
  }),
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
}));

vi.mock("../src/clients/youtube-client.js", () => ({
  YoutubeClient: vi.fn(function (this: unknown) {
    return { search: youtubeSearchMock, verifyCredentials: youtubeVerifyMock };
  }),
  DEFAULT_MAX_RESULTS: 25,
  MAX_MAX_RESULTS: 50,
}));

const { buildMcpServer } = await import("../src/commands/mcp.js");

let tmpDir: string;
let client: Client;

function textOf(result: CallToolResult): unknown {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error("expected a text content block");
  }
  return JSON.parse(first.text);
}

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "auditreach-mcp-cmd-"));
  process.chdir(tmpDir);
  getRedditCredentialsMock.mockReset();
  getYoutubeCredentialsMock.mockReset();
  redditSearchMock.mockReset();
  youtubeSearchMock.mockReset();
  redditVerifyMock.mockReset();
  youtubeVerifyMock.mockReset();

  const server = buildMcpServer({ version: "0.0.0-test" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

afterEach(async () => {
  await client.close();
  await rm(tmpDir, { recursive: true, force: true });
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

describe("MCP server", () => {
  it("exposes exactly the 3 documented tools -- no tool for setting or clearing credentials", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["auth_status", "search", "verify_log"]);
  });

  it("never imports the credential set/clear functions -- MCP has no path to them", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/commands/mcp.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/\bsetCredential\b/);
    expect(source).not.toMatch(/\bdeleteCredential\b/);
  });

  describe("search tool", () => {
    it("returns a tool error when no Reddit credentials are stored", async () => {
      getRedditCredentialsMock.mockReturnValue(null);

      const result = await client.callTool({
        name: "search",
        arguments: { platform: "reddit", query: "test" },
      });

      expect(result.isError).toBe(true);
      const parsed = textOf(result as CallToolResult) as { error: string };
      expect(parsed.error).toContain("No Reddit credentials found");
      expect(redditSearchMock).not.toHaveBeenCalled();
    });

    it("returns a tool error when --query is missing for a reddit search", async () => {
      getRedditCredentialsMock.mockReturnValue({
        clientId: "id",
        clientSecret: "secret",
        username: "user",
        password: "pass",
      });

      const result = await client.callTool({ name: "search", arguments: { platform: "reddit" } });

      expect(result.isError).toBe(true);
      const parsed = textOf(result as CallToolResult) as { error: string };
      expect(parsed.error).toContain("requires --query");
    });

    it("runs a reddit search end-to-end: structured result, results file, and audit-log entry", async () => {
      getRedditCredentialsMock.mockReturnValue({
        clientId: "id",
        clientSecret: "my-client-secret",
        username: "user",
        password: "pass",
      });
      redditSearchMock.mockResolvedValue(sampleOutcome);

      const result = await client.callTool({
        name: "search",
        arguments: { platform: "reddit", query: "test" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = textOf(result as CallToolResult) as {
        platform: string;
        items: unknown[];
        auditLogEntryId: string;
        resultsFile: string;
        auditLogFile: string;
        truncated: boolean;
      };
      expect(parsed.platform).toBe("reddit");
      expect(parsed.items).toHaveLength(1);
      expect(typeof parsed.auditLogEntryId).toBe("string");
      expect(parsed.truncated).toBe(false);

      const written = JSON.parse(
        await readFile(path.join(tmpDir, parsed.resultsFile), "utf8"),
      ) as unknown[];
      expect(written).toHaveLength(1);

      const logContent = await readFile(path.join(tmpDir, "auditreach.log.jsonl"), "utf8");
      expect(logContent).not.toContain("my-client-secret");
      const entry = JSON.parse(logContent.trim()) as { results_returned: number };
      expect(entry.results_returned).toBe(1);
    });

    it("runs a youtube search using channel/since/maxResults parameters", async () => {
      getYoutubeCredentialsMock.mockReturnValue({ apiKey: "yt-key" });
      youtubeSearchMock.mockResolvedValue({
        ...sampleOutcome,
        platform: "youtube",
        queryParams: { query: "test", maxResults: 5 },
      });

      const result = await client.callTool({
        name: "search",
        arguments: { platform: "youtube", query: "test", channel: "@AnthropicAI", maxResults: 5 },
      });

      expect(result.isError).toBeFalsy();
      expect(youtubeSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ channelHandle: "@AnthropicAI", maxResults: 5 }),
      );
      const parsed = textOf(result as CallToolResult) as { platform: string };
      expect(parsed.platform).toBe("youtube");
    });
  });

  describe("auth_status tool", () => {
    it("reports valid: false with a helpful message when no credentials are stored, without erroring the tool call", async () => {
      getRedditCredentialsMock.mockReturnValue(null);

      const result = await client.callTool({
        name: "auth_status",
        arguments: { platform: "reddit" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = textOf(result as CallToolResult) as {
        platform: string;
        valid: boolean;
        error: string | null;
      };
      expect(parsed.platform).toBe("reddit");
      expect(parsed.valid).toBe(false);
      expect(parsed.error).toContain("No Reddit credentials found");
    });

    it("reports valid: true when the stored credentials check out", async () => {
      getRedditCredentialsMock.mockReturnValue({
        clientId: "id",
        clientSecret: "secret",
        username: "user",
        password: "pass",
      });
      redditVerifyMock.mockResolvedValue(undefined);

      const result = await client.callTool({
        name: "auth_status",
        arguments: { platform: "reddit" },
      });

      const parsed = textOf(result as CallToolResult) as { valid: boolean; error: string | null };
      expect(parsed.valid).toBe(true);
      expect(parsed.error).toBeNull();
    });

    it("reports valid: true for youtube using the youtube client's verifyCredentials", async () => {
      getYoutubeCredentialsMock.mockReturnValue({ apiKey: "yt-key" });
      youtubeVerifyMock.mockResolvedValue(undefined);

      const result = await client.callTool({
        name: "auth_status",
        arguments: { platform: "youtube" },
      });

      const parsed = textOf(result as CallToolResult) as { valid: boolean };
      expect(parsed.valid).toBe(true);
      expect(youtubeVerifyMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("verify_log tool", () => {
    it("reports an intact empty chain when no log file exists yet", async () => {
      const result = await client.callTool({ name: "verify_log", arguments: {} });

      expect(result.isError).toBeFalsy();
      const parsed = textOf(result as CallToolResult) as { valid: boolean; totalEntries: number };
      expect(parsed.valid).toBe(true);
      expect(parsed.totalEntries).toBe(0);
    });

    it("reports a broken chain without erroring the tool call", async () => {
      const { appendAuditLogEntry } = await import("../src/audit-log/hash-chain-writer.js");
      const logPath = path.join(tmpDir, "auditreach.log.jsonl");
      const baseEntry = {
        entry_id: "ar_2026-07-12_abc123",
        timestamp: "2026-07-12T00:00:00.000Z",
        platform: "reddit" as const,
        endpoint: "GET /search",
        query_params: { query: "test" },
        auth_scope: "OAuth script-app grant, read-only, public-subreddit scope",
        consent_basis: "Reddit API Terms -- public content, official API",
        api_key_fingerprint: "sha256:abc123",
        results_returned: 5,
        prev_entry_hash: null,
      };
      await appendAuditLogEntry(baseEntry, logPath);
      await appendAuditLogEntry(
        { ...baseEntry, entry_id: "ar_2026-07-12_def456", prev_entry_hash: "sha256:wrong" },
        logPath,
      );

      const result = await client.callTool({ name: "verify_log", arguments: { path: logPath } });

      expect(result.isError).toBeFalsy();
      const parsed = textOf(result as CallToolResult) as {
        valid: boolean;
        brokenAtEntryId: string;
      };
      expect(parsed.valid).toBe(false);
      expect(parsed.brokenAtEntryId).toBe("ar_2026-07-12_def456");
    });
  });
});
