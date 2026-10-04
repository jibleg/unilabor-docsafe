import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createEvaluationTemplate,
  deleteEvaluationTemplate,
  getApiErrorMessage,
  getTrainingCourse,
} from '../../../api/service';
import type { EvaluationTemplate, EvaluationType, TrainingCourse } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import {
  courseDisplayTitle,
  inductionPhaseOf,
  isInductionCourse,
  isPracticalTemplate,
  validityLongLabel,
} from '../../../utils/trainingCatalog';

interface TrainingCourseDrawerProps {
  course: TrainingCourse;
  /** Cambia cuando el editor o la asignacion modifican las evaluaciones: fuerza recarga. */
  refreshKey: number;
  onClose: () => void;
  onEditCourse: (course: TrainingCourse) => void;
  onDesignCertificate: (course: TrainingCourse) => void;
  onDeleteCourse: (course: TrainingCourse) => void;
  onEditTemplate: (templateId: number) => void;
  onAssignTemplate: (template: EvaluationTemplate) => void;
  /** Las evaluaciones cambiaron (alta/baja): el catalogo recalcula sus contadores. */
  onTemplatesChanged: () => void;
}

const headerButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25';
const rowButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]';

const Metric = ({ icon: Icon, value, title }: { icon: typeof Clock3; value: string; title: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,65,106,0.06)] px-2 py-0.5" title={title}>
    <Icon size={12} /> {value}
  </span>
);

/** Drawer de la capacitacion: datos clave y sus evaluaciones con acciones directas. */
export const TrainingCourseDrawer = ({
  course,
  refreshKey,
  onClose,
  onEditCourse,
  onDesignCertificate,
  onDeleteCourse,
  onEditTemplate,
  onAssignTemplate,
  onTemplatesChanged,
}: TrainingCourseDrawerProps) => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<EvaluationType | null>(null);
  const induction = isInductionCourse(course);
  const phase = inductionPhaseOf(course);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await getTrainingCourse(course.id);
      setTemplates(detail?.templates ?? []);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones.'));
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates, refreshKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCreate = async (evaluationType: EvaluationType) => {
    setCreating(evaluationType);
    try {
      const created = await createEvaluationTemplate(course.id, {
        title: evaluationType === 'practical' ? 'Nueva práctica' : 'Nueva evaluación',
        evaluation_type: evaluationType,
      });
      notifySuccess(evaluationType === 'practical' ? 'Práctica creada.' : 'Evaluación creada.');
      await loadTemplates();
      onTemplatesChanged();
      if (created) {
        onEditTemplate(created.id);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear la evaluación.'));
    } finally {
      setCreating(null);
    }
  };

  const handleDelete = async (template: EvaluationTemplate) => {
    const confirmed = await confirmAction('Inactivar evaluación', `¿Inactivar "${template.title}"?`, 'Inactivar');
    if (!confirmed) {
      return;
    }
    try {
      await deleteEvaluationTemplate(template.id);
      notifySuccess('Evaluación inactivada.');
      await loadTemplates();
      onTemplatesChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar la evaluación.'));
    }
  };

  const KindIcon = induction ? Briefcase : GraduationCap;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,34,53,0.32)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={course.title}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-[rgba(246,249,252,1)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ animation: 'comp-drawer-in .35s cubic-bezier(.2,.8,.2,1) both' }}
      >
        <header
          className="relative overflow-hidden px-6 pb-5 pt-5 text-white"
          style={{
            background: induction
              ? 'linear-gradient(120deg, #0b2235, var(--color-brand-700) 60%, var(--color-brand-500))'
              : 'linear-gradient(120deg, #0b2235, #1f5a3a 60%, #2f7a4d)',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-2 ring-white/30">
              <KindIcon size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-tight" title={course.title}>
                {courseDisplayTitle(course)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-white/75">{course.code}</p>
            </div>
            <button type="button" onClick={onClose} className={headerButtonClass} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            {phase !== null && <span className="rounded-full bg-white/20 px-2.5 py-1">Inducción · Fase {phase}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
              <CalendarClock size={12} /> {validityLongLabel(course.certificate_validity_months)}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={() => onDesignCertificate(course)} className={headerButtonClass} title="Constancia" aria-label="Diseñar constancia">
                <Award size={15} />
              </button>
              <button type="button" onClick={() => onEditCourse(course)} className={headerButtonClass} title="Editar" aria-label="Editar capacitación">
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteCourse(course)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-red-500/80"
                title="Inactivar"
                aria-label="Inactivar capacitación"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {course.description ? <p className="relative mt-3 line-clamp-2 text-xs text-white/80">{course.description}</p> : null}
        </header>

        <div className="flex items-center justify-between gap-2 border-b border-[rgba(0,65,106,0.08)] bg-white/70 px-6 py-3">
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
            <ListChecks size={16} /> Evaluaciones
            <span className="rounded-full bg-[rgba(0,65,106,0.08)] px-2 text-xs">{templates.length}</span>
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCreate('quiz')}
              disabled={creating !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              title="Nuevo cuestionario"
            >
              {creating === 'quiz' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <BookOpen size={13} />
            </button>
            <button
              type="button"
              onClick={() => void handleCreate('practical')}
              disabled={creating !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.16)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50"
              title="Nueva práctica"
            >
              {creating === 'practical' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <ClipboardCheck size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--unilabor-neutral)]">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] py-12 text-sm text-[var(--unilabor-neutral)]">
              <ListChecks size={28} className="text-[var(--color-brand-300)]" />
              Sin evaluaciones
            </div>
          ) : (
            templates.map((template) => {
              const practical = isPracticalTemplate(template);
              const published = template.status === 'published';
              const TypeIcon = practical ? ClipboardCheck : BookOpen;
              return (
                <div
                  key={template.id}
                  className="group rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-3.5 transition hover:border-[var(--color-brand-300)] hover:shadow-[0_8px_20px_rgba(0,65,106,0.1)]"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        practical ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700'
                      }`}
                      title={practical ? 'Práctica' : 'Cuestionario'}
                    >
                      <TypeIcon size={16} />
                    </span>
                    <button type="button" onClick={() => onEditTemplate(template.id)} className="min-w-0 flex-1 text-left">
                      <p className="line-clamp-2 text-sm font-semibold text-[var(--unilabor-ink)]">{template.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[var(--color-brand-700)]">
                        {!practical && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                              published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${published ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {published ? 'Publicada' : 'Borrador'}
                          </span>
                        )}
                        {practical ? (
                          <Metric icon={Target} value="≥ 8" title="RH captura la calificación; acredita con 8 o más" />
                        ) : (
                          <>
                            <Metric icon={ListChecks} value={String(template.question_count ?? 0)} title="Preguntas" />
                            <Metric icon={Target} value={`${template.passing_score}%`} title="Calificación mínima" />
                            <Metric icon={Clock3} value={`${template.window_hours} h`} title="Plazo para presentar" />
                            {template.requires_manual_grading ? (
                              <Metric icon={UserCheck} value="RH" title="Incluye preguntas abiertas: requiere revisión de RH" />
                            ) : null}
                          </>
                        )}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {practical ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/rh/practical-capture?template=${template.id}`)}
                          className={rowButtonClass}
                          title="Capturar calificaciones"
                          aria-label="Capturar calificaciones"
                        >
                          <ClipboardCheck size={15} />
                        </button>
                      ) : induction ? (
                        <button
                          type="button"
                          onClick={() => navigate('/rh/induction')}
                          className={rowButtonClass}
                          title="Se asigna desde Inducción al inscribir"
                          aria-label="Ir a Inducción"
                        >
                          <Briefcase size={15} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAssignTemplate(template)}
                          className={rowButtonClass}
                          title="Asignar a colaboradores"
                          aria-label="Asignar evaluación"
                        >
                          <UserPlus size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEditTemplate(template.id)}
                        className={rowButtonClass}
                        title="Diseñar"
                        aria-label="Diseñar evaluación"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(template)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                        title="Inactivar"
                        aria-label="Inactivar evaluación"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
