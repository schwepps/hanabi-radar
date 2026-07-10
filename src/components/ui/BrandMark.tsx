/**
 * Brand mark + wordmark. The mark is the "Hanabi Intelligence" logo — a firework
 * burst whose outer nodes form a constellation (hanabi + collective intelligence),
 * drawn as an inline SVG on the brand blue gradient. Kept in sync by hand with the
 * extension's assets/brand/hanabi-intelligence-logo.svg and this app's icon.svg.
 */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <svg
        aria-hidden
        viewBox="0 0 128 128"
        className="size-[26px]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="hb-brandmark-grad" cx="30%" cy="30%" r="85%">
            <stop offset="0%" stopColor="#2e6be6" />
            <stop offset="60%" stopColor="#1f4fd6" />
            <stop offset="100%" stopColor="#143a9c" />
          </radialGradient>
        </defs>
        <rect width="128" height="128" rx="29" fill="url(#hb-brandmark-grad)" />
        <circle
          cx="64"
          cy="64"
          r="42"
          stroke="#fff"
          strokeOpacity="0.3"
          strokeWidth="1.6"
          fill="none"
        />
        {[45, 90, 135, 180, 225, 270, 315, 360].map((a) => (
          <g key={a} transform={`rotate(${a} 64 64)`}>
            <line
              x1="64"
              y1="46"
              x2="64"
              y2="26"
              stroke="#fff"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <circle cx="64" cy="22" r="4.6" fill="#fff" />
          </g>
        ))}
        <circle cx="64" cy="64" r="8.5" fill="#fff" />
      </svg>
      <span className="text-[16px] font-bold tracking-tight text-ink">
        Hanabi<span className="text-brand"> Intelligence</span>
      </span>
    </span>
  );
}
