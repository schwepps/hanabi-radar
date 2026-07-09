/**
 * Derive an absolute `posted_at` from LinkedIn's relative timestamp.
 *
 * LinkedIn only renders relative strings ("2h", "1d", "3 sem", "il y a 2 h"), so the
 * absolute time is reconstructed by subtracting the offset from `capturedAt` -- the
 * moment the extension saw the post -- NOT from server `now` (the two can differ by
 * the time a batch spends queued / in flight).
 *
 * Returns `null` for anything it can't parse (unknown unit, no unit, bad input): the
 * read layer already falls back to `captured_at` when `posted_at` is null (items
 * `computeAgeDays`). Month and year are approximations (30 / 365 days) -- acceptable
 * because the field only feeds ordering and a coarse age label.
 */

const MS = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000, // approximation
  year: 365 * 86_400_000, // approximation
} as const;

type Unit = keyof typeof MS;

/**
 * Exact relative-time unit tokens -> canonical unit, EN + FR, compact and spelled.
 * Exact-token lookup (not prefix) so the classic ambiguities never collide:
 * "m"/"min" (minute) vs "mo"/"mois" (month); "an"/"ans" (year).
 */
const UNIT: Record<string, Unit> = {
  // seconds
  s: 'second',
  sec: 'second',
  secs: 'second',
  second: 'second',
  seconds: 'second',
  seconde: 'second',
  secondes: 'second',
  // minutes
  m: 'minute',
  min: 'minute',
  mins: 'minute',
  minute: 'minute',
  minutes: 'minute',
  // hours
  h: 'hour',
  hr: 'hour',
  hrs: 'hour',
  hour: 'hour',
  hours: 'hour',
  heure: 'hour',
  heures: 'hour',
  // days
  d: 'day',
  day: 'day',
  days: 'day',
  j: 'day',
  jour: 'day',
  jours: 'day',
  // weeks
  w: 'week',
  wk: 'week',
  wks: 'week',
  week: 'week',
  weeks: 'week',
  sem: 'week',
  semaine: 'week',
  semaines: 'week',
  // months
  mo: 'month',
  mos: 'month',
  month: 'month',
  months: 'month',
  mois: 'month',
  // years
  y: 'year',
  yr: 'year',
  yrs: 'year',
  year: 'year',
  years: 'year',
  an: 'year',
  ans: 'year',
  annee: 'year',
  annees: 'year',
  année: 'year',
  années: 'year',
};

const NOW_FORMS = new Set([
  'now',
  'just now',
  'maintenant',
  "à l'instant",
  "a l'instant",
]);

/**
 * Lowercase, collapse ALL whitespace (JS `\s` covers the non-breaking space
 * LinkedIn uses) and trim BEFORE stripping the multi-word "il y a" / "ago" affixes,
 * so those still match under NBSP separators or leading/trailing padding.
 */
function normalizeRelative(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^il y a /, '') // FR "il y a 2 h" -> "2 h"
    .replace(/ ago$/, ''); // EN "2 hours ago" -> "2 hours"
}

export function derivePostedAt(
  rawRelative: string | null,
  capturedAt: string,
): Date | null {
  const capturedMs = new Date(capturedAt).getTime();
  if (Number.isNaN(capturedMs) || rawRelative == null) {
    return null;
  }

  const normalized = normalizeRelative(rawRelative);
  if (normalized === '') {
    return null;
  }
  if (NOW_FORMS.has(normalized)) {
    return new Date(capturedMs);
  }

  const match = /^(\d+)\s*([a-zà-ÿ]+)\.?$/u.exec(normalized);
  if (match == null) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  const unit = UNIT[match[2]];
  if (unit === undefined || Number.isNaN(value)) {
    return null;
  }

  const posted = new Date(capturedMs - value * MS[unit]);
  // A huge offset (e.g. "99999999w") overflows to an Invalid Date; return null per
  // the contract so the caller doesn't throw on `.toISOString()`.
  return Number.isNaN(posted.getTime()) ? null : posted;
}
