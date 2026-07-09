import { describe, expect, it } from 'vitest';
import { makeRawPost } from './fixtures';
import { mapPostToRows } from './map-post-to-rows';
import { postSchema } from './schema';

// makeRawPost() defaults captured_at to this instant, so the posted_at assertions
// below are pure offsets from it.
const CAPTURED = '2026-07-09T12:00:00.000Z';

function mapRaw(overrides: Record<string, unknown> = {}) {
  return mapPostToRows(postSchema.parse(makeRawPost(overrides)));
}

describe('mapPostToRows', () => {
  it('routes the per-sensor fields onto source, never onto item', () => {
    const mapped = mapRaw({
      author_degree: 'second',
      social_proof: 'Camille knows Jean',
    });
    expect(mapped.source).toEqual({
      author_degree: 'second',
      social_proof: 'Camille knows Jean',
    });
    // The privacy invariant, asserted structurally.
    expect('author_degree' in mapped.item).toBe(false);
    expect('social_proof' in mapped.item).toBe(false);
  });

  it('derives posted_at from posted_at_raw + captured_at', () => {
    const mapped = mapRaw({ posted_at_raw: '2h' });
    expect(mapped.item.posted_at).toBe(
      new Date(Date.parse(CAPTURED) - 2 * 3_600_000).toISOString(),
    );
    expect(mapped.item.posted_at_raw).toBe('2h');
  });

  it('leaves posted_at null when the relative string is unparseable', () => {
    const mapped = mapRaw({ posted_at_raw: 'yesterday' });
    expect(mapped.item.posted_at).toBeNull();
  });

  it('leaves posted_at null when posted_at_raw is absent', () => {
    const mapped = mapRaw();
    expect(mapped.item.posted_at).toBeNull();
    expect(mapped.item.posted_at_raw).toBeNull();
  });

  it('stores repost author fields verbatim (does not swap resharer/original)', () => {
    const mapped = mapRaw({
      is_repost: true,
      author_name: 'Léa Girard', // the resharer (surfaced author)
      original_author_name: 'Antoine Mercier', // the original / decision-maker
    });
    expect(mapped.item.author_name).toBe('Léa Girard');
    expect(mapped.item.original_author_name).toBe('Antoine Mercier');
    expect(mapped.item.is_repost).toBe(true);
  });

  it('normalizes absent optional fields to null on the item', () => {
    const mapped = mapRaw();
    expect(mapped.item.author_company).toBeNull();
    expect(mapped.item.author_title).toBeNull();
    expect(mapped.item.author_profile_url).toBeNull();
    expect(mapped.item.text).toBeNull();
    expect(mapped.item.media_title).toBeNull();
    expect(mapped.source.social_proof).toBeNull();
  });
});
