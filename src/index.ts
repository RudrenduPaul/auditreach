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
export { executeSearch, SearchCommandError } from "./commands/search.js";
export { checkAuthStatus } from "./commands/auth.js";
export { executeVerifyLog } from "./commands/verify-log.js";
export { buildMcpServer, runMcpServerCommand } from "./commands/mcp.js";
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
export type { SearchExecutionResult } from "./commands/search.js";
export type { AuthStatusResult } from "./commands/auth.js";
export type { VerifyLogResult } from "./commands/verify-log.js";
export type { McpCommandArgs } from "./commands/mcp.js";
