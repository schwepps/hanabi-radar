import { DATE_RANGE_OPTIONS } from '../lib/presentation';
import type { DateRange } from '../types';

interface DateRangeRadiosProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateRangeRadios({ value, onChange }: DateRangeRadiosProps) {
  return (
    <fieldset>
      <legend className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-text-low uppercase">
        Période
      </legend>
      <div className="flex flex-col gap-2">
        {DATE_RANGE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-[13px] text-text-mid"
          >
            <input
              type="radio"
              name="date-range"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="accent-brand"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
