import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, Lock, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  deleteSupervisionDraft,
  getSupervisionChecklistPdfUrl,
  saveSupervisionResults,
  updateSupervisionChecklist,
  type CloseSupervisionChecklistResult,
} from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklist, SupervisionResult, SupervisionType } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifyInfo, notifySuccess } from '../../../utils/notify';
import { SupervisionCloseModal } from './SupervisionCloseModal';
import { SupervisionSectionsEditor, type SupervisionDraftResult } from './SupervisionSectionsEditor';
import { CONCLUSION_UI, buttonClass, formatDateOnly, formatPct, inputClass, labelClass, primaryButtonClass, todayIsoDate } from './supervision-ui';

interface SupervisionChecklistEditorProps {
  checklist: SupervisionChecklist;
  onChanged: (updated: SupervisionChecklist) => void;
  onClosed: (result: CloseSupervisionChecklistResult) => void;
  onDeleted: () => void;
}

const toValues = (checklist: SupervisionChecklist): Record<number, SupervisionDraftResult> => {
  const values: Record<number, SupervisionDraftResult> = {};
  for (const section of checklist.sections) {
    for (const item of section.items) {
      values[item.item_id] = { result: item.result, observations: item.observations ?? '' };
    }
  }
  return values;
};

/** Resumen en vivo con los valores aún no guardados (misma regla que el backend). */
const liveSummary = (values: Record<number, SupervisionDraftResult>) => {
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
 * Editor de una lista ANA-REG-060: cabecera (fecha, tipo, supervisor,
 * responsable, área), 31 aspectos por sección, resultado en vivo, pregunta del
 * SGC, comentarios, PDF, borrado del borrador y cierre con firmas. Cerrada =
 * solo lectura.
 */
export const SupervisionChecklistEditor = ({ checklist, onChanged, onClosed, onDeleted }: SupervisionChecklistEditorProps) => {
  const readOnly = checklist.status === 'CLOSED';
  const [date, setDate] = useState(checklist.supervision_date);
  const [type, setType] = useState<SupervisionType>(checklist.supervision_type);
  const [supervisor, setSupervisor] = useState(checklist.supervisor_name);
  const [responsible, setResponsible] = useState(checklist.area_responsible_name);
  const [area, setArea] = useState(checklist.area_name ?? '');
  const [sgcRequired, setSgcRequired] = useState(checklist.sgc_follow_up_required);
  const [sgcReference, setSgcReference] = useState(checklist.sgc_reference ?? '');
  const [comments, setComments] = useState(checklist.supervisor_comments ?? '');
  const [values, setValues] = useState<Record<number, SupervisionDraftResult>>(() => toValues(checklist));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'delete' | null>(null);
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    setDate(checklist.supervision_date);
    setType(checklist.supervision_type);
    setSupervisor(checklist.supervisor_name);
    setResponsible(checklist.area_responsible_name);
    setArea(checklist.area_name ?? '');
    setSgcRequired(checklist.sgc_follow_up_required);
    setSgcReference(checklist.sgc_reference ?? '');
    setComments(checklist.supervisor_comments ?? '');
    setValues(toValues(checklist));
    setDirty(false);
  }, [checklist]);

  const summary = useMemo(() => liveSummary(values), [values]);
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;

  const markDirty = () => setDirty(true);
  const handleItemChange = (itemId: number, next: Partial<SupervisionDraftResult>) => {
    setValues((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { result: null, observations: '' }), ...next } }));
    markDirty();
  };
  const handleBulk = (itemIds: number[], result: SupervisionResult) => {
    setValues((current) => {
      const next = { ...current };
      for (const id of itemIds) next[id] = { ...(current[id] ?? { result: null, observations: '' }), result };
      return next;
    });
    markDirty();
  };

  /** Guarda cabecera + resultados; devuelve la lista actualizada (o null si falló). */
  const save = async (silent = false): Promise<SupervisionChecklist | null> => {
    setSaving(true);
    try {
      await updateSupervisionChecklist(checklist.id, {
        supervision_date: date,
        supervision_type: type,
        area_name: area.trim() || null,
        ...(supervisor.trim() ? { supervisor_name: supervisor.trim() } : {}),
        area_responsible_name: responsible.trim(),
        sgc_follow_up_required: sgcRequired,
        sgc_reference: sgcReference.trim() || null,
        supervisor_comments: comments.trim() || null,
      });
      const updated = await saveSupervisionResults(
        checklist.id,
        Object.entries(values).map(([itemId, value]) => ({ item_id: Number(itemId), result: value.result, observations: value.observations || null })),
      );
      setDirty(false);
      onChanged(updated);
      if (!silent) notifySuccess('Lista guardada.');
      return updated;
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la lista.'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async () => {
    setBusy('pdf');
    try {
      if (!readOnly && dirty) {
        const saved = await save(true);
        if (!saved) return;
      }
      const url = await getSupervisionChecklistPdfUrl(checklist.id);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAction(
      'Eliminar borrador',
      `Se eliminará el borrador ${checklist.folio} de ${checklist.employee_name}. Un borrador sin firmas no es evidencia; las listas cerradas nunca se borran.`,
      'Eliminar borrador',
      'danger',
    );
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteSupervisionDraft(checklist.id);
      notifyInfo('Borrador eliminado.');
      onDeleted();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el borrador.'));
    } finally {
      setBusy(null);
    }
  };

  const openClose = async () => {
    if (!supervisor.trim() || !responsible.trim()) {
      notifyError('Captura el nombre del supervisor / auditor y del responsable del área antes de cerrar.');
      return;
    }
    if (summary.pending > 0) {
      notifyError(`Faltan ${summary.pending} aspecto(s) por calificar.`);
      return;
    }
    if (summary.evaluated === 0) {
      notifyError('Todos los aspectos quedaron en N/A; la lista debe evaluar al menos uno.');
      return;
    }
    if (sgcRequired && !sgcReference.trim()) {
      notifyError('Indica la referencia o descripción de la situación que requiere gestión del SGC.');
      return;
    }
    const saved = await save(true);
    if (saved) setShowClose(true);
  };

  const field = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setter(event.target.value);
    markDirty();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            {checklist.form_code} · Rev. {checklist.form_revision} · {checklist.folio}
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--color-brand-700)]">{checklist.employee_name}</h2>
          <p className="text-sm text-[var(--unilabor-ink)]">
            {checklist.employee_code} · {checklist.position_code} – {checklist.position_name}
            {checklist.branch_name ? ` · ${checklist.branch_name}` : ''}
          </p>
          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
            {checklist.enrollment_id ? (
              <>
                Fase 6 de Inducción · inscripción #{checklist.enrollment_id}
                {checklist.is_final ? ' · lista FINAL de la fase' : ''} ·{' '}
                <Link
                  to={`/rh/induction/dashboard?employee=${checklist.employee_id}&phase=6`}
                  className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand-500)] hover:underline"
                >
                  ver en el tablero <ExternalLink size={11} />
                </Link>
              </>
            ) : (
              'Supervisión de área (sin inscripción de Inducción)'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <Lock size={12} /> Cerrada {formatDateOnly(checklist.closed_at)}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Borrador</span>
          )}
          <button type="button" onClick={openPdf} disabled={busy !== null} className={buttonClass} title="Ver PDF con el diseño del ANA-REG-060">
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
          </button>
          {!readOnly ? (
            <>
              <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={buttonClass} title="Guardar cambios">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button type="button" onClick={handleDelete} disabled={busy !== null} className={`${buttonClass} text-rose-700`} title="Eliminar borrador">
                <Trash2 size={14} />
              </button>
              <button type="button" onClick={openClose} disabled={saving} className={primaryButtonClass}>
                <Lock size={14} /> Cerrar y firmar
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4 md:grid-cols-6">
        <div>
          <label className={labelClass}>Fecha</label>
          <input type="date" value={date} max={todayIsoDate()} disabled={readOnly} onChange={field(setDate)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)]">
            {(['PROGRAMADA', 'NO_PROGRAMADA'] as SupervisionType[]).map((option) => (
              <button
                key={option}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setType(option);
                  markDirty();
                }}
                className={`px-3 py-2 text-xs font-bold ${type === option ? 'bg-[var(--color-brand-700)] text-white' : 'bg-white text-[var(--unilabor-neutral)]'}`}
              >
                {option === 'PROGRAMADA' ? 'Programada' : 'No programada'}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Supervisor / Auditor</label>
          <input value={supervisor} disabled={readOnly} onChange={field(setSupervisor)} className={inputClass} placeholder="Nombre de quien supervisa" />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Responsable del Área</label>
          <input value={responsible} disabled={readOnly} onChange={field(setResponsible)} className={inputClass} placeholder="Coordinador / responsable del área" />
        </div>
        <div className="md:col-span-3">
          <label className={labelClass}>Área evaluada</label>
          <input value={area} disabled={readOnly} onChange={field(setArea)} className={inputClass} placeholder="Área donde se supervisó" />
        </div>
        <div className="flex flex-wrap items-end gap-4 text-sm md:col-span-3">
          <div>
            <p className="text-[11px] uppercase text-[var(--unilabor-neutral)]">Evaluados</p>
            <p className="text-lg font-bold text-[var(--color-brand-700)]">{summary.evaluated}</p>
          </div>
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
              <span className="text-xs text-[var(--unilabor-neutral)]">{summary.pending > 0 ? `${summary.pending} sin calificar` : '—'}</span>
            )}
          </div>
        </div>
      </section>

      <SupervisionSectionsEditor sections={checklist.sections} values={values} readOnly={readOnly} onChange={handleItemChange} onBulk={handleBulk} />

      <section className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4">
        <label className="flex items-start gap-3 text-sm text-[var(--unilabor-ink)]">
          <input
            type="checkbox"
            checked={sgcRequired}
            disabled={readOnly}
            onChange={(e) => {
              setSgcRequired(e.target.checked);
              markDirty();
            }}
            className="mt-1"
          />
          <span>
            ¿Se identificó alguna situación que requiera la gestión de Trabajo No Conforme, No Conformidad, Acción Correctiva o seguimiento adicional
            conforme al Sistema de Gestión de la Calidad?
          </span>
        </label>
        {sgcRequired ? (
          <div>
            <label className={labelClass}>Referencia o descripción</label>
            <textarea value={sgcReference} disabled={readOnly} onChange={field(setSgcReference)} rows={2} className={inputClass} placeholder="Folio del TNC / NC / AC o descripción breve" />
          </div>
        ) : null}
        <div>
          <label className={labelClass}>Comentarios del supervisor</label>
          <textarea value={comments} disabled={readOnly} onChange={field(setComments)} rows={3} className={inputClass} placeholder="Desempeño observado, fortalezas y aspectos a reforzar" />
        </div>
      </section>

      {showClose ? <SupervisionCloseModal checklist={checklist} onClose={() => setShowClose(false)} onClosed={onClosed} /> : null}
    </div>
  );
};
