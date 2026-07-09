import type { z } from 'zod';
import type { ingestBatchSchema, postSchema } from './lib/schema';

/** A single validated post (schema output, with defaults applied). */
export type IngestPost = z.infer<typeof postSchema>;
/** The full validated ingestion batch. */
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

/** Machine-readable error codes returned in `{ error: { code } }`. */
export type IngestErrorCode =
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'invalid_json'
  | 'unauthorized'
  | 'invalid_payload'
  | 'ingest_failed';

/** One post the DB isolated (per-post savepoint) instead of failing the batch. */
export interface IngestFailure {
  linkedin_post_id: string;
  error: string;
}

/** 200 response body. `failed` is present only when the DB isolated some posts. */
export interface IngestSuccessBody {
  received: number;
  new_items: number;
  known_items: number;
  failed?: IngestFailure[];
}
