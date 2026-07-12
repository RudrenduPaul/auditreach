import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

const setPasswordMock = vi.fn((value: string) => {
  store.set(currentAccount, value);
});
const getPasswordMock = vi.fn(() => {
  const value = store.get(currentAccount);
  if (value === undefined) {
    throw new Error("no password found");
  }
  return value;
});
const deletePasswordMock = vi.fn(() => store.delete(currentAccount));

let currentAccount = "";

vi.mock("@napi-rs/keyring", () => ({
  Entry: vi.fn(function (this: unknown, _service: string, account: string) {
    currentAccount = account;
    return {
      setPassword: setPasswordMock,
      getPassword: getPasswordMock,
      deletePassword: deletePasswordMock,
    };
  }),
}));

const {
  setCredential,
  getCredential,
  deleteCredential,
  getRedditCredentials,
  getYoutubeCredentials,
} = await import("../src/auth/credential-store.js");

describe("credential-store", () => {
  beforeEach(() => {
    store.clear();
  });

  it("round-trips a stored credential", () => {
    setCredential("youtube", "apiKey", "my-secret-key");
    expect(getCredential("youtube", "apiKey")).toBe("my-secret-key");
  });

  it("returns null for a credential that was never set", () => {
    expect(getCredential("reddit", "clientId")).toBeNull();
  });

  it("returns null after a credential is deleted", () => {
    setCredential("reddit", "clientId", "abc");
    deleteCredential("reddit", "clientId");
    expect(getCredential("reddit", "clientId")).toBeNull();
  });

  it("getRedditCredentials returns null unless all four fields are set", () => {
    setCredential("reddit", "clientId", "id");
    setCredential("reddit", "clientSecret", "secret");
    expect(getRedditCredentials()).toBeNull();

    setCredential("reddit", "username", "user");
    setCredential("reddit", "password", "pass");
    expect(getRedditCredentials()).toEqual({
      clientId: "id",
      clientSecret: "secret",
      username: "user",
      password: "pass",
    });
  });

  it("getYoutubeCredentials returns null unless apiKey is set", () => {
    expect(getYoutubeCredentials()).toBeNull();
    setCredential("youtube", "apiKey", "key123");
    expect(getYoutubeCredentials()).toEqual({ apiKey: "key123" });
  });

  it("namespaces credentials by platform -- reddit and youtube never collide", () => {
    setCredential("reddit", "clientId", "reddit-value");
    setCredential("youtube", "apiKey", "youtube-value");
    expect(getCredential("reddit", "clientId")).toBe("reddit-value");
    expect(getCredential("youtube", "apiKey")).toBe("youtube-value");
  });
});
