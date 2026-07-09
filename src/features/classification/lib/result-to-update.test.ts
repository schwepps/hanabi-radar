import { describe, expect, it } from 'vitest';

import { NOISE_UPDATE, resultToUpdate } from './result-to-update';
import type { RawClassification } from './schema';

describe('resultToUpdate', () => {
  it('maps noise to the NOISE_UPDATE patch', () => {
    const raw: RawClassification = {
      stream: 'noise',
      domains: ['pmo'],
      heat: 'hot',
      summary: 'ignored',
    };
    expect(resultToUpdate(raw)).toEqual(NOISE_UPDATE);
  });

  it('keeps heat on a non-opportunity stream (Rule B)', () => {
    const raw: RawClassification = {
      stream: 'signal',
      domains: ['it_architecture'],
      heat: 'hot',
      summary: 'Nomination.',
    };
    expect(resultToUpdate(raw)).toEqual({
      stream: 'signal',
      domains: ['it_architecture'],
      heat: 'hot',
      summary: 'Nomination.',
    });
  });

  it('normalizes and dedupes domains', () => {
    const raw: RawClassification = {
      stream: 'opportunity',
      domains: ['servicenow', 'servicenow', 'pmo'],
      heat: null,
      summary: 'x',
    };
    expect(resultToUpdate(raw).domains).toEqual(['pmo', 'servicenow']);
  });

  it('trims an empty summary to null', () => {
    const raw: RawClassification = {
      stream: 'trend',
      domains: [],
      heat: null,
      summary: '   ',
    };
    expect(resultToUpdate(raw).summary).toBeNull();
  });

  it('truncates an over-long summary', () => {
    const raw: RawClassification = {
      stream: 'trend',
      domains: [],
      heat: null,
      summary: 'a'.repeat(600),
    };
    const { summary } = resultToUpdate(raw);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBeLessThanOrEqual(401);
    expect(summary!.endsWith('…')).toBe(true);
  });
});
