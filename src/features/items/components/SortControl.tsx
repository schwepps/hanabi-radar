import type { KeyboardEvent } from 'react';
import { cx } from '@/components/ui/cx';
import { SORT_OPTIONS } from '../lib/presentation';
import type { SortKey } from '../types';

interface SortControlProps {
  sort: SortKey;
  onChange: (sort: SortKey) => void;
}

/** "Tri" label + a segmented single-select radiogroup (Accessibilité | Date). */
export function SortControl({ sort, onChange }: SortControlProps) {
  // Radiogroup keyboard pattern: arrow keys move selection and focus.
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) {
      return;
    }
    event.preventDefault();
    const index = SORT_OPTIONS.findIndex((option) => option.value === sort);
    const delta = forward ? 1 : -1;
    const next =
      SORT_OPTIONS[(index + delta + SORT_OPTIONS.length) % SORT_OPTIONS.length];
    onChange(next.value);
    document.getElementById(`sort-${next.value}`)?.focus();
  }

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
              id={`sort-${option.value}`}
              type="button"
              role="radio"
              aria-checked={isActive}
              // Roving tabIndex: only the checked option is in the tab order.
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={handleKeyDown}
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
