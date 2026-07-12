import { beforeEach, describe, expect, it, vi } from "vitest";

const setCredentialMock = vi.fn();
const deleteCredentialMock = vi.fn();
const promptTextMock = vi.fn();
const promptSecretMock = vi.fn();

vi.mock("../src/auth/credential-store.js", () => ({
  setCredential: setCredentialMock,
  deleteCredential: deleteCredentialMock,
}));

vi.mock("../src/util/prompt.js", () => ({
  promptText: promptTextMock,
  promptSecret: promptSecretMock,
}));

const { runAuthCommand } = await import("../src/commands/auth.js");

describe("runAuthCommand", () => {
  beforeEach(() => {
    setCredentialMock.mockReset();
    deleteCredentialMock.mockReset();
    promptTextMock.mockReset();
    promptSecretMock.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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
});
