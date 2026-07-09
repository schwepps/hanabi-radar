import { Dot } from '@/components/ui/Dot';

interface RealtimeBannerProps {
  count: number;
  onDismiss: () => void;
}

/**
 * Non-disruptive "new items arrived" banner. In this reference screen it is
 * driven by the seeded `isNew` flags; production drives it from the realtime feed.
 */
export function RealtimeBanner({ count, onDismiss }: RealtimeBannerProps) {
  const message =
    count > 1
      ? `${count} nouveaux éléments viennent d’arriver`
      : '1 nouvel élément vient d’arriver';

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-[11px] border border-spark-border bg-spark-bg px-[15px] py-[11px] motion-safe:animate-hb-drop"
    >
      <Dot
        size={9}
        className="bg-spark shadow-[0_0_6px_rgba(224,162,30,.7)]"
        isPulsing
      />
      <span className="flex-1 text-[13px] font-semibold text-spark-text">
        {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="font-mono text-[11px] text-spark-glyph hover:underline"
      >
        masquer
      </button>
    </div>
  );
}
