import { describe, expect, it } from 'vitest';

import { makePendingItem } from './fixtures';
import { prefilterItem } from './prefilter';

describe('prefilterItem', () => {
  describe('teaser rule (substance-bearing formats always send)', () => {
    const junk = '🎉🎉🎉';
    it.each([
      'document',
      'multi_image',
      'video',
      'poll',
      'image',
      'article',
    ] as const)(
      'never auto-noises a %s post even with junk text',
      (post_type) => {
        const item = makePendingItem({ post_type, text: junk, hashtags: [] });
        expect(prefilterItem(item).decision).toBe('send');
      },
    );

    it('sends a text post that carries a media_title', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: '👇',
        media_title: 'Feuille de route de transformation',
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('sends a repost regardless of its (resharer) text', () => {
      const item = makePendingItem({
        post_type: 'text',
        is_repost: true,
        original_author_name: 'Antoine Mercier',
        text: 'Bravo !',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });
  });

  describe('noise verdicts (text posts only)', () => {
    it('noises empty text', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: '  ',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('noise');
    });

    it('noises a work anniversary', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: '3 ans déjà chez Acme, merci à toute l’équipe ! 🎉',
        hashtags: ['workanniversary'],
      });
      expect(prefilterItem(item).decision).toBe('noise');
    });

    it('noises generic congratulations with no business hook', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Bravo à toute la team pour cette belle année, félicitations !',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('noise');
    });

    it('noises very short text with no business keyword', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Belle journée à tous',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('noise');
    });
  });

  describe('sends anything with a business signal', () => {
    it('sends a post with a domain keyword even if short', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'On recrute un PMO.',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('sends a substantive transformation post', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Nous lançons un vaste programme de transformation de notre SI.',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('sends when a business keyword hides in the hashtags', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Quelques nouvelles de notre équipe cette semaine.',
        hashtags: ['servicenow'],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });
  });

  describe('web3 / AI / tech hiring (broadened scope)', () => {
    it('sends the web3 recruiter job ad (the previously-missed opportunity)', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Talent3 Recruiters is Hiring: Senior Solidity Engineer',
        hashtags: ['soliditydeveloper', 'defijobs', 'web3hiring'],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('sends a non-hiring web3 post via the new keywords', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Building a DeFi protocol on Ethereum with Solidity.',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('sends an AI/ML post', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'We are scaling our machine learning platform this quarter.',
        hashtags: ['mlops'],
      });
      expect(prefilterItem(item).decision).toBe('send');
    });

    it('still noises an out-of-scope short post with no tech keyword', () => {
      const item = makePendingItem({
        post_type: 'text',
        text: 'Belle journée ensoleillée à Paris',
        hashtags: [],
      });
      expect(prefilterItem(item).decision).toBe('noise');
    });
  });
});
