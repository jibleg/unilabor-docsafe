import { useCallback, useState } from 'react';
import { Briefcase, FilePen, GraduationCap, LayoutGrid, Loader2, Plus, Search, SearchX, X } from 'lucide-react';
import {
  createTrainingCourse,
  deleteTrainingCourse,
  getApiErrorMessage,
  listTrainingCoursesPaginated,
  updateTrainingCourse,
  type TrainingCoursePayload,
} from '../api/service';
import type { EvaluationTemplate, TrainingCourse, TrainingCourseKind, TrainingCourseSummary } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { confirmAction } from '../utils/confirm';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';
import { EvaluationTemplateEditorModal } from '../components/rh/EvaluationTemplateEditorModal';
import { AssignEvaluationModal } from '../components/rh/AssignEvaluationModal';
import { CertificateDesignerModal } from '../components/rh/CertificateDesignerModal';
import { TrainingCourseCard, TrainingCourseCardSkeleton } from '../components/rh/trainings/TrainingCourseCard';
import { TrainingCourseDrawer } from '../components/rh/trainings/TrainingCourseDrawer';
import { INDUCTION_PHASES } from '../utils/trainingCatalog';

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

type KindTab = 'all' | TrainingCourseKind;

const KIND_TABS: { key: KindTab; label: string; icon: typeof LayoutGrid; count: (s: TrainingCourseSummary) => number }[] = [
  { key: 'all', label: 'Todas', icon: LayoutGrid, count: (s) => s.total },
  { key: 'induction', label: 'Inducción', icon: Briefcase, count: (s) => s.induction },
  { key: 'general', label: 'Generales', icon: GraduationCap, count: (s) => s.general },
  { key: 'draft', label: 'Borrador', icon: FilePen, count: (s) => s.draft },
];

const EMPTY_SUMMARY: TrainingCourseSummary = { total: 0, induction: 0, general: 0, draft: 0 };
const PAGE_SIZE = 24;

export const RhTrainingsPage = () => {
  const [kind, setKind] = useState<KindTab>('all');
  const [phase, setPhase] = useState<number | null>(null);
  const [summary, setSummary] = useState<TrainingCourseSummary>(EMPTY_SUMMARY);

  const fetchCourses = useCallback(
    async (query: { page: number; limit: number; search: string; filters: Record<string, string> }) => {
      const result = await listTrainingCoursesPaginated({
        page: query.page,
        limit: query.limit,
        search: query.search,
        kind: (query.filters.kind || undefined) as TrainingCourseKind | undefined,
        phase: query.filters.phase ? Number(query.filters.phase) : undefined,
      });
      setSummary(result.summary);
      return result;
    },
    [],
  );

  const {
    items: courses,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    loading,
    reload,
  } = usePaginatedList<TrainingCourse>(fetchCourses, {
    pageSize: PAGE_SIZE,
    filters: { kind: kind === 'all' ? '' : kind, phase: kind === 'induction' && phase ? String(phase) : '' },
    onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar las capacitaciones.')),
  });

  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  const [courseForm, setCourseForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);
  const [savingCourse, setSavingCourse] = useState(false);

  const [openCourse, setOpenCourse] = useState<TrainingCourse | null>(null);
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [assigningTemplate, setAssigningTemplate] = useState<EvaluationTemplate | null>(null);
  const [certificateCourse, setCertificateCourse] = useState<TrainingCourse | null>(null);

  // El drawer queda debajo de los modales: Esc/clic fuera no debe cerrarlo mientras uno esta abierto.
  const modalOpen = isCourseModalOpen || editingTemplateId !== null || assigningTemplate !== null || certificateCourse !== null;
  const closeDrawer = useCallback(() => {
    if (!modalOpen) {
      setOpenCourse(null);
    }
  }, [modalOpen]);

  const refreshAfterTemplateChange = () => {
    setDrawerRefreshKey((current) => current + 1);
    reload();
  };

  const selectKind = (next: KindTab) => {
    setKind(next);
    if (next !== 'induction') {
      setPhase(null);
    }
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
      notifyWarning('El título de la capacitación es obligatorio.');
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
        const updated = await updateTrainingCourse(editingCourse.id, payload);
        notifySuccess('Capacitación actualizada correctamente.');
        if (openCourse?.id === editingCourse.id) {
          setOpenCourse(
            updated ?? {
              ...openCourse,
              title: payload.title,
              description: payload.description ?? null,
              certificate_validity_months: courseForm.certificate_validity_months,
            },
          );
        }
      } else {
        await createTrainingCourse(payload);
        notifySuccess('Capacitación creada correctamente.');
      }
      setIsCourseModalOpen(false);
      reload();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la capacitación.'));
    } finally {
      setSavingCourse(false);
    }
  };

  const handleDeleteCourse = async (course: TrainingCourse) => {
    const confirmed = await confirmAction(
      'Inactivar capacitación',
      `Inactivar la capacitación "${course.title}"?`,
      'Inactivar',
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteTrainingCourse(course.id);
      notifySuccess('Capacitación inactivada correctamente.');
      if (openCourse?.id === course.id) {
        setOpenCourse(null);
      }
      reload();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar la capacitación.'));
    }
  };

  const filtersActive = kind !== 'all' || search.trim() !== '';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-black text-[var(--color-brand-700)]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))] text-white shadow-[0_8px_18px_rgba(0,65,106,0.25)]">
            <GraduationCap size={22} />
          </span>
          Capacitaciones
        </h1>
        <button
          type="button"
          onClick={openCreateCourse}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,65,106,0.25)] transition hover:brightness-110"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Nueva capacitación</span>
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/70 p-3 shadow-[0_1px_2px_rgba(0,65,106,0.05)] backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código o título"
              className={`${inputClass} pl-9 pr-9`}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--unilabor-neutral)] transition hover:bg-[rgba(0,65,106,0.08)]"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[rgba(0,65,106,0.05)] p-1" role="tablist">
            {KIND_TABS.map(({ key, label, icon: Icon, count }) => {
              const active = kind === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectKind(key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                    active
                      ? 'bg-white text-[var(--color-brand-700)] shadow-[0_2px_8px_rgba(0,65,106,0.14)]'
                      : 'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      active ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(0,65,106,0.08)]'
                    }`}
                  >
                    {count(summary)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {kind === 'induction' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {[null, ...INDUCTION_PHASES].map((value) => {
              const active = phase === value;
              return (
                <button
                  key={value ?? 'all'}
                  type="button"
                  onClick={() => setPhase(value)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    active
                      ? 'bg-[var(--color-brand-700)] text-white shadow-sm'
                      : 'bg-[rgba(191,212,230,0.35)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.35)]'
                  }`}
                >
                  {value === null ? 'Todas' : `Fase ${value}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading && courses.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <TrainingCourseCardSkeleton key={index} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-sm text-[var(--unilabor-neutral)]">
          {filtersActive ? <SearchX size={32} className="text-[var(--color-brand-300)]" /> : <GraduationCap size={32} className="text-[var(--color-brand-300)]" />}
          {filtersActive ? 'Sin resultados' : 'Sin capacitaciones'}
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                selectKind('all');
              }}
              className="rounded-lg border border-[rgba(0,65,106,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
          {courses.map((course) => (
            <TrainingCourseCard
              key={course.id}
              course={course}
              onOpen={setOpenCourse}
              onDesignCertificate={setCertificateCourse}
              onEdit={openEditCourse}
              onDelete={(target) => void handleDeleteCourse(target)}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={pagination.limit}
        onPageChange={setPage}
        loading={loading}
      />

      {openCourse !== null && (
        <TrainingCourseDrawer
          course={openCourse}
          refreshKey={drawerRefreshKey}
          onClose={closeDrawer}
          onEditCourse={openEditCourse}
          onDesignCertificate={setCertificateCourse}
          onDeleteCourse={(target) => void handleDeleteCourse(target)}
          onEditTemplate={setEditingTemplateId}
          onAssignTemplate={setAssigningTemplate}
          onTemplatesChanged={reload}
        />
      )}

      {/* Modal capacitación */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 p-5 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <h2 className="mb-4 text-lg font-bold text-[var(--color-brand-700)]">
              {editingCourse ? 'Editar capacitación' : 'Nueva capacitación'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Título</label>
                <input
                  value={courseForm.title}
                  onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))}
                  className={inputClass}
                  placeholder="Bioseguridad en el laboratorio"
                />
              </div>
              <div>
                <label className={labelClass}>Descripción (opcional)</label>
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
                {editingCourse ? 'Guardar cambios' : 'Crear capacitación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor de evaluación + banco de preguntas */}
      {editingTemplateId !== null && (
        <EvaluationTemplateEditorModal
          templateId={editingTemplateId}
          onClose={() => setEditingTemplateId(null)}
          onSaved={refreshAfterTemplateChange}
        />
      )}

      {assigningTemplate !== null && (
        <AssignEvaluationModal
          template={assigningTemplate}
          onClose={() => setAssigningTemplate(null)}
          onAssigned={() => setDrawerRefreshKey((current) => current + 1)}
        />
      )}

      {certificateCourse !== null && (
        <CertificateDesignerModal
          courseId={certificateCourse.id}
          courseTitle={certificateCourse.title}
          onClose={() => setCertificateCourse(null)}
        />
      )}
    </div>
  );
};
