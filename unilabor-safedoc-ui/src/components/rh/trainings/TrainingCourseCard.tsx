import { Award, Briefcase, CalendarClock, CheckCircle2, FilePen, GraduationCap, ListChecks, Pencil, Trash2 } from 'lucide-react';
import type { TrainingCourse } from '../../../types/models';
import {
  courseDisplayTitle,
  draftTemplateCount,
  inductionPhaseOf,
  isInductionCourse,
  validityLongLabel,
  validityShortLabel,
} from '../../../utils/trainingCatalog';

interface TrainingCourseCardProps {
  course: TrainingCourse;
  onOpen: (course: TrainingCourse) => void;
  onDesignCertificate: (course: TrainingCourse) => void;
  onEdit: (course: TrainingCourse) => void;
  onDelete: (course: TrainingCourse) => void;
}

const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]';

/** Tarjeta del catalogo: icono + titulo como protagonistas, metadatos en chips con icono. */
export const TrainingCourseCard = ({ course, onOpen, onDesignCertificate, onEdit, onDelete }: TrainingCourseCardProps) => {
  const induction = isInductionCourse(course);
  const phase = inductionPhaseOf(course);
  const drafts = draftTemplateCount(course);
  const templates = course.template_count ?? 0;
  const KindIcon = induction ? Briefcase : GraduationCap;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(course)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(course);
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 p-4 shadow-[0_1px_2px_rgba(0,65,106,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-brand-300)] hover:shadow-[0_14px_30px_rgba(0,65,106,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-300)]"
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${
          induction
            ? 'bg-[linear-gradient(90deg,var(--color-brand-700),var(--color-brand-300))]'
            : 'bg-[linear-gradient(90deg,#2f7a4d,#7fc8a0)]'
        }`}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_6px_14px_rgba(0,65,106,0.2)] ${
            induction
              ? 'bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))]'
              : 'bg-[linear-gradient(135deg,#4fae7c,#2f7a4d)]'
          }`}
        >
          <KindIcon size={20} />
        </span>
        <div
          className="flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => onDesignCertificate(course)} className={iconButtonClass} title="Constancia" aria-label="Diseñar constancia">
            <Award size={15} />
          </button>
          <button type="button" onClick={() => onEdit(course)} className={iconButtonClass} title="Editar" aria-label="Editar capacitación">
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(course)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
            title="Inactivar"
            aria-label="Inactivar capacitación"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-bold leading-snug text-[var(--color-brand-700)]" title={course.title}>
          {courseDisplayTitle(course)}
        </h3>
        <p className="mt-1 truncate font-mono text-[11px] text-[var(--unilabor-neutral)]">{course.code}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        {phase !== null && (
          <span className="rounded-full bg-[rgba(191,212,230,0.45)] px-2 py-0.5 text-[var(--color-brand-700)]" title="Programa de Inducción">
            Fase {phase}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,65,106,0.06)] px-2 py-0.5 text-[var(--color-brand-700)]"
          title={`${templates} evaluación(es)`}
        >
          <ListChecks size={12} /> {templates}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,65,106,0.06)] px-2 py-0.5 text-[var(--color-brand-700)]"
          title={validityLongLabel(course.certificate_validity_months)}
        >
          <CalendarClock size={12} /> {validityShortLabel(course.certificate_validity_months)}
        </span>
        <span className="ml-auto">
          {templates === 0 ? null : drafts > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700" title={`${drafts} en borrador`}>
              <FilePen size={12} /> {drafts}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700" title="Publicada">
              <CheckCircle2 size={12} />
            </span>
          )}
        </span>
      </div>
    </article>
  );
};

/** Esqueleto de carga con la misma huella que la tarjeta. */
export const TrainingCourseCardSkeleton = () => (
  <div className="flex animate-pulse flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/80 p-4">
    <span className="h-11 w-11 rounded-xl bg-[rgba(0,65,106,0.08)]" />
    <span className="h-4 w-4/5 rounded bg-[rgba(0,65,106,0.08)]" />
    <span className="h-3 w-1/3 rounded bg-[rgba(0,65,106,0.06)]" />
    <span className="h-5 w-1/2 rounded-full bg-[rgba(0,65,106,0.06)]" />
  </div>
);
