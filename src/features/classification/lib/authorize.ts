import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a caller-provided token against the expected trigger
 * secret. The length is guarded first because `timingSafeEqual` throws on
 * unequal-length buffers; a length mismatch is simply "not authorized".
 */
export function isAuthorizedToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
