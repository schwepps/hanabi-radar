import type { PendingItem } from '../types';

export type PrefilterDecision =
  { decision: 'noise'; reason: string } | { decision: 'send' };

const SEND: PrefilterDecision = { decision: 'send' };

/**
 * Substrings (lowercase, FR + EN, stemmed where useful) that signal genuine
 * business substance. If ANY appears in the text or hashtags we never auto-noise —
 * we send the post to the model. Generous by design: an extra Claude call on a
 * borderline post is cheap; dropping a real signal is not.
 */
const DOMAIN_KEYWORDS = [
  'servicenow',
  'power platform',
  'powerplatform',
  'power apps',
  'power automate',
  'low-code',
  'low code',
  'genai',
  'gen ai',
  'generative ai',
  'ia générative',
  'ia generative',
  'copilot',
  'copilote',
  'llm',
  'pmo',
  'carve',
  'm&a',
  'fusion',
  'acquisition',
  'cession',
  'architect',
  'socle',
  'urbanisation',
  'digital workplace',
  'intranet',
  'microsoft 365',
  'm365',
  'sharepoint',
  'smart office',
  'product manag',
  'product owner',
  'roadmap',
  "appel d'offres",
  "appels d'offres",
  'appel d’offres',
  'appels d’offres',
  'rfp',
  'tender',
  'marché public',
  'marche public',
  'transform',
  'operating model',
  'réorganisation',
  'reorganisation',
  'organisation cible',
  'change manag',
  'conduite du changement',
  'adoption',
  'devops',
  'kubernetes',
  'ci/cd',
  'cloud',
  'sre',
  'platform engineering',
  'data platform',
  'pipeline',
  'cyber',
  'sécurité',
  'securite',
  'security',
  'entra id',
  'iam',
  'soc',
  'conformité',
  'compliance',
  'pricing',
  'tarification',
  'marketing',
  'd2c',
  'contrat',
  'vendor',
  'fournisseur',
  'sourcing',
  'itsm',
  'service delivery',
  'dsi',
  'cio',
  'cto',
  'coo',
  'directeur',
  'directrice',
  'responsable',
  'programme',
  'projet',
  'déploie',
  'deploie',
  'migrat',
  'refonte',
  'recrut',
  'hiring',
  'nomin',
  'nomme',
  'partenaire',
  'mission',
  'gouvernance',
  'lancement',
  'lance ',
  'lançons',
  // --- High-demand tech clusters (web3 / AI / software staffing) ---
  // Precise substrings only: e.g. 'defi' (→ "definitely") and 'tech lead' (→ "fintech leader")
  // are deliberately omitted — they over-match common words, and web3/AI posts already hit the
  // keywords below.
  'web3',
  'blockchain',
  'solidity',
  'smart contract',
  'ethereum',
  'crypto',
  'machine learning',
  'machine-learning',
  'mlops',
  'deep learning',
  'data science',
  'data scientist',
  'nlp',
  'computer vision',
  'software engineer',
  'ingénieur logiciel',
  'développeur',
  'developer',
  'staff engineer',
];

/**
 * High-precision NOISE patterns — only obvious personal / filler content. These are
 * checked ONLY after the business-keyword gate above rules the post out, so a
 * "félicitations pour le lancement du programme" is already sent (it matches a
 * keyword) before reaching here.
 */
const NOISE_PATTERNS: RegExp[] = [
  /work\s*anniversary|#workanniversary|anniversaire de travail/i,
  /\b\d+\s*(ans|years?)\b.*\b(chez|at|@)\b/i,
  /#?opentowork|open to work|à la recherche d('|’)un poste|je recherche (un poste|une opportunité)|disponible imm(é|e)diatement/i,
  /joyeux anniversaire|happy birthday/i,
  /\b(félicitations|felicitations|bravo|congratulations|congrats)\b/i,
  /citation (du jour|inspirante)|pensée du jour|motivation du (lundi|matin)/i,
];

/** Below this length (and with no business keyword) a text post carries nothing. */
const MIN_MEANINGFUL_TEXT = 40;

/**
 * Conservative, fail-open keyword pre-filter run BEFORE any Claude call to save
 * cost. Returns `noise` (skip the model, persist NOISE_UPDATE) or `send`
 * (classify). Bias is heavily toward `send`: a false `noise` silently drops real
 * signal, which is the one outcome the collective cannot afford.
 */
export function prefilterItem(item: PendingItem): PrefilterDecision {
  // Teaser rule, enforced structurally: only a plain `text` post is ever eligible
  // for an auto-noise verdict. Substance-bearing formats (document/video/poll/
  // carousel/image/article), reposts, and anything carrying a media_title always
  // go to the model — their substance may live outside the text.
  if (item.post_type !== 'text' || item.is_repost) {
    return SEND;
  }
  if (item.media_title != null && item.media_title.trim() !== '') {
    return SEND;
  }

  const text = (item.text ?? '').trim();
  if (text === '') {
    return { decision: 'noise', reason: 'empty text' };
  }

  const haystack = `${text}\n${item.hashtags.join(' ')}`.toLowerCase();
  if (DOMAIN_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return SEND;
  }
  if (NOISE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { decision: 'noise', reason: 'personal/filler pattern' };
  }
  if (text.length < MIN_MEANINGFUL_TEXT) {
    return { decision: 'noise', reason: 'too short, no signal' };
  }
  return SEND;
}
