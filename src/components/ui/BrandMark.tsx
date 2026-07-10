/**
 * Brand mark + wordmark. The mark is the fireworks "spark" abstraction rendered
 * as a CSS radial-gradient rounded square (no image asset). Portable to the
 * extension consent screen — it reads the same --hb-* token.
 */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-[26px] rounded-[7px]"
        style={{ backgroundImage: 'var(--hb-gradient-brand-mark)' }}
      />
      <span className="text-[16px] font-bold tracking-tight text-ink">
        Hanabi<span className="text-brand"> Radar</span>
      </span>
    </span>
  );
}
