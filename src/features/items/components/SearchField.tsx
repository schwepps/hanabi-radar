import type { Ref } from 'react';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Global search input: ⌕ glyph + borderless field + "/" keyboard hint. Filters
 * items across summary / author / meta / account / domains (wired in the
 * container). Uses React 19 ref-as-prop.
 */
export function SearchField({ value, onChange, ref }: SearchFieldProps) {
  return (
    <div className="flex items-center gap-2 rounded-[9px] border border-border bg-field px-3 py-2">
      <span aria-hidden className="text-[15px] text-text-low">
        ⌕
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Rechercher…"
        aria-label="Rechercher"
        className="w-full border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-text-low"
      />
      <kbd className="rounded-[4px] border border-border-soft px-1 font-mono text-[10px] text-text-low">
        /
      </kbd>
    </div>
  );
}
