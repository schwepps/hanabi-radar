import { describe, expect, it } from 'vitest';
import { BATCH_MAX, ingestBatchSchema, postSchema } from './schema';

function validRawPost(overrides: Record<string, unknown> = {}) {
  return {
    linkedin_post_id: 'urn:li:activity:123',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    author_name: 'Jean Dupont',
    captured_at: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

function validRawBatch(posts: unknown[] = [validRawPost()]) {
  return { version: 1, posts };
}

describe('postSchema', () => {
  it('applies defaults for a minimal post', () => {
    const result = postSchema.parse(validRawPost());
    expect(result).toMatchObject({
      author_type: 'person',
      post_type: 'text',
      is_repost: false,
      hashtags: [],
      reaction_count: 0,
      comment_count: 0,
      author_degree: 'none',
    });
  });

  it('accepts a fully-populated post', () => {
    const result = postSchema.safeParse(
      validRawPost({
        text: 'A signal about a ServiceNow transformation',
        author_company: 'Acme',
        author_title: 'CIO',
        author_profile_url: 'https://linkedin.com/in/jd',
        author_type: 'company',
        post_type: 'article',
        media_title: 'Deck title',
        hashtags: ['servicenow', 'pmo'],
        reaction_count: 128,
        comment_count: 24,
        posted_at_raw: '4h',
        author_degree: 'first',
        social_proof: 'Camille knows Jean',
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    ['author_type', 'robot'],
    ['post_type', 'reel'],
    ['author_degree', 'fourth'],
  ])('rejects an invalid %s enum value', (field, value) => {
    expect(postSchema.safeParse(validRawPost({ [field]: value })).success).toBe(
      false,
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com',
    'not-a-url',
  ])('rejects a non-http(s) url %j', (url) => {
    expect(postSchema.safeParse(validRawPost({ url })).success).toBe(false);
  });

  it('requires the url', () => {
    const raw = validRawPost();
    delete (raw as Record<string, unknown>).url;
    expect(postSchema.safeParse(raw).success).toBe(false);
  });

  it('coerces blank optional strings to null', () => {
    const result = postSchema.parse(validRawPost({ author_company: '   ' }));
    expect(result.author_company).toBeNull();
  });

  it('rejects a whitespace-only required string', () => {
    expect(
      postSchema.safeParse(validRawPost({ author_name: '   ' })).success,
    ).toBe(false);
  });

  it('trims hashtags and drops blank entries', () => {
    const result = postSchema.parse(
      validRawPost({ hashtags: ['ai', '', '  ', ' ml '] }),
    );
    expect(result.hashtags).toEqual(['ai', 'ml']);
  });

  it('treats null hashtags as an empty array', () => {
    expect(postSchema.parse(validRawPost({ hashtags: null })).hashtags).toEqual(
      [],
    );
  });

  it.each([
    ['reaction_count', -1],
    ['reaction_count', 1.5],
    ['comment_count', -5],
  ])('rejects an invalid %s value %s', (field, value) => {
    expect(postSchema.safeParse(validRawPost({ [field]: value })).success).toBe(
      false,
    );
  });

  it.each(['not-a-date', '2026-07-09'])(
    'rejects an invalid captured_at %j',
    (captured_at) => {
      expect(postSchema.safeParse(validRawPost({ captured_at })).success).toBe(
        false,
      );
    },
  );

  it.each(['2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00+02:00'])(
    'accepts a valid captured_at %j (Z or offset form)',
    (captured_at) => {
      expect(postSchema.safeParse(validRawPost({ captured_at })).success).toBe(
        true,
      );
    },
  );

  it('rejects unknown keys (strict)', () => {
    const result = postSchema.safeParse(validRawPost({ smuggled: 'x' }));
    expect(result.success).toBe(false);
  });

  describe('repost invariant', () => {
    it('rejects a repost without an original author', () => {
      const result = postSchema.safeParse(validRawPost({ is_repost: true }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('original_author_name'),
          ),
        ).toBe(true);
      }
    });

    it('accepts a repost with an original author', () => {
      const result = postSchema.safeParse(
        validRawPost({
          is_repost: true,
          original_author_name: 'Antoine Mercier',
        }),
      );
      expect(result.success).toBe(true);
    });
  });
});

describe('ingestBatchSchema', () => {
  it('accepts a valid batch', () => {
    expect(ingestBatchSchema.safeParse(validRawBatch()).success).toBe(true);
  });

  it('rejects a wrong version', () => {
    expect(
      ingestBatchSchema.safeParse({ version: 2, posts: [validRawPost()] })
        .success,
    ).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(ingestBatchSchema.safeParse(validRawBatch([])).success).toBe(false);
  });

  it('rejects a batch over the size cap', () => {
    const posts = Array.from({ length: BATCH_MAX + 1 }, (_unused, index) =>
      validRawPost({ linkedin_post_id: `urn:li:activity:${index}` }),
    );
    expect(ingestBatchSchema.safeParse(validRawBatch(posts)).success).toBe(
      false,
    );
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(
      ingestBatchSchema.safeParse({ ...validRawBatch(), extra: 1 }).success,
    ).toBe(false);
  });
});
