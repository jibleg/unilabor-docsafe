import { useEffect, useMemo, useState } from 'react';
import { Search, Signature, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { listEmployees } from '../../api/service.api-core';
import { assignAcknowledgements } from '../../api/service.api-rh-acknowledgement';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { Employee } from '../../types/models';

// Valores por defecto acordados: 72h de plazo y 7s de permanencia por pagina.
// El segundo es un piso anti-atajo, no una estimacion de lectura real.
const DEFAULT_DEADLINE_HOURS = 72;
const DEFAULT_MIN_SECONDS_PER_PAGE = 7;

interface Props {
  documentId: number;
  documentTitle: string;
  onClose: () => void;
  onAssigned?: () => void;
}

export const RequestAcknowledgementModal = ({
  documentId,
  documentTitle,
  onClose,
  onAssigned,
}: Props) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [deadlineHours, setDeadlineHours] = useState(DEFAULT_DEADLINE_HOURS);
  const [minSeconds, setMinSeconds] = useState(DEFAULT_MIN_SECONDS_PER_PAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Colaboradores que el backend rechazo por tener ya un acuse vigente.
  const [alreadyAssigned, setAlreadyAssigned] = useState<Set<number>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        setEmployees((await listEmployees()).filter((employee) => employee.is_active));
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'No se pudieron cargar los colaboradores.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return employees;
    }
    return employees.filter(
      (employee) =>
        employee.full_name.toLowerCase().includes(term) ||
        employee.employee_code.toLowerCase().includes(term) ||
        (employee.area ?? '').toLowerCase().includes(term),
    );
  }, [employees, search]);

  const toggle = (employeeId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const allSelected = filtered.every((employee) => selected.has(employee.id));
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((employee) => {
        if (allSelected) {
          next.delete(employee.id);
        } else {
          next.add(employee.id);
        }
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      return;
    }
    setSaving(true);
    try {
      const result = await assignAcknowledgements(documentId, {
        employee_ids: [...selected],
        deadline_hours: deadlineHours,
        min_seconds_per_page: minSeconds,
      });

      const skipped = result.skipped_employee_ids.length;

      // Nadie recibio el acuse porque todos ya lo tenian. No es un error, pero
      // cerrar el modal con un "0 creados" se lee como falla: se deja abierto y
      // se marcan los omitidos para que RH pueda corregir la seleccion.
      if (result.created.length === 0) {
        setAlreadyAssigned(new Set(result.skipped_employee_ids));
        toast.warning(
          skipped === 1
            ? 'Ese colaborador ya tiene un acuse vigente de este documento.'
            : `Los ${skipped} colaboradores seleccionados ya tienen un acuse vigente de este documento.`,
        );
        return;
      }

      toast.success(
        skipped > 0
          ? `${result.created.length} acuse(s) solicitado(s). ${skipped} ya lo tenían.`
          : `${result.created.length} acuse(s) solicitado(s).`,
      );
      onAssigned?.();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo solicitar el acuse.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/97 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="flex items-start justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-bold text-[var(--color-brand-700)]">
              <Signature size={18} />
              Solicitar acuse de lectura
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--unilabor-neutral)]">
              {documentTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
            Plazo para firmar (horas)
            <input
              type="number"
              min={1}
              max={2160}
              value={deadlineHours}
              onChange={(event) => setDeadlineHours(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">
            Permanencia mínima por página (segundos)
            <input
              type="number"
              min={1}
              max={120}
              value={minSeconds}
              onChange={(event) => setMinSeconds(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
            />
          </label>
        </div>

        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-3">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, código o área…"
              className="w-full rounded-lg border border-[rgba(0,65,106,0.12)] py-2 pl-9 pr-3 text-sm"
            />
          </div>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="mt-2 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
            >
              {filtered.every((employee) => selected.has(employee.id))
                ? 'Quitar todos los visibles'
                : 'Seleccionar todos los visibles'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}
          {!loading && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--unilabor-neutral)]">
              Sin colaboradores que coincidan.
            </p>
          )}
          <ul className="space-y-1">
            {filtered.map((employee) => (
              <li key={employee.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-[rgba(191,212,230,0.2)]">
                  <input
                    type="checkbox"
                    checked={selected.has(employee.id)}
                    onChange={() => toggle(employee.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--color-brand-700)]">
                      {employee.full_name}
                      {alreadyAssigned.has(employee.id) && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          ya lo tiene
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-[var(--unilabor-neutral)]">
                      {employee.employee_code}
                      {employee.area ? ` · ${employee.area}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <span className="text-xs text-[var(--unilabor-neutral)]">
            {selected.size} seleccionado(s)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={selected.size === 0 || saving}
              className="rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Solicitando…' : 'Solicitar acuse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
