import { warmPathLabel } from '../lib/presentation';
import type { Degree } from '../types';
import { ConnectionGlyph } from './ConnectionGlyph';

/**
 * The single most valuable signal on an opportunity card. States only that a
 * warm path exists and its degree — NEVER the holder's identity. Clicking opens
 * the permissioned reveal flow.
 */
export function WarmPathBadge({
  degree,
  onReveal,
}: {
  degree: Degree;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReveal}
      className="flex w-full touch-manipulation items-center gap-2.5 rounded-[10px] border border-spark-border bg-spark-bg px-3 py-[9px] text-left transition-[filter] hover:brightness-[0.98]"
    >
      <ConnectionGlyph className="shrink-0 text-spark-glyph" />
      <span className="flex-1 text-body-sm font-semibold text-spark-text">
        {warmPathLabel(degree)}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-spark-glyph">
        révéler ↗
      </span>
    </button>
  );
}
