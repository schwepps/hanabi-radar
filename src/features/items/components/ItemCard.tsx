import { memo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/components/ui/cx';
import { STREAM_META } from '../lib/presentation';
import type { ListItem } from '../types';
import { AuthorRow } from './AuthorRow';
import { CardFooter } from './CardFooter';
import { DomainTags } from './DomainTags';
import { HeatBadge } from './HeatBadge';
import { WarmPathBadge } from './WarmPathBadge';

const SHEEN =
  'linear-gradient(100deg, transparent 32%, rgba(224,162,30,.12) 50%, transparent 68%)';

interface ItemCardProps {
  item: ListItem;
  isProcessed: boolean;
  onDismiss: (id: string) => void;
  onToggleProcessed: (id: string) => void;
  onReveal: (id: string) => void;
}

// Memoized so a single-item interaction re-renders only the affected card: the
// container passes stable (id)-taking handlers and referentially stable items.
export const ItemCard = memo(function ItemCard({
  item,
  isProcessed,
  onDismiss,
  onToggleProcessed,
  onReveal,
}: ItemCardProps) {
  const stream = STREAM_META[item.stream];
  const showNew = item.isNew && !isProcessed;
  const showWarmPath = item.stream === 'opportunity' && item.hasWarmPath;

  return (
    <article
      className={cx(
        'relative overflow-hidden rounded-card border border-l-[3px] border-border bg-surface px-[19px] py-[17px] shadow-card transition-opacity',
        stream.cardBorder,
        isProcessed && 'opacity-55',
      )}
    >
      {showNew && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-safe:animate-hb-sheen"
          style={{ backgroundImage: SHEEN }}
        />
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cx(
              'font-mono text-[10px] font-semibold tracking-[0.1em] uppercase',
              stream.text,
            )}
          >
            {stream.overline}
          </span>
          {item.heat != null && <HeatBadge heat={item.heat} />}
        </div>
        {showNew && (
          <Badge
            className="bg-spark-bg tracking-[0.08em] text-spark-glyph uppercase"
            dotClassName="bg-spark"
            isPulsing
          >
            Nouveau
          </Badge>
        )}
      </div>

      {item.summary != null && (
        <p className="mb-3.5 text-body text-ink">{item.summary}</p>
      )}

      <AuthorRow item={item} />

      {item.domains.length > 0 && (
        <div className="mt-3">
          <DomainTags domains={item.domains} />
        </div>
      )}

      {showWarmPath && (
        <div className="mt-3">
          <WarmPathBadge
            degree={item.path}
            onReveal={() => onReveal(item.id)}
          />
        </div>
      )}

      <CardFooter
        seen={item.seen}
        url={item.url}
        isProcessed={isProcessed}
        onDismiss={() => onDismiss(item.id)}
        onToggleProcessed={() => onToggleProcessed(item.id)}
      />
    </article>
  );
});
