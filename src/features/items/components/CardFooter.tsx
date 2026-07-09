import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';

const SEEN_COLORS = ['bg-seen-1', 'bg-seen-2', 'bg-seen-3'];

function SeenByAvatars({ count }: { count: number }) {
  const shown = Math.min(count, SEEN_COLORS.length);
  if (shown === 0) {
    return null;
  }
  return (
    <span className="flex" aria-hidden>
      {SEEN_COLORS.slice(0, shown).map((color, index) => (
        <span
          key={color}
          className={cx(
            'size-[14px] rounded-full border border-surface',
            color,
            index > 0 && '-ml-[5px]',
          )}
        />
      ))}
    </span>
  );
}

interface CardFooterProps {
  seen: number;
  url: string;
  isProcessed: boolean;
  onDismiss: () => void;
  onToggleProcessed: () => void;
}

/** Seen-by cluster (left) + Dismiss / Mark-processed / open-original (right). */
export function CardFooter({
  seen,
  url,
  isProcessed,
  onDismiss,
  onToggleProcessed,
}: CardFooterProps) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-faint pt-3">
      <div className="flex items-center gap-2">
        <SeenByAvatars count={seen} />
        <span className="font-mono text-[11px] text-text-mid">
          vu par {seen}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={onDismiss}>
          Ignorer
        </Button>
        <Button
          variant="secondary"
          onClick={onToggleProcessed}
          aria-pressed={isProcessed}
          className={cx(
            isProcessed &&
              'border-success-border bg-stream-opportunity-tint text-success',
          )}
        >
          {isProcessed ? 'Traité ✓' : 'Marquer traité'}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir la publication LinkedIn d’origine"
          className="ml-1 inline-flex size-8 items-center justify-center rounded-md text-brand transition-colors hover:bg-brand-tint"
        >
          ↗
        </a>
      </div>
    </div>
  );
}
