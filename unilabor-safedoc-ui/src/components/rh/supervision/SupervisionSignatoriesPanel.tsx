import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { listAreaSignatories, saveAreaSignatories } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionAreaSignatory } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { buttonClass, inputClass } from './supervision-ui';

/**
 * Firmantes por área: quién aparece como Supervisor / Auditor y como
 * Responsable del Área en los borradores que el generador abre para cada
 * colaborador del área. Las áreas salen de la ficha de los colaboradores.
 */
export const SupervisionSignatoriesPanel = () => {
  const [rows, setRows] = useState<SupervisionAreaSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listAreaSignatories());
      setDirty(false);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los firmantes por área.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const update = (key: string, field: 'supervisor_name' | 'area_responsible_name', value: string) => {
    setRows((current) => current.map((row) => (row.area_key === key ? { ...row, [field]: value } : row)));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setRows(
        await saveAreaSignatories(
          rows.map((row) => ({ area_name: row.area_name, supervisor_name: row.supervisor_name, area_responsible_name: row.area_responsible_name })),
        ),
      );
      setDirty(false);
      notifySuccess('Firmantes por área guardados.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los firmantes.'));
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
          Por cada área, quién firma como <strong>Supervisor / Auditor</strong> y como <strong>Responsable del Área</strong>. El generador abre los
          borradores de la Fase 6 con estos nombres ya puestos; el supervisor puede corregirlos en cada lista. Las áreas se toman de la ficha de los
          colaboradores activos.
        </p>
        <button type="button" onClick={handleSave} disabled={saving || !dirty} className={buttonClass}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </button>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
          <tr>
            <th className="px-3 py-2">Área</th>
            <th className="px-3 py-2">Colaboradores</th>
            <th className="px-3 py-2">Fase 6 pendientes</th>
            <th className="px-3 py-2">Supervisor / Auditor</th>
            <th className="px-3 py-2">Responsable del Área</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
          {rows.map((row) => (
            <tr key={row.area_key} className={row.phase6_pending > 0 && !row.configured ? 'bg-amber-50/50' : ''}>
              <td className="px-3 py-2 font-semibold text-[var(--unilabor-ink)]">{row.area_name}</td>
              <td className="px-3 py-2 text-xs">{row.employees}</td>
              <td className="px-3 py-2 text-xs">
                {row.phase6_pending > 0 ? <span className="font-bold text-[var(--color-brand-700)]">{row.phase6_pending}</span> : '—'}
              </td>
              <td className="px-3 py-2">
                <input value={row.supervisor_name} onChange={(e) => update(row.area_key, 'supervisor_name', e.target.value)} className={inputClass} placeholder="Nombre de quien supervisa" />
              </td>
              <td className="px-3 py-2">
                <input value={row.area_responsible_name} onChange={(e) => update(row.area_key, 'area_responsible_name', e.target.value)} className={inputClass} placeholder="Coordinador / responsable" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
