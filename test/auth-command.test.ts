import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setCredentialMock = vi.fn();
const deleteCredentialMock = vi.fn();
const getRedditCredentialsMock = vi.fn();
const getYoutubeCredentialsMock = vi.fn();
const promptTextMock = vi.fn();
const promptSecretMock = vi.fn();
const redditVerifyMock = vi.fn();
const youtubeVerifyMock = vi.fn();

vi.mock("../src/auth/credential-store.js", () => ({
  setCredential: setCredentialMock,
  deleteCredential: deleteCredentialMock,
  getRedditCredentials: getRedditCredentialsMock,
  getYoutubeCredentials: getYoutubeCredentialsMock,
}));

vi.mock("../src/util/prompt.js", () => ({
  promptText: promptTextMock,
  promptSecret: promptSecretMock,
}));

vi.mock("../src/clients/reddit-client.js", () => ({
  RedditClient: vi.fn(function (this: unknown) {
    return { verifyCredentials: redditVerifyMock };
  }),
}));

vi.mock("../src/clients/youtube-client.js", () => ({
  YoutubeClient: vi.fn(function (this: unknown) {
    return { verifyCredentials: youtubeVerifyMock };
  }),
}));

const { runAuthCommand } = await import("../src/commands/auth.js");

describe("runAuthCommand", () => {
  beforeEach(() => {
    setCredentialMock.mockReset();
    deleteCredentialMock.mockReset();
    getRedditCredentialsMock.mockReset();
    getYoutubeCredentialsMock.mockReset();
    promptTextMock.mockReset();
    promptSecretMock.mockReset();
    redditVerifyMock.mockReset();
    youtubeVerifyMock.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = 0;
  });

  it("prompts for and stores all four Reddit credential fields", async () => {
    promptTextMock.mockResolvedValueOnce("client-id-value").mockResolvedValueOnce("username-value");
    promptSecretMock
      .mockResolvedValueOnce("client-secret-value")
      .mockResolvedValueOnce("password-value");

    await runAuthCommand({ platform: "reddit" });

    expect(setCredentialMock).toHaveBeenCalledWith("reddit", "clientId", "client-id-value");
    expect(setCredentialMock).toHaveBeenCalledWith("reddit", "clientSecret", "client-secret-value");
    expect(setCredentialMock).toHaveBeenCalledWith("reddit", "username", "username-value");
    expect(setCredentialMock).toHaveBeenCalledWith("reddit", "password", "password-value");
  });

  it("prompts for and stores the YouTube API key via the masked prompt", async () => {
    promptSecretMock.mockResolvedValueOnce("api-key-value");

    await runAuthCommand({ platform: "youtube" });

    expect(setCredentialMock).toHaveBeenCalledWith("youtube", "apiKey", "api-key-value");
    expect(promptTextMock).not.toHaveBeenCalled();
  });

  it("uses the masked prompt (never promptText) for every secret field", async () => {
    promptTextMock.mockResolvedValueOnce("client-id-value").mockResolvedValueOnce("username-value");
    promptSecretMock
      .mockResolvedValueOnce("client-secret-value")
      .mockResolvedValueOnce("password-value");

    await runAuthCommand({ platform: "reddit" });

    expect(promptSecretMock).toHaveBeenCalledTimes(2);
    expect(promptTextMock).toHaveBeenCalledTimes(2);
  });

  it("clears all four Reddit credential fields with --clear", async () => {
    await runAuthCommand({ platform: "reddit", clear: true });

    expect(deleteCredentialMock).toHaveBeenCalledWith("reddit", "clientId");
    expect(deleteCredentialMock).toHaveBeenCalledWith("reddit", "clientSecret");
    expect(deleteCredentialMock).toHaveBeenCalledWith("reddit", "username");
    expect(deleteCredentialMock).toHaveBeenCalledWith("reddit", "password");
    expect(setCredentialMock).not.toHaveBeenCalled();
  });

  it("clears the YouTube API key with --clear", async () => {
    await runAuthCommand({ platform: "youtube", clear: true });
    expect(deleteCredentialMock).toHaveBeenCalledWith("youtube", "apiKey");
  });

  describe("--verify", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(path.join(tmpdir(), "auditreach-auth-verify-"));
      process.chdir(tmpDir);
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("reports success for valid Reddit credentials with no results file or audit-log entry", async () => {
      getRedditCredentialsMock.mockReturnValue({
        clientId: "id",
        clientSecret: "secret",
        username: "user",
        password: "pass",
      });
      redditVerifyMock.mockResolvedValue(undefined);

      await runAuthCommand({ platform: "reddit", verify: true });

      expect(redditVerifyMock).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
      expect(setCredentialMock).not.toHaveBeenCalled();
      expect(await readdir(tmpDir)).toHaveLength(0);
    });

    it("reports a clear failure message for invalid Reddit credentials with no results file or audit-log entry", async () => {
      getRedditCredentialsMock.mockReturnValue({
        clientId: "id",
        clientSecret: "secret",
        username: "user",
        password: "pass",
      });
      redditVerifyMock.mockRejectedValue(
        new Error(
          'Reddit OAuth token request failed: 401 Unauthorized. Check your credentials with "auditreach auth --platform reddit".',
        ),
      );
      const errorSpy = vi.spyOn(console, "error");

      await runAuthCommand({ platform: "reddit", verify: true });

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("credential check failed"));
      expect(await readdir(tmpDir)).toHaveLength(0);
    });

    it("exits 1 with a helpful message when no Reddit credentials are stored, without calling verifyCredentials", async () => {
      getRedditCredentialsMock.mockReturnValue(null);

      await runAuthCommand({ platform: "reddit", verify: true });

      expect(process.exitCode).toBe(1);
      expect(redditVerifyMock).not.toHaveBeenCalled();
      expect(await readdir(tmpDir)).toHaveLength(0);
    });

    it("reports success for valid YouTube credentials with no results file or audit-log entry", async () => {
      getYoutubeCredentialsMock.mockReturnValue({ apiKey: "key" });
      youtubeVerifyMock.mockResolvedValue(undefined);

      await runAuthCommand({ platform: "youtube", verify: true });

      expect(youtubeVerifyMock).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
      expect(await readdir(tmpDir)).toHaveLength(0);
    });

    it("reports a clear failure message for invalid YouTube credentials", async () => {
      getYoutubeCredentialsMock.mockReturnValue({ apiKey: "bad-key" });
      youtubeVerifyMock.mockRejectedValue(
        new Error("API key not valid. Please pass a valid API key."),
      );
      const errorSpy = vi.spyOn(console, "error");

      await runAuthCommand({ platform: "youtube", verify: true });

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("credential check failed"));
      expect(await readdir(tmpDir)).toHaveLength(0);
    });

    it("exits 1 with a helpful message when no YouTube credentials are stored, without calling verifyCredentials", async () => {
      getYoutubeCredentialsMock.mockReturnValue(null);

      await runAuthCommand({ platform: "youtube", verify: true });

      expect(process.exitCode).toBe(1);
      expect(youtubeVerifyMock).not.toHaveBeenCalled();
    });

    describe("--json", () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("prints one parseable JSON object for valid credentials", async () => {
        getRedditCredentialsMock.mockReturnValue({
          clientId: "id",
          clientSecret: "secret",
          username: "user",
          password: "pass",
        });
        redditVerifyMock.mockResolvedValue(undefined);
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        await runAuthCommand({ platform: "reddit", verify: true, json: true });

        expect(writeSpy).toHaveBeenCalledTimes(1);
        const printed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
        expect(printed).toEqual({ platform: "reddit", valid: true, error: null });
        expect(process.exitCode).toBe(0);
      });

      it("prints one parseable JSON object with the error for invalid credentials, never throwing", async () => {
        getYoutubeCredentialsMock.mockReturnValue({ apiKey: "bad-key" });
        youtubeVerifyMock.mockRejectedValue(
          new Error("API key not valid. Please pass a valid API key."),
        );
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        await runAuthCommand({ platform: "youtube", verify: true, json: true });

        const printed = JSON.parse(writeSpy.mock.calls[0]![0] as string);
        expect(printed.valid).toBe(false);
        expect(printed.error).toContain("credential check failed");
        expect(process.exitCode).toBe(1);
      });
    });
  });
});
