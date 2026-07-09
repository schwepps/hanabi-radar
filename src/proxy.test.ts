import { describe, expect, it } from 'vitest';
import { config } from './proxy';

// Anchor the matcher end-to-end (^…$) so it matches a full pathname the way Next
// applies it — an unanchored test would spuriously match the "/ingest" substring of
// "/api/ingest". Guards against a future edit silently re-capturing `/api`.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('proxy matcher', () => {
  it.each(['/', '/login', '/items', '/dashboard', '/apidocs', '/api-status'])(
    'runs the auth proxy on %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each(['/api', '/api/ingest', '/api/anything/deep'])(
    'skips the auth proxy on API route %s (self-authenticated)',
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
