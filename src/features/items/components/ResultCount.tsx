import { SORT_OPTIONS } from '../lib/presentation';
import type { SortKey } from '../types';

export function ResultCount({ count, sort }: { count: number; sort: SortKey }) {
  const sortLabel = (
    SORT_OPTIONS.find((option) => option.value === sort)?.label ?? ''
  ).toLowerCase();
  const plural = count > 1 ? 's' : '';
  return (
    <p aria-live="polite" className="font-mono text-[11px] text-text-low">
      {count} élément{plural} · trié par {sortLabel}
    </p>
  );
}
