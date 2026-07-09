import { cx } from './cx';

interface ChipProps {
  label: string;
  /** When `onToggle` is provided the chip is an interactive filter toggle. */
  isSelected?: boolean;
  onToggle?: () => void;
}

const BASE =
  'inline-flex items-center rounded-pill border px-[9px] py-[3px] text-[11px] font-medium transition-colors';

const SELECTED = 'border-brand-border bg-brand-tint text-brand';
const UNSELECTED = 'border-border-soft bg-surface-sunken text-chip-text';

/** Pill chip — a static tag by default, a multi-select toggle when interactive. */
export function Chip({ label, isSelected = false, onToggle }: ChipProps) {
  const classes = cx(BASE, isSelected ? SELECTED : UNSELECTED);

  if (onToggle == null) {
    return <span className={classes}>{label}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cx(classes, 'touch-manipulation hover:border-brand-border')}
    >
      {label}
    </button>
  );
}
