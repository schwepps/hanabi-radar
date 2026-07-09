import type { PendingItem } from '../types';
import type { ClaudeParser } from './classify-item';

/** A substantive text opportunity by default; override any field per test. */
export function makePendingItem(
  overrides: Partial<PendingItem> = {},
): PendingItem {
  return {
    id: 'item-1',
    text: 'Nous lançons une refonte ServiceNow et cherchons un partenaire PMO.',
    post_type: 'text',
    media_title: null,
    hashtags: [],
    author_type: 'person',
    author_name: 'Jean Dupont',
    author_company: 'Acme Corp',
    author_title: 'Directeur des systèmes d’information',
    is_repost: false,
    original_author_name: null,
    ...overrides,
  };
}

interface ParseResult {
  stop_reason: string | null;
  text: string | null;
}

export interface RecordingParser extends ClaudeParser {
  calls: { request: unknown; options: { timeout: number } }[];
}

/**
 * A fake `ClaudeParser` for tests: returns `behavior` (a fixed parse result), or —
 * when `behavior` is a function — invokes it so it can throw. Records every call so
 * tests can assert on the request/options passed.
 */
export function makeFakeParser(
  behavior: ParseResult | (() => never),
): RecordingParser {
  const calls: RecordingParser['calls'] = [];
  return {
    calls,
    async parse(request, options) {
      calls.push({ request, options });
      if (typeof behavior === 'function') {
        return behavior();
      }
      return behavior;
    },
  };
}
