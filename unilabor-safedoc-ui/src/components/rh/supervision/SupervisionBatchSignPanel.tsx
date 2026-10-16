import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PenLine, RefreshCw } from 'lucide-react';
import { listAreaSignatories, listSupervisionChecklists, type CloseSupervisionChecklistResult } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionAreaSignatory, SupervisionChecklistListRow } from '../../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { SupervisionBatchCard, type BatchSession } from './SupervisionBatchCard';
import { buttonClass, inputClass, labelClass } from './supervision-ui';

const normalize = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Firmar por área: el supervisor y el responsable del área trazan su firma una
 * vez por sesión; después revisan y confirman cada lista en borrador del área,
 * una por una. Cada confirmación cierra esa lista con fecha y hora propias,
 * genera su PDF, lo archiva y, si es de la Fase 6, acredita la fase del puesto.
 * Las firmas de la sesión viven solo en memoria del navegador.
 */
export const SupervisionBatchSignPanel = () => {
  const [drafts, setDrafts] = useState<SupervisionChecklistListRow[]>([]);
  const [signatories, setSignatories] = useState<SupervisionAreaSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaKey, setAreaKey] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);
  const [areaSignature, setAreaSignature] = useState<string | null>(null);
  const [closedCount, setClosedCount] = useState(0);
  const [padVersion, setPadVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, areas] = await Promise.all([listSupervisionChecklists({ status: 'DRAFT', limit: 100 }), listAreaSignatories()]);
      setDrafts(page.rows);
      setSignatories(areas);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los borradores.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const areas = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number }>();
    for (const row of drafts) {
      const key = normalize(row.employee_area) || 'sin-area';
      const entry = map.get(key) ?? { key, name: row.employee_area?.trim() || 'Sin área registrada', count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [drafts]);

  useEffect(() => {
    if (!areaKey && areas.length > 0) setAreaKey(areas[0]!.key);
  }, [areas, areaKey]);

  // Al cambiar de área, prellena los firmantes configurados (sin pisar lo tecleado si ya hay texto).
  useEffect(() => {
    const config = signatories.find((item) => item.area_key === areaKey);
    if (config) {
      setSupervisorName((current) => current || config.supervisor_name);
      setResponsibleName((current) => current || config.area_responsible_name);
    }
  }, [areaKey, signatories]);

  const rows = drafts.filter((row) => (normalize(row.employee_area) || 'sin-area') === areaKey);
  const session: BatchSession = { supervisorName, responsibleName, supervisorSignature, areaSignature };
  const ready = Boolean(supervisorSignature && areaSignature && supervisorName.trim() && responsibleName.trim());

  const handleClosed = (result: CloseSupervisionChecklistResult) => {
    setClosedCount((value) => value + 1);
    if (result.practical && !result.practical.captured) notifyWarning(result.message);
    else notifySuccess(result.message);
  };

  const endSession = () => {
    setSupervisorSignature(null);
    setAreaSignature(null);
    setPadVersion((value) => value + 1);
    setClosedCount(0);
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
          Elige el área, traza una vez las firmas de la sesión y confirma cada lista después de revisarla. Cada confirmación es un cierre independiente con su
          fecha y hora, su PDF en el expediente y, si es de la Fase 6, la acreditación del puesto. La firma del colaborador no se recaba en esta modalidad.
        </p>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {areas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
          No hay listas en borrador. Usa "Generar borradores" en Pendientes o espera al ciclo automático.
        </p>
      ) : (
        <>
          <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Área</label>
              <select value={areaKey} onChange={(e) => { setAreaKey(e.target.value); setSupervisorName(''); setResponsibleName(''); }} className={inputClass}>
                {areas.map((area) => (
                  <option key={area.key} value={area.key}>
                    {area.name} ({area.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Supervisor / Auditor</label>
              <input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} className={inputClass} placeholder="Quien supervisa y firma" />
            </div>
            <div>
              <label className={labelClass}>Responsable del Área</label>
              <input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} className={inputClass} placeholder="Quien firma como responsable" />
            </div>
            <div className="md:col-span-3 grid gap-4 md:grid-cols-2">
              <SignaturePad key={`sup-${padVersion}`} label="Firma de la sesión · Supervisor / Auditor" hint="Se aplicará a cada lista que confirmes" onChange={setSupervisorSignature} />
              <SignaturePad key={`area-${padVersion}`} label="Firma de la sesión · Responsable del Área" hint="Debe estar presente; si no, deja las listas en borrador" onChange={setAreaSignature} />
            </div>
            <p className={`md:col-span-3 text-xs font-semibold ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>
              <PenLine size={12} className="mr-1 inline" />
              {ready ? `Sesión lista: ${rows.length} lista(s) por revisar en esta área · ${closedCount} cerrada(s) en esta sesión.` : 'Faltan nombres o firmas de la sesión para poder confirmar listas.'}
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
