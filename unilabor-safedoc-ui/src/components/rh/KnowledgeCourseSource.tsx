import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleDashed, GraduationCap, History, Loader2, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../../api/service';
import { assignCourseKnowledge, listKnowledgeCourseOptions } from '../../api/service.api-rh-competency';
import type { KnowledgeCourseOption, RhCompetencyEvaluation } from '../../types/models';
import { confirmAction } from '../../utils/confirm';

interface KnowledgeCourseSourceProps {
  evaluation: RhCompetencyEvaluation;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}

const ATTEMPT_LABEL: Record<string, string> = {
  passed: 'acreditada',
  failed: 'no acreditada',
  grading: 'en revisión',
  submitted: 'enviada',
  pending: 'asignada, sin iniciar',
  in_progress: 'en curso',
  authorized_late: 'extemporánea autorizada',
};

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—');

/**
 * Fuente "Capacitación del puesto" para la sección 3: lista las capacitaciones
 * ligadas al puesto evaluado (catálogo de Puestos) con el último intento del
 * colaborador. RH asigna la evaluación de la capacitación o usa la que ya
 * presentó; sus preguntas y respuestas llenan la sección 3.
 */
export const KnowledgeCourseSource = ({ evaluation, onChanged }: KnowledgeCourseSourceProps) => {
  const [courses, setCourses] = useState<KnowledgeCourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCourses(await listKnowledgeCourseOptions(evaluation.id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las capacitaciones del puesto.'));
    } finally {
      setLoading(false);
    }
  }, [evaluation.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (course: KnowledgeCourseOption, mode: 'new' | 'existing') => {
    const ok = await confirmAction(
      mode === 'new' ? 'Asignar evaluación de la capacitación' : 'Usar la evaluación ya presentada',
      mode === 'new'
        ? `Se asignará a ${evaluation.employee_name} el cuestionario de "${course.course_title}" con las reglas de esa capacitación (ventana, tiempo y mínimo). No se envía SMS ni correo: avísale en persona. Al contestarlo, la sección 3 se llena sola.`
        : `La sección 3 se llenará con las preguntas y respuestas del intento #${course.last_attempt?.attempt_no ?? 1} de "${course.course_title}" (${ATTEMPT_LABEL[course.last_attempt?.status ?? ''] ?? course.last_attempt?.status}).`,
      mode === 'new' ? 'Asignar' : 'Usar este intento',
      'primary',
    );
    if (!ok) return;
    setBusy(`${course.course_id}:${mode}`);
    try {
      const result = await assignCourseKnowledge(evaluation.id, course.course_id, mode);
      toast.success(result.message);
      onChanged(result.evaluation);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo ligar la capacitación a la sección 3.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--unilabor-neutral)]">Cargando capacitaciones del puesto…</p>;
  }
  if (courses.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <span>
          El puesto <b>{evaluation.position_name}</b> no tiene capacitaciones ligadas. Lígalas en Puestos (inducción) → "Capacitaciones
          del puesto · Fase 7".
        </span>
        <Link
          to={`/rh/positions?position=${evaluation.position_id}&focus=courses`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
        >
          Ir a vincular capacitaciones <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Link
          to={`/rh/positions?position=${evaluation.position_id}&focus=courses`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-600)] hover:underline"
        >
          Administrar capacitaciones del puesto <ArrowRight size={12} />
        </Link>
      </div>
      {courses.map((course) => {
        const attempt = course.last_attempt;
        const answered = attempt && ['passed', 'failed'].includes(attempt.status);
        return (
          <div key={course.course_id} className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-brand-700)]">
                  <GraduationCap size={14} /> {course.course_title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-[var(--unilabor-neutral)]">
                  <span className="font-mono">{course.course_code}</span>
                  <span className={`inline-flex items-center gap-1 ${course.published_template_id ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {course.published_template_id ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                    {course.published_template_id ? `Cuestionario publicado · ${course.question_count} pregunta(s)` : 'Sin cuestionario publicado'}
                  </span>
                  {attempt ? (
                    <span className="inline-flex items-center gap-1">
                      <History size={11} /> Último intento #{attempt.attempt_no}: {ATTEMPT_LABEL[attempt.status] ?? attempt.status}
                      {attempt.percentage !== null ? ` · ${attempt.percentage}%` : ''}
                      {attempt.submitted_at ? ` · ${formatDate(attempt.submitted_at)}` : ''}
                    </span>
                  ) : (
                    <span>Sin intentos del colaborador</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {attempt ? (
                  <button
                    type="button"
                    onClick={() => void run(course, 'existing')}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50"
                  >
                    {busy === `${course.course_id}:existing` ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                    {answered ? 'Usar la ya presentada' : 'Ligar intento en curso'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void run(course, 'new')}
                  disabled={busy !== null || !course.published_template_id}
                  title={course.published_template_id ? '' : 'Publica el cuestionario de la capacitación en Capacitaciones'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === `${course.course_id}:new` ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Asignar evaluación
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
