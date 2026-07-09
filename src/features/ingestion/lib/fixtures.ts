/**
 * Test fixtures for the ingestion payload — a shared "minimal valid raw post"
 * builder (pre-Zod shape) so the schema and mapper suites can't drift on the
 * required-field set. Mirrors items/lib/fixtures.ts.
 */

/** A raw post object (as the extension would send it) with only required fields set. */
export function makeRawPost(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    linkedin_post_id: 'urn:li:activity:123',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    author_name: 'Jean Dupont',
    captured_at: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

/** A raw ingestion batch envelope wrapping the given posts. */
export function makeRawBatch(
  posts: unknown[] = [makeRawPost()],
): Record<string, unknown> {
  return { version: 1, posts };
}
