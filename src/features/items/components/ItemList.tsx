import type { ListItem, Stream } from '../types';
import { EmptyState } from './EmptyState';
import { ItemCard } from './ItemCard';

interface ItemListProps {
  items: ListItem[];
  activeTab: Stream;
  processed: string[];
  onDismiss: (id: string) => void;
  onToggleProcessed: (id: string) => void;
  onReveal: (id: string) => void;
  onReset: () => void;
}

export function ItemList({
  items,
  activeTab,
  processed,
  onDismiss,
  onToggleProcessed,
  onReveal,
  onReset,
}: ItemListProps) {
  // Set for O(1) lookup; handlers are passed through stably so memoized cards skip.
  const processedSet = new Set(processed);

  return (
    // No tabIndex: the panel always holds focusable children (card actions or
    // the empty-state button), so per the ARIA APG it should not be a tab stop.
    <div
      role="tabpanel"
      id={`panel-${activeTab}`}
      aria-labelledby={`tab-${activeTab}`}
      className="flex flex-col gap-3"
    >
      {items.length === 0 ? (
        <EmptyState onReset={onReset} />
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isProcessed={processedSet.has(item.id)}
            onDismiss={onDismiss}
            onToggleProcessed={onToggleProcessed}
            onReveal={onReveal}
          />
        ))
      )}
    </div>
  );
}
