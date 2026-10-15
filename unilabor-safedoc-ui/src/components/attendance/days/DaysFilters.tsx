import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { EmployeePicker } from '../punches/EmployeePicker';
import { inputClass, labelClass } from '../punches/formStyles';
import { RESULT_FILTER_OPTIONS } from './dayHelpers';
import { pastDateBounds } from '../shared/format';

export interface DaysFilterValues {
  from: string;
  to: string;
  branch: string;
  employee: string;
  result: string;
}

interface DaysFiltersProps {
  values: DaysFilterValues;
  branches: AttendanceBranch[];
  rangeError: string | null;
  onChange: (patch: Partial<DaysFilterValues>) => void;
}

export const DaysFilters = ({ values, branches, rangeError, onChange }: DaysFiltersProps) => (
  <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label>
        <span className={labelClass}>Desde</span>
        <input type="date" {...pastDateBounds()} className={inputClass} value={values.from} onChange={(e) => onChange({ from: e.target.value })} />
      </label>
      <label>
        <span className={labelClass}>Hasta</span>
        <input type="date" {...pastDateBounds()} className={inputClass} value={values.to} onChange={(e) => onChange({ to: e.target.value })} />
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
        <span className={labelClass}>Resultado</span>
        <select className={inputClass} value={values.result} onChange={(e) => onChange({ result: e.target.value })}>
          {RESULT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--unilabor-ink)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-brand-700)]"
          checked={values.result === 'incident'}
          onChange={(e) => onChange({ result: e.target.checked ? 'incident' : '' })}
        />
        Solo con incidencias
      </label>
      {rangeError ? <p role="alert" className="text-xs font-semibold text-[#d03b3b]">{rangeError}</p> : null}
    </div>
  </div>
);
