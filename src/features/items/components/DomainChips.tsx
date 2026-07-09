import { Chip } from '@/components/ui/Chip';
import { DOMAIN_OPTIONS } from '../lib/presentation';

interface DomainChipsProps {
  selected: string[];
  onToggle: (slug: string) => void;
}

/** Multi-select expertise-domain filter (OR logic applied downstream). */
export function DomainChips({ selected, onToggle }: DomainChipsProps) {
  return (
    <fieldset>
      <legend className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-text-low uppercase">
        Domaine d’expertise
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {DOMAIN_OPTIONS.map((option) => (
          <Chip
            key={option.slug}
            label={option.label}
            isSelected={selected.includes(option.slug)}
            onToggle={() => onToggle(option.slug)}
          />
        ))}
      </div>
    </fieldset>
  );
}
