import { describe, expect, it } from 'vitest';
import { gateSensor, type SensorRow } from './gate-sensor';

function sensor(overrides: Partial<SensorRow> = {}): SensorRow {
  return {
    id: 'a1000000-0000-4000-8000-000000000003',
    name: 'Dev Sensor',
    email: 'dev@hanabi.test',
    active: true,
    consented_at: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('gateSensor', () => {
  it('rejects an unknown sensor (null row)', () => {
    expect(gateSensor(null, { requireConsent: false })).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('rejects an inactive sensor regardless of requireConsent', () => {
    const row = sensor({ active: false });
    expect(gateSensor(row, { requireConsent: false }).ok).toBe(false);
    expect(gateSensor(row, { requireConsent: true })).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('requires consent when requireConsent is true', () => {
    expect(
      gateSensor(sensor({ consented_at: null }), { requireConsent: true }),
    ).toEqual({ ok: false, reason: 'no_consent' });
  });

  it('allows a not-yet-consented sensor when consent is not required', () => {
    const row = sensor({ consented_at: null });
    expect(gateSensor(row, { requireConsent: false })).toEqual({
      ok: true,
      sensor: row,
    });
  });

  it('allows an active, consented sensor either way', () => {
    const row = sensor();
    expect(gateSensor(row, { requireConsent: true })).toEqual({
      ok: true,
      sensor: row,
    });
    expect(gateSensor(row, { requireConsent: false })).toEqual({
      ok: true,
      sensor: row,
    });
  });
});
