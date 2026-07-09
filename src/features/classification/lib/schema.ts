import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CLASSIFIER_DOMAIN_VALUES } from '@/lib/taxonomy';
import { Constants } from '@/types/database';

/**
 * Structured-output contract for one classification. `stream`/`heat` enums are
 * sourced from the generated DB `Constants` (same anti-drift pattern as
 * `ingestion/lib/schema.ts`); `domains` is constrained to the canonical taxonomy
 * plus the `other` sentinel, so the model cannot invent fragmented slugs.
 *
 * The schema is deliberately LENIENT on length/count: `zodOutputFormat` strips
 * `minLength`/`maxItems`-style keywords (unsupported by structured outputs) and
 * validates client-side, so a hard length/count constraint here would fail-parse a
 * whole item and leave it stuck as `stream IS NULL` forever. Trimming, the domain
 * cap, and summary truncation are applied downstream in `result-to-update.ts`.
 */
export const classificationSchema = z.object({
  stream: z.enum(Constants.public.Enums.stream),
  domains: z.array(z.enum(CLASSIFIER_DOMAIN_VALUES)),
  heat: z.enum(Constants.public.Enums.heat).nullable(),
  summary: z.string(),
});

export type RawClassification = z.infer<typeof classificationSchema>;

/** Passed to `messages.parse({ output_config: { format } })`. */
export const classificationOutputFormat = zodOutputFormat(classificationSchema);
