import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-body-sm font-semibold transition-colors touch-manipulation active:scale-[0.99] disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-surface-sunken disabled:text-text-disabled';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand px-4 py-[9px] text-white hover:bg-brand-hover',
  secondary:
    'border border-border-strong bg-surface px-4 py-[9px] text-ink hover:bg-surface-sunken',
  ghost: 'px-3 py-[9px] text-text-mid hover:text-ink',
  danger: 'bg-danger px-4 py-[9px] text-white hover:opacity-90',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(BASE, VARIANTS[variant], className)}
      {...props}
    />
  );
}
