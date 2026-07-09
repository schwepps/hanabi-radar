/**
 * Extract the raw token from an HTTP `Authorization: Bearer <token>` header value.
 *
 * Returns `null` when the header is absent or not a well-formed bearer credential
 * (the caller maps `null` to a uniform 401). The scheme match is case-insensitive
 * per RFC 7235; the token is returned trimmed, and an empty token is rejected.
 */
export function parseBearerToken(header: string | null): string | null {
  if (header == null) {
    return null;
  }
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  if (match == null) {
    return null;
  }
  const token = match[1].trim();
  return token === '' ? null : token;
}
