import type { ReactNode } from 'react';
import { cx } from './cx';
import { Dot } from './Dot';

interface BadgeProps {
  children: ReactNode;
  /** Colour classes (text / bg / border). */
  className?: string;
  /** bg-<color> for a leading dot; omit for no dot. */
  dotClassName?: string;
  isPulsing?: boolean;
}

/**
 * One small pill, tone driven by `className`. Covers the heat badge, the NEW
 * tag, the permission chip, the HOLDS-PATH chip and the live indicator — the
 * design's badges share this shape (mono 10px/600, 6px radius, optional 6px dot).
 */
export function Badge({
  children,
  className,
  dotClassName,
  isPulsing,
}: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-semibold leading-none',
        className,
      )}
    >
      {dotClassName != null && (
        <Dot size={6} className={dotClassName} isPulsing={isPulsing} />
      )}
      {children}
    </span>
  );
}
