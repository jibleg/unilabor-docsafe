import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCheck, FileText, Loader2, Lock, Save, ShieldCheck } from 'lucide-react';
import {
  endorseMySupervision,
  getMySupervisionPdfUrl,
  saveMySupervisionResults,
  signMySupervision,
  type MySupervisionRole,
} from '../../../api/service.api-my-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionChecklist, SupervisionResult } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { SupervisionSectionsEditor, type SupervisionDraftResult } from './SupervisionSectionsEditor';
import { buttonClass, CONCLUSION_UI, formatDateOnly, formatPct, inputClass, primaryButtonClass } from './supervision-ui';

interface MySupervisionDetailProps {
  checklist: SupervisionChecklist;
  roles: MySupervisionRole[];
  onBack: () => void;
  /** La lista cambio de estado (firmada o cerrada): recargar el panorama. */
  onDone: () => void;
}

const toValues = (checklist: SupervisionChecklist): Record<number, SupervisionDraftResult> => {
  const values: Record<number, SupervisionDraftResult> = {};
  for (const section of checklist.sections) for (const item of section.items) values[item.item_id] = { result: item.result, observations: item.observations ?? '' };
  return values;
};

const summarize = (values: Record<number, SupervisionDraftResult>) => {
  const all = Object.values(values);
  const si = all.filter((value) => value.result === 'SI').length;
  const no = all.filter((value) => value.result === 'NO').length;
  const na = all.filter((value) => value.result === 'NA').length;
  const pending = all.length - si - no - na;
  const pct = si + no > 0 ? Math.round((si / (si + no)) * 10000) / 100 : null;
  const conclusion = pct === null ? null : pct >= 85 ? 'CONFORME' : pct >= 80 ? 'CONFORME_CON_OBSERVACIONES' : 'REQUIERE_SEGUIMIENTO';
  return { si, no, na, pending, pct, conclusion } as const;
};

/**
 * Una lista ANA-REG-060 en "Mis supervisiones". Como supervisor (borrador):
 * califica, guarda y firma con su cuenta. Como responsable del área (ya
 * firmada por el supervisor): revisa y avala; el aval cierra la lista.
 */
export const MySupervisionDetail = ({ checklist, roles, onBack, onDone }: MySupervisionDetailProps) => {
  const [values, setValues] = useState(() => toValues(checklist));
  const [comments, setComments] = useState(checklist.supervisor_comments ?? '');
  const [sgcRequired, setSgcRequired] = useState(checklist.sgc_follow_up_required);
  const [sgcReference, setSgcReference] = useState(checklist.sgc_reference ?? '');
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'sign' | 'endorse' | 'pdf' | null>(null);
  const [dirty, setDirty] = useState(false);

  const canSupervise = roles.includes('supervisor') && checklist.status === 'DRAFT';
  const canEndorse = roles.includes('responsible') && checklist.status === 'SUPERVISOR_SIGNED';
  const summary = useMemo(() => summarize(values), [values]);
  const conclusion = summary.conclusion ? CONCLUSION_UI[summary.conclusion] : null;

  const change = (itemId: number, patch: Partial<SupervisionDraftResult>) => {
    setValues((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { result: null, observations: '' }), ...patch } }));
    setDirty(true);
  };
  const bulk = (itemIds: number[], result: SupervisionResult) => {
    setValues((current) => {
      const next = { ...current };
      for (const id of itemIds) next[id] = { ...(current[id] ?? { result: null, observations: '' }), result };
      return next;
    });
    setDirty(true);
  };
  const allYes = () => {
    setValues((current) => {
      const next = { ...current };
      for (const [id, value] of Object.entries(current)) if (value.result === null) next[Number(id)] = { ...value, result: 'SI' };
      return next;
    });
    setDirty(true);
  };

  const saveResults = async (silent = false): Promise<boolean> => {
    setBusy('save');
    try {
      await saveMySupervisionResults(
        checklist.id,
        Object.entries(values).map(([itemId, value]) => ({ item_id: Number(itemId), result: value.result, observations: value.observations || null })),
      );
      setDirty(false);
      if (!silent) notifySuccess('Calificaciones guardadas.');
      return true;
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar las calificaciones.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const sign = async () => {
    if (summary.pending > 0) return notifyWarning(`Faltan ${summary.pending} aspecto(s) por calificar.`);
    if (sgcRequired && !sgcReference.trim()) return notifyWarning('Indica la referencia de la situación que requiere gestión del SGC.');
    if (!signature) return notifyWarning('Traza tu firma.');
    const ok = await confirmAction(
      'Firmar como supervisor',
      `Firmarás la lista ${checklist.folio} de ${checklist.employee_name} (${checklist.position_code}) con ${formatPct(summary.pct)}. Después ya no podrás cambiar las calificaciones; quedará en espera del aval de ${checklist.area_responsible_name || 'el responsable del área'}.`,
      'Firmar',
      'primary',
    );
    if (!ok) return;
    if (!(await saveResults(true))) return;
    setBusy('sign');
    try {
      const result = await signMySupervision(checklist.id, {
        signature,
        sgc_follow_up_required: sgcRequired,
        sgc_reference: sgcReference.trim() || null,
        supervisor_comments: comments.trim() || null,
      });
      notifySuccess(result.message);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo firmar la lista.'));
    } finally {
      setBusy(null);
    }
  };

  const endorse = async () => {
    if (!signature) return notifyWarning('Traza tu firma.');
    const ok = await confirmAction(
      'Avalar y cerrar',
      `Avalarás la lista ${checklist.folio} de ${checklist.employee_name} (${checklist.position_code}) firmada por ${checklist.supervisor_name}. Se cierra, se archiva el PDF en su expediente y, si es la Fase 6, se registra su calificación.`,
      'Avalar y cerrar',
      'primary',
    );
    if (!ok) return;
    setBusy('endorse');
    try {
      const result = await endorseMySupervision(checklist.id, signature);
      if (result.practical && !result.practical.captured) notifyWarning(result.message);
      else notifySuccess(result.message);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo avalar la lista.'));
    } finally {
      setBusy(null);
    }
  };

  const openPdf = async () => {
    setBusy('pdf');
    try {
      window.open(await getMySupervisionPdfUrl(checklist.id), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)] hover:underline">
            <ArrowLeft size={13} /> Mis supervisiones
          </button>
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">
            {checklist.employee_name} · {checklist.position_code} {checklist.position_name}
          </h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            {checklist.folio} · {formatDateOnly(checklist.supervision_date)} · {checklist.process_area_name ?? 'Puesto sin área'} · Supervisor: {checklist.supervisor_name || '—'} ·
            Responsable: {checklist.area_responsible_name || '—'}
          </p>
        </div>
        <button type="button" onClick={() => void openPdf()} disabled={busy !== null} className={buttonClass} title="Ver PDF">
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-5 text-sm">
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
        {canSupervise ? (
          <div className="flex gap-2">
            <button type="button" onClick={allYes} disabled={summary.pending === 0} className={`${buttonClass} text-emerald-700`} title="Marca SÍ en los aspectos aún sin calificar">
              <CheckCheck size={14} /> Todo SÍ
            </button>
            <button type="button" onClick={() => void saveResults()} disabled={!dirty || busy !== null} className={buttonClass}>
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
            </button>
          </div>
        ) : null}
      </div>

      <SupervisionSectionsEditor sections={checklist.sections} values={values} readOnly={!canSupervise} onChange={change} onBulk={bulk} />

      <section className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="flex items-start gap-2 text-xs text-[var(--unilabor-ink)]">
            <input type="checkbox" checked={sgcRequired} disabled={!canSupervise} onChange={(e) => setSgcRequired(e.target.checked)} className="mt-0.5" />
            Requiere gestión del SGC (trabajo no conforme, no conformidad, acción correctiva o seguimiento)
          </label>
          {sgcRequired ? (
            <input value={sgcReference} disabled={!canSupervise} onChange={(e) => setSgcReference(e.target.value)} className={`${inputClass} mt-2`} placeholder="Referencia o descripción" />
          ) : null}
        </div>
        <textarea value={comments} disabled={!canSupervise} onChange={(e) => setComments(e.target.value)} rows={2} className={inputClass} placeholder="Comentarios del supervisor" />
      </section>

      {canSupervise || canEndorse ? (
        <section className="grid gap-4 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-4 md:grid-cols-2">
          <SignaturePad
            label={canSupervise ? `Tu firma · Supervisor / Auditor` : `Tu firma · Responsable del Área`}
            hint="Firma con el dedo, lápiz o mouse"
            onChange={setSignature}
          />
          <div className="flex flex-col justify-end gap-2 text-xs text-[var(--unilabor-neutral)]">
            {canSupervise ? (
              <p>Al firmar, las calificaciones quedan bloqueadas y la lista pasa a {checklist.area_responsible_name || 'el responsable del área'} para su aval.</p>
            ) : (
              <p>El supervisor {checklist.supervisor_name} ya calificó y firmó. Tu aval cierra la lista y la archiva en el expediente.</p>
            )}
            <button
              type="button"
              onClick={() => void (canSupervise ? sign() : endorse())}
              disabled={busy !== null}
              className={`${primaryButtonClass} justify-center`}
            >
              {busy === 'sign' || busy === 'endorse' ? <Loader2 size={14} className="animate-spin" /> : canSupervise ? <Lock size={14} /> : <ShieldCheck size={14} />}
              {canSupervise ? 'Firmar como supervisor' : 'Avalar y cerrar'}
            </button>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800">
          {checklist.status === 'SUPERVISOR_SIGNED'
            ? `Firmaste esta lista; espera el aval de ${checklist.area_responsible_name || 'el responsable del área'}.`
            : 'Solo consulta.'}
        </p>
      )}
    </div>
  );
};
