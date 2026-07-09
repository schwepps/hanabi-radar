import type { DateRange } from '../types';
import { AccountSelect } from './AccountSelect';
import { DateRangeRadios } from './DateRangeRadios';
import { DomainChips } from './DomainChips';

interface FilterRailProps {
  domains: string[];
  onToggleDomain: (slug: string) => void;
  accounts: string[];
  account: string;
  onAccountChange: (value: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (value: DateRange) => void;
  onReset: () => void;
}

/**
 * Left filter rail (desktop only — the cockpit layout). Sticky under the 58px
 * top bar with its own scroll.
 */
export function FilterRail({
  domains,
  onToggleDomain,
  accounts,
  account,
  onAccountChange,
  dateRange,
  onDateRangeChange,
  onReset,
}: FilterRailProps) {
  return (
    <aside
      aria-label="Filtres"
      className="sticky top-[58px] hidden h-[calc(100svh-58px)] w-[276px] shrink-0 overflow-y-auto border-r border-border bg-surface px-[22px] py-6 lg:block"
    >
      <div className="flex flex-col gap-7">
        <DomainChips selected={domains} onToggle={onToggleDomain} />
        <AccountSelect
          accounts={accounts}
          value={account}
          onChange={onAccountChange}
        />
        <DateRangeRadios value={dateRange} onChange={onDateRangeChange} />
        <button
          type="button"
          onClick={onReset}
          className="self-start font-mono text-[11px] text-text-low transition-colors hover:text-text-mid"
        >
          Réinitialiser les filtres
        </button>
      </div>
    </aside>
  );
}
