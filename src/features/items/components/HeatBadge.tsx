import { Badge } from '@/components/ui/Badge';
import { cx } from '@/components/ui/cx';
import { HEAT_META } from '../lib/presentation';
import type { Heat } from '../types';

/** Heat pill (one scale: cold → warm → hot). Domain-specific, so it lives here. */
export function HeatBadge({ heat }: { heat: Heat }) {
  const meta = HEAT_META[heat];
  return (
    <Badge
      className={cx(meta.bg, meta.text, 'tracking-[0.08em] uppercase')}
      dotClassName={meta.dot}
    >
      {meta.label}
    </Badge>
  );
}
