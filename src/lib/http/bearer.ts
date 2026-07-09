/**
 * Extract the raw token from an HTTP `Authorization: Bearer <token>` header value.
 *
 * A shared, feature-agnostic helper: the ingestion, sensor, and classification
 * routes all authenticate this way, so it lives in `src/lib/http/` rather than in
 * any one feature.
 *
 * Returns `null` when the header is absent or not a well-formed bearer credential
 * (the caller maps `null` to a uniform 401). Per RFC 6750 the credential is a SINGLE
 * non-whitespace token: the scheme is case-insensitive and extra spaces after it are
 * tolerated, but a value with internal/trailing whitespace (e.g. `Bearer a b`) is
 * malformed and rejected.
 */
export function parseBearerToken(header: string | null): string | null {
  if (header == null) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match == null ? null : match[1];
}
