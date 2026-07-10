import { describe, expect, it } from 'vitest';

import {
  DOMAIN_SLUGS,
  DOMAINS,
  MAX_DOMAINS,
  isKnownDomain,
  normalizeDomains,
  renderTaxonomyForPrompt,
} from './taxonomy';

describe('taxonomy', () => {
  it('exposes a slug for every domain, with unique slugs', () => {
    expect(DOMAIN_SLUGS).toHaveLength(DOMAINS.length);
    expect(new Set(DOMAIN_SLUGS).size).toBe(DOMAIN_SLUGS.length);
  });

  it('keeps the original nine and adds the diversity clusters', () => {
    for (const slug of [
      'pmo',
      'servicenow',
      'power_platform',
      'gen_ai',
      'carve_in_out',
      'it_architecture',
      'digital_workplace',
      'product_management',
      'rfp',
    ]) {
      expect(isKnownDomain(slug)).toBe(true);
    }
    for (const slug of [
      'strategy_organization',
      'change_management',
      'software_engineering',
      'cloud_devops',
      'data_engineering',
      'cybersecurity',
      'pricing',
      'marketing',
      'vendor_management',
      'service_delivery',
      'cio_advisory',
      'web3_blockchain',
      'ai_ml',
    ]) {
      expect(isKnownDomain(slug)).toBe(true);
    }
  });

  describe('isKnownDomain', () => {
    it('rejects the other sentinel and unknown slugs', () => {
      expect(isKnownDomain('other')).toBe(false);
      expect(isKnownDomain('blockchain')).toBe(false);
      expect(isKnownDomain('')).toBe(false);
    });
  });

  describe('normalizeDomains', () => {
    it('lowercases, trims and dedupes', () => {
      expect(normalizeDomains(['  ServiceNow ', 'servicenow', 'PMO'])).toEqual([
        'pmo',
        'servicenow',
      ]);
    });

    it('drops unknown slugs but keeps the other sentinel', () => {
      expect(normalizeDomains(['gen_ai', 'blockchain', 'other'])).toEqual([
        'gen_ai',
        'other',
      ]);
    });

    it('orders by the taxonomy with other last', () => {
      expect(
        normalizeDomains(['other', 'rfp', 'pmo', 'strategy_organization']),
      ).toEqual(['pmo', 'rfp', 'strategy_organization', 'other']);
    });

    it('caps at MAX_DOMAINS', () => {
      const many = DOMAIN_SLUGS.slice(0, MAX_DOMAINS + 3);
      expect(normalizeDomains(many)).toHaveLength(MAX_DOMAINS);
    });

    it('returns an empty array for no valid domains', () => {
      expect(normalizeDomains([])).toEqual([]);
      expect(normalizeDomains(['', 'nope'])).toEqual([]);
    });
  });

  describe('renderTaxonomyForPrompt', () => {
    it('is deterministic and lists every slug with its gloss', () => {
      const rendered = renderTaxonomyForPrompt();
      expect(rendered).toBe(renderTaxonomyForPrompt());
      for (const { slug, gloss } of DOMAINS) {
        expect(rendered).toContain(`- ${slug}: ${gloss}`);
      }
    });
  });
});
