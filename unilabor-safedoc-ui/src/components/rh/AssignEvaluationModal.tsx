import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Send, Users, X } from 'lucide-react';
import {
  assignEvaluation,
  getApiErrorMessage,
  listEmployees,
  listTemplateAssignments,
} from '../../api/service';
import type { EvaluationAssignment, EvaluationTemplate, Employee } from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';
import { EVALUATION_STATUS_META, formatTimeRemaining } from '../../utils/evaluations';

interface AssignEvaluationModalProps {
  template: EvaluationTemplate;
  onClose: () => void;
  onAssigned: () => void;
}

type Tab = 'assign' | 'assigned';

export const AssignEvaluationModal = ({ template, onClose, onAssigned }: AssignEvaluationModalProps) => {
  const [tab, setTab] = useState<Tab>('assign');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const loadAssignments = useCallback(async () => {
    const result = await listTemplateAssignments(template.id, { page: 1, limit: 100 });
    setAssignments(result.data);
  }, [template.id]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [emps] = await Promise.all([listEmployees(), loadAssignments()]);
        if (active) {
          setEmployees(emps);
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudieron cargar los datos de asignación.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [loadAssignments]);

  // Colaboradores con una asignacion vigente (no se pueden volver a asignar).
  const activeAssignedIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((a) => ['pending', 'in_progress', 'submitted', 'grading'].includes(a.status))
          .map((a) => a.employee_id),
      ),
    [assignments],
  );

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return employees;
    }
    return employees.filter((employee) =>
      [employee.full_name, employee.employee_code, employee.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [employees, search]);

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const selectableIds = useMemo(
    () => filteredEmployees.filter((employee) => !activeAssignedIds.has(employee.id)).map((employee) => employee.id),
    [filteredEmployees, activeAssignedIds],
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });

  const handleAssign = async () => {
    if (template.status !== 'published') {
      notifyWarning('Publica la evaluación antes de asignarla.');
      return;
    }
    if (selected.size === 0) {
      notifyWarning('Selecciona al menos un colaborador.');
      return;
    }
    setAssigning(true);
    try {
      const summary = await assignEvaluation(template.id, [...selected]);
      notifySuccess(
        `Asignadas ${summary.created} evaluación(es)${summary.skipped > 0 ? `; ${summary.skipped} ya vigente(s)` : ''}.`,
      );
      setSelected(new Set());
      await loadAssignments();
      onAssigned();
      setTab('assigned');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo asignar la evaluación.'));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Asignar evaluación
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{template.title}</h2>
            <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">
              Ventana de {template.window_hours}h | mínimo {template.passing_score}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[rgba(0,65,106,0.08)] px-5 pt-3">
          {(['assign', 'assigned'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                tab === value
                  ? 'border-b-2 border-[var(--color-brand-500)] text-[var(--color-brand-700)]'
                  : 'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]'
              }`}
            >
              {value === 'assign' ? 'Asignar' : `Asignadas (${assignments.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando...
          </div>
        ) : tab === 'assign' ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {template.status !== 'published' && (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Esta evaluación está en borrador. Publícala para poder asignarla.
              </div>
            )}
            <div className="px-5 py-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar colaborador..."
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </div>
              {selectableIds.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="mt-2 text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]"
                >
                  {allSelected ? 'Quitar selección' : 'Seleccionar todos los visibles'}
                </button>
              )}
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto px-5 pb-4">
              {filteredEmployees.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--unilabor-neutral)]">Sin colaboradores.</p>
              ) : (
                filteredEmployees.map((employee) => {
                  const already = activeAssignedIds.has(employee.id);
                  return (
                    <label
                      key={employee.id}
                      className={`flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] px-3 py-2 text-sm ${
                        already ? 'opacity-50' : 'cursor-pointer hover:bg-[rgba(191,212,230,0.2)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={selected.has(employee.id)}
                        onChange={() => toggle(employee.id)}
                        className="h-4 w-4 accent-[var(--color-brand-500)]"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-[var(--unilabor-ink)]">{employee.full_name}</span>
                        <span className="ml-2 text-xs text-[var(--unilabor-neutral)]">{employee.employee_code}</span>
                      </span>
                      {already && <span className="text-[10px] font-semibold text-[var(--color-brand-500)]">Ya asignada</span>}
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <span className="mr-auto self-center text-xs text-[var(--unilabor-neutral)]">
                {selected.size} seleccionado(s)
              </span>
              <button
                type="button"
                onClick={() => void handleAssign()}
                disabled={assigning || template.status !== 'published' || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {assigning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Asignar evaluación
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {assignments.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--unilabor-neutral)]">
                <Users className="mx-auto mb-2" size={22} /> Aún no hay colaboradores asignados.
              </p>
            ) : (
              <ul className="space-y-2">
                {assignments.map((assignment) => {
                  const meta = EVALUATION_STATUS_META[assignment.status];
                  return (
                    <li
                      key={assignment.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white/90 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--unilabor-ink)]">{assignment.employee_name}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {assignment.employee_code} | {formatTimeRemaining(assignment.deadline_at)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.className}`}>
                        {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
