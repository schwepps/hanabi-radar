import { createHash } from 'node:crypto';

/**
 * Hash a raw sensor ingestion token into the value stored in `sensors.token_hash`.
 *
 * SHA-256, lowercase hex — deterministic, so the endpoint can look a sensor up by
 * hash in a single indexed query. Unsalted is correct here: the token is a
 * high-entropy (>= 256-bit) CSPRNG secret, not a low-entropy password, so a
 * per-value salt buys nothing and would break the equality lookup. The raw token
 * is never stored. Must match the DB side `encode(digest(token,'sha256'),'hex')`
 * (pgcrypto — also lowercase hex) used to provision a sensor.
 */
export function hashSensorToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
