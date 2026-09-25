import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Clock3, Loader2, RefreshCw, Shuffle, ListChecks, X, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../../api/service';
import { assignKnowledgeQuiz, cancelKnowledgeQuiz, getCompetencyEvaluation } from '../../api/service.api-rh-competency';
import { listApprovedPositionQuestions } from '../../api/service.api-rh-question-bank';
import { getPositionById } from '../../api/service.api-rh-position';
import type { QuestionBankItem, RhCompetencyEvaluation, RhPositionDocument } from '../../types/models';
import { confirmAction } from '../../utils/confirm';
import { QuestionBankPanel } from './QuestionBankPanel';

interface KnowledgeQuizPanelProps {
  evaluation: RhCompetencyEvaluation;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const buttonClass =
  'inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';

const TYPE_LABELS: Record<string, string> = {
  single: 'Opción única',
  multiple: 'Opción múltiple',
  boolean: 'Verdadero / Falso',
  open: 'Abierta',
};

const QUIZ_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Asignado, sin iniciar', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  in_progress: { label: 'En curso', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
  authorized_late: { label: 'Extemporáneo autorizado', className: 'bg-teal-50 text-teal-700 ring-teal-200' },
  submitted: { label: 'Enviado', className: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  grading: { label: 'En revisión', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  passed: { label: 'Contestado · acreditado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: 'Contestado · no acreditado', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  expired: { label: 'Vencido sin contestar', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/**
 * Sección 3 "Conocimiento" del REH-REG-003 alimentada por el banco de
 * preguntas IA del PUESTO: RH genera y aprueba preguntas desde los documentos
 * obligatorios del puesto y asigna al colaborador un cuestionario (N al azar o
 * selección fija) con la ventana y los minutos que decida. Al contestarlo, la
 * sección 3 se llena sola y el 30 % se calcula.
 */
export const KnowledgeQuizPanel = ({ evaluation, onChanged }: KnowledgeQuizPanelProps) => {
  const quiz = evaluation.knowledge_quiz ?? null;
  const readOnly = evaluation.status === 'CLOSED';
  const [documents, setDocuments] = useState<RhPositionDocument[]>([]);
  const [approved, setApproved] = useState<QuestionBankItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const loadBank = useCallback(async () => {
    setLoadingBank(true);
    try {
      const [position, approvedItems] = await Promise.all([
        getPositionById(evaluation.position_id),
        listApprovedPositionQuestions(evaluation.position_id),
      ]);
      setDocuments(position?.documents ?? []);
      setApproved(approvedItems);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cargar el banco de preguntas del puesto.'));
    } finally {
      setLoadingBank(false);
    }
  }, [evaluation.position_id]);

  useEffect(() => {
    if (!readOnly) {
      void loadBank();
    }
  }, [loadBank, readOnly]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await getCompetencyEvaluation(evaluation.id);
      if (fresh) {
        onChanged(fresh);
        toast.info(
          fresh.knowledge_quiz && ['passed', 'failed'].includes(fresh.knowledge_quiz.status)
            ? 'Respuestas del colaborador sincronizadas en la sección 3.'
            : 'Estado del cuestionario actualizado.',
        );
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo actualizar el estado del cuestionario.'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirmAction(
      'Cancelar cuestionario de Conocimiento',
      'Se retirará el cuestionario que el colaborador aún no ha iniciado y la sección 3 volverá a captura manual. Podrás asignar uno nuevo después.',
      'Cancelar cuestionario',
    );
    if (!ok) return;
    try {
      const updated = await cancelKnowledgeQuiz(evaluation.id);
      onChanged(updated);
      toast.success('Cuestionario cancelado.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cancelar el cuestionario.'));
    }
  };

  const status = quiz ? QUIZ_STATUS[quiz.status] ?? { label: quiz.status, className: 'bg-slate-100 text-slate-600 ring-slate-200' } : null;
  const canReassign = quiz ? ['failed', 'expired'].includes(quiz.status) : true;
  const canCancel = quiz ? ['pending', 'expired'].includes(quiz.status) : false;

  if (readOnly && !quiz) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
            <BookOpenCheck size={15} /> Cuestionario de Conocimiento (banco del puesto)
          </h3>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            {quiz
              ? 'El colaborador lo contesta en "Mis evaluaciones"; al enviarlo, la sección 3 se llena sola con sus respuestas.'
              : 'Genera y aprueba preguntas desde los documentos obligatorios del puesto y asigna al colaborador un cuestionario autocalificable.'}
          </p>
        </div>
        {quiz && status ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${status.className}`}>{status.label}</span>
        ) : null}
      </div>

      {quiz ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <p className="font-semibold text-[var(--unilabor-neutral)]">Preguntas</p>
            <p className="text-sm font-bold text-[var(--unilabor-ink)]">
              {quiz.question_count} · {quiz.selection_mode === 'fixed' ? 'selección fija' : 'al azar'}
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--unilabor-neutral)]">Vence</p>
            <p className="text-sm font-bold text-[var(--unilabor-ink)]">{formatDateTime(quiz.deadline_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--unilabor-neutral)]">Enviado</p>
            <p className="text-sm font-bold text-[var(--unilabor-ink)]">{formatDateTime(quiz.submitted_at)}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--unilabor-neutral)]">Aciertos</p>
            <p className="text-sm font-bold text-[var(--unilabor-ink)]">
              {quiz.percentage !== null ? `${quiz.percentage}%` : '—'}
            </p>
          </div>
        </div>
      ) : null}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {quiz ? (
            <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className={buttonClass}>
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Actualizar estado
            </button>
          ) : null}
          {canReassign ? (
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              disabled={loadingBank}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Shuffle size={14} /> {quiz ? 'Asignar nuevo cuestionario' : 'Asignar cuestionario'}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="inline-flex items-center gap-1 rounded-xl border border-[rgba(176,42,42,0.25)] px-3 py-2 text-sm font-semibold text-[#b02a2a] transition hover:bg-[rgba(190,40,40,0.08)]"
            >
              <XCircle size={14} /> Cancelar cuestionario
            </button>
          ) : null}
          <span className="text-xs text-[var(--unilabor-neutral)]">
            {loadingBank ? 'Cargando banco…' : `${approved.length} pregunta(s) aprobada(s) en el banco del puesto`}
          </span>
        </div>
      )}

      {!readOnly && (
        <div className="mt-4">
          <QuestionBankPanel
            scope={{ positionId: evaluation.position_id }}
            documents={documents.map((doc) => ({ document_id: doc.document_id, code: doc.code, title: doc.title }))}
            onApprovedChanged={() => void loadBank()}
            sourceLabel={`los documentos obligatorios del puesto ${evaluation.position_name}`}
          />
          {documents.length === 0 && !loadingBank ? (
            <p className="mt-2 text-xs text-amber-700">
              Este puesto no tiene documentos obligatorios configurados (Puestos → Documentos obligatorios); sin ellos no
              hay de dónde generar preguntas.
            </p>
          ) : null}
        </div>
      )}

      {showAssign ? (
        <AssignQuizModal
          evaluation={evaluation}
          approved={approved}
          onClose={() => setShowAssign(false)}
          onAssigned={(updated) => {
            onChanged(updated);
            setShowAssign(false);
          }}
        />
      ) : null}
    </section>
  );
};

interface AssignQuizModalProps {
  evaluation: RhCompetencyEvaluation;
  approved: QuestionBankItem[];
  onClose: () => void;
  onAssigned: (updated: RhCompetencyEvaluation) => void;
}

const AssignQuizModal = ({ evaluation, approved, onClose, onAssigned }: AssignQuizModalProps) => {
  const [mode, setMode] = useState<'random' | 'fixed'>('random');
  const [count, setCount] = useState<string>(String(Math.min(10, approved.length || 10)));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [windowHours, setWindowHours] = useState<string>('72');
  const [minutes, setMinutes] = useState<string>('30');
  const [saving, setSaving] = useState(false);

  const parsedCount = Number(count);
  const parsedWindow = Number(windowHours);
  const parsedMinutes = minutes.trim() === '' ? null : Number(minutes);
  const countValid = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= Math.min(50, approved.length);
  const windowValid = Number.isInteger(parsedWindow) && parsedWindow >= 1 && parsedWindow <= 720;
  const minutesValid = parsedMinutes === null || (Number.isInteger(parsedMinutes) && parsedMinutes >= 5 && parsedMinutes <= 240);
  const selectionValid = mode === 'random' ? countValid : selected.size >= 1 && selected.size <= 50;
  const canSubmit = approved.length > 0 && selectionValid && windowValid && minutesValid && !saving;

  const byType = useMemo(() => {
    const counter: Record<string, number> = {};
    approved.forEach((item) => {
      counter[item.type] = (counter[item.type] ?? 0) + 1;
    });
    return counter;
  }, [approved]);

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const updated = await assignKnowledgeQuiz(evaluation.id, {
        mode,
        count: mode === 'random' ? parsedCount : undefined,
        item_ids: mode === 'fixed' ? [...selected] : undefined,
        window_hours: parsedWindow,
        attempt_time_limit_minutes: parsedMinutes,
      });
      toast.success(
        `Cuestionario asignado a ${evaluation.employee_name} (${updated.knowledge_quiz?.question_count ?? 0} preguntas). Avísale en persona: no se envía SMS ni correo.`,
      );
      onAssigned(updated);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo asignar el cuestionario.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Sección 3 · Conocimiento</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Asignar cuestionario a {evaluation.employee_name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-[rgba(191,212,230,0.22)] px-4 py-3 text-xs text-[var(--unilabor-ink)]">
            Banco aprobado del puesto <span className="font-semibold">{evaluation.position_name}</span>: {approved.length}{' '}
            pregunta(s)
            {Object.keys(byType).length > 0
              ? ` (${Object.entries(byType)
                  .map(([type, total]) => `${total} ${TYPE_LABELS[type] ?? type}`)
                  .join(', ')})`
              : ''}
            . Solo se usan preguntas autocalificables; el colaborador la contesta en "Mis evaluaciones".
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('random')}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                mode === 'random' ? 'border-[var(--color-brand-500)] bg-[rgba(191,212,230,0.25)]' : 'border-[rgba(0,65,106,0.12)] hover:bg-[rgba(248,251,253,0.9)]'
              }`}
            >
              <Shuffle size={18} className="mt-0.5 shrink-0 text-[var(--color-brand-700)]" />
              <span>
                <span className="block text-sm font-bold text-[var(--color-brand-700)]">Aleatorio</span>
                <span className="block text-xs text-[var(--unilabor-neutral)]">El sistema sortea N preguntas del banco aprobado.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('fixed')}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                mode === 'fixed' ? 'border-[var(--color-brand-500)] bg-[rgba(191,212,230,0.25)]' : 'border-[rgba(0,65,106,0.12)] hover:bg-[rgba(248,251,253,0.9)]'
              }`}
            >
              <ListChecks size={18} className="mt-0.5 shrink-0 text-[var(--color-brand-700)]" />
              <span>
                <span className="block text-sm font-bold text-[var(--color-brand-700)]">Selección fija</span>
                <span className="block text-xs text-[var(--unilabor-neutral)]">Tú eliges exactamente cuáles preguntas.</span>
              </span>
            </button>
          </div>

          {mode === 'random' ? (
            <div className="w-40">
              <label htmlFor="kq-count" className={labelClass}>Cantidad de preguntas</label>
              <input
                id="kq-count"
                type="number"
                min={1}
                max={Math.min(50, approved.length)}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">Máximo {Math.min(50, approved.length)} (aprobadas).</p>
            </div>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={labelClass}>Preguntas a incluir ({selected.size})</label>
                <button
                  type="button"
                  onClick={() => setSelected(selected.size === approved.length ? new Set() : new Set(approved.map((item) => item.id)))}
                  className="text-xs font-semibold text-[var(--color-brand-700)] underline"
                >
                  {selected.size === approved.length ? 'Quitar todas' : 'Marcar todas'}
                </button>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.1)] p-2">
                {approved.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[rgba(191,212,230,0.18)]">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4 accent-[var(--color-brand-700)]" />
                    <span>
                      <span className="mr-2 rounded-full bg-[rgba(0,65,106,0.06)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--unilabor-neutral)]">
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      {item.text}
                    </span>
                  </label>
                ))}
                {approved.length === 0 ? <p className="p-2 text-xs text-[var(--unilabor-neutral)]">Sin preguntas aprobadas.</p> : null}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="kq-window" className={labelClass}>Ventana para contestar (horas)</label>
              <input id="kq-window" type="number" min={1} max={720} value={windowHours} onChange={(event) => setWindowHours(event.target.value)} className={inputClass} />
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">Desde ahora. Entre 1 y 720 h.</p>
            </div>
            <div>
              <label htmlFor="kq-minutes" className={labelClass}>Minutos por intento (vacío = sin límite)</label>
              <input id="kq-minutes" type="number" min={5} max={240} value={minutes} onChange={(event) => setMinutes(event.target.value)} className={inputClass} />
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">Una vez iniciado, el reloj corre. Entre 5 y 240 min.</p>
            </div>
          </div>

          <p className="flex items-center gap-1 text-xs text-[var(--unilabor-neutral)]">
            <Clock3 size={12} /> No se envía correo ni SMS: avisa al colaborador en persona.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[rgba(0,65,106,0.14)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.2)] disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <BookOpenCheck size={14} />}
            Asignar {mode === 'random' ? (countValid ? `${parsedCount} preguntas` : 'cuestionario') : `${selected.size} pregunta(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
