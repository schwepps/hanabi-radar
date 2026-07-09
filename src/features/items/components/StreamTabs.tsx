import type { KeyboardEvent } from 'react';
import { Dot } from '@/components/ui/Dot';
import { cx } from '@/components/ui/cx';
import { STREAM_META, STREAM_ORDER } from '../lib/presentation';
import type { Stream } from '../types';

interface StreamTabsProps {
  activeTab: Stream;
  counts: Record<Stream, number>;
  onSelect: (stream: Stream) => void;
}

/** The three streams as an ARIA tablist. Streams are equal peers — order ≠ rank. */
export function StreamTabs({ activeTab, counts, onSelect }: StreamTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    const index = STREAM_ORDER.indexOf(activeTab);
    const next =
      STREAM_ORDER[(index + delta + STREAM_ORDER.length) % STREAM_ORDER.length];
    onSelect(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Flux"
      className="flex gap-6 border-b border-border-tab"
    >
      {STREAM_ORDER.map((stream) => {
        const meta = STREAM_META[stream];
        const isActive = stream === activeTab;
        return (
          <button
            key={stream}
            id={`tab-${stream}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${stream}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(stream)}
            onKeyDown={handleKeyDown}
            className={cx(
              '-mb-px flex items-center gap-2 border-b-2 pt-1 pb-2.5 text-[14px] transition-colors',
              isActive
                ? cx('font-bold text-ink', meta.tabBorder)
                : 'border-transparent font-medium text-text-low hover:text-text-mid',
            )}
          >
            <Dot size={8} className={meta.dot} />
            {meta.label}
            <span className="font-mono text-[11px] text-text-low">
              {counts[stream]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
