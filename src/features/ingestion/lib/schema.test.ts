import { describe, expect, it } from 'vitest';
import { makeRawBatch, makeRawPost } from './fixtures';
import { BATCH_MAX, ingestBatchSchema, postSchema } from './schema';

describe('postSchema', () => {
  it('applies defaults for a minimal post', () => {
    const result = postSchema.parse(makeRawPost());
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
      makeRawPost({
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
    expect(postSchema.safeParse(makeRawPost({ [field]: value })).success).toBe(
      false,
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com',
    'not-a-url',
  ])('rejects a non-http(s) url %j', (url) => {
    expect(postSchema.safeParse(makeRawPost({ url })).success).toBe(false);
  });

  it('requires the url', () => {
    const raw = makeRawPost();
    delete raw.url;
    expect(postSchema.safeParse(raw).success).toBe(false);
  });

  it('coerces blank optional strings to null', () => {
    const result = postSchema.parse(makeRawPost({ author_company: '   ' }));
    expect(result.author_company).toBeNull();
  });

  it('rejects a whitespace-only required string', () => {
    expect(
      postSchema.safeParse(makeRawPost({ author_name: '   ' })).success,
    ).toBe(false);
  });

  it('trims hashtags and drops blank entries', () => {
    const result = postSchema.parse(
      makeRawPost({ hashtags: ['ai', '', '  ', ' ml '] }),
    );
    expect(result.hashtags).toEqual(['ai', 'ml']);
  });

  it('treats null hashtags as an empty array', () => {
    expect(postSchema.parse(makeRawPost({ hashtags: null })).hashtags).toEqual(
      [],
    );
  });

  it.each([
    ['reaction_count', -1],
    ['reaction_count', 1.5],
    ['reaction_count', 2_147_483_648], // > int4 max: must 422, not overflow the DB
    ['comment_count', -5],
    ['comment_count', 2_147_483_648],
  ])('rejects an invalid %s value %s', (field, value) => {
    expect(postSchema.safeParse(makeRawPost({ [field]: value })).success).toBe(
      false,
    );
  });

  it.each(['not-a-date', '2026-07-09'])(
    'rejects an invalid captured_at %j',
    (captured_at) => {
      expect(postSchema.safeParse(makeRawPost({ captured_at })).success).toBe(
        false,
      );
    },
  );

  it.each(['2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00+02:00'])(
    'accepts a valid captured_at %j (Z or offset form)',
    (captured_at) => {
      expect(postSchema.safeParse(makeRawPost({ captured_at })).success).toBe(
        true,
      );
    },
  );

  it('rejects unknown keys (strict)', () => {
    expect(postSchema.safeParse(makeRawPost({ smuggled: 'x' })).success).toBe(
      false,
    );
  });

  describe('repost invariant', () => {
    it('rejects a repost without an original author', () => {
      const result = postSchema.safeParse(makeRawPost({ is_repost: true }));
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
        makeRawPost({
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
    expect(ingestBatchSchema.safeParse(makeRawBatch()).success).toBe(true);
  });

  it('rejects a wrong version', () => {
    expect(
      ingestBatchSchema.safeParse({ version: 2, posts: [makeRawPost()] })
        .success,
    ).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(ingestBatchSchema.safeParse(makeRawBatch([])).success).toBe(false);
  });

  it('rejects a batch over the size cap', () => {
    const posts = Array.from({ length: BATCH_MAX + 1 }, (_unused, index) =>
      makeRawPost({ linkedin_post_id: `urn:li:activity:${index}` }),
    );
    expect(ingestBatchSchema.safeParse(makeRawBatch(posts)).success).toBe(
      false,
    );
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(
      ingestBatchSchema.safeParse({ ...makeRawBatch(), extra: 1 }).success,
    ).toBe(false);
  });
});
