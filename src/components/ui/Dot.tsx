import { cx } from './cx';

interface DotProps {
  /** bg-<color> class for the dot fill. */
  className?: string;
  /** Diameter in px. */
  size?: number;
  isPulsing?: boolean;
}

/** A small decorative colour dot (stream marker, live/NEW indicator). */
export function Dot({ className, size = 8, isPulsing = false }: DotProps) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block shrink-0 rounded-full',
        className,
        isPulsing && 'motion-safe:animate-hb-pulse',
      )}
      style={{ width: size, height: size }}
    />
  );
}
