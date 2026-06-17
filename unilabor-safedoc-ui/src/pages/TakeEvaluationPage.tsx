import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, ArrowRight, Award, CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  getApiErrorMessage,
  getEmployeeDocumentUrl,
  startMyEvaluation,
  submitMyEvaluation,
  type SubmitAnswerPayload,
} from '../api/service';
import type {
  EvaluationSubmitResult,
  EvaluationTakingQuestion,
  EvaluationTakingView,
} from '../types/models';
import { notifyError } from '../utils/notify';

type AnswerState = Record<number, { selected: number[]; text: string }>;

interface CongratsMessage {
  emoji: string;
  title: string;
  subtitle: string;
}

const buildResultMessage = (result: EvaluationSubmitResult): CongratsMessage => {
  if (result.requires_manual_grading || result.status === 'grading') {
    return {
      emoji: '📝',
      title: 'Evaluacion enviada',
      subtitle: 'Tu evaluacion incluye preguntas abiertas y sera revisada por RH. Te avisaremos el resultado.',
    };
  }
  if (result.passed) {
    const pct = result.percentage ?? 0;
    if (pct >= 100) {
      return { emoji: '🏆', title: '¡Perfecto!', subtitle: 'Dominas el tema por completo. ¡Felicidades!' };
    }
    if (pct >= 90) {
      return { emoji: '🎉', title: '¡Excelente trabajo!', subtitle: 'Un resultado sobresaliente. ¡Felicidades!' };
    }
    return { emoji: '✅', title: '¡Felicidades, acreditaste!', subtitle: 'Alcanzaste la calificacion requerida.' };
  }
  return {
    emoji: '💪',
    title: 'No alcanzaste el minimo esta vez',
    subtitle: 'No te preocupes: RH fue notificado y te contactara para recapacitacion.',
  };
};

const cardClass =
  'rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/92 p-5 shadow-[0_10px_28px_rgba(0,65,106,0.06)] md:p-7';

export const TakeEvaluationPage = () => {
  const { id } = useParams();
  const assignmentId = Number(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<EvaluationTakingView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EvaluationSubmitResult | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const started = await startMyEvaluation(assignmentId);
        if (active) {
          setView(started);
        }
      } catch (error) {
        if (active) {
          setLoadError(getApiErrorMessage(error, 'No se pudo abrir la evaluacion.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    if (Number.isFinite(assignmentId) && assignmentId > 0) {
      void run();
    } else {
      setLoadError('Evaluacion invalida.');
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const questions = useMemo(() => view?.questions ?? [], [view]);
  const total = questions.length;
  const current = questions[index];

  const getAnswer = useCallback(
    (questionId: number) => answers[questionId] ?? { selected: [], text: '' },
    [answers],
  );

  const setSelected = (question: EvaluationTakingQuestion, optionId: number) => {
    setAnswers((current) => {
      const prev = current[question.id] ?? { selected: [], text: '' };
      let selected: number[];
      if (question.type === 'multiple') {
        selected = prev.selected.includes(optionId)
          ? prev.selected.filter((id) => id !== optionId)
          : [...prev.selected, optionId];
      } else {
        selected = [optionId];
      }
      return { ...current, [question.id]: { ...prev, selected } };
    });
  };

  const setText = (questionId: number, text: string) => {
    setAnswers((current) => {
      const prev = current[questionId] ?? { selected: [], text: '' };
      return { ...current, [questionId]: { ...prev, text } };
    });
  };

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => {
        const answer = answers[question.id];
        if (!answer) return false;
        return question.type === 'open' ? answer.text.trim().length > 0 : answer.selected.length > 0;
      }).length,
    [questions, answers],
  );

  const goTo = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(total - 1, next)));
  };

  const openCertificate = async (documentId: number) => {
    try {
      const url = await getEmployeeDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la constancia.'));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: SubmitAnswerPayload[] = questions.map((question) => {
        const answer = getAnswer(question.id);
        return question.type === 'open'
          ? { question_id: question.id, text_answer: answer.text }
          : { question_id: question.id, selected_option_ids: answer.selected };
      });
      const submitResult = await submitMyEvaluation(assignmentId, payload);
      setResult(submitResult);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo enviar la evaluacion.'));
    } finally {
      setSubmitting(false);
    }
  };

  // --- Estados de carga / error ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 className="mr-2 animate-spin" size={18} /> Abriendo tu evaluacion...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl">
        <div className={cardClass}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle size={26} />
            </span>
            <h1 className="text-xl font-bold text-[var(--color-brand-700)]">No se puede abrir la evaluacion</h1>
            <p className="text-sm text-[var(--unilabor-neutral)]">{loadError}</p>
            <button
              type="button"
              onClick={() => navigate('/rh/my-evaluations')}
              className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
            >
              <ArrowLeft size={15} /> Volver a mis evaluaciones
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Pantalla de resultados ---
  if (result) {
    const message = buildResultMessage(result);
    const celebratory = result.passed && !result.requires_manual_grading;
    return (
      <div className="mx-auto max-w-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={cardClass}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: celebratory ? [0, -12, 12, 0] : 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 12 }}
              className="text-6xl"
              role="img"
              aria-label="resultado"
            >
              {message.emoji}
            </motion.span>
            <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">{message.title}</h1>
            {result.percentage !== null && (
              <div className="text-5xl font-black text-[var(--color-brand-700)]">{result.percentage}%</div>
            )}
            <p className="max-w-sm text-sm text-[var(--unilabor-neutral)]">{message.subtitle}</p>

            {celebratory && result.certificate_document_id ? (
              <button
                type="button"
                onClick={() => void openCertificate(result.certificate_document_id!)}
                className="mt-1 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Award size={16} /> Ver mi constancia
              </button>
            ) : celebratory ? (
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={15} /> Tu constancia se archivara en tus constancias en breve.
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => navigate('/rh/my-evaluations')}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
            >
              <ArrowLeft size={15} /> Volver a mis evaluaciones
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-xl">
        <div className={cardClass}>
          <p className="text-center text-sm text-[var(--unilabor-neutral)]">Esta evaluacion no tiene preguntas.</p>
        </div>
      </div>
    );
  }

  const answer = getAnswer(current.id);
  const isLast = index === total - 1;
  const progress = Math.round(((index + 1) / total) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          {view?.assignment.course_title}
        </p>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-brand-700)]">
          {view?.assignment.template_title}
        </h1>
        {view?.assignment.instructions && (
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{view.assignment.instructions}</p>
        )}
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--unilabor-neutral)]">
          <span>
            Pregunta {index + 1} de {total}
          </span>
          <span>{answeredCount} respondida(s)</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
          <motion.div
            className="h-full rounded-full bg-[var(--color-brand-500)]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Tarjeta de pregunta con transicion */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={cardClass}
          >
            <p className="mb-4 text-base font-semibold text-[var(--unilabor-ink)]">{current.text}</p>

            {current.type === 'open' ? (
              <textarea
                value={answer.text}
                onChange={(event) => setText(current.id, event.target.value)}
                rows={5}
                placeholder="Escribe tu respuesta..."
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            ) : (
              <div className="space-y-2">
                {current.options.map((option) => {
                  const selected = answer.selected.includes(option.id);
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelected(current, option.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? 'border-[var(--color-brand-400)] bg-[rgba(124,173,211,0.18)] text-[var(--color-brand-700)]'
                          : 'border-[rgba(0,65,106,0.12)] bg-white/80 text-[var(--unilabor-ink)] hover:bg-[rgba(191,212,230,0.18)]'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] ${
                          current.type === 'multiple' ? 'rounded-md' : 'rounded-full'
                        } ${selected ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white' : 'border-[rgba(0,65,106,0.25)]'}`}
                      >
                        {selected ? '✓' : ''}
                      </span>
                      {option.text}
                    </motion.button>
                  );
                })}
                {current.type === 'multiple' && (
                  <p className="text-[11px] text-[var(--unilabor-neutral)]">Puedes seleccionar varias opciones.</p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navegacion */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
        >
          <ArrowLeft size={15} /> Anterior
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[var(--color-brand-500)] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Enviar evaluacion
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            Siguiente <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
