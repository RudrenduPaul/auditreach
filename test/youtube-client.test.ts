import { beforeEach, describe, expect, it, vi } from "vitest";

const searchListMock = vi.fn();
const channelsListMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    youtube: vi.fn(() => ({
      search: { list: searchListMock },
      channels: { list: channelsListMock },
    })),
  },
}));

const { YoutubeClient } = await import("../src/clients/youtube-client.js");

describe("YoutubeClient", () => {
  beforeEach(() => {
    searchListMock.mockReset();
    channelsListMock.mockReset();
  });

  it("throws when neither query nor channel is provided", async () => {
    const client = new YoutubeClient({ apiKey: "test-key" });
    await expect(client.search({})).rejects.toThrow(/requires either --query or --channel/);
  });

  it("searches by query and normalizes results", async () => {
    searchListMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: { videoId: "vid123" },
            snippet: {
              title: "Agent skill security explained",
              publishedAt: "2026-07-01T00:00:00Z",
              channelTitle: "Some Channel",
              channelId: "chan1",
              description: "desc",
            },
          },
        ],
      },
    });

    const client = new YoutubeClient({ apiKey: "test-key" });
    const outcome = await client.search({ query: "agent skill security" });

    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({
      id: "vid123",
      title: "Agent skill security explained",
      url: "https://www.youtube.com/watch?v=vid123",
      author: "Some Channel",
    });
    expect(channelsListMock).not.toHaveBeenCalled();
  });

  it("resolves a channel handle to a channel id before searching", async () => {
    channelsListMock.mockResolvedValueOnce({ data: { items: [{ id: "UCxxxx" }] } });
    searchListMock.mockResolvedValueOnce({ data: { items: [] } });

    const client = new YoutubeClient({ apiKey: "test-key" });
    await client.search({ channelHandle: "AnthropicAI" });

    expect(channelsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ forHandle: "@AnthropicAI" }),
    );
    expect(searchListMock).toHaveBeenCalledWith(expect.objectContaining({ channelId: "UCxxxx" }));
  });

  it("throws a clear error when a channel handle does not resolve", async () => {
    channelsListMock.mockResolvedValueOnce({ data: { items: [] } });

    const client = new YoutubeClient({ apiKey: "test-key" });
    await expect(client.search({ channelHandle: "doesnotexist" })).rejects.toThrow(
      /No YouTube channel found/,
    );
  });

  it("caps maxResults at the platform maximum", async () => {
    searchListMock.mockResolvedValueOnce({ data: { items: [] } });

    const client = new YoutubeClient({ apiKey: "test-key" });
    await client.search({ query: "test", maxResults: 500 });

    expect(searchListMock).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 50 }));
  });
});
