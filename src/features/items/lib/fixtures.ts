import type { Tables } from '@/types/database';
import type { ListItem } from '../types';

/** Test fixtures (used by the *.test.ts suites in this folder). */

export function makeListItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    stream: 'opportunity',
    account: 'Acme',
    heat: 'warm',
    path: 'none',
    isNew: false,
    isProcessed: false,
    ageDays: 3,
    dateLabel: '3 j',
    seen: 1,
    summary: 'Résumé de test',
    authorName: 'Jean Dupont',
    authorKind: 'person',
    authorMeta: 'CTO · Acme',
    domains: ['gen_ai'],
    url: 'https://www.linkedin.com/feed/update/1',
    hasWarmPath: false,
    ...overrides,
  };
}

export function makeItemRow(
  overrides: Partial<Tables<'items'>> = {},
): Tables<'items'> {
  return {
    id: 'i1',
    linkedin_post_id: 'urn:li:activity:fixture-1',
    author_name: 'Jean Dupont',
    author_company: 'Acme',
    author_title: 'CTO',
    author_profile_url: null,
    author_type: 'person',
    text: null,
    url: 'https://www.linkedin.com/feed/update/1',
    post_type: 'text',
    is_repost: false,
    original_author_name: null,
    original_author_profile_url: null,
    media_title: null,
    hashtags: [],
    reaction_count: 0,
    comment_count: 0,
    posted_at: null,
    posted_at_raw: null,
    captured_at: '2026-07-01T00:00:00.000Z',
    seen_count: 1,
    best_author_degree: 'none',
    stream: 'opportunity',
    domains: [],
    account: 'Acme',
    heat: null,
    summary: null,
    status: 'new',
    priority: 0,
    classification_attempts: 0,
    classification_error: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}
