import type { Tables } from '@/types/database';

/** The sensor columns the auth path reads back. */
export type SensorRow = Pick<
  Tables<'sensors'>,
  'id' | 'name' | 'email' | 'active' | 'consented_at'
>;

export type GateResult =
  | { ok: true; sensor: SensorRow }
  | { ok: false; reason: 'unknown' | 'inactive' | 'no_consent' };

/**
 * Decide whether a looked-up sensor may act. Pure, so the 401 decision is unit-tested
 * once and reused by every sensor endpoint:
 *   - `requireConsent: true`  → /api/ingest (a post write needs recorded consent),
 *   - `requireConsent: false` → /api/sensor/me + /api/sensor/consent (called during
 *     onboarding, BEFORE consent is recorded).
 * A missing/unknown/inactive sensor is always rejected. `reason` is for server logs
 * only — every failure maps to a uniform 401 (no enumeration).
 */
export function gateSensor(
  row: SensorRow | null,
  options: { requireConsent: boolean },
): GateResult {
  if (row == null) {
    return { ok: false, reason: 'unknown' };
  }
  if (!row.active) {
    return { ok: false, reason: 'inactive' };
  }
  if (options.requireConsent && row.consented_at == null) {
    return { ok: false, reason: 'no_consent' };
  }
  return { ok: true, sensor: row };
}
