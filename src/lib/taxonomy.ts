/**
 * Single source of truth for Hanabi's expertise-domain taxonomy.
 *
 * `items.domains` is a free-text `text[]` column (no DB enum), so THIS list — not
 * the database — is the canonical vocabulary. Both the classifier (its prompt block
 * and its structured-output enum) and the dashboard filter (`DOMAIN_OPTIONS` in
 * `features/items/lib/presentation.ts`) derive from `DOMAINS`, so one edit here
 * updates the model's vocabulary, the allowed output values, and the UI filter
 * together — they can never drift.
 *
 * The set intentionally spans the full breadth of the wearehanabi.com collective:
 * the original nine domains plus the strategy/organization, change,
 * engineering, cloud, data, security, pricing, marketing, vendor, service-delivery
 * and CIO-advisory clusters the collective actually staffs.
 *
 *   slug  — English key stored in `items.domains` and used by the UI filter.
 *   gloss — English one-liner shown to the classifier so it maps posts precisely.
 *   label — French label rendered in the (French-facing) dashboard.
 */

export const DOMAINS = [
  // --- Core taxonomy (stable since inception) ---
  {
    slug: 'pmo',
    gloss:
      'Program/project management office, delivery governance, PMO staffing',
    label: 'PMO',
  },
  {
    slug: 'servicenow',
    gloss:
      'ServiceNow platform — implementation, modules, ITSM built on ServiceNow',
    label: 'ServiceNow',
  },
  {
    slug: 'power_platform',
    gloss:
      'Microsoft Power Platform — Power Apps/Automate/BI, low-code automation',
    label: 'Power Platform',
  },
  {
    slug: 'gen_ai',
    gloss: 'Generative AI, LLMs, copilots, AI use-cases and scaling',
    label: 'GenAI',
  },
  {
    slug: 'carve_in_out',
    gloss:
      'M&A IT separation/integration — carve-out (divestiture) or carve-in',
    label: 'Carve-in / out',
  },
  {
    slug: 'it_architecture',
    gloss:
      'Enterprise & application architecture, technical core (socle applicatif)',
    label: 'Architecture IT',
  },
  {
    slug: 'digital_workplace',
    gloss:
      'Intranet, Microsoft 365 collaboration, employee experience, smart office',
    label: 'Digital Workplace',
  },
  {
    slug: 'product_management',
    gloss: 'Product discovery, roadmap, product ownership and product ops',
    label: 'Product Management',
  },
  {
    slug: 'rfp',
    gloss:
      'Tender / bid phase — issuing or responding to an RFP (appel d’offres)',
    label: 'Appels d’offres',
  },
  // --- Diversity additions (cover the collective's full breadth) ---
  {
    slug: 'strategy_organization',
    gloss:
      'Transformation strategy, target operating model, organization design (the "transformation" theme)',
    label: 'Stratégie & Organisation',
  },
  {
    slug: 'change_management',
    gloss: 'Change adoption, enablement, training and communication',
    label: 'Conduite du changement',
  },
  {
    slug: 'software_engineering',
    gloss: 'Software development, full-stack, tech lead, engineering craft',
    label: 'Ingénierie logicielle',
  },
  {
    slug: 'cloud_devops',
    gloss: 'Cloud, Kubernetes, CI/CD, DevOps, SRE, platform engineering',
    label: 'Cloud & DevOps',
  },
  {
    slug: 'data_engineering',
    gloss:
      'Data platform, pipelines, data engineering and analytics enablement',
    label: 'Data Engineering',
  },
  {
    slug: 'cybersecurity',
    gloss:
      'Security, identity & access (incl. Entra ID), SOC, risk and compliance',
    label: 'Cybersécurité',
  },
  {
    slug: 'pricing',
    gloss: 'Pricing strategy and monetization',
    label: 'Pricing',
  },
  {
    slug: 'marketing',
    gloss: 'Marketing and direct-to-consumer (D2C), growth',
    label: 'Marketing & D2C',
  },
  {
    slug: 'vendor_management',
    gloss:
      'Delivery-phase supplier & contract management (distinct from the RFP bid phase)',
    label: 'Gestion fournisseurs & contrats',
  },
  {
    slug: 'service_delivery',
    gloss:
      'Service delivery management / ITSM discipline, independent of tooling',
    label: 'Service Delivery & ITSM',
  },
  {
    slug: 'cio_advisory',
    gloss:
      'Executive IT advisory — CIO/CTO strategy, IT governance and sourcing',
    label: 'Conseil CIO/CTO',
  },
] as const;

/** A canonical domain slug (literal union derived from `DOMAINS`). */
export type DomainSlug = (typeof DOMAINS)[number]['slug'];

/** Ordered list of canonical slugs — the classifier's structured-output vocabulary. */
export const DOMAIN_SLUGS: readonly DomainSlug[] = DOMAINS.map((d) => d.slug);

/**
 * Reserved sentinel the classifier may emit when a post touches real expertise
 * that no canonical slug covers — keeps precision on the real slugs instead of
 * forcing a wrong bucket. Recurring `other` themes are promoted to real slugs by
 * extending `DOMAINS` (migration-free: the column is free `text[]`).
 */
export const OTHER_DOMAIN = 'other';

/** Every value the classifier is allowed to emit for a domain. */
export const CLASSIFIER_DOMAIN_VALUES = [
  ...DOMAIN_SLUGS,
  OTHER_DOMAIN,
] as const;

/** Max domains stored per item — a post spanning more than this is over-tagged. */
export const MAX_DOMAINS = 6;

const SLUG_INDEX = new Map<string, number>(
  DOMAIN_SLUGS.map((slug, index) => [slug, index]),
);

/** True when `slug` is a canonical taxonomy slug (excludes the `other` sentinel). */
export function isKnownDomain(slug: string): boolean {
  return SLUG_INDEX.has(slug);
}

/**
 * Defensive normalization of a raw domain array (the structured output already
 * constrains membership, so this is belt-and-suspenders): lowercase + trim, keep
 * only canonical slugs plus the `other` sentinel, dedupe, order by the taxonomy,
 * and cap at `MAX_DOMAINS`. `other` always sorts last.
 */
export function normalizeDomains(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of raw) {
    const slug = value.trim().toLowerCase();
    if (slug === '' || seen.has(slug)) {
      continue;
    }
    if (isKnownDomain(slug) || slug === OTHER_DOMAIN) {
      seen.add(slug);
      kept.push(slug);
    }
  }
  kept.sort(
    (a, b) =>
      (SLUG_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (SLUG_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  return kept.slice(0, MAX_DOMAINS);
}

/** The taxonomy block injected into the classifier's (cacheable) system prompt. */
export function renderTaxonomyForPrompt(): string {
  return DOMAINS.map((d) => `- ${d.slug}: ${d.gloss}`).join('\n');
}
