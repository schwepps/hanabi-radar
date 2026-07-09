import { describe, expect, it } from 'vitest';
import { isPublicPath } from './is-public-path';

describe('isPublicPath', () => {
  it.each(['/login'])('%s is public', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // Gated routes — including near-misses that a loose `startsWith` would wrongly
  // treat as public (the exact bug the exact-match guards against).
  it.each(['/', '/items', '/dashboard', '/login-extra', '/login/sub'])(
    '%s is protected',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
