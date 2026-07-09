import { describe, expect, it } from 'vitest';

import { DOMAINS } from '@/lib/taxonomy';
import { makePendingItem } from './fixtures';
import { buildSystemPrompt, buildUserContent } from './prompt';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  it('is deterministic (cache-safe — no volatile content)', () => {
    expect(buildSystemPrompt()).toBe(prompt);
  });

  it('defines every stream', () => {
    for (const stream of ['signal', 'opportunity', 'trend', 'noise']) {
      expect(prompt).toContain(`${stream}:`);
    }
  });

  it('lists every canonical domain slug', () => {
    for (const { slug } of DOMAINS) {
      expect(prompt).toContain(`${slug}:`);
    }
  });

  it('states the teaser rule and the multi-domain instruction', () => {
    expect(prompt.toLowerCase()).toContain('teaser');
    expect(prompt).toContain('EVERY expertise domain');
  });

  it('constrains heat and summary language', () => {
    expect(prompt).toContain('heat = null');
    expect(prompt).toContain('one sentence, in French');
  });
});

describe('buildUserContent', () => {
  it('includes post_type and media_title and omits null fields', () => {
    const content = buildUserContent(
      makePendingItem({
        post_type: 'article',
        media_title: 'Refonte du socle',
        author_company: null,
        text: 'Texte substantiel sur notre programme.',
      }),
    );
    expect(content).toContain('post_type: article');
    expect(content).toContain('media_title: Refonte du socle');
    expect(content).not.toContain('author_company:');
  });

  it('injects a SUBSTANCE NOTE for a document with a short teaser text', () => {
    const content = buildUserContent(
      makePendingItem({
        post_type: 'document',
        media_title: 'Target Operating Model',
        text: 'Quelques mots 👇',
      }),
    );
    expect(content).toContain('SUBSTANCE NOTE');
  });

  it('does not inject a SUBSTANCE NOTE for a plain text post', () => {
    const content = buildUserContent(
      makePendingItem({ post_type: 'text', media_title: null }),
    );
    expect(content).not.toContain('SUBSTANCE NOTE');
  });

  it('flags the original author on a repost', () => {
    const content = buildUserContent(
      makePendingItem({
        is_repost: true,
        original_author_name: 'Antoine Mercier',
      }),
    );
    expect(content).toContain('is_repost: true');
    expect(content).toContain('Antoine Mercier');
  });
});
