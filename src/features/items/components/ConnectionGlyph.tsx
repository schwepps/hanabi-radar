/** The warm-path connection glyph: dot — bar — hollow ring (all currentColor). */
export function ConnectionGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="26"
      height="10"
      viewBox="0 0 26 10"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="3" cy="5" r="3" fill="currentColor" />
      <line
        x1="6.5"
        y1="5"
        x2="16.5"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="21" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
