import { createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Canonical JSON: sorts object keys recursively so the same logical entry
 * always serializes to the same bytes, regardless of insertion order. This
 * is required for the audit-log hash chain to verify deterministically.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * A fingerprint proves which credential made a query without ever storing
 * or logging the credential itself. Only the last 6 hex characters of the
 * hash are kept -- enough to distinguish rotated keys in a local audit log,
 * not enough to be a partial credential leak.
 *
 * Derived with scrypt (a computationally expensive KDF) under a fixed
 * application salt so the value stays deterministic for a given credential
 * while resisting brute-force recovery. The Python port uses identical
 * parameters, so both implementations emit the same fingerprint.
 */
const FINGERPRINT_SALT = "auditreach:credential-fingerprint:v1";

export function credentialFingerprint(secret: string): string {
  const derived = scryptSync(secret, FINGERPRINT_SALT, 32, { N: 16384, r: 8, p: 1 });
  return derived.toString("hex").slice(-6);
}

export function generateEntryId(prefix = "ar"): string {
  const date = new Date().toISOString().slice(0, 10);
  const rand = randomBytes(3).toString("hex");
  return `${prefix}_${date}_${rand}`;
}
