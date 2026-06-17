import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Save, X } from 'lucide-react';
import { gradeEvaluation, getApiErrorMessage, getGradingDetail } from '../../api/service';
import type { EvaluationGradingDetail } from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';

interface GradeEvaluationModalProps {
  assignmentId: number;
  onClose: () => void;
  onGraded: () => void;
}

export const GradeEvaluationModal = ({ assignmentId, onClose, onGraded }: GradeEvaluationModalProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<EvaluationGradingDetail | null>(null);
  const [points, setPoints] = useState<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getGradingDetail(assignmentId);
        if (!active) return;
        setDetail(data);
        if (data) {
          setPoints(
            Object.fromEntries(data.open_answers.map((answer) => [answer.question_id, answer.points_awarded])),
          );
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle de calificacion.'));
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

  const projected = useMemo(() => {
    if (!detail) {
      return { score: 0, percentage: 0, passed: false };
    }
    const openTotal = detail.open_answers.reduce(
      (sum, answer) => sum + (Number.isFinite(points[answer.question_id]) ? points[answer.question_id]! : 0),
      0,
    );
    const score = detail.assignment.objective_score + openTotal;
    const max = detail.assignment.max_score;
    const percentage = max > 0 ? Math.round((score / max) * 10000) / 100 : 0;
    return { score, percentage, passed: percentage >= detail.assignment.passing_score };
  }, [detail, points]);

  const setQuestionPoints = (questionId: number, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
    setPoints((current) => ({ ...current, [questionId]: clamped }));
  };

  const handleSave = async () => {
    if (!detail) return;
    const grades = detail.open_answers.map((answer) => ({
      question_id: answer.question_id,
      points_awarded: points[answer.question_id] ?? 0,
    }));
    if (grades.some((grade) => !Number.isFinite(grade.points_awarded))) {
      notifyWarning('Asigna los puntos de todas las respuestas.');
      return;
    }
    setSaving(true);
    try {
      const result = await gradeEvaluation(assignmentId, grades);
      notifySuccess(
        result.passed
          ? `Evaluacion calificada: ACREDITADA (${result.percentage}%).`
          : `Evaluacion calificada: no acreditada (${result.percentage}%). RH sera notificado para recapacitacion.`,
      );
      onGraded();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo calificar la evaluacion.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Calificar evaluacion
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
              {detail?.assignment.employee_name ?? 'Colaborador'}
            </h2>
            {detail && (
              <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">
                {detail.assignment.employee_code} | {detail.assignment.course_title} | {detail.assignment.template_title}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando...
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {detail.open_answers.map((answer, index) => (
                <div key={answer.question_id} className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.6)] p-4">
                  <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                    {index + 1}. {answer.text}
                  </p>
                  <div className="mt-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2 text-sm text-[var(--unilabor-ink)]">
                    {answer.text_answer || <span className="italic text-[var(--unilabor-neutral)]">Sin respuesta</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs font-semibold text-[var(--unilabor-neutral)]">Puntos:</label>
                    <input
                      type="number"
                      min={0}
                      max={answer.points}
                      value={points[answer.question_id] ?? 0}
                      onChange={(event) => setQuestionPoints(answer.question_id, Number(event.target.value), answer.points)}
                      className="w-20 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <span className="text-xs text-[var(--unilabor-neutral)]">de {answer.points}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.8)] px-4 py-2 text-sm">
                <span className="text-[var(--unilabor-neutral)]">
                  Objetivas {detail.assignment.objective_score} + abiertas = {projected.score}/{detail.assignment.max_score}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-bold ${projected.passed ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {projected.passed && <CheckCircle2 size={15} />}
                  {projected.percentage}% {projected.passed ? '(acredita)' : `(min ${detail.assignment.passing_score}%)`}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Calificar y cerrar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
