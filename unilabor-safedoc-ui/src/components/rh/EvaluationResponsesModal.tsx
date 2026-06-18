import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronDown, Circle, Loader2, MinusCircle, X, XCircle } from 'lucide-react';
import { getApiErrorMessage, getEvaluationResponses } from '../../api/service';
import type { EvaluationQuestionResponse, EvaluationResponsesDetail } from '../../types/models';
import { notifyError } from '../../utils/notify';
import { EVALUATION_STATUS_META } from '../../utils/evaluations';

interface EvaluationResponsesModalProps {
  assignmentId: number;
  onClose: () => void;
}

const QUESTION_TYPE_LABEL: Record<EvaluationQuestionResponse['type'], string> = {
  single: 'Opción única',
  multiple: 'Opción múltiple',
  boolean: 'Verdadero / Falso',
  open: 'Abierta',
};

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Estado visual de cada opción según fue correcta y/o marcada por el colaborador. */
const optionVisual = (isCorrect: boolean, selected: boolean) => {
  if (isCorrect && selected) {
    return { icon: CheckCircle2, className: 'border-emerald-300 bg-emerald-50 text-emerald-800', tag: 'Marcó · Correcta', tagClass: 'bg-emerald-600 text-white' };
  }
  if (!isCorrect && selected) {
    return { icon: XCircle, className: 'border-red-300 bg-red-50 text-red-800', tag: 'Marcó · Incorrecta', tagClass: 'bg-red-600 text-white' };
  }
  if (isCorrect && !selected) {
    return { icon: MinusCircle, className: 'border-amber-300 bg-amber-50 text-amber-800', tag: 'Correcta (no marcada)', tagClass: 'bg-amber-500 text-white' };
  }
  return { icon: Circle, className: 'border-[rgba(0,65,106,0.1)] bg-white text-[var(--unilabor-neutral)]', tag: '', tagClass: '' };
};

const QuestionCard = ({ question, index }: { question: EvaluationQuestionResponse; index: number }) => {
  const correct = question.is_correct;
  // Las incorrectas arrancan abiertas para que RH vea los errores de inmediato.
  const [open, setOpen] = useState(!correct);
  const resultClass = correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
  const panelId = `question-panel-${question.question_id}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[rgba(191,212,230,0.12)]"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-brand-700)]">Pregunta {index + 1}</span>
            <span className="rounded-full bg-[rgba(191,212,230,0.35)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
              {QUESTION_TYPE_LABEL[question.type]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${resultClass}`}>
              {correct ? 'Correcta' : 'Incorrecta'}
            </span>
            <span className="text-[10px] font-semibold text-[var(--unilabor-neutral)]">
              {question.points_awarded} / {question.points} pts
            </span>
          </div>
          <p className={`text-sm font-medium text-[var(--unilabor-ink)] ${open ? '' : 'truncate'}`}>{question.text}</p>
        </div>
        <ChevronDown
          size={18}
          className={`mt-1 shrink-0 text-[var(--color-brand-700)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {question.type === 'open' ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Respuesta del colaborador
                  </p>
                  {question.text_answer ? (
                    <p className="whitespace-pre-wrap text-sm text-[var(--unilabor-ink)]">{question.text_answer}</p>
                  ) : (
                    <p className="text-sm italic text-[var(--unilabor-neutral)]">Sin responder</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const visual = optionVisual(option.is_correct, option.selected);
                    const Icon = visual.icon;
                    return (
                      <div
                        key={option.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${visual.className}`}
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="flex-1">{option.text}</span>
                        {visual.tag && (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${visual.tagClass}`}>
                            {visual.tag}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {!question.answered && (
                    <p className="text-xs italic text-[var(--unilabor-neutral)]">El colaborador no marcó ninguna opción.</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const EvaluationResponsesModal = ({ assignmentId, onClose }: EvaluationResponsesModalProps) => {
  const [detail, setDetail] = useState<EvaluationResponsesDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const result = await getEvaluationResponses(assignmentId);
        if (active) {
          setDetail(result);
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudieron cargar las respuestas.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const assignment = detail?.assignment;
  const statusMeta = assignment ? EVALUATION_STATUS_META[assignment.status] : null;
  const correctCount = detail?.questions.filter((q) => q.is_correct).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.32)] p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.18)]"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[var(--color-brand-700)]">Respuestas de la evaluación</h2>
            {assignment && (
              <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">
                {assignment.employee_name} · {assignment.employee_code}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando respuestas...
          </div>
        ) : !assignment ? (
          <div className="px-5 py-16 text-center text-sm text-[var(--unilabor-neutral)]">
            No hay respuestas registradas para esta evaluación.
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.7)] px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                <span className="font-semibold text-[var(--unilabor-ink)]">{assignment.course_title}</span>
                <span className="text-[var(--unilabor-neutral)]">{assignment.template_title}</span>
                {statusMeta && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--unilabor-neutral)]">
                <span>
                  Calificación:{' '}
                  <span className="font-bold text-[var(--color-brand-700)]">
                    {assignment.percentage !== null ? `${assignment.percentage}%` : '—'}
                  </span>{' '}
                  (mínimo {assignment.passing_score}%)
                </span>
                <span>
                  Puntos: <span className="font-semibold text-[var(--unilabor-ink)]">{assignment.score ?? 0} / {assignment.max_score ?? 0}</span>
                </span>
                <span>
                  Aciertos: <span className="font-semibold text-[var(--unilabor-ink)]">{correctCount} / {detail?.questions.length ?? 0}</span>
                </span>
                <span>Enviada: {formatDateTime(assignment.submitted_at)}</span>
              </div>
            </div>

            {/* Preguntas */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {detail && detail.questions.length > 0 ? (
                detail.questions.map((question, index) => (
                  <QuestionCard key={question.question_id} question={question} index={index} />
                ))
              ) : (
                <p className="py-10 text-center text-sm text-[var(--unilabor-neutral)]">
                  Esta evaluación no tiene respuestas registradas.
                </p>
              )}
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[rgba(0,65,106,0.08)] px-5 py-2.5 text-[10px] text-[var(--unilabor-neutral)]">
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-600" /> Marcó correcta</span>
              <span className="inline-flex items-center gap-1"><XCircle size={12} className="text-red-600" /> Marcó incorrecta</span>
              <span className="inline-flex items-center gap-1"><MinusCircle size={12} className="text-amber-500" /> Correcta no marcada</span>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
