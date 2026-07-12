export { RedditClient } from "./clients/reddit-client.js";
export { YoutubeClient } from "./clients/youtube-client.js";
export {
  getCredential,
  setCredential,
  deleteCredential,
  getRedditCredentials,
  getYoutubeCredentials,
} from "./auth/credential-store.js";
export {
  appendAuditLogEntry,
  getLastEntryHash,
  computeEntryHash,
  DEFAULT_AUDIT_LOG_PATH,
} from "./audit-log/hash-chain-writer.js";
export { verifyAuditLogChain } from "./audit-log/chain-verifier.js";
export { credentialFingerprint, canonicalJson, sha256Hex } from "./util/crypto.js";
export type {
  Platform,
  AuditLogEntry,
  UnhashedAuditLogEntry,
  ChainVerificationResult,
  SearchResultItem,
  SearchOutcome,
  RedditSearchOptions,
  YoutubeSearchOptions,
} from "./types.js";
