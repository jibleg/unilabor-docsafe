import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createEvaluationTemplate,
  createTrainingCourse,
  deleteEvaluationTemplate,
  deleteTrainingCourse,
  getApiErrorMessage,
  getTrainingCourse,
  listTrainingCoursesPaginated,
  updateTrainingCourse,
  type TrainingCoursePayload,
} from '../api/service';
import type { EvaluationTemplate, TrainingCourse } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';
import { EvaluationTemplateEditorModal } from '../components/rh/EvaluationTemplateEditorModal';

interface CourseFormState {
  title: string;
  description: string;
  certificate_validity_months: number;
}

const EMPTY_COURSE_FORM: CourseFormState = {
  title: '',
  description: '',
  certificate_validity_months: 12,
};

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

export const RhTrainingsPage = () => {
  const {
    items: courses,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    loading,
    reload,
  } = usePaginatedList<TrainingCourse>(
    (query) => listTrainingCoursesPaginated(query),
    {
      onError: (error) =>
        notifyError(getApiErrorMessage(error, 'No se pudieron cargar las capacitaciones.')),
    },
  );

  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  const [courseForm, setCourseForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);
  const [savingCourse, setSavingCourse] = useState(false);

  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const loadTemplates = useCallback(async (courseId: number) => {
    setLoadingTemplates(true);
    try {
      const detail = await getTrainingCourse(courseId);
      setTemplates(detail?.templates ?? []);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones.'));
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (expandedCourseId !== null) {
      void loadTemplates(expandedCourseId);
    }
  }, [expandedCourseId, loadTemplates]);

  const toggleExpand = (courseId: number) => {
    setExpandedCourseId((current) => (current === courseId ? null : courseId));
  };

  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm(EMPTY_COURSE_FORM);
    setIsCourseModalOpen(true);
  };

  const openEditCourse = (course: TrainingCourse) => {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      description: course.description ?? '',
      certificate_validity_months: course.certificate_validity_months,
    });
    setIsCourseModalOpen(true);
  };

  const handleSaveCourse = async () => {
    if (!courseForm.title.trim()) {
      notifyWarning('El titulo de la capacitacion es obligatorio.');
      return;
    }
    const payload: TrainingCoursePayload = {
      title: courseForm.title.trim(),
      description: courseForm.description.trim() || null,
      certificate_validity_months: courseForm.certificate_validity_months,
    };
    setSavingCourse(true);
    try {
      if (editingCourse) {
        await updateTrainingCourse(editingCourse.id, payload);
        notifySuccess('Capacitacion actualizada correctamente.');
      } else {
        await createTrainingCourse(payload);
        notifySuccess('Capacitacion creada correctamente.');
      }
      setIsCourseModalOpen(false);
      reload();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la capacitacion.'));
    } finally {
      setSavingCourse(false);
    }
  };

  const handleDeleteCourse = async (course: TrainingCourse) => {
    if (!window.confirm(`Inactivar la capacitacion "${course.title}"?`)) {
      return;
    }
    try {
      await deleteTrainingCourse(course.id);
      notifySuccess('Capacitacion inactivada correctamente.');
      reload();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar la capacitacion.'));
    }
  };

  const handleCreateTemplate = async (courseId: number) => {
    try {
      const created = await createEvaluationTemplate(courseId, { title: 'Nueva evaluacion' });
      notifySuccess('Evaluacion creada. Disenala a continuacion.');
      await loadTemplates(courseId);
      if (created) {
        setEditingTemplateId(created.id);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear la evaluacion.'));
    }
  };

  const handleDeleteTemplate = async (templateId: number, courseId: number) => {
    if (!window.confirm('Inactivar esta evaluacion?')) {
      return;
    }
    try {
      await deleteEvaluationTemplate(templateId);
      notifySuccess('Evaluacion inactivada correctamente.');
      await loadTemplates(courseId);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar la evaluacion.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Capacitacion y competencia
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <GraduationCap size={24} /> Capacitaciones
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Disena las capacitaciones, sus evaluaciones y el banco de preguntas (ISO 15189).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateCourse}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
        >
          <Plus size={16} /> Nueva capacitacion
        </button>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por codigo, titulo o descripcion..."
          className={`${inputClass} pl-9`}
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando capacitaciones...
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
            Aun no hay capacitaciones. Crea la primera para empezar a disenar evaluaciones.
          </div>
        ) : (
          courses.map((course) => {
            const expanded = expandedCourseId === course.id;
            return (
              <div
                key={course.id}
                className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(course.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <div>
                      <p className="font-semibold text-[var(--color-brand-700)]">{course.title}</p>
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {course.code} | Vigencia constancia:{' '}
                        {course.certificate_validity_months === 0
                          ? 'sin vencimiento'
                          : `${course.certificate_validity_months} meses`}{' '}
                        | {course.template_count ?? 0} evaluacion(es)
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCourse(course)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                      aria-label="Editar capacitacion"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCourse(course)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                      aria-label="Inactivar capacitacion"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.6)] px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-500)]">
                        Evaluaciones
                      </h3>
                      <button
                        type="button"
                        onClick={() => void handleCreateTemplate(course.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                      >
                        <Plus size={13} /> Nueva evaluacion
                      </button>
                    </div>
                    {loadingTemplates ? (
                      <div className="flex items-center py-4 text-xs text-[var(--unilabor-neutral)]">
                        <Loader2 className="mr-2 animate-spin" size={14} /> Cargando evaluaciones...
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="py-3 text-xs text-[var(--unilabor-neutral)]">
                        Esta capacitacion aun no tiene evaluaciones.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {templates.map((template) => (
                          <li
                            key={template.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white/90 px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => setEditingTemplateId(template.id)}
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              <BookOpen size={15} className="text-[var(--color-brand-500)]" />
                              <span className="text-sm font-medium text-[var(--unilabor-ink)]">
                                {template.title}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  template.status === 'published'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {template.status === 'published' ? 'Publicada' : 'Borrador'}
                              </span>
                              <span className="text-xs text-[var(--unilabor-neutral)]">
                                {template.question_count ?? 0} pregunta(s) | min {template.passing_score}% |{' '}
                                {template.window_hours}h
                                {template.requires_manual_grading ? ' | revision RH' : ''}
                              </span>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingTemplateId(template.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                                aria-label="Disenar evaluacion"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteTemplate(template.id, course.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                                aria-label="Inactivar evaluacion"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={pagination.limit}
        onPageChange={setPage}
        loading={loading}
      />

      {/* Modal capacitacion */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 p-5 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <h2 className="mb-4 text-lg font-bold text-[var(--color-brand-700)]">
              {editingCourse ? 'Editar capacitacion' : 'Nueva capacitacion'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Titulo</label>
                <input
                  value={courseForm.title}
                  onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))}
                  className={inputClass}
                  placeholder="Bioseguridad en el laboratorio"
                />
              </div>
              <div>
                <label className={labelClass}>Descripcion (opcional)</label>
                <textarea
                  value={courseForm.description}
                  onChange={(event) =>
                    setCourseForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Vigencia de la constancia (meses, 0 = sin vencimiento)</label>
                <input
                  type="number"
                  min={0}
                  value={courseForm.certificate_validity_months}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      certificate_validity_months: Number(event.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCourseModalOpen(false)}
                disabled={savingCourse}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCourse()}
                disabled={savingCourse}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {savingCourse ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {editingCourse ? 'Guardar cambios' : 'Crear capacitacion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor de evaluacion + banco de preguntas */}
      {editingTemplateId !== null && (
        <EvaluationTemplateEditorModal
          templateId={editingTemplateId}
          onClose={() => setEditingTemplateId(null)}
          onSaved={() => {
            if (expandedCourseId !== null) {
              void loadTemplates(expandedCourseId);
            }
            reload();
          }}
        />
      )}
    </div>
  );
};
