'use client';

export function ProviderSelect({
  value,
  onChange,
  providers,
}: {
  value: string;
  onChange: (provider: string) => void;
  providers?: string[];
}) {
  return (
    <label className="rate-select">
      <span className="sr-only">Provider</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Provider">
        <option value="all">All providers</option>
        {(providers ?? []).map((provider) => (
          <option key={provider} value={provider}>
            {provider}
          </option>
        ))}
      </select>
    </label>
  );
}
