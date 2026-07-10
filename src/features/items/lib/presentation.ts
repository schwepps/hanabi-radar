import { DOMAINS } from '@/lib/taxonomy';
import type {
  AuthorKind,
  DateRange,
  Degree,
  Heat,
  SortKey,
  Stream,
} from '../types';

/**
 * Visual mapping layer: stream / heat / author kind → French labels + LITERAL
 * Tailwind class strings. Classes are written out in full (never concatenated at
 * runtime) so Tailwind's JIT keeps them in the bundle.
 */

export interface StreamMeta {
  /** Tab label (plural). */
  label: string;
  /** Card overline label (rendered uppercase). */
  overline: string;
  /** text-<color> for the solid stream hue. */
  text: string;
  /** bg-<color> for the stream dot. */
  dot: string;
  /** border-l color for the card's 3px left rule. */
  cardBorder: string;
  /** border-<color> for the active tab's bottom rule. */
  tabBorder: string;
  /** bg-<tint> for soft stream fills. */
  tint: string;
}

export const STREAM_META: Record<Stream, StreamMeta> = {
  signal: {
    label: 'Signaux',
    overline: 'Signal',
    text: 'text-stream-signal',
    dot: 'bg-stream-signal',
    cardBorder: 'border-l-stream-signal',
    tabBorder: 'border-stream-signal',
    tint: 'bg-stream-signal-tint',
  },
  opportunity: {
    label: 'Opportunités',
    overline: 'Opportunité',
    text: 'text-stream-opportunity',
    dot: 'bg-stream-opportunity',
    cardBorder: 'border-l-stream-opportunity',
    tabBorder: 'border-stream-opportunity',
    tint: 'bg-stream-opportunity-tint',
  },
  trend: {
    label: 'Tendances',
    overline: 'Tendance',
    text: 'text-stream-trend',
    dot: 'bg-stream-trend',
    cardBorder: 'border-l-stream-trend',
    tabBorder: 'border-stream-trend',
    tint: 'bg-stream-trend-tint',
  },
};

/** Tabs render in this fixed order (streams are equal peers — order ≠ rank). */
export const STREAM_ORDER: Stream[] = ['signal', 'opportunity', 'trend'];

export interface HeatMeta {
  label: string;
  text: string;
  bg: string;
  dot: string;
}

export const HEAT_META: Record<Heat, HeatMeta> = {
  cold: {
    label: 'Froid',
    text: 'text-heat-cold-text',
    bg: 'bg-heat-cold-bg',
    dot: 'bg-heat-cold',
  },
  warm: {
    label: 'Tiède',
    text: 'text-heat-warm-text',
    bg: 'bg-heat-warm-bg',
    dot: 'bg-heat-warm',
  },
  hot: {
    label: 'Chaud',
    text: 'text-heat-hot-text',
    bg: 'bg-heat-hot-bg',
    dot: 'bg-heat-hot',
  },
};

export interface AvatarStyle {
  bg: string;
  fg: string;
  /** Glyph shown instead of initials (company page / aggregate), or null. */
  glyph: string | null;
}

export const AUTHOR_AVATAR: Record<AuthorKind, AvatarStyle> = {
  person: { bg: 'bg-brand-tint', fg: 'text-stream-signal', glyph: null },
  company: { bg: 'bg-surface-sunken', fg: 'text-text-mid', glyph: '◧' },
  aggregate: {
    bg: 'bg-stream-trend-tint',
    fg: 'text-stream-trend',
    glyph: '≈',
  },
};

/** Suffix after the author name (person/company); aggregates show their count. */
export const AUTHOR_KIND_LABEL: Record<AuthorKind, string> = {
  person: 'personne',
  company: 'page entreprise',
  aggregate: 'tendance',
};

export const DEGREE_LABEL: Record<Degree, string> = {
  first: '1er degré',
  second: '2e degré',
  third: '3e degré',
  none: '',
};

/** "Warm path exists · Nth degree" → French. */
export function warmPathLabel(degree: Degree): string {
  return `Chemin chaud · ${DEGREE_LABEL[degree]}`;
}

/** Hop label inside the reveal chain. */
export function hopLabel(degree: Degree): string {
  switch (degree) {
    case 'first':
      return 'Directement connecté (1er degré)';
    case 'second':
      return 'Relations en commun (2e degré)';
    case 'third':
      return 'Chemin indirect (3e degré)';
    default:
      return 'Aucun chemin';
  }
}

/**
 * Label for one revealed warm-intro path (FSC-106). A degree path reuses `hopLabel`; a
 * `none` row is a social-proof alternative (the sensor isn't connected, but a named
 * 1st-degree contact can bridge).
 */
export function revealPathLabel(degree: Degree): string {
  return degree === 'none'
    ? 'Relation de 1er degré · voie alternative'
    : hopLabel(degree);
}

/**
 * "vu le 8 juil." — calendar date for a reveal sighting (`item_sources.seen_at`).
 * Pinned to Europe/Paris (the French collective's timezone) so the coarse day label is
 * deterministic regardless of the machine timezone.
 */
export function formatSeenAt(iso: string): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
  return `vu le ${date}`;
}

/** Initials from a display name (max two letters). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Expertise-domain filter options (Hanabi taxonomy → French label), derived from
 * the single source of truth in `@/lib/taxonomy` so the filter, the classifier's
 * vocabulary, and the DB-allowed values can never drift.
 */
export const DOMAIN_OPTIONS: { slug: string; label: string }[] = DOMAINS.map(
  ({ slug, label }) => ({ slug, label }),
);

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '24h', label: 'Dernières 24 heures' },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'all', label: 'Tout' },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'reachability', label: 'Accessibilité' },
  { value: 'date', label: 'Date' },
];
