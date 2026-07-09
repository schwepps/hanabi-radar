import { describe, expect, it } from 'vitest';

import { isAuthorizedToken } from './authorize';

describe('isAuthorizedToken', () => {
  it('accepts an exact match', () => {
    expect(isAuthorizedToken('s3cret-value', 's3cret-value')).toBe(true);
  });

  it('rejects a different token of the same length', () => {
    expect(isAuthorizedToken('aaaaaaaa', 'bbbbbbbb')).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(isAuthorizedToken('short', 'a-much-longer-secret')).toBe(false);
  });
});
