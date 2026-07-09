import { describe, expect, it } from 'vitest';
import { derivePostedAt } from './posted-at';

// Fixed capture instant so every expectation is a pure offset from it.
const CAPTURED = '2026-07-09T12:00:00.000Z';
const CAPTURED_MS = Date.parse(CAPTURED);

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NBSP = String.fromCharCode(0x00a0); // non-breaking space (LinkedIn FR uses it)

function at(offsetMs: number): Date {
  return new Date(CAPTURED_MS - offsetMs);
}

describe('derivePostedAt', () => {
  it.each<[string, number]>([
    // English compact
    ['now', 0],
    ['2h', 2 * HOUR],
    ['1d', DAY],
    ['3w', 21 * DAY],
    ['1mo', 30 * DAY],
    ['5y', 5 * 365 * DAY],
    ['45m', 45 * 60_000],
    // English spelled / "ago"
    ['2 hours ago', 2 * HOUR],
    ['3 days ago', 3 * DAY],
    // French
    ['maintenant', 0],
    ["à l'instant", 0],
    ['il y a 2 h', 2 * HOUR],
    [' il y a 2 h ', 2 * HOUR], // leading/trailing padding (affix strip after collapse)
    ['3 j', 3 * DAY],
    ['2 sem', 14 * DAY],
    ['1 mois', 30 * DAY],
    ['2 ans', 2 * 365 * DAY],
    // Whitespace / case tolerance
    ['  2H  ', 2 * HOUR],
    ['2 h.', 2 * HOUR],
  ])('parses %j relative to capturedAt', (raw, offsetMs) => {
    expect(derivePostedAt(raw, CAPTURED)).toEqual(at(offsetMs));
  });

  it('handles non-breaking spaces in a French relative string', () => {
    const raw = `il${NBSP}y${NBSP}a${NBSP}2${NBSP}h`;
    expect(derivePostedAt(raw, CAPTURED)).toEqual(at(2 * HOUR));
  });

  it('disambiguates months from minutes by exact token', () => {
    // "5mo" is 5 months, NOT 5 minutes.
    expect(derivePostedAt('5mo', CAPTURED)).toEqual(at(5 * 30 * DAY));
    expect(derivePostedAt('5m', CAPTURED)).toEqual(at(5 * 60_000));
    expect(derivePostedAt('5mo', CAPTURED)).not.toEqual(
      derivePostedAt('5m', CAPTURED),
    );
  });

  it.each([
    'garbage',
    'yesterday',
    '',
    '   ',
    '5', // number without a unit
    'h', // unit without a number
    '3 fortnights', // unknown unit
    '99999999w', // offset overflows Date -> Invalid Date, must be null (not a crash)
  ])('returns null for the unparseable input %j', (raw) => {
    expect(derivePostedAt(raw, CAPTURED)).toBeNull();
  });

  it('returns null for a null raw string', () => {
    expect(derivePostedAt(null, CAPTURED)).toBeNull();
  });

  it('returns null when capturedAt is not a valid date', () => {
    expect(derivePostedAt('2h', 'not-a-date')).toBeNull();
  });
});
