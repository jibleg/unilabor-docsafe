import { useMemo, useState } from 'react';
import { ClipboardPen, Loader2, PlayCircle, UserCheck } from 'lucide-react';
import { assignPhase6Supervisor } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionPendingRow } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SearchableSelect, type SearchableOption } from '../../SearchableSelect';
import { SIGNERS_TOTAL, formatPct } from './supervision-ui';
import { useEmployeeOptions } from './useEmployeeOptions';

interface SupervisionPendingTableProps {
  rows: SupervisionPendingRow[];
  loading: boolean;
  openingEnrollmentId: number | null;
  onOpen: (row: SupervisionPendingRow) => void;
  /** Tras asignar supervisores (para recargar la bandeja). */
  onAssigned: () => void;
}

// Valor del filtro para los colaboradores sin sucursal en su ficha.
const NO_UNIT = '__sin_sucursal__';

/**
 * Colaboradores con la Fase 6 en curso, agrupados por área del puesto. RH
 * asigna el Supervisor / Auditor de cada colaborador en su puesto (uno por
 * uno o en bloque con la selección, filtrando por unidad si conviene) y abre
 * su lista ANA-REG-060.
 */
export const SupervisionPendingTable = ({ rows, loading, openingEnrollmentId, onOpen, onAssigned }: SupervisionPendingTableProps) => {
  const employeeOptions = useEmployeeOptions();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkSupervisor, setBulkSupervisor] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [unitFilter, setUnitFilter] = useState('');

  const unitOptions = useMemo<SearchableOption[]>(() => {
    const names = [...new Set(rows.map((row) => row.branch_name).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
    const options = names.map((name) => ({ value: name, label: name }));
    return rows.some((row) => !row.branch_name) ? [...options, { value: NO_UNIT, label: 'Sin sucursal' }] : options;
  }, [rows]);
  // Una unidad que ya no tiene pendientes (tras recargar la bandeja) deja de filtrar.
  const activeUnit = unitOptions.some((option) => option.value === unitFilter) ? unitFilter : '';
  const visibleRows = useMemo(
    () => (activeUnit ? rows.filter((row) => (row.branch_name ?? NO_UNIT) === activeUnit) : rows),
    [rows, activeUnit],
  );
  const changeUnit = (value: string) => {
    setUnitFilter(value);
    // La seleccion en bloque solo debe abarcar lo que se ve.
    setSelectedIds(new Set());
  };

  const assign = async (enrollmentIds: number[], supervisorId: string) => {
    setAssigning(true);
    try {
      notifySuccess(await assignPhase6Supervisor(enrollmentIds, supervisorId ? Number(supervisorId) : null));
      setSelectedIds(new Set());
      setBulkSupervisor('');
      onAssigned();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo asignar el supervisor.'));
    } finally {
      setAssigning(false);
    }
  };
  const toggle = (id: number) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (items: SupervisionPendingRow[], checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (checked) next.add(item.enrollment_id);
        else next.delete(item.enrollment_id);
      }
      return next;
    });
  // El evaluado nunca aparece como su propio supervisor.
  const optionsFor = (employeeId: number) => employeeOptions.filter((option) => option.value !== String(employeeId));
  const groups = useMemo(() => {
    const map = new Map<string, SupervisionPendingRow[]>();
    for (const row of visibleRows) {
      const key = row.area?.trim() || 'Puesto sin área asignada';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [visibleRows]);

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando pendientes…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
        Nadie tiene la Fase 6 en curso sin lista final. Los colaboradores entran a la Fase 6 al acreditar la Fase 5 de todos sus puestos.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {unitOptions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <SearchableSelect value={activeUnit} options={unitOptions} onChange={changeUnit} placeholder="Todas las unidades" emptyLabel="Todas las unidades" searchPlaceholder="Buscar unidad..." />
          </div>
          {activeUnit ? (
            <span className="text-xs text-[var(--unilabor-neutral)]">
              {visibleRows.length} de {rows.length} pendiente(s)
            </span>
          ) : null}
        </div>
      ) : null}
      {selectedIds.size > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-brand-300)] bg-white px-4 py-3 shadow-sm">
          <UserCheck size={16} className="text-[var(--color-brand-700)]" />
          <span className="text-sm font-semibold text-[var(--unilabor-ink)]">{selectedIds.size} seleccionado(s)</span>
          <div className="min-w-[260px] flex-1">
            <SearchableSelect value={bulkSupervisor} options={employeeOptions} onChange={setBulkSupervisor} placeholder="Supervisor / Auditor" emptyLabel="Quitar supervisor" searchPlaceholder="Buscar colaborador..." />
          </div>
          <button
            type="button"
            disabled={assigning}
            onClick={() => void assign([...selectedIds], bulkSupervisor)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {assigning ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />} {bulkSupervisor ? 'Asignar' : 'Quitar'}
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-semibold text-[var(--unilabor-neutral)] hover:underline">
            Limpiar
          </button>
        </div>
      ) : null}
      {groups.map(([area, items]) => (
        <section key={area} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)]">
          <header className="flex items-center justify-between bg-[rgba(238,245,250,0.9)] px-4 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">{area}</p>
            <span className="text-[11px] font-semibold text-[var(--unilabor-neutral)]">{items.length} pendiente(s)</span>
          </header>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
              <tr>
                <th className="w-8 pl-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar todos en ${area}`}
                    checked={items.every((item) => selectedIds.has(item.enrollment_id))}
                    onChange={(event) => toggleGroup(items, event.target.checked)}
                  />
                </th>
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Puesto</th>
                <th className="w-[24%] px-3 py-2">Supervisor / Auditor</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">En fase</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
              {items.map((row) => {
                const opening = openingEnrollmentId === row.enrollment_id;
                return (
                  <tr key={row.enrollment_id} className="hover:bg-[rgba(248,251,253,0.9)]">
                    <td className="pl-4 py-2">
                      <input type="checkbox" aria-label={`Seleccionar ${row.employee_name}`} checked={selectedIds.has(row.enrollment_id)} onChange={() => toggle(row.enrollment_id)} />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-[var(--unilabor-ink)]">{row.employee_name}</p>
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.employee_code}{row.section ? ` · ${row.section}` : ''}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-[var(--color-brand-700)]">{row.position_code}</p>
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.position_name}</p>
                    </td>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        value={row.supervisor_employee_id ? String(row.supervisor_employee_id) : ''}
                        options={optionsFor(row.employee_id)}
                        onChange={(value) => void assign([row.enrollment_id], value)}
                        placeholder="Asignar supervisor"
                        emptyLabel="Sin supervisor"
                        searchPlaceholder="Buscar colaborador..."
                        disabled={assigning}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">{row.branch_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{row.days_in_phase !== null ? `${row.days_in_phase} d` : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.draft_status === 'PENDING_SIGNATURES' ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                          En firma ({row.draft_signatures_done}/{SIGNERS_TOTAL})
                        </span>
                      ) : row.draft_checklist_id ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Borrador abierto</span>
                      ) : row.evaluation_status === 'passed' ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          Acreditada {formatPct(row.evaluation_percentage)}
                        </span>
                      ) : row.evaluation_status === 'failed' ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                          No acreditó {formatPct(row.last_closed_pct ?? row.evaluation_percentage)}
                        </span>
                      ) : row.closed_count > 0 ? (
                        <span className="text-[var(--unilabor-neutral)]">{row.closed_count} supervisión(es) intermedia(s)</span>
                      ) : (
                        <span className="text-[var(--unilabor-neutral)]">Sin lista</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        disabled={opening}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
                        title={row.draft_status === 'PENDING_SIGNATURES' ? 'Ver el avance de firmas' : row.draft_checklist_id ? 'Continuar el borrador' : 'Abrir lista ANA-REG-060'}
                      >
                        {opening ? <Loader2 size={13} className="animate-spin" /> : row.draft_checklist_id ? <PlayCircle size={13} /> : <ClipboardPen size={13} />}
                        {row.draft_status === 'PENDING_SIGNATURES' ? 'Ver firmas' : row.draft_checklist_id ? 'Continuar' : 'Aplicar lista'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
};
