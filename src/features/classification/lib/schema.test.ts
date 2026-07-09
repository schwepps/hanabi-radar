import { describe, expect, it } from 'vitest';

import { classificationSchema } from './schema';

describe('classificationSchema', () => {
  const valid = {
    stream: 'opportunity',
    domains: ['pmo', 'servicenow'],
    heat: 'hot',
    summary: 'Une phrase.',
  };

  it('accepts a well-formed classification', () => {
    const parsed = classificationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('accepts the noise stream and null heat', () => {
    expect(
      classificationSchema.safeParse({
        stream: 'noise',
        domains: [],
        heat: null,
        summary: '',
      }).success,
    ).toBe(true);
  });

  it('accepts the other domain sentinel', () => {
    expect(
      classificationSchema.safeParse({ ...valid, domains: ['gen_ai', 'other'] })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown domain slug', () => {
    expect(
      classificationSchema.safeParse({ ...valid, domains: ['blockchain'] })
        .success,
    ).toBe(false);
  });

  it('rejects an invalid stream', () => {
    expect(
      classificationSchema.safeParse({ ...valid, stream: 'lead' }).success,
    ).toBe(false);
  });

  it('rejects an invalid heat', () => {
    expect(
      classificationSchema.safeParse({ ...valid, heat: 'lukewarm' }).success,
    ).toBe(false);
  });
});
