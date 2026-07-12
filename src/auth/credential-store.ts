import { Entry } from "@napi-rs/keyring";
import type { Platform } from "../types.js";

const SERVICE_NAME = "auditreach";

export type RedditCredentialKey = "clientId" | "clientSecret" | "username" | "password";
export type YoutubeCredentialKey = "apiKey";
export type CredentialKey = RedditCredentialKey | YoutubeCredentialKey;

function accountName(platform: Platform, key: CredentialKey): string {
  return `${platform}:${key}`;
}

/**
 * All credential I/O goes through this module. It is the one place allowed
 * to touch a raw secret -- callers get it back only to hand directly to an
 * API client's auth constructor, never to log, print, or serialize it.
 */
export function setCredential(platform: Platform, key: CredentialKey, value: string): void {
  const entry = new Entry(SERVICE_NAME, accountName(platform, key));
  entry.setPassword(value);
}

export function getCredential(platform: Platform, key: CredentialKey): string | null {
  const entry = new Entry(SERVICE_NAME, accountName(platform, key));
  try {
    return entry.getPassword();
  } catch {
    return null;
  }
}

export function deleteCredential(platform: Platform, key: CredentialKey): boolean {
  const entry = new Entry(SERVICE_NAME, accountName(platform, key));
  try {
    return entry.deletePassword();
  } catch {
    return false;
  }
}

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface YoutubeCredentials {
  apiKey: string;
}

export function getRedditCredentials(): RedditCredentials | null {
  const clientId = getCredential("reddit", "clientId");
  const clientSecret = getCredential("reddit", "clientSecret");
  const username = getCredential("reddit", "username");
  const password = getCredential("reddit", "password");
  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }
  return { clientId, clientSecret, username, password };
}

export function getYoutubeCredentials(): YoutubeCredentials | null {
  const apiKey = getCredential("youtube", "apiKey");
  if (!apiKey) {
    return null;
  }
  return { apiKey };
}
