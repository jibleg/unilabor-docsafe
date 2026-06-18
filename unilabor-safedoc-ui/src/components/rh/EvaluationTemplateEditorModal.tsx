import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import {
  getApiErrorMessage,
  getEvaluationTemplate,
  replaceTemplateQuestions,
  updateEvaluationTemplate,
} from '../../api/service';
import type {
  EvaluationQuestion,
  EvaluationQuestionType,
  EvaluationSelectionMode,
  EvaluationTemplate,
} from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';

interface EvaluationTemplateEditorModalProps {
  templateId: number;
  onClose: () => void;
  onSaved: () => void;
}

const QUESTION_TYPE_LABELS: Record<EvaluationQuestionType, string> = {
  single: 'Opción única',
  multiple: 'Opción múltiple',
  boolean: 'Verdadero / Falso',
  open: 'Abierta (califica RH)',
};

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const emptyQuestion = (type: EvaluationQuestionType = 'single'): EvaluationQuestion => ({
  type,
  text: '',
  points: 1,
  options:
    type === 'open'
      ? []
      : type === 'boolean'
        ? [
            { text: 'Verdadero', is_correct: true },
            { text: 'Falso', is_correct: false },
          ]
        : [
            { text: '', is_correct: true },
            { text: '', is_correct: false },
          ],
});

/** Valida el banco con las mismas reglas del backend (evita un 400). */
const validateQuestions = (questions: EvaluationQuestion[]): string | null => {
  if (questions.length === 0) {
    return 'La evaluación debe tener al menos una pregunta.';
  }
  for (const [index, question] of questions.entries()) {
    const position = index + 1;
    if (!question.text.trim()) {
      return `La pregunta ${position} no tiene texto.`;
    }
    if (question.type === 'open') {
      continue;
    }
    if (question.options.length < 2) {
      return `La pregunta ${position} requiere al menos 2 opciones.`;
    }
    if (question.options.some((option) => !option.text.trim())) {
      return `La pregunta ${position} tiene opciones sin texto.`;
    }
    const correct = question.options.filter((option) => option.is_correct).length;
    if ((question.type === 'single' || question.type === 'boolean') && correct !== 1) {
      return `La pregunta ${position} debe tener exactamente una opción correcta.`;
    }
    if (question.type === 'multiple' && correct < 1) {
      return `La pregunta ${position} debe tener al menos una opción correcta.`;
    }
  }
  return null;
};

export const EvaluationTemplateEditorModal = ({
  templateId,
  onClose,
  onSaved,
}: EvaluationTemplateEditorModalProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<EvaluationTemplate | null>(null);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await getEvaluationTemplate(templateId);
        if (!active) {
          return;
        }
        setTemplate(detail);
        setQuestions(detail?.questions ?? []);
      } catch (error) {
        if (active) {
          notifyError(getApiErrorMessage(error, 'No se pudo cargar la evaluación.'));
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
  }, [templateId]);

  const patchTemplate = (patch: Partial<EvaluationTemplate>) =>
    setTemplate((current) => (current ? { ...current, ...patch } : current));

  const updateQuestion = (index: number, patch: Partial<EvaluationQuestion>) =>
    setQuestions((current) => current.map((question, i) => (i === index ? { ...question, ...patch } : question)));

  const changeQuestionType = (index: number, type: EvaluationQuestionType) =>
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...emptyQuestion(type), text: question.text, points: question.points } : question,
      ),
    );

  const updateOption = (qIndex: number, oIndex: number, patch: Partial<EvaluationQuestion['options'][number]>) =>
    setQuestions((current) =>
      current.map((question, i) => {
        if (i !== qIndex) {
          return question;
        }
        const options = question.options.map((option, j) => (j === oIndex ? { ...option, ...patch } : option));
        return { ...question, options };
      }),
    );

  const toggleCorrect = (qIndex: number, oIndex: number) =>
    setQuestions((current) =>
      current.map((question, i) => {
        if (i !== qIndex) {
          return question;
        }
        // single/boolean: exclusivo; multiple: acumulativo.
        const exclusive = question.type === 'single' || question.type === 'boolean';
        const options = question.options.map((option, j) => ({
          ...option,
          is_correct: exclusive ? j === oIndex : j === oIndex ? !option.is_correct : option.is_correct,
        }));
        return { ...question, options };
      }),
    );

  const addOption = (qIndex: number) =>
    setQuestions((current) =>
      current.map((question, i) =>
        i === qIndex ? { ...question, options: [...question.options, { text: '', is_correct: false }] } : question,
      ),
    );

  const removeOption = (qIndex: number, oIndex: number) =>
    setQuestions((current) =>
      current.map((question, i) =>
        i === qIndex ? { ...question, options: question.options.filter((_, j) => j !== oIndex) } : question,
      ),
    );

  const contentRef = useRef<HTMLDivElement>(null);

  const addQuestion = () => {
    setQuestions((current) => [...current, emptyQuestion()]);
    // La pregunta nueva se agrega al final; desplaza para que quede visible.
    requestAnimationFrame(() => {
      const container = contentRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    });
  };
  const removeQuestion = (index: number) =>
    setQuestions((current) => current.filter((_, i) => i !== index));

  const hasOpenQuestions = useMemo(() => questions.some((question) => question.type === 'open'), [questions]);

  const handleSave = async () => {
    if (!template) {
      return;
    }
    if (!template.title.trim()) {
      notifyWarning('El título de la evaluación es obligatorio.');
      return;
    }
    if (
      template.selection_mode === 'random' &&
      (!template.random_count || template.random_count > questions.length)
    ) {
      notifyWarning('En modo aleatorio, la cantidad debe ser mayor a 0 y no superar el total de preguntas.');
      return;
    }
    const validationError = validateQuestions(questions);
    if (validationError) {
      notifyWarning(validationError);
      return;
    }

    setSaving(true);
    try {
      await updateEvaluationTemplate(template.id, {
        title: template.title.trim(),
        instructions: template.instructions,
        passing_score: template.passing_score,
        window_hours: template.window_hours,
        selection_mode: template.selection_mode,
        random_count: template.selection_mode === 'random' ? template.random_count : null,
        status: template.status,
      });
      await replaceTemplateQuestions(template.id, questions);
      notifySuccess('Evaluación guardada correctamente.');
      onSaved();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la evaluación.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Diseño de evaluación
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
              {template?.title || 'Evaluación'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!loading && template && (
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
              >
                <Plus size={14} /> Agregar pregunta
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {loading || !template ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 className="mr-2 animate-spin" size={18} /> Cargando evaluación...
          </div>
        ) : (
          <div ref={contentRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* Configuracion de la evaluacion */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Título</label>
                <input
                  value={template.title}
                  onChange={(event) => patchTemplate({ title: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Instrucciones (opcional)</label>
                <textarea
                  value={template.instructions ?? ''}
                  onChange={(event) => patchTemplate({ instructions: event.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Calificación mínima (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={template.passing_score}
                  onChange={(event) => patchTemplate({ passing_score: Number(event.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ventana para responder (horas)</label>
                <input
                  type="number"
                  min={1}
                  value={template.window_hours}
                  onChange={(event) => patchTemplate({ window_hours: Number(event.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Entrega de preguntas</label>
                <select
                  value={template.selection_mode}
                  onChange={(event) =>
                    patchTemplate({ selection_mode: event.target.value as EvaluationSelectionMode })
                  }
                  className={inputClass}
                >
                  <option value="all">Todo el banco</option>
                  <option value="random">Subconjunto aleatorio</option>
                </select>
              </div>
              {template.selection_mode === 'random' && (
                <div>
                  <label className={labelClass}>Preguntas a entregar (de {questions.length})</label>
                  <input
                    type="number"
                    min={1}
                    max={questions.length}
                    value={template.random_count ?? ''}
                    onChange={(event) => patchTemplate({ random_count: Number(event.target.value) })}
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Estado</label>
                <select
                  value={template.status}
                  onChange={(event) =>
                    patchTemplate({ status: event.target.value as EvaluationTemplate['status'] })
                  }
                  className={inputClass}
                >
                  <option value="draft">Borrador</option>
                  <option value="published">Publicada</option>
                </select>
              </div>
            </section>

            {hasOpenQuestions && (
              <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
                Esta evaluación incluye preguntas abiertas: la calificación final requerirá la revisión de RH.
              </div>
            )}

            {/* Banco de preguntas */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                  Banco de preguntas ({questions.length})
                </h3>
              </div>

              {questions.map((question, qIndex) => (
                <div
                  key={qIndex}
                  className="space-y-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.7)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="mt-2 text-xs font-bold text-[var(--color-brand-500)]">#{qIndex + 1}</span>
                    <div className="flex-1">
                      <textarea
                        value={question.text}
                        onChange={(event) => updateQuestion(qIndex, { text: event.target.value })}
                        rows={2}
                        placeholder="Escribe la pregunta..."
                        className={inputClass}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIndex)}
                      className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                      aria-label="Eliminar pregunta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Tipo</label>
                      <select
                        value={question.type}
                        onChange={(event) => changeQuestionType(qIndex, event.target.value as EvaluationQuestionType)}
                        className={inputClass}
                      >
                        {(Object.keys(QUESTION_TYPE_LABELS) as EvaluationQuestionType[]).map((type) => (
                          <option key={type} value={type}>
                            {QUESTION_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Puntos</label>
                      <input
                        type="number"
                        min={1}
                        value={question.points}
                        onChange={(event) => updateQuestion(qIndex, { points: Number(event.target.value) })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {question.type !== 'open' && (
                    <div className="space-y-2">
                      <label className={labelClass}>Opciones (marca la correcta)</label>
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-2">
                          <input
                            type={question.type === 'multiple' ? 'checkbox' : 'radio'}
                            checked={option.is_correct}
                            onChange={() => toggleCorrect(qIndex, oIndex)}
                            className="h-4 w-4 accent-[var(--color-brand-500)]"
                            aria-label="Marcar correcta"
                          />
                          <input
                            value={option.text}
                            onChange={(event) => updateOption(qIndex, oIndex, { text: event.target.value })}
                            placeholder={`Opción ${oIndex + 1}`}
                            className={inputClass}
                            disabled={question.type === 'boolean'}
                          />
                          {question.type !== 'boolean' && question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(qIndex, oIndex)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                              aria-label="Eliminar opcion"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {question.type !== 'boolean' && (
                        <button
                          type="button"
                          onClick={() => addOption(qIndex)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]"
                        >
                          <Plus size={13} /> Agregar opción
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
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
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar evaluación
          </button>
        </div>
      </div>
    </div>
  );
};
