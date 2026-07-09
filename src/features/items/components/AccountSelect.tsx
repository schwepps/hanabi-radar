interface AccountSelectProps {
  accounts: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Account filter (native select). Trends are cross-account and exempt downstream. */
export function AccountSelect({
  accounts,
  value,
  onChange,
}: AccountSelectProps) {
  return (
    <div>
      <label
        htmlFor="account-select"
        className="mb-2.5 block font-mono text-[10px] font-semibold tracking-[0.14em] text-text-low uppercase"
      >
        Compte
      </label>
      <select
        id="account-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
      >
        <option value="all">Tous les comptes</option>
        {accounts.map((account) => (
          <option key={account} value={account}>
            {account}
          </option>
        ))}
      </select>
    </div>
  );
}
