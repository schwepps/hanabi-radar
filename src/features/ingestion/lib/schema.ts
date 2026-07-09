import { z } from 'zod';
import { Constants } from '@/types/database';

/**
 * Zod schema for the ingestion payload — the runtime trust boundary between the
 * capture extension (separate repo, FSC-110) and the database. Enum members are
 * sourced from the generated DB `Constants` so the schema can never drift from the
 * Postgres enums. This is the authoritative shape; `docs/ingestion-api-contract.md`
 * documents it for the extension.
 */

/** Max posts accepted in one batch (bounded per-request DB work / abuse guard). */
export const BATCH_MAX = 50;
/** Max raw request body size in bytes (independent of BATCH_MAX). */
export const MAX_BODY_BYTES = 512 * 1024;

// Field length caps — real size guards at the boundary, not cosmetic.
const MAX_ID = 512;
const MAX_NAME = 300;
const MAX_URL = 2048;
const MAX_TEXT = 40_000;
const MAX_RAW = 64;
const MAX_HASHTAG = 140;
const MAX_HASHTAGS = 64;

/** Trim strings and treat blank as absent (null); pass non-strings through so the
 * inner schema reports a proper type error rather than this coercing it. */
const trimToNull = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const optionalText = (max: number) =>
  z.preprocess(trimToNull, z.string().max(max).nullable().optional());

// Reject non-http(s) URLs at the boundary so a `javascript:`/`data:` value never
// reaches the DB (mirrors the read-side `safeHttpUrl` guard in items/lib/derive.ts).
const httpUrl = z
  .url()
  .max(MAX_URL)
  .refine((value) => /^https?:\/\//i.test(value), 'Must be an http(s) URL');

const requiredHttpUrl = z.preprocess(trimToNull, httpUrl);
const optionalHttpUrl = z.preprocess(trimToNull, httpUrl.nullable().optional());

// Absent (null/undefined) -> []; otherwise trim each hashtag and drop blanks before
// validation (a stray '' shouldn't 422 the whole batch). Non-arrays fall through to a
// proper type error.
const hashtags = z.preprocess(
  (value) => {
    if (value == null) {
      return [];
    }
    return Array.isArray(value)
      ? value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
          .filter((entry) => entry !== '')
      : value;
  },
  z.array(z.string().min(1).max(MAX_HASHTAG)).max(MAX_HASHTAGS),
);

export const postSchema = z
  .strictObject({
    linkedin_post_id: requiredText(MAX_ID),
    text: optionalText(MAX_TEXT),
    url: requiredHttpUrl,
    author_name: requiredText(MAX_NAME),
    author_company: optionalText(MAX_NAME),
    author_title: optionalText(MAX_NAME),
    author_profile_url: optionalHttpUrl,
    author_type: z.enum(Constants.public.Enums.author_type).default('person'),
    post_type: z.enum(Constants.public.Enums.post_type).default('text'),
    is_repost: z.boolean().default(false),
    original_author_name: optionalText(MAX_NAME),
    original_author_profile_url: optionalHttpUrl,
    media_title: optionalText(MAX_NAME),
    hashtags,
    reaction_count: z.number().int().nonnegative().default(0),
    comment_count: z.number().int().nonnegative().default(0),
    posted_at_raw: optionalText(MAX_RAW),
    // Accept both `Z` and offset forms (e.g. "…+02:00") — the extension's locale may
    // produce either; derivePostedAt handles both.
    captured_at: z.iso.datetime({ offset: true }),
    author_degree: z.enum(Constants.public.Enums.author_degree).default('none'),
    social_proof: optionalText(MAX_TEXT),
  })
  // A repost MUST carry its original author, else the read layer surfaces the
  // resharer — the exact "never contact the resharer" bug the guardrail prevents.
  // The DB CHECK backstops this; enforcing here gives a clean 422.
  .refine((post) => !post.is_repost || post.original_author_name != null, {
    error: 'original_author_name is required when is_repost is true',
    path: ['original_author_name'],
  });

export const ingestBatchSchema = z.strictObject({
  version: z.literal(1),
  posts: z.array(postSchema).min(1).max(BATCH_MAX),
});
