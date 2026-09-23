import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { SearchableSelect } from '../../SearchableSelect';
import type { CalendarEventKind, CalendarFilters } from '../../../types/helpdesk-program';
import type { Employee, HelpdeskCatalogs, HelpdeskOrgStructure } from '../../../types/models';
import { KIND_LABELS, KIND_STYLES } from '../../../utils/maintenanceProgram';

interface ProgramFilterBarProps {
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
  orgStructure: HelpdeskOrgStructure | null;
  employees: Employee[];
  catalogs: HelpdeskCatalogs | null;
}

const ALL_KINDS: CalendarEventKind[] = ['PREVENTIVE', 'VERIFICATION', 'ELECTRICAL_SAFETY', 'OTHER', 'POST_REPAIR_VERIFICATION', 'CALIBRATION', 'CORRECTIVE'];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'SCHEDULED,RESCHEDULED', label: 'Programadas' },
  { value: 'IN_PROGRESS', label: 'En ejecución' },
  { value: 'PENDING_VALIDATION', label: 'En validación' },
  { value: 'CLOSED', label: 'Cerradas' },
];

export const ProgramFilterBar = ({ filters, onChange, orgStructure, employees, catalogs }: ProgramFilterBarProps) => {
  const unitOptions = useMemo(
    () => (orgStructure?.units ?? []).map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [orgStructure],
  );
  const areaOptions = useMemo(() => {
    const unitId = filters.unit_id ? Number(filters.unit_id) : null;
    return (orgStructure?.areas ?? [])
      .filter((area) => !unitId || area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [orgStructure, filters.unit_id]);
  const responsibleOptions = useMemo(() => {
    const areaId = filters.area_id ? Number(filters.area_id) : null;
    const area = areaId ? (orgStructure?.areas ?? []).find((item) => item.id === areaId) : null;
    const areaUsers = area
      ? (orgStructure?.users ?? []).filter((user) => area.responsible_user_ids.includes(user.id)).map((user) => ({ value: `u:${user.id}`, label: user.full_name, hint: 'Responsable de área' }))
      : [];
    const employeeOptions = employees
      .filter((employee) => employee.is_active)
      .map((employee) => ({ value: `e:${employee.id}`, label: employee.full_name, hint: employee.position ?? employee.area ?? 'Responsable técnico / operador' }));
    return [...areaUsers, ...employeeOptions];
  }, [orgStructure, employees, filters.area_id]);

  const responsibleValue = filters.responsible_user_id ? `u:${filters.responsible_user_id}` : filters.responsible_employee_id ? `e:${filters.responsible_employee_id}` : '';
  const categoryOptions = (catalogs?.categories ?? []).map((item) => ({ value: String(item.id), label: item.name }));
  const criticalityOptions = (catalogs?.criticalities ?? []).map((item) => ({ value: String(item.id), label: item.name }));
  const activeKinds = filters.kind ?? [];
  const hasFilters = Boolean(filters.unit_id || filters.area_id || responsibleValue || filters.category_id || filters.criticality_id || filters.search || activeKinds.length || (filters.status ?? []).length);

  const toggleKind = (kind: CalendarEventKind) => {
    const next = activeKinds.includes(kind) ? activeKinds.filter((k) => k !== kind) : [...activeKinds, kind];
    onChange({ ...filters, kind: next });
  };

  return (
    <div className="space-y-2 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-3 py-2.5 shadow-sm">
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <SearchableSelect
          value={filters.unit_id ?? ''}
          options={unitOptions}
          placeholder="Unidad"
          emptyLabel="Todas las unidades"
          onChange={(value) => onChange({ ...filters, unit_id: value, area_id: '', responsible_user_id: '' })}
        />
        <SearchableSelect
          value={filters.area_id ?? ''}
          options={areaOptions}
          placeholder="Área"
          emptyLabel="Todas las áreas"
          onChange={(value) => onChange({ ...filters, area_id: value, responsible_user_id: '' })}
        />
        <SearchableSelect
          value={responsibleValue}
          options={responsibleOptions}
          placeholder="Responsable"
          emptyLabel="Todos los responsables"
          onChange={(value) =>
            onChange({
              ...filters,
              responsible_user_id: value.startsWith('u:') ? value.slice(2) : '',
              responsible_employee_id: value.startsWith('e:') ? value.slice(2) : '',
            })
          }
        />
        <SearchableSelect
          value={filters.category_id ?? ''}
          options={categoryOptions}
          placeholder="Categoría"
          emptyLabel="Todas las categorías"
          onChange={(value) => onChange({ ...filters, category_id: value })}
        />
        <SearchableSelect
          value={filters.criticality_id ?? ''}
          options={criticalityOptions}
          placeholder="Criticidad"
          emptyLabel="Toda criticidad"
          onChange={(value) => onChange({ ...filters, criticality_id: value })}
        />
        <div className="flex gap-2">
          <select
            value={(filters.status ?? []).join(',')}
            onChange={(event) => onChange({ ...filters, status: event.target.value ? event.target.value.split(',') : [] })}
            className="h-10 min-w-0 flex-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 text-sm text-[var(--unilabor-ink)]"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 md:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            value={filters.search ?? ''}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Código o nombre del activo"
            className="h-9 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white pl-8 pr-3 text-sm text-[var(--unilabor-ink)]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_KINDS.map((kind) => {
            const active = activeKinds.length === 0 || activeKinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active ? KIND_STYLES[kind].chip : 'border-[rgba(0,65,106,0.1)] bg-white text-[var(--unilabor-neutral)] opacity-60'
                }`}
                title={activeKinds.includes(kind) ? 'Quitar del filtro' : 'Filtrar por este tipo'}
              >
                <span className={`h-2 w-2 rounded-full ${KIND_STYLES[kind].dot}`} />
                {KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => onChange({})}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--unilabor-neutral)] hover:text-[#b02a2a]"
          >
            <X size={12} /> Limpiar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
};
