import type { Enums } from '@/types/database';
import type { IngestPost } from '../types';
import { derivePostedAt } from './posted-at';

/**
 * The item-bound half of a mapped post — every payload field EXCEPT the two
 * per-sensor warm-intro fields. Structurally cannot hold `author_degree` /
 * `social_proof`, which is the privacy invariant made un-bypassable.
 */
export interface MappedItem {
  linkedin_post_id: string;
  author_name: string;
  author_company: string | null;
  author_title: string | null;
  author_profile_url: string | null;
  author_type: Enums<'author_type'>;
  text: string | null;
  url: string;
  post_type: Enums<'post_type'>;
  is_repost: boolean;
  original_author_name: string | null;
  original_author_profile_url: string | null;
  media_title: string | null;
  hashtags: string[];
  reaction_count: number;
  comment_count: number;
  posted_at: string | null;
  posted_at_raw: string | null;
  captured_at: string;
}

/** The per-sensor half — RLS-protected, lands only on `item_sources`. */
export interface MappedSource {
  author_degree: Enums<'author_degree'>;
  social_proof: string | null;
}

export interface MappedPost {
  item: MappedItem;
  source: MappedSource;
}

const nullify = <T>(value: T | null | undefined): T | null =>
  value == null ? null : value;

/**
 * Route a validated post onto its two persistence targets. The extension already
 * stores `author_*` as the surfaced (feed) author and `original_author_*` as the
 * original author — both are written verbatim; the read layer does the
 * resharer -> original swap, so this must NOT swap them. `posted_at` is derived
 * here (pure) from `posted_at_raw` + `captured_at`; the DB never accepts it raw.
 */
export function mapPostToRows(post: IngestPost): MappedPost {
  const postedAt = derivePostedAt(post.posted_at_raw ?? null, post.captured_at);
  return {
    item: {
      linkedin_post_id: post.linkedin_post_id,
      author_name: post.author_name,
      author_company: nullify(post.author_company),
      author_title: nullify(post.author_title),
      author_profile_url: nullify(post.author_profile_url),
      author_type: post.author_type,
      text: nullify(post.text),
      url: post.url,
      post_type: post.post_type,
      is_repost: post.is_repost,
      original_author_name: nullify(post.original_author_name),
      original_author_profile_url: nullify(post.original_author_profile_url),
      media_title: nullify(post.media_title),
      hashtags: post.hashtags,
      reaction_count: post.reaction_count,
      comment_count: post.comment_count,
      posted_at: postedAt === null ? null : postedAt.toISOString(),
      posted_at_raw: nullify(post.posted_at_raw),
      captured_at: post.captured_at,
    },
    source: {
      author_degree: post.author_degree,
      social_proof: nullify(post.social_proof),
    },
  };
}
