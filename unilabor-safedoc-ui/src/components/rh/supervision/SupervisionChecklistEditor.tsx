import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, ExternalLink, FileText, Loader2, Lock, RefreshCw, RotateCcw, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cancelSupervisionSignature,
  deleteSupervisionDraft,
  getSupervisionChecklist,
  getSupervisionChecklistPdfUrl,
  retrySupervisionClose,
  saveSupervisionResults,
  updateSupervisionChecklist,
  type CloseSupervisionChecklistResult,
} from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklist, SupervisionResult, SupervisionType } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifyInfo, notifySuccess } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { SupervisionCloseModal } from './SupervisionCloseModal';
import { SupervisionSectionsEditor, type SupervisionDraftResult } from './SupervisionSectionsEditor';
import { SupervisionSignatureProgress } from './SupervisionSignatureProgress';
import {
  CONCLUSION_UI,
  SIGNERS_TOTAL,
  buttonClass,
  formatDateOnly,
  formatDateTime,
  formatPct,
  inputClass,
  labelClass,
  primaryButtonClass,
  quickFillPending,
  todayIsoDate,
} from './supervision-ui';
import { useEmployeeOptions } from './useEmployeeOptions';

interface SupervisionChecklistEditorProps {
  checklist: SupervisionChecklist;
  onChanged: (updated: SupervisionChecklist) => void;
  /** La lista se cerró al reintentar el cierre automático (ya tenía sus tres firmas). */
  onClosed: (result: CloseSupervisionChecklistResult) => void;
  onDeleted: () => void;
}

interface SignerSelectProps {
  value: string;
  /** El evaluado nunca es su propio supervisor ni responsable. */
  excludeEmployeeId: number;
  placeholder: string;
  onChange: (value: string) => void;
}

/** Firmante elegido entre los colaboradores activos (solo supervisión de área; en la Fase 6 sale de la asignación). */
const SignerSelect = ({ value, excludeEmployeeId, placeholder, onChange }: SignerSelectProps) => {
  const options = useEmployeeOptions().filter((option) => option.value !== String(excludeEmployeeId));
  return <SearchableSelect value={value} options={options} onChange={onChange} placeholder={placeholder} emptyLabel="Sin asignar" searchPlaceholder="Buscar colaborador..." />;
};

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
 * SGC, comentarios, PDF, borrado del borrador y envío a firma. En firma o
 * cerrada = solo lectura; en firma RH ve el avance y puede cancelar el envío.
 */
export const SupervisionChecklistEditor = ({ checklist, onChanged, onClosed, onDeleted }: SupervisionChecklistEditorProps) => {
  // En firma o cerrada: ya no se edita.
  const readOnly = checklist.status !== 'DRAFT';
  const inSignature = checklist.status === 'PENDING_SIGNATURES';
  // En la Fase 6 los firmantes salen de la asignacion (supervisor de la inscripcion y responsable del area).
  const assignedSigners = checklist.enrollment_id !== null;
  const [date, setDate] = useState(checklist.supervision_date);
  const [type, setType] = useState<SupervisionType>(checklist.supervision_type);
  const [supervisorId, setSupervisorId] = useState(checklist.supervisor_employee_id ? String(checklist.supervisor_employee_id) : '');
  const [responsibleId, setResponsibleId] = useState(checklist.area_responsible_employee_id ? String(checklist.area_responsible_employee_id) : '');
  const [area, setArea] = useState(checklist.area_name ?? '');
  const [sgcRequired, setSgcRequired] = useState(checklist.sgc_follow_up_required);
  const [sgcReference, setSgcReference] = useState(checklist.sgc_reference ?? '');
  const [comments, setComments] = useState(checklist.supervisor_comments ?? '');
  const [values, setValues] = useState<Record<number, SupervisionDraftResult>>(() => toValues(checklist));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'delete' | 'cancel' | 'retry' | 'refresh' | null>(null);
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    setDate(checklist.supervision_date);
    setType(checklist.supervision_type);
    setSupervisorId(checklist.supervisor_employee_id ? String(checklist.supervisor_employee_id) : '');
    setResponsibleId(checklist.area_responsible_employee_id ? String(checklist.area_responsible_employee_id) : '');
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

  /** Captura rapida: todo lo pendiente queda en SI (N/A si no aplica al puesto); lo ya calificado no se toca. */
  const handleQuickFill = () => {
    const fill = quickFillPending(checklist.sections, values);
    const ids = Object.keys(fill).map(Number);
    if (ids.length === 0) return;
    setValues((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = { ...(current[id] ?? { result: null, observations: '' }), result: fill[id]! };
      return next;
    });
    markDirty();
    notifyInfo(`${ids.length} aspecto(s) pendiente(s) marcados como cumple. Ajusta los que no cumplan antes de enviar a firma.`);
  };

  /** Guarda cabecera + resultados; devuelve la lista actualizada (o null si falló). */
  const save = async (silent = false): Promise<SupervisionChecklist | null> => {
    setSaving(true);
    try {
      await updateSupervisionChecklist(checklist.id, {
        supervision_date: date,
        supervision_type: type,
        area_name: area.trim() || null,
        ...(assignedSigners
          ? {}
          : { supervisor_employee_id: supervisorId ? Number(supervisorId) : null, area_responsible_employee_id: responsibleId ? Number(responsibleId) : null }),
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

  const handleCancelSignature = async () => {
    const ok = await confirmAction(
      'Cancelar envío a firma',
      `La lista ${checklist.folio} regresará a borrador para corregirla.` +
        (checklist.signatures_done > 0
          ? ` Las ${checklist.signatures_done} firma(s) ya recabada(s) quedarán invalidadas (se conserva su rastro) y los tres deberán firmar de nuevo cuando la reenvíes.`
          : ' Aún no tiene firmas recabadas.'),
      'Cancelar envío',
      'danger',
    );
    if (!ok) return;
    setBusy('cancel');
    try {
      const result = await cancelSupervisionSignature(checklist.id);
      notifyInfo(result.message);
      onChanged(result.checklist);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cancelar el envío a firma.'));
    } finally {
      setBusy(null);
    }
  };

  /** Vuelve a leer la lista para ver las firmas que hayan llegado (o si ya se cerró sola). */
  const refreshSignatures = async () => {
    setBusy('refresh');
    try {
      onChanged(await getSupervisionChecklist(checklist.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la lista.'));
    } finally {
      setBusy(null);
    }
  };

  const handleRetryClose = async () => {
    setBusy('retry');
    try {
      onClosed(await retrySupervisionClose(checklist.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la lista.'));
    } finally {
      setBusy(null);
    }
  };

  const openClose = async () => {
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
  const signer = (setter: (value: string) => void) => (value: string) => {
    setter(value);
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
          {checklist.status === 'CLOSED' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <Lock size={12} /> Cerrada {formatDateOnly(checklist.closed_at)}
            </span>
          ) : inSignature ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
              <Send size={12} /> En firma ({checklist.signatures_done}/{SIGNERS_TOTAL})
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
              <button
                type="button"
                onClick={openClose}
                disabled={saving}
                className={primaryButtonClass}
                title="Envía la lista a firma: cada persona firma desde su Buzón y la lista se cierra sola con las tres firmas"
              >
                <Lock size={14} /> Cerrar y firmar
              </button>
            </>
          ) : inSignature ? (
            <>
              {checklist.signatures_done >= SIGNERS_TOTAL ? (
                <button
                  type="button"
                  onClick={() => void handleRetryClose()}
                  disabled={busy !== null}
                  className={primaryButtonClass}
                  title="Ya están las tres firmas pero el cierre automático falló: vuelve a intentarlo"
                >
                  {busy === 'retry' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reintentar cierre
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleCancelSignature()}
                disabled={busy !== null}
                className={`${buttonClass} text-rose-700`}
                title="Regresa la lista a borrador para corregirla; las firmas recabadas se invalidan"
              >
                {busy === 'cancel' ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Cancelar envío
              </button>
            </>
          ) : null}
        </div>
      </header>

      {inSignature ? (
        <section className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-5 text-sky-900">
              <strong>En firma.</strong> Enviada{checklist.signature_requested_by_name ? ` por ${checklist.signature_requested_by_name}` : ''} el{' '}
              {formatDateTime(checklist.signature_requested_at)}
              {checklist.enrollment_id ? (checklist.is_final ? ' como lista final de la Fase 6 del puesto' : ' como supervisión intermedia') : ''}. Cada
              persona firma desde su Buzón de firmas; con la tercera firma la lista se cierra sola.
            </p>
            <button
              type="button"
              onClick={() => void refreshSignatures()}
              disabled={busy !== null}
              className="rounded-lg p-1.5 text-sky-800 hover:bg-white/70 disabled:opacity-50"
              title="Actualizar avance de firmas"
              aria-label="Actualizar avance de firmas"
            >
              {busy === 'refresh' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
          </div>
          <SupervisionSignatureProgress signers={checklist.signers} inSignature />
        </section>
      ) : null}

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
          {assignedSigners || readOnly ? (
            <input
              value={checklist.supervisor_name}
              disabled
              className={inputClass}
              placeholder={assignedSigners ? 'Asígnalo en Pendientes Fase 6 o al enviar a firma' : 'Sin asignar'}
              title={assignedSigners ? 'Se asigna por colaborador y puesto en Pendientes Fase 6' : undefined}
            />
          ) : (
            <SignerSelect value={supervisorId} excludeEmployeeId={checklist.employee_id} placeholder="Quien supervisa" onChange={signer(setSupervisorId)} />
          )}
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Responsable del Área</label>
          {assignedSigners || readOnly ? (
            <input
              value={checklist.area_responsible_name}
              disabled
              className={inputClass}
              placeholder={assignedSigners ? 'Configúralo en Firmantes por área o al enviar a firma' : 'Sin asignar'}
              title={assignedSigners ? 'Se configura por área del puesto en Firmantes por área' : undefined}
            />
          ) : (
            <SignerSelect value={responsibleId} excludeEmployeeId={checklist.employee_id} placeholder="Coordinador / responsable del área" onChange={signer(setResponsibleId)} />
          )}
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
          {!readOnly && summary.pending > 0 ? (
            <button
              type="button"
              onClick={handleQuickFill}
              className={`${buttonClass} ml-auto`}
              title="Marca como SÍ todo lo que falta por calificar (N/A en lo que no aplica al puesto). No cambia lo que ya calificaste."
            >
              <CheckCheck size={16} /> Todo cumple
            </button>
          ) : null}
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

      {showClose ? (
        <SupervisionCloseModal
          checklist={checklist}
          onClose={() => setShowClose(false)}
          onChanged={onChanged}
          onSent={(result) => {
            notifySuccess(result.message);
            onChanged(result.checklist);
          }}
        />
      ) : null}
    </div>
  );
};
