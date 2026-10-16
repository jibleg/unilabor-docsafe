import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronUp, FileCheck2, Loader2, Lock } from 'lucide-react';
import {
  closeSupervisionChecklist,
  getSupervisionChecklist,
  saveSupervisionResults,
  updateSupervisionChecklist,
  type CloseSupervisionChecklistResult,
} from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklist, SupervisionChecklistListRow, SupervisionResult } from '../../../types/models';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { SupervisionSectionsEditor, type SupervisionDraftResult } from './SupervisionSectionsEditor';
import { CONCLUSION_UI, formatPct, inputClass } from './supervision-ui';

export interface BatchSession {
  supervisorName: string;
  responsibleName: string;
  supervisorSignature: string | null;
  areaSignature: string | null;
}

interface SupervisionBatchCardProps {
  row: SupervisionChecklistListRow;
  session: BatchSession;
  onClosed: (result: CloseSupervisionChecklistResult) => void;
}

const summarize = (values: Record<number, SupervisionDraftResult>) => {
  let si = 0;
  let no = 0;
  let na = 0;
  let pending = 0;
  for (const value of Object.values(values)) {
    if (value.result === 'SI') si += 1;
    else if (value.result === 'NO') no += 1;
    else if (value.result === 'NA') na += 1;
    else pending += 1;
  }
  const evaluated = si + no;
  const pct = evaluated > 0 ? Math.round((si / evaluated) * 10000) / 100 : null;
  const conclusion = pct === null ? null : pct >= 85 ? 'CONFORME' : pct >= 80 ? 'CONFORME_CON_OBSERVACIONES' : 'REQUIERE_SEGUIMIENTO';
  return { si, no, na, pending, evaluated, pct, conclusion } as const;
};

/**
 * Una lista dentro de la sesión de firma por área: se expande para revisar los
 * aspectos (con "Todo SÍ en lo aplicable"), comentarios y SGC, y se confirma
 * individualmente. El cierre usa las firmas trazadas en la sesión.
 */
export const SupervisionBatchCard = ({ row, session, onClosed }: SupervisionBatchCardProps) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SupervisionChecklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<number, SupervisionDraftResult>>({});
  const [comments, setComments] = useState('');
  const [sgcRequired, setSgcRequired] = useState(false);
  const [sgcReference, setSgcReference] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [closed, setClosed] = useState<SupervisionChecklist | null>(null);

  const summary = useMemo(() => summarize(values), [values]);
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail) return;
    setLoading(true);
    try {
      const loaded = await getSupervisionChecklist(row.id);
      setDetail(loaded);
      const next: Record<number, SupervisionDraftResult> = {};
      for (const section of loaded.sections) for (const item of section.items) next[item.item_id] = { result: item.result, observations: item.observations ?? '' };
      setValues(next);
      setComments(loaded.supervisor_comments ?? '');
      setSgcRequired(loaded.sgc_follow_up_required);
      setSgcReference(loaded.sgc_reference ?? '');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la lista.'));
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const allYes = () =>
    setValues((current) => {
      const next = { ...current };
      for (const [id, value] of Object.entries(current)) if (value.result === null) next[Number(id)] = { ...value, result: 'SI' };
      return next;
    });
  const change = (itemId: number, patch: Partial<SupervisionDraftResult>) =>
    setValues((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { result: null, observations: '' }), ...patch } }));
  const bulk = (itemIds: number[], result: SupervisionResult) =>
    setValues((current) => {
      const next = { ...current };
      for (const id of itemIds) next[id] = { ...(current[id] ?? { result: null, observations: '' }), result };
      return next;
    });

  const confirm = async () => {
    if (!session.supervisorSignature || !session.areaSignature) {
      notifyWarning('Traza primero las dos firmas de la sesión (supervisor y responsable del área).');
      return;
    }
    if (!session.supervisorName.trim() || !session.responsibleName.trim()) {
      notifyWarning('Captura los nombres del supervisor y del responsable del área en la sesión.');
      return;
    }
    if (summary.pending > 0) {
      notifyWarning(`Faltan ${summary.pending} aspecto(s) por calificar en esta lista.`);
      return;
    }
    if (summary.evaluated === 0) {
      notifyWarning('Todos los aspectos quedaron en N/A; evalúa al menos uno.');
      return;
    }
    if (sgcRequired && !sgcReference.trim()) {
      notifyWarning('Indica la referencia de la situación que requiere gestión del SGC.');
      return;
    }
    setConfirming(true);
    try {
      await updateSupervisionChecklist(row.id, {
        supervisor_name: session.supervisorName.trim(),
        area_responsible_name: session.responsibleName.trim(),
        sgc_follow_up_required: sgcRequired,
        sgc_reference: sgcReference.trim() || null,
        supervisor_comments: comments.trim() || null,
      });
      await saveSupervisionResults(
        row.id,
        Object.entries(values).map(([itemId, value]) => ({ item_id: Number(itemId), result: value.result, observations: value.observations || null })),
      );
      const result = await closeSupervisionChecklist(row.id, {
        supervisor_signature: session.supervisorSignature,
        area_responsible_signature: session.areaSignature,
        is_final: row.enrollment_id !== null,
      });
      setClosed(result.checklist);
      setOpen(false);
      onClosed(result);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la lista.'));
    } finally {
      setConfirming(false);
    }
  };

  if (closed) {
    const done = closed.conclusion ? CONCLUSION_UI[closed.conclusion] : null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
            {row.employee_name} · <span className="text-[var(--color-brand-700)]">{row.position_code}</span> {row.position_name}
          </p>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">{closed.folio}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
            <Lock size={12} /> Cerrada · {formatPct(closed.compliance_pct)}
          </span>
          {done ? <span className={`rounded-full border px-2 py-0.5 font-bold ${done.className}`}>{done.label}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white">
      <button type="button" onClick={() => void toggle()} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
        <div>
          <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
            {row.employee_name} · <span className="text-[var(--color-brand-700)]">{row.position_code}</span> {row.position_name}
          </p>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">
            {row.folio} · {row.items_pending > 0 ? `${row.items_pending} aspecto(s) sin calificar` : 'calificada, pendiente de firma'}
            {row.enrollment_id ? ' · Fase 6' : ' · supervisión de área'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
          {open ? 'Ocultar' : 'Revisar'} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[rgba(0,65,106,0.08)] px-4 py-4">
          {loading || !detail ? (
            <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={14} className="animate-spin" /> Cargando aspectos…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-end gap-4 text-sm">
                  <div>
                    <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">SÍ / NO / N/A</p>
                    <p className="text-lg font-bold text-[var(--color-brand-700)]">
                      {summary.si} / {summary.no} / {summary.na}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Cumplimiento</p>
                    <p className="text-lg font-bold text-[var(--color-brand-700)]">{formatPct(summary.pct)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Conclusión</p>
                    {conclusion ? (
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${conclusion.className}`}>{conclusion.label}</span>
                    ) : (
                      <span className="text-xs text-[var(--unilabor-neutral)]">{summary.pending} sin calificar</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={allYes}
                  disabled={summary.pending === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  title="Marca SÍ en todos los aspectos aún sin calificar (los N/A se conservan)"
                >
                  <CheckCheck size={14} /> Todo SÍ en lo aplicable
                </button>
              </div>
              <SupervisionSectionsEditor sections={detail.sections} values={values} readOnly={false} onChange={change} onBulk={bulk} />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="flex items-start gap-2 text-xs text-[var(--unilabor-ink)]">
                    <input type="checkbox" checked={sgcRequired} onChange={(e) => setSgcRequired(e.target.checked)} className="mt-0.5" />
                    Requiere gestión del SGC (trabajo no conforme, no conformidad, acción correctiva o seguimiento)
                  </label>
                  {sgcRequired ? (
                    <input value={sgcReference} onChange={(e) => setSgcReference(e.target.value)} className={`${inputClass} mt-2`} placeholder="Referencia o descripción" />
                  ) : null}
                </div>
                <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} className={inputClass} placeholder="Comentarios del supervisor" />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={confirming}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {confirming ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />} Confirmar y firmar esta lista
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};
