import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Power, Search } from 'lucide-react';
import {
  bulkEnableEmployees,
  extractBulkRowErrors,
  listAttendanceEmployees,
  type AttendanceEmployee,
} from '../../../api/service.api-attendance-employees';
import type { AttendanceBranch } from '../../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifySuccess } from '../../../utils/notify';
import { isValidDeviceNumber } from './readiness';
import { inputClass, labelClass, modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from './ui';

interface Props {
  branches: AttendanceBranch[];
  onClose: () => void;
  onDone: () => void;
}

interface Selection {
  employee: AttendanceEmployee;
  number: string;
}

/** Habilitado en lote tipo hoja: elige colaboradores sin habilitar, sucursal por defecto y numero de reloj. */
export const BulkEnableModal = ({ branches, onClose, onDone }: Props) => {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [selected, setSelected] = useState<Record<number, Selection>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const result = await listAttendanceEmployees({ enabled: 'false', search: search.trim() || undefined, limit: 100 });
        if (active) setCandidates(result.data);
      } catch (err) {
        if (active) setLoadError(getApiErrorMessage(err, 'No se pudo cargar la lista.'));
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [search, reloadKey]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggle = (employee: AttendanceEmployee) =>
    setSelected((current) => {
      const next = { ...current };
      if (next[employee.id]) delete next[employee.id];
      else next[employee.id] = { employee, number: employee.device_employee_number ?? employee.suggested_device_number ?? '' };
      return next;
    });

  const setNumber = (id: number, number: string) =>
    setSelected((current) => (current[id] ? { ...current, [id]: { ...current[id], number } } : current));

  const handleSubmit = async () => {
    setError('');
    setRowErrors({});
    if (selectedList.length === 0) return setError('Elige al menos un colaborador.');
    const local: Record<number, string> = {};
    for (const { employee, number } of selectedList) {
      if (!number.trim()) local[employee.id] = 'Falta el número de reloj.';
      else if (!isValidDeviceNumber(number)) local[employee.id] = 'Solo letras, números y guion (hasta 20).';
      else if (!defaultBranch && employee.branch_id === null) local[employee.id] = 'Sin sucursal: elige una por defecto.';
    }
    if (Object.keys(local).length > 0) {
      setRowErrors(local);
      return setError('Corrige las filas marcadas.');
    }
    setSaving(true);
    try {
      const result = await bulkEnableEmployees(
        selectedList.map(({ employee, number }) => ({ employee_id: employee.id, device_employee_number: number.trim() })),
        defaultBranch ? Number(defaultBranch) : undefined,
      );
      notifySuccess(`${result.enabled} colaborador(es) habilitado(s).`);
      onDone();
    } catch (err) {
      const perRow = extractBulkRowErrors(err);
      setRowErrors(perRow);
      setError(getApiErrorMessage(err, 'No se pudo habilitar.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Habilitar en lote">
      <div className={`${modalPanelClass} max-w-3xl`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Habilitar en lote</h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">Si una fila falla no se habilita a nadie.</p>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bulk-branch">Sucursal por defecto</label>
              <select id="bulk-branch" className={inputClass} value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)}>
                <option value="">Usar la del colaborador</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="bulk-search">Buscar</label>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
                <input id="bulk-search" className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o código" />
              </div>
            </div>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
          ) : loadError ? (
            <div className="space-y-2 py-4 text-sm">
              <p className="text-red-800">{loadError}</p>
              <button type="button" className={secondaryButtonClass} onClick={() => setReloadKey((key) => key + 1)}>Reintentar</button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--unilabor-neutral)]">No hay colaboradores sin habilitar con esa búsqueda.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[rgba(0,65,106,0.1)]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[rgba(239,245,250,0.96)] text-xs uppercase text-[var(--unilabor-neutral)]">
                  <tr>
                    <th className="w-10 px-3 py-2"><span className="sr-only">Elegir</span></th>
                    <th className="px-3 py-2">Colaborador</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">N.º reloj</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                  {candidates.map((employee) => {
                    const row = selected[employee.id];
                    return (
                      <tr key={employee.id}>
                        <td className="px-3 py-2">
                          <input type="checkbox" className="checkbox checkbox-sm" aria-label={`Elegir a ${employee.full_name}`} checked={!!row} onChange={() => toggle(employee)} />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-[var(--unilabor-ink)]">{employee.full_name}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{employee.employee_code}</p>
                        </td>
                        <td className="px-3 py-2 text-xs">{employee.branch_name ?? '—'}</td>
                        <td className="px-3 py-2">
                          {row ? (
                            <>
                              <input
                                aria-label={`Número de reloj de ${employee.full_name}`}
                                className={`${inputClass} max-w-[160px] py-1 ${rowErrors[employee.id] ? 'border-red-400' : ''}`}
                                maxLength={20}
                                value={row.number}
                                onChange={(event) => setNumber(employee.id, event.target.value)}
                              />
                              {rowErrors[employee.id] ? <p className="mt-1 text-xs text-red-700">{rowErrors[employee.id]}</p> : null}
                            </>
                          ) : (
                            <span className="text-xs text-[var(--unilabor-neutral)]">{employee.suggested_device_number ? `Sugerido: ${employee.suggested_device_number}` : '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {Object.keys(rowErrors).some((id) => !candidates.some((c) => c.id === Number(id))) ? (
            <ul className="text-xs text-red-700">
              {Object.entries(rowErrors).filter(([id]) => !candidates.some((c) => c.id === Number(id))).map(([id, message]) => (
                <li key={id}>{selected[Number(id)]?.employee.full_name ?? `#${id}`}: {message}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <span className="text-xs text-[var(--unilabor-neutral)]">{selectedList.length} elegido(s)</span>
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className={primaryButtonClass} onClick={() => void handleSubmit()} disabled={saving || selectedList.length === 0}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Power size={15} aria-hidden="true" />} Habilitar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
