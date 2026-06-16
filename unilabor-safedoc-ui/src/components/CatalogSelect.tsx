import type { HelpdeskCatalogItem } from '../types/models';

interface CatalogSelectProps {
  label: string;
  value: string;
  options: HelpdeskCatalogItem[];
  onChange: (value: string) => void;
}

export const CatalogSelect = ({ label, value, options, onChange }: CatalogSelectProps) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
      {label}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
    >
      <option value="">Sin seleccionar</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  </label>
);
