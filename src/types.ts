export type Platform = "reddit" | "youtube";

export interface AuditLogEntry {
  entry_id: string;
  timestamp: string;
  platform: Platform;
  endpoint: string;
  query_params: Record<string, string | number | boolean | undefined>;
  auth_scope: string;
  consent_basis: string;
  api_key_fingerprint: string;
  results_returned: number;
  prev_entry_hash: string | null;
  entry_hash: string;
}

export type UnhashedAuditLogEntry = Omit<AuditLogEntry, "entry_hash">;

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenAtEntryId: string | null;
  brokenAtIndex: number | null;
  reason: string | null;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  author: string | null;
  score: number | null;
  extra: Record<string, unknown>;
}

/** Cursor fullnames read back from a platform's response, for requesting the next/previous page. */
export interface SearchCursor {
  after: string | null;
  before: string | null;
}

export interface SearchOutcome {
  platform: Platform;
  endpoint: string;
  queryParams: Record<string, string | number | boolean | undefined>;
  authScope: string;
  consentBasis: string;
  items: SearchResultItem[];
  /** Pagination cursors extracted from the response itself (not an echo of the request params). Populated when the platform's API exposes them. */
  nextCursor?: SearchCursor;
}

export interface RedditSearchOptions {
  query: string;
  subreddit?: string;
  limit?: number;
  /** Reddit fullname (e.g. "t3_abc123") to page results before, for paginating past the ~1000-result search cap. */
  before?: string;
  /** Reddit fullname (e.g. "t3_abc123") to page results after, for paginating past the ~1000-result search cap. */
  after?: string;
}

export interface YoutubeSearchOptions {
  query?: string;
  channelHandle?: string;
  since?: string;
  maxResults?: number;
}
