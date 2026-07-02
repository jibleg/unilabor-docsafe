import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, ClipboardCheck, Loader2, Save, Search } from 'lucide-react';
import {
  capturePracticalResults,
  getApiErrorMessage,
  getEvaluationTemplate,
  getTrainingCourse,
  listEmployees,
  listTemplateAssignments,
  listTrainingCoursesPaginated,
  type PracticalCaptureSummary,
} from '../api/service';
import type { Employee, EvaluationTemplate, TrainingCourse } from '../types/models';

/** Captura previa de un colaborador en esta practica (para mostrar "ya calificado"). */
interface PriorCapture {
  score: number;
  passed: boolean;
}
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Nota valida: numero entre 0 y 10 (admite un decimal). */
const parseScore = (raw: string): number | null => {
  if (raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    return null;
  }
  return value;
};

export const RhPracticalCapturePage = () => {
  const [searchParams] = useSearchParams();
  const templateParam = searchParams.get('template');

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [practicalTemplates, setPracticalTemplates] = useState<EvaluationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [capturedAt, setCapturedAt] = useState<string>(todayIso());

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [scores, setScores] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<PracticalCaptureSummary | null>(null);
  const [priorByEmployee, setPriorByEmployee] = useState<Record<number, PriorCapture>>({});

  // Carga inicial: capacitaciones + colaboradores. Si viene ?template=, preselecciona.
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [coursesResult, emps] = await Promise.all([
          listTrainingCoursesPaginated({ page: 1, limit: 200 }),
          listEmployees(),
        ]);
        if (!active) {
          return;
        }
        setCourses(coursesResult.data);
        setEmployees(emps);
        if (templateParam) {
          const template = await getEvaluationTemplate(Number(templateParam));
          if (active && template && template.evaluation_type === 'practical') {
            setSelectedCourseId(template.training_course_id);
            setSelectedTemplateId(template.id);
          }
        }
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudieron cargar los datos de captura.'));
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
  }, [templateParam]);

  // Al elegir capacitacion, carga sus evaluaciones practicas.
  const loadPracticalTemplates = useCallback(
    async (courseId: number, keepTemplateId?: number | null) => {
      try {
        const detail = await getTrainingCourse(courseId);
        const practical = (detail?.templates ?? []).filter(
          (template) => template.evaluation_type === 'practical' && template.is_active,
        );
        setPracticalTemplates(practical);
        // Conserva la seleccion si sigue siendo valida; si no, la limpia.
        setSelectedTemplateId((current) => {
          const target = keepTemplateId ?? current;
          return target && practical.some((t) => t.id === target) ? target : null;
        });
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evaluaciones prácticas.'));
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedCourseId !== null) {
      void loadPracticalTemplates(selectedCourseId, selectedTemplateId);
    } else {
      setPracticalTemplates([]);
      setSelectedTemplateId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, loadPracticalTemplates]);

  // Capturas previas de la practica seleccionada (para avisar "ya calificado").
  const loadPriorCaptures = useCallback(async (templateId: number) => {
    try {
      const result = await listTemplateAssignments(templateId, { page: 1, limit: 200 });
      const map: Record<number, PriorCapture> = {};
      // El backend ordena por mas reciente primero: se conserva la primera por colaborador.
      for (const assignment of result.data) {
        if (map[assignment.employee_id]) {
          continue;
        }
        map[assignment.employee_id] = {
          score: assignment.percentage !== null ? assignment.percentage / 10 : 0,
          passed: assignment.status === 'passed',
        };
      }
      setPriorByEmployee(map);
    } catch {
      setPriorByEmployee({});
    }
  }, []);

  useEffect(() => {
    if (selectedTemplateId !== null) {
      void loadPriorCaptures(selectedTemplateId);
    } else {
      setPriorByEmployee({});
    }
  }, [selectedTemplateId, loadPriorCaptures]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return employees;
    }
    return employees.filter((employee) =>
      [employee.full_name, employee.employee_code, employee.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [employees, search]);

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const setScore = (id: number, value: string) =>
    setScores((current) => ({ ...current, [id]: value }));

  const selectedCount = selected.size;

  const handleSave = async () => {
    if (!selectedTemplateId) {
      notifyWarning('Selecciona la capacitación y su evaluación práctica.');
      return;
    }
    if (selectedCount === 0) {
      notifyWarning('Selecciona al menos un colaborador.');
      return;
    }
    const results: { employee_id: number; score: number }[] = [];
    for (const employeeId of selected) {
      const parsed = parseScore(scores[employeeId] ?? '');
      if (parsed === null) {
        const employee = employees.find((e) => e.id === employeeId);
        notifyWarning(`Captura una calificación válida (0–10) para ${employee?.full_name ?? 'el colaborador'}.`);
        return;
      }
      results.push({ employee_id: employeeId, score: parsed });
    }

    setSaving(true);
    setSummary(null);
    try {
      const result = await capturePracticalResults(selectedTemplateId, results, capturedAt);
      setSummary(result);
      notifySuccess(
        `Registradas ${results.length} calificación(es): ${result.acreditados} acreditada(s), ` +
          `${result.constancias_emitidas} constancia(s) emitida(s)` +
          `${result.reemplazados > 0 ? `, ${result.reemplazados} corregida(s)` : ''}.`,
      );
      setSelected(new Set());
      setScores({});
      // Refresca las capturas previas para reflejar lo recien registrado.
      if (selectedTemplateId) {
        void loadPriorCaptures(selectedTemplateId);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron registrar las calificaciones.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          Capacitación y competencia
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <ClipboardCheck size={24} /> Capacitación práctica
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Captura la calificación (0–10) de una capacitación presencial. Con nota ≥ 8 se genera y archiva la
          constancia en el expediente del colaborador.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando...
        </div>
      ) : (
        <>
          {/* Seleccion de capacitacion, evaluacion practica y fecha */}
          <section className="grid grid-cols-1 gap-4 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-5 md:grid-cols-3">
            <div>
              <label className={labelClass}>Capacitación</label>
              <select
                value={selectedCourseId ?? ''}
                onChange={(event) =>
                  setSelectedCourseId(event.target.value ? Number(event.target.value) : null)
                }
                className={inputClass}
              >
                <option value="">Selecciona…</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Evaluación práctica</label>
              <select
                value={selectedTemplateId ?? ''}
                onChange={(event) =>
                  setSelectedTemplateId(event.target.value ? Number(event.target.value) : null)
                }
                disabled={selectedCourseId === null}
                className={inputClass}
              >
                <option value="">
                  {selectedCourseId === null
                    ? 'Elige una capacitación'
                    : practicalTemplates.length === 0
                      ? 'Sin evaluaciones prácticas'
                      : 'Selecciona…'}
                </option>
                {practicalTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Fecha de la capacitación</label>
              <input
                type="date"
                value={capturedAt}
                max={todayIso()}
                onChange={(event) => setCapturedAt(event.target.value)}
                className={inputClass}
              />
            </div>
          </section>

          {selectedCourseId !== null && practicalTemplates.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Esta capacitación no tiene evaluaciones prácticas. Crea una desde{' '}
              <strong>Capacitaciones → Nueva práctica</strong>.
            </div>
          )}

          {/* Resumen del ultimo registro */}
          {summary && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Award size={16} /> {summary.constancias_emitidas} constancia(s) emitida(s)
                </span>
                <span>{summary.acreditados} acreditado(s)</span>
                <span>{summary.no_acreditados} no acreditado(s)</span>
                {summary.reemplazados > 0 && <span>{summary.reemplazados} corregida(s)</span>}
              </div>
            </div>
          )}

          {/* Lista de colaboradores con captura de nota */}
          <section className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-5">
            <div className="relative mb-3">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar colaborador..."
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="max-h-[46vh] space-y-1 overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--unilabor-neutral)]">Sin colaboradores.</p>
              ) : (
                filteredEmployees.map((employee) => {
                  const checked = selected.has(employee.id);
                  const scoreValue = scores[employee.id] ?? '';
                  const invalid = checked && parseScore(scoreValue) === null;
                  const prior = priorByEmployee[employee.id];
                  return (
                    <div
                      key={employee.id}
                      className={`flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] px-3 py-2 text-sm ${
                        checked ? 'bg-[rgba(191,212,230,0.2)]' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(employee.id)}
                        className="h-4 w-4 accent-[var(--color-brand-500)]"
                        aria-label={`Seleccionar ${employee.full_name}`}
                      />
                      <span className="flex-1">
                        <span className="font-medium text-[var(--unilabor-ink)]">{employee.full_name}</span>
                        <span className="ml-2 text-xs text-[var(--unilabor-neutral)]">{employee.employee_code}</span>
                        {prior && (
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              prior.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}
                            title="Ya tiene una calificación registrada en esta práctica. Recapturar la corrige."
                          >
                            Ya: {prior.score}/10 {prior.passed ? 'acreditada' : 'no acred.'}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={scoreValue}
                          onChange={(event) => setScore(employee.id, event.target.value)}
                          onFocus={() => {
                            if (!checked) toggle(employee.id);
                          }}
                          placeholder="Nota"
                          className={`w-20 rounded-lg border px-2 py-1.5 text-sm outline-none transition ${
                            invalid
                              ? 'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-200'
                              : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                          }`}
                        />
                        <span className="text-xs text-[var(--unilabor-neutral)]">/10</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            <span className="mr-auto text-xs text-[var(--unilabor-neutral)]">{selectedCount} seleccionado(s)</span>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !selectedTemplateId || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar y emitir constancias
            </button>
          </div>
        </>
      )}
    </div>
  );
};
