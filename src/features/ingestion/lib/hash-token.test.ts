import { describe, expect, it } from 'vitest';
import { hashSensorToken } from './hash-token';

describe('hashSensorToken', () => {
  // Canonical SHA-256 test vectors (NIST), lowercase hex — pins the algorithm and
  // encoding so it can never silently drift from the DB `digest(...,'sha256')` side.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('hashes %j to its known SHA-256 vector', (input, expected) => {
    expect(hashSensorToken(input)).toBe(expected);
  });

  it('is deterministic and returns lowercase 64-char hex', () => {
    const token = 'hanabi-local-dev-sensor-token';
    expect(hashSensorToken(token)).toBe(hashSensorToken(token));
    expect(hashSensorToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps different tokens to different hashes', () => {
    expect(hashSensorToken('token-a')).not.toBe(hashSensorToken('token-b'));
  });
});
