import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PenLine, RefreshCw } from 'lucide-react';
import { listSupervisionChecklists, type CloseSupervisionChecklistResult } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklistListRow } from '../../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { SearchableSelect } from '../../SearchableSelect';
import { SupervisionBatchCard, type BatchSession } from './SupervisionBatchCard';
import { buttonClass, inputClass, labelClass } from './supervision-ui';

const NO_AREA = 'NONE';

/**
 * Firmar como supervisor (sesión presencial con RH): se elige al Supervisor /
 * Auditor y el área; aparecen solo los borradores asignados a esa persona en
 * los puestos de esa área. El supervisor y el Responsable del Área trazan su
 * firma una vez; después cada lista se revisa y confirma una por una (cierre
 * independiente con su fecha, PDF al expediente y acreditación de la Fase 6).
 * Las firmas de la sesión viven solo en memoria del navegador. Si el
 * supervisor tiene cuenta, puede firmar él mismo en "Mis supervisiones".
 */
export const SupervisionBatchSignPanel = () => {
  const [drafts, setDrafts] = useState<SupervisionChecklistListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [supervisorId, setSupervisorId] = useState('');
  const [areaKey, setAreaKey] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);
  const [areaSignature, setAreaSignature] = useState<string | null>(null);
  const [closedIds, setClosedIds] = useState<Set<number>>(() => new Set());
  const [padVersion, setPadVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listSupervisionChecklists({ status: 'DRAFT', limit: 100 });
      setDrafts(page.rows);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los borradores.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const unassigned = drafts.filter((row) => row.enrollment_id && !row.supervisor_employee_id).length;

  const supervisorOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    for (const row of drafts) {
      if (!row.supervisor_employee_id) continue;
      const key = String(row.supervisor_employee_id);
      const entry = map.get(key) ?? { value: key, label: row.supervisor_name || `Colaborador ${key}`, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((entry) => ({ value: entry.value, label: entry.label, hint: `${entry.count} lista(s) por firmar` }));
  }, [drafts]);

  const mine = useMemo(() => drafts.filter((row) => String(row.supervisor_employee_id ?? '') === supervisorId), [drafts, supervisorId]);
  const areas = useMemo(() => {
    const map = new Map<string, { key: string; name: string; responsible: string; count: number }>();
    for (const row of mine) {
      const key = row.process_area_code ?? NO_AREA;
      const entry = map.get(key) ?? { key, name: row.process_area_name ?? 'Puestos sin área asignada', responsible: row.area_responsible_name, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [mine]);

  useEffect(() => {
    if (!areas.some((area) => area.key === areaKey)) setAreaKey(areas[0]?.key ?? '');
  }, [areas, areaKey]);

  const area = areas.find((item) => item.key === areaKey) ?? null;
  const rows = mine.filter((row) => (row.process_area_code ?? NO_AREA) === areaKey);
  const supervisorName = supervisorOptions.find((option) => option.value === supervisorId)?.label ?? '';
  const responsibleName = area?.responsible ?? '';
  const session: BatchSession = { supervisorName, responsibleName, supervisorSignature, areaSignature };
  const ready = Boolean(supervisorSignature && areaSignature && supervisorName && responsibleName);
  const toReviewCount = rows.filter((row) => !closedIds.has(row.id)).length;

  const resetSignatures = () => {
    setSupervisorSignature(null);
    setAreaSignature(null);
    setPadVersion((value) => value + 1);
  };

  const handleClosed = (result: CloseSupervisionChecklistResult) => {
    setClosedIds((current) => new Set(current).add(result.checklist.id));
    if (result.practical && !result.practical.captured) notifyWarning(result.message);
    else notifySuccess(result.message);
  };

  const endSession = () => {
    resetSignatures();
    setClosedIds(new Set());
    void load();
  };

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando borradores…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-[var(--unilabor-ink)]">
          Sesión presencial: elige al supervisor y el área; el supervisor y el Responsable del Área trazan su firma una vez y se confirma cada lista
          después de revisarla. Si el supervisor tiene cuenta en SafeDoc, también puede firmar él mismo en <em>Mis supervisiones</em>.
        </p>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {unassigned > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          {unassigned} borrador(es) de la Fase 6 sin supervisor asignado: asígnalo en Pendientes Fase 6 para que aparezcan aquí.
        </p>
      ) : null}

      {supervisorOptions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
          No hay listas en borrador con supervisor asignado.
        </p>
      ) : (
        <>
          <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Supervisor / Auditor</label>
              <SearchableSelect
                value={supervisorId}
                options={supervisorOptions}
                onChange={(value) => {
                  setSupervisorId(value);
                  resetSignatures();
                }}
                placeholder="Elige al supervisor"
                emptyLabel="Sin elegir"
                searchPlaceholder="Buscar supervisor..."
              />
            </div>
            <div>
              <label className={labelClass}>Área</label>
              <select
                value={areaKey}
                onChange={(e) => {
                  setAreaKey(e.target.value);
                  setAreaSignature(null);
                  setPadVersion((value) => value + 1);
                }}
                className={inputClass}
                disabled={areas.length === 0}
              >
                {areas.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Responsable del Área</label>
              <p className={`${inputClass} truncate`}>{responsibleName || <span className="text-amber-700">Sin responsable: configúralo en Firmantes por área</span>}</p>
            </div>
            {supervisorId ? (
              <div className="md:col-span-3 grid gap-4 md:grid-cols-2">
                <SignaturePad key={`sup-${padVersion}`} label={`Firma de la sesión · ${supervisorName}`} hint="Se aplicará a cada lista que confirmes" onChange={setSupervisorSignature} />
                <SignaturePad
                  key={`area-${padVersion}-${areaKey}`}
                  label={`Firma de la sesión · ${responsibleName || 'Responsable del Área'}`}
                  hint="Debe estar presente; si no, deja las listas en borrador"
                  onChange={setAreaSignature}
                />
              </div>
            ) : null}
            <p className={`md:col-span-3 text-xs font-semibold ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>
              <PenLine size={12} className="mr-1 inline" />
              {ready
                ? `Sesión lista: ${toReviewCount} lista(s) por revisar · ${closedIds.size} cerrada(s) en esta sesión.`
                : 'Elige al supervisor y traza las dos firmas de la sesión para poder confirmar listas.'}
            </p>
          </section>

          <div className="space-y-3">
            {rows.map((row) => (
              <SupervisionBatchCard key={row.id} row={row} session={session} onClosed={handleClosed} />
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={endSession} className={buttonClass} title="Borra las firmas de la sesión de la memoria del navegador y recarga los borradores">
              Terminar sesión de firma
            </button>
          </div>
        </>
      )}
    </div>
  );
};
