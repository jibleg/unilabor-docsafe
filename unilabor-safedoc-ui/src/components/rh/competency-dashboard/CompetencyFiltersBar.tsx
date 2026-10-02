import { Building2, Briefcase, CalendarDays, Filter, Layers, RotateCcw, Search, Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { MultiSelectFilter } from '../../MultiSelectFilter';
import { SearchableSelect } from '../../SearchableSelect';
import type { CompetencyStanding } from '../../../types/competencyDashboard';
import {
  EMPTY_FILTERS,
  EVALUATION_TYPE_LABELS,
  STANDING_META,
  STANDING_ORDER,
  type CompetencyFilters,
} from '../../../utils/competencyDashboard';

interface CompetencyFiltersBarProps {
  filters: CompetencyFilters;
  onChange: (filters: CompetencyFilters) => void;
  branches: string[];
  areas: string[];
  positions: Array<{ id: number; name: string }>;
  years: string[];
  resultCount: number;
  totalCount: number;
}

const Field = ({ icon: Icon, label, children }: { icon: typeof Search; label: string; children: ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1">
    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
      <Icon size={12} /> {label}
    </span>
    {children}
  </label>
);

const selectClass =
  'h-10 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[rgba(0,105,166,0.15)]';

const isDefault = (filters: CompetencyFilters): boolean =>
  JSON.stringify({ ...filters, standings: [...filters.standings].sort() }) ===
  JSON.stringify({ ...EMPTY_FILTERS, standings: [...EMPTY_FILTERS.standings].sort() });

/** Filtros del panel en una sola franja: atraviesan indicadores, gráficas y listado. */
export const CompetencyFiltersBar = ({
  filters,
  onChange,
  branches,
  areas,
  positions,
  years,
  resultCount,
  totalCount,
}: CompetencyFiltersBarProps) => {
  const set = <K extends keyof CompetencyFilters>(key: K, value: CompetencyFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-lg shadow-[rgba(0,65,106,0.06)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
          <Filter size={16} /> Filtros
          <span className="rounded-full bg-[rgba(191,212,230,0.5)] px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {resultCount} de {totalCount} colaboradores
          </span>
        </h2>
        {!isDefault(filters) ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
          >
            <RotateCcw size={12} /> Limpiar filtros
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <Field icon={Search} label="Buscar">
          <input
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
            placeholder="Nombre, número o puesto"
            className={selectClass}
          />
        </Field>
        <Field icon={Layers} label="Estado">
          <MultiSelectFilter
            values={filters.standings}
            defaultValues={EMPTY_FILTERS.standings}
            allLabel="Todos los estados"
            options={STANDING_ORDER.map((standing) => ({ value: standing, label: STANDING_META[standing].label }))}
            onChange={(values) => set('standings', values as CompetencyStanding[])}
          />
        </Field>
        <Field icon={Building2} label="Unidad">
          <SearchableSelect
            value={filters.branch}
            onChange={(value) => set('branch', value)}
            emptyLabel="Todas las unidades"
            placeholder="Todas las unidades"
            options={branches.map((branch) => ({ value: branch, label: branch }))}
          />
        </Field>
        <Field icon={Layers} label="Área">
          <SearchableSelect
            value={filters.area}
            onChange={(value) => set('area', value)}
            emptyLabel="Todas las áreas"
            placeholder="Todas las áreas"
            options={areas.map((area) => ({ value: area, label: area }))}
          />
        </Field>
        <Field icon={Briefcase} label="Puesto">
          <SearchableSelect
            value={filters.positionId}
            onChange={(value) => set('positionId', value)}
            emptyLabel="Todos los puestos"
            placeholder="Todos los puestos"
            options={positions.map((position) => ({ value: String(position.id), label: position.name }))}
          />
        </Field>
        <Field icon={Tag} label="Tipo de evaluación">
          <select value={filters.evaluationType} onChange={(event) => set('evaluationType', event.target.value)} className={selectClass}>
            <option value="">Todos los tipos</option>
            {Object.entries(EVALUATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field icon={CalendarDays} label="Año de evaluación">
          <select value={filters.year} onChange={(event) => set('year', event.target.value)} className={selectClass}>
            <option value="">Todos los años</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
};
