import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleDashed, GraduationCap, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../../api/service';
import {
  linkPositionTrainingCourse,
  listLinkableTrainingCourses,
  listPositionTrainingCourses,
  unlinkPositionTrainingCourse,
} from '../../api/service.api-rh-position';
import type { PositionTrainingCourse, TrainingCourseOption } from '../../types/models';
import { confirmAction } from '../../utils/confirm';
import { SearchableSelect } from '../SearchableSelect';

interface PositionTrainingCoursesPanelProps {
  positionId: number;
  positionName: string;
  /** Desplaza la vista a este apartado y lo resalta (p. ej. al llegar desde la evaluación de competencia). */
  focus?: boolean;
}

/**
 * Capacitaciones del puesto (Fase 7): las que se liguen aquí aparecen como
 * fuente de la sección 3 "Conocimiento" en la evaluación de competencia
 * (REH-REG-003) de quien tenga este puesto.
 */
export const PositionTrainingCoursesPanel = ({ positionId, positionName, focus = false }: PositionTrainingCoursesPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [linked, setLinked] = useState<PositionTrainingCourse[]>([]);
  const [catalog, setCatalog] = useState<TrainingCourseOption[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courses, options] = await Promise.all([listPositionTrainingCourses(positionId), listLinkableTrainingCourses()]);
      setLinked(courses);
      setCatalog(options);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar las capacitaciones del puesto.'));
    } finally {
      setLoading(false);
    }
  }, [positionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focus && !loading) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focus, loading]);

  const options = useMemo(() => {
    const taken = new Set(linked.map((course) => course.course_id));
    return catalog
      .filter((course) => !taken.has(course.id))
      .map((course) => ({
        value: String(course.id),
        label: `${course.code} · ${course.title}`,
        hint: course.has_published_quiz ? 'Con cuestionario publicado' : 'Sin cuestionario publicado',
      }));
  }, [catalog, linked]);

  const handleLink = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      setLinked(await linkPositionTrainingCourse(positionId, Number(selected)));
      setSelected('');
      toast.success('Capacitación ligada al puesto.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo ligar la capacitación.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (course: PositionTrainingCourse) => {
    const ok = await confirmAction(
      'Desligar capacitación',
      `"${course.course_title}" dejará de ofrecerse como fuente de Conocimiento para ${positionName}. Las evaluaciones que ya la usan no se modifican.`,
      'Desligar',
      'danger',
    );
    if (!ok) return;
    try {
      setLinked(await unlinkPositionTrainingCourse(course.link_id));
      toast.success('Capacitación desligada.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo desligar la capacitación.'));
    }
  };

  return (
    <div ref={containerRef} className={focus ? 'rounded-xl p-3 ring-2 ring-amber-300 ring-offset-2 transition' : ''}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <GraduationCap size={15} /> Capacitaciones del puesto · Fase 7 ({linked.length})
      </h3>
      <p className="mb-2 text-xs text-[var(--unilabor-neutral)]">
        Su evaluación se usa como sección 3 "Conocimiento" del REH-REG-003 de este puesto.
      </p>
      {loading ? (
        <p className="text-xs text-[var(--unilabor-neutral)]">Cargando…</p>
      ) : (
        <div className="space-y-1.5">
          {linked.map((course) => (
            <div
              key={course.link_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-1.5 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate text-[var(--unilabor-ink)]">
                  <span className="mr-1 font-mono text-[11px] text-[var(--unilabor-neutral)]">{course.course_code}</span>
                  {course.course_title}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] ${course.published_template_id ? 'text-emerald-700' : 'text-amber-700'}`}
                >
                  {course.published_template_id ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                  {course.published_template_id
                    ? `Cuestionario publicado · ${course.question_count} pregunta(s)`
                    : 'Sin cuestionario publicado: publícalo en Capacitaciones'}
                </span>
              </span>
              <button type="button" onClick={() => void handleUnlink(course)} className="shrink-0 text-rose-500 hover:text-rose-700" title="Desligar">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {linked.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[rgba(0,65,106,0.14)] px-3 py-2 text-xs text-[var(--unilabor-neutral)]">
              Sin capacitaciones ligadas.
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            value={selected}
            options={options}
            onChange={setSelected}
            placeholder="Ligar una capacitación…"
            searchPlaceholder="Buscar por código o nombre"
            emptyLabel="Sin capacitaciones disponibles"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleLink()}
          disabled={!selected || saving}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
    </div>
  );
};
