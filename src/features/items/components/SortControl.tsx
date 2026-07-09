import { cx } from '@/components/ui/cx';
import { SORT_OPTIONS } from '../lib/presentation';
import type { SortKey } from '../types';

interface SortControlProps {
  sort: SortKey;
  onChange: (sort: SortKey) => void;
}

/** "Tri" label + a segmented single-select toggle (Accessibilité | Date). */
export function SortControl({ sort, onChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] tracking-wide text-text-low uppercase">
        Tri
      </span>
      <div
        role="radiogroup"
        aria-label="Trier par"
        className="flex gap-0.5 rounded-lg bg-track p-[3px]"
      >
        {SORT_OPTIONS.map((option) => {
          const isActive = sort === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(option.value)}
              className={cx(
                'rounded-md px-3 py-1 text-[12px] transition-colors',
                isActive
                  ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.1)]'
                  : 'text-text-mid hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
