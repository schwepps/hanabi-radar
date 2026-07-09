import { cx } from './cx';

interface AvatarProps {
  /** Initials or a single glyph to render. */
  content: string;
  bgClassName: string;
  fgClassName: string;
  /** Diameter in px. */
  size?: number;
  radiusClassName?: string;
  className?: string;
}

/** Initials / glyph tile. Caller supplies the colour classes and the content. */
export function Avatar({
  content,
  bgClassName,
  fgClassName,
  size = 30,
  radiusClassName = 'rounded-md',
  className,
}: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold select-none',
        bgClassName,
        fgClassName,
        radiusClassName,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {content}
    </span>
  );
}
