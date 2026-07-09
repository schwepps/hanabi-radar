import type { Enums } from '@/types/database';

/**
 * View-model types for the Item List screen.
 *
 * Privacy invariant (design + `item_sources` guardrail): the holder of a warm
 * path is personal data that lives only on `item_sources.social_proof`. It must
 * NEVER travel in the card/list payload. That is enforced structurally here:
 * `ListItem` (the list payload) has no holder field, and `RevealPath` (the
 * permissioned reveal) is a SEPARATE type — never a member of `ListItem`.
 */

/** The three streams are peers; `noise` is filtered out before it reaches the UI. */
export type Stream = Exclude<Enums<'stream'>, 'noise'>;
export type Heat = Enums<'heat'>;
export type Degree = Enums<'author_degree'>;

/** `person`/`company` come from the schema; `aggregate` is a view-only kind for
 *  the cross-account trend author ("≈ N posts") and is never persisted. */
export type AuthorKind = Enums<'author_type'> | 'aggregate';

export type SortKey = 'reachability' | 'date';
export type DateRange = '24h' | '7d' | '30d' | 'all';

/** Non-sensitive card payload — safe to render in the list. */
export interface ListItem {
  id: string;
  stream: Stream;
  account: string | null;
  heat: Heat | null;
  /** `items.best_author_degree`: the NON-identifying "a warm path exists" signal. */
  path: Degree;
  /** `status === 'new'`. */
  isNew: boolean;
  /** `status === 'processed'` — a partner has actioned it (persisted, shared). */
  isProcessed: boolean;
  ageDays: number;
  dateLabel: string;
  /** `items.seen_count` — number of feeds the post appeared in. */
  seen: number;
  summary: string | null;
  /** For reposts this is the original author (the decision-maker), not the resharer. */
  authorName: string;
  authorKind: AuthorKind;
  authorMeta: string | null;
  domains: string[];
  /** Permalink to the original LinkedIn post. */
  url: string;
  /** `path !== 'none'`. */
  hasWarmPath: boolean;
}

/**
 * SENSITIVE — the permissioned reveal payload. Deliberately a separate type,
 * resolved on demand when the modal opens (in production, a permission-checked
 * lookup against `item_sources`; FSC-106). Never a field of `ListItem`.
 */
export interface RevealPath {
  itemId: string;
  holderName: string;
  holderTitle: string;
  holderInitials: string;
  degree: Degree;
  /** e.g. "Directement connecté (1er degré)" / "N relations en commun". */
  hopLabel: string;
  authorName: string;
}
