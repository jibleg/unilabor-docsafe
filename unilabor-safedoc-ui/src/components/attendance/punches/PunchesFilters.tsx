import { Search } from 'lucide-react';
import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { EmployeePicker } from './EmployeePicker';
import { inputClass, labelClass } from './formStyles';
import { REVIEW_FILTER_OPTIONS, SOURCE_FILTER_OPTIONS } from './punchHelpers';

export interface PunchesFilterValues {
  from: string;
  to: string;
  branch: string;
  employee: string;
  source: string;
  review: string;
  q: string;
}

interface PunchesFiltersProps {
  values: PunchesFilterValues;
  branches: AttendanceBranch[];
  rangeError: string | null;
  onChange: (patch: Partial<PunchesFilterValues>) => void;
}

export const PunchesFilters = ({ values, branches, rangeError, onChange }: PunchesFiltersProps) => (
  <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label>
        <span className={labelClass}>Desde</span>
        <input type="date" className={inputClass} value={values.from} onChange={(e) => onChange({ from: e.target.value })} />
      </label>
      <label>
        <span className={labelClass}>Hasta</span>
        <input type="date" className={inputClass} value={values.to} onChange={(e) => onChange({ to: e.target.value })} />
      </label>
      <label>
        <span className={labelClass}>Sucursal</span>
        <select className={inputClass} value={values.branch} onChange={(e) => onChange({ branch: e.target.value })}>
          <option value="">Todas</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <div className="lg:col-span-2">
        <span className={labelClass}>Colaborador</span>
        <EmployeePicker value={values.employee} onChange={(employee) => onChange({ employee })} placeholder="Todos los colaboradores" emptyLabel="Todos los colaboradores" />
      </div>
      <label>
        <span className={labelClass}>Origen</span>
        <select className={inputClass} value={values.source} onChange={(e) => onChange({ source: e.target.value })}>
          {SOURCE_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label>
        <span className={labelClass}>Revisión</span>
        <select className={inputClass} value={values.review} onChange={(e) => onChange({ review: e.target.value })}>
          {REVIEW_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2 lg:col-span-5">
        <span className={labelClass}>Buscar</span>
        <div className="relative">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Nombre, código o número de reloj"
            value={values.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </div>
      </label>
    </div>
    {rangeError ? <p role="alert" className="mt-3 text-xs font-semibold text-[#d03b3b]">{rangeError}</p> : null}
  </div>
);
