import { Chip } from '@/components/ui/Chip';
import { DOMAIN_OPTIONS } from '../lib/presentation';

const LABELS = new Map(
  DOMAIN_OPTIONS.map((option) => [option.slug, option.label]),
);

/** Static expertise-domain chips on a card. */
export function DomainTags({ domains }: { domains: string[] }) {
  if (domains.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {domains.map((slug) => (
        <li key={slug}>
          <Chip label={LABELS.get(slug) ?? slug} />
        </li>
      ))}
    </ul>
  );
}
