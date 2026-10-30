import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { listAreaSignatories, saveAreaSignatories } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionAreaSignatory } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { buttonClass } from './supervision-ui';
import { useEmployeeOptions } from './useEmployeeOptions';

/**
 * Responsable del Área por área del proceso (Preanalítica, Analítica,
 * Posanalítica, Administración): el colaborador que avala con su firma las
 * listas ANA-REG-060 de los puestos del área. El Supervisor / Auditor no se
 * configura aquí: se asigna a cada colaborador en su puesto (Pendientes Fase 6).
 */
export const SupervisionSignatoriesPanel = () => {
  const [rows, setRows] = useState<SupervisionAreaSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const employeeOptions = useEmployeeOptions();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listAreaSignatories());
      setDirty(false);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los responsables por área.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const update = (key: string, employeeId: string) => {
    setRows((current) => current.map((row) => (row.area_key === key ? { ...row, area_responsible_employee_id: employeeId ? Number(employeeId) : null } : row)));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setRows(await saveAreaSignatories(rows.map((row) => ({ area_key: row.area_key, area_responsible_employee_id: row.area_responsible_employee_id }))));
      setDirty(false);
      notifySuccess('Responsables por área guardados; los borradores del área ya los muestran.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los responsables.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando áreas…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-[var(--unilabor-ink)]">
          Quién firma como <strong>Responsable del Área</strong> en las listas de los puestos de cada área. El <strong>Supervisor / Auditor</strong> se
          asigna a cada colaborador en su puesto, en <em>Pendientes Fase 6</em>. Nadie avala su propia supervisión: si el evaluado es el responsable de su
          área, la lista no se podrá cerrar.
        </p>
        <button type="button" onClick={handleSave} disabled={saving || !dirty} className={buttonClass}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </button>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
          <tr>
            <th className="px-3 py-2">Área</th>
            <th className="px-3 py-2">Puestos</th>
            <th className="px-3 py-2">Colaboradores</th>
            <th className="px-3 py-2">Fase 6 pendientes</th>
            <th className="w-[38%] px-3 py-2">Responsable del Área</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
          {rows.map((row) => (
            <tr key={row.area_key} className={row.phase6_pending > 0 && !row.area_responsible_employee_id ? 'bg-amber-50/50' : ''}>
              <td className="px-3 py-2 font-semibold text-[var(--unilabor-ink)]">{row.area_name}</td>
              <td className="px-3 py-2 text-xs">{row.positions}</td>
              <td className="px-3 py-2 text-xs">{row.employees}</td>
              <td className="px-3 py-2 text-xs">
                {row.phase6_pending > 0 ? <span className="font-bold text-[var(--color-brand-700)]">{row.phase6_pending}</span> : '—'}
              </td>
              <td className="px-3 py-2">
                <SearchableSelect
                  value={row.area_responsible_employee_id ? String(row.area_responsible_employee_id) : ''}
                  options={employeeOptions}
                  onChange={(value) => update(row.area_key, value)}
                  placeholder="Elige al responsable"
                  emptyLabel="Sin responsable"
                  searchPlaceholder="Buscar colaborador..."
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
