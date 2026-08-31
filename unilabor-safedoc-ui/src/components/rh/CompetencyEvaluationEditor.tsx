import { useEffect, useState } from 'react';
import { AlertTriangle, Check, FileCheck2, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  closeCompetencyEvaluation,
  replaceCompetencyActions,
  replaceCompetencySectionItems,
  type CompetencyActionPayload,
  type CompetencySectionItemPayload,
} from '../../api/service.api-rh-competency';
import { getApiErrorMessage } from '../../api/service.parsers';
import { DICTAMEN_UI, formatDateOnly } from '../../utils/competency';
import { SignaturePad } from '../helpdesk/SignaturePad';
import type {
  RhCompetencyCriticality,
  RhCompetencyEvaluation,
  RhCompetencyEvaluationItem,
  RhCompetencySection,
} from '../../types/models';

interface CompetencyEvaluationEditorProps {
  evaluation: RhCompetencyEvaluation;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const buttonClass =
  'inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';

const CRITICALITY_LABELS: Record<RhCompetencyCriticality, string> = {
  A: 'A — Alta (5)',
  M: 'M — Media (3)',
  B: 'B — Baja (1)',
};

const METHOD_LABELS: Record<string, string> = {
  OD: 'OD — Observación directa',
  RR: 'RR — Revisión de registro',
  ES: 'ES — Examen escrito',
  EP: 'EP — Examen práctico',
  SI: 'SI — Simulación',
};


const SECTION_META: Record<RhCompetencySection, { title: string; weight: string; hint: string }> = {
  COMPETENCIA: {
    title: '1. Competencia',
    weight: '50%',
    hint: 'Precargada del catálogo del puesto. Califica 1-4; una criticidad ALTA con menos de 3 aplica VETO.',
  },
  DESEMPENO: {
    title: '2. Desempeño',
    weight: '20%',
    hint: 'Los 7 criterios institucionales. Sustenta cada calificación en evidencia objetiva.',
  },
  CONOCIMIENTO: {
    title: '3. Conocimiento',
    weight: '30%',
    hint: 'Captura las preguntas (10 sugeridas) y marca si la respuesta del evaluado fue correcta.',
  },
};

const toPayload = (item: RhCompetencyEvaluationItem): CompetencySectionItemPayload => ({
  item_text: item.item_text,
  criticality: item.criticality,
  method: item.method,
  score: item.score,
  expected_answer: item.expected_answer,
  given_answer: item.given_answer,
  is_correct: item.is_correct,
  observations: item.observations,
});

const SectionEditor = ({
  evaluation,
  section,
  readOnly,
  onChanged,
}: {
  evaluation: RhCompetencyEvaluation;
  section: RhCompetencySection;
  readOnly: boolean;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}) => {
  const meta = SECTION_META[section];
  const [items, setItems] = useState<RhCompetencyEvaluationItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems((evaluation.items ?? []).filter((item) => item.section === section));
    setDirty(false);
  }, [evaluation.id, evaluation.items, section]);

  const patchItem = (index: number, patch: Partial<RhCompetencyEvaluationItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        section,
        item_text: '',
        criticality: 'M',
        method: section === 'COMPETENCIA' ? 'OD' : null,
        score: null,
        expected_answer: null,
        given_answer: null,
        is_correct: null,
        observations: null,
        sort_order: current.length,
      },
    ]);
    setDirty(true);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSave = async () => {
    if (items.some((item) => !item.item_text.trim())) {
      toast.warning('Hay items sin texto en la sección.');
      return;
    }
    setSaving(true);
    try {
      const updated = await replaceCompetencySectionItems(evaluation.id, section, items.map(toPayload));
      toast.success(`Sección "${meta.title}" guardada.`);
      onChanged(updated);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo guardar la sección.'));
    } finally {
      setSaving(false);
    }
  };

  const scoredCount = items.filter((item) =>
    section === 'CONOCIMIENTO' ? item.is_correct !== null : item.score !== null,
  ).length;

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-brand-700)]">
            {meta.title} · peso {meta.weight} · {scoredCount}/{items.length} calificados
          </h3>
          <p className="text-xs text-[var(--unilabor-neutral)]">{meta.hint}</p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline">
              <Plus size={13} /> Agregar
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !dirty} className={buttonClass}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar sección
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-center text-xs text-[var(--unilabor-neutral)]">
            Sin items todavía.
          </p>
        )}
        {items.map((item, index) => {
          const vetoHit = section === 'COMPETENCIA' && item.criticality === 'A' && item.score !== null && item.score < 3;
          return (
            <div key={index} className={`rounded-xl border p-3 ${vetoHit ? 'border-rose-300 bg-rose-50/60' : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.8)]'}`}>
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-bold text-[var(--color-brand-500)]">#{index + 1}</span>
                <textarea
                  value={item.item_text}
                  onChange={(event) => patchItem(index, { item_text: event.target.value })}
                  rows={1}
                  disabled={readOnly}
                  placeholder={section === 'CONOCIMIENTO' ? 'Pregunta...' : 'Competencia / criterio a evaluar...'}
                  className={inputClass}
                />
                {!readOnly && (
                  <button type="button" onClick={() => removeItem(index)} className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50" aria-label="Eliminar item">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className={labelClass}>Criticidad</label>
                  <select value={item.criticality} onChange={(event) => patchItem(index, { criticality: event.target.value as RhCompetencyCriticality })} disabled={readOnly} className={inputClass}>
                    {(Object.keys(CRITICALITY_LABELS) as RhCompetencyCriticality[]).map((key) => (
                      <option key={key} value={key}>{CRITICALITY_LABELS[key]}</option>
                    ))}
                  </select>
                </div>
                {section === 'COMPETENCIA' && (
                  <div>
                    <label className={labelClass}>Método</label>
                    <select value={item.method ?? ''} onChange={(event) => patchItem(index, { method: event.target.value || null })} disabled={readOnly} className={inputClass}>
                      <option value="">—</option>
                      {Object.keys(METHOD_LABELS).map((key) => (
                        <option key={key} value={key}>{METHOD_LABELS[key]}</option>
                      ))}
                    </select>
                  </div>
                )}
                {section !== 'CONOCIMIENTO' ? (
                  <div>
                    <label className={labelClass}>Calificación (1-4)</label>
                    <select
                      value={item.score ?? ''}
                      onChange={(event) => patchItem(index, { score: event.target.value ? Number(event.target.value) : null })}
                      disabled={readOnly}
                      className={inputClass}
                    >
                      <option value="">Sin calificar</option>
                      <option value="4">4 — Domina y actúa sin supervisión</option>
                      <option value="3">3 — Correcto con orientación ocasional</option>
                      <option value="2">2 — Parcial, requiere supervisión</option>
                      <option value="1">1 — No demuestra la habilidad</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Resultado</label>
                    <select
                      value={item.is_correct === null ? '' : item.is_correct ? 'true' : 'false'}
                      onChange={(event) => patchItem(index, { is_correct: event.target.value === '' ? null : event.target.value === 'true' })}
                      disabled={readOnly}
                      className={inputClass}
                    >
                      <option value="">Sin calificar</option>
                      <option value="true">Correcta (4)</option>
                      <option value="false">Incorrecta (1)</option>
                    </select>
                  </div>
                )}
                <div className={section === 'COMPETENCIA' ? '' : 'sm:col-span-2'}>
                  <label className={labelClass}>Observaciones / evidencia</label>
                  <input value={item.observations ?? ''} onChange={(event) => patchItem(index, { observations: event.target.value || null })} disabled={readOnly} placeholder="Qué se observó, cuándo, en qué actividad" className={inputClass} />
                </div>
              </div>

              {section === 'CONOCIMIENTO' && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Respuesta correcta</label>
                    <input value={item.expected_answer ?? ''} onChange={(event) => patchItem(index, { expected_answer: event.target.value || null })} disabled={readOnly} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Respuesta del evaluado</label>
                    <input value={item.given_answer ?? ''} onChange={(event) => patchItem(index, { given_answer: event.target.value || null })} disabled={readOnly} className={inputClass} />
                  </div>
                </div>
              )}

              {vetoHit && (
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-700">
                  <AlertTriangle size={13} /> VETO: competencia de criticidad ALTA con calificación menor a 3 — el dictamen será NO COMPETENTE.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ActionsEditor = ({
  evaluation,
  readOnly,
  onChanged,
}: {
  evaluation: RhCompetencyEvaluation;
  readOnly: boolean;
  onChanged: (updated: RhCompetencyEvaluation) => void;
}) => {
  const [actions, setActions] = useState<CompetencyActionPayload[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setActions(
      (evaluation.actions ?? []).map((action) => ({
        improvement_area: action.improvement_area,
        required_action: action.required_action,
        responsible: action.responsible,
        due_date: action.due_date,
        follow_up: action.follow_up,
      })),
    );
    setDirty(false);
  }, [evaluation.id, evaluation.actions]);

  const patch = (index: number, patchValue: Partial<CompetencyActionPayload>) => {
    setActions((current) => current.map((action, i) => (i === index ? { ...action, ...patchValue } : action)));
    setDirty(true);
  };

  const handleSave = async () => {
    if (actions.some((action) => !action.improvement_area.trim() || !action.required_action.trim())) {
      toast.warning('Cada acción necesita la oportunidad de mejora y la acción requerida.');
      return;
    }
    setSaving(true);
    try {
      const updated = await replaceCompetencyActions(evaluation.id, actions);
      toast.success('Plan de acciones guardado.');
      onChanged(updated);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo guardar el plan de acciones.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-brand-700)]">Plan de acciones</h3>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            Obligatorio cuando el dictamen no es "Competente y autorizado".
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActions((current) => [...current, { improvement_area: '', required_action: '', responsible: null, due_date: null, follow_up: null }]);
                setDirty(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
            >
              <Plus size={13} /> Agregar
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !dirty} className={buttonClass}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar plan
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {actions.length === 0 && (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-3 text-center text-xs text-[var(--unilabor-neutral)]">Sin acciones registradas.</p>
        )}
        {actions.map((action, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.8)] p-3 sm:grid-cols-2 lg:grid-cols-5">
            <input value={action.improvement_area} onChange={(event) => patch(index, { improvement_area: event.target.value })} disabled={readOnly} placeholder="Oportunidad de mejora" className={inputClass} />
            <input value={action.required_action} onChange={(event) => patch(index, { required_action: event.target.value })} disabled={readOnly} placeholder="Acción requerida" className={inputClass} />
            <input value={action.responsible ?? ''} onChange={(event) => patch(index, { responsible: event.target.value || null })} disabled={readOnly} placeholder="Responsable" className={inputClass} />
            <input type="date" value={action.due_date ?? ''} onChange={(event) => patch(index, { due_date: event.target.value || null })} disabled={readOnly} className={inputClass} />
            <div className="flex items-center gap-2">
              <input value={action.follow_up ?? ''} onChange={(event) => patch(index, { follow_up: event.target.value || null })} disabled={readOnly} placeholder="Seguimiento" className={inputClass} />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setActions((current) => current.filter((_, i) => i !== index));
                    setDirty(true);
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.2)] text-red-600 transition hover:bg-red-50"
                  aria-label="Eliminar acción"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const CloseModal = ({
  evaluation,
  onClose,
  onClosed,
}: {
  evaluation: RhCompetencyEvaluation;
  onClose: () => void;
  onClosed: (updated: RhCompetencyEvaluation) => void;
}) => {
  const [areaName, setAreaName] = useState('');
  const [rhName, setRhName] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const setSignature = (key: string) => (dataUrl: string | null) =>
    setSignatures((current) => ({ ...current, [key]: dataUrl }));

  const handleSubmit = async () => {
    if (!areaName.trim() || !rhName.trim() || !directorName.trim()) {
      toast.warning('Captura los nombres de los tres firmantes institucionales.');
      return;
    }
    const required = ['collaborator', 'evaluator', 'area', 'rh', 'director'];
    if (required.some((key) => !signatures[key])) {
      toast.warning('Las cinco firmas son obligatorias.');
      return;
    }
    setSaving(true);
    try {
      const updated = await closeCompetencyEvaluation(evaluation.id, {
        collaborator_signature: signatures.collaborator as string,
        evaluator_signature: signatures.evaluator as string,
        area_signature: signatures.area as string,
        rh_signature: signatures.rh as string,
        director_signature: signatures.director as string,
        area_signatory_name: areaName.trim(),
        rh_signatory_name: rhName.trim(),
        director_signatory_name: directorName.trim(),
      });
      toast.success('Evaluación cerrada y archivada en el expediente.');
      onClosed(updated);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cerrar la evaluación.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              REH-REG-003 · {evaluation.employee_name}
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
              <FileCheck2 size={18} /> Cerrar evaluación de competencia
            </h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            El cierre sella los resultados, genera el PDF oficial con las 5 firmas y lo archiva en el expediente
            (sección Competencias laborales) con vigencia de 12 meses. No se puede modificar después.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Coordinador del área</label>
              <input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Nombre completo" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Coordinador de RH</label>
              <input value={rhName} onChange={(event) => setRhName(event.target.value)} placeholder="Nombre completo" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Director General</label>
              <input value={directorName} onChange={(event) => setDirectorName(event.target.value)} placeholder="Nombre completo" className={inputClass} />
            </div>
          </div>
          <SignaturePad label={`Colaborador evaluado — ${evaluation.employee_name}`} onChange={setSignature('collaborator')} />
          <SignaturePad label={`Evaluador técnico — ${evaluation.evaluator_name}`} onChange={setSignature('evaluator')} />
          <SignaturePad label="Coordinador del área" onChange={setSignature('area')} />
          <SignaturePad label="Coordinador de RH" onChange={setSignature('rh')} />
          <SignaturePad label="Director General" onChange={setSignature('director')} />
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving} className={buttonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
            Cerrar y archivar
          </button>
        </div>
      </div>
    </div>
  );
};

/** Editor completo de una evaluación REH-REG-003 (3 secciones + plan + resultados + cierre). */
export const CompetencyEvaluationEditor = ({ evaluation, onChanged }: CompetencyEvaluationEditorProps) => {
  const [showCloseModal, setShowCloseModal] = useState(false);
  const readOnly = evaluation.status === 'CLOSED';
  const results = evaluation.results;
  const dictamenUi = results.dictamen ? DICTAMEN_UI[results.dictamen] : null;

  return (
    <div className="space-y-4">
      {/* Resultados en vivo */}
      <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <div>
              <p className="font-semibold text-[var(--unilabor-neutral)]">Competencia (50%)</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{results.competency_pct ?? '—'}%</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--unilabor-neutral)]">Desempeño (20%)</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{results.performance_pct ?? '—'}%</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--unilabor-neutral)]">Conocimiento (30%)</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{results.knowledge_pct ?? '—'}%</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--unilabor-neutral)]">Resultado final</p>
              <p className="text-lg font-bold text-[var(--color-brand-700)]">{results.final_pct ?? '—'}%</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {dictamenUi && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${dictamenUi.className}`}>
                {dictamenUi.label}
                {results.veto_applied ? ' · VETO' : ''}
              </span>
            )}
            {evaluation.status === 'CLOSED' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <Check size={13} /> Cerrada {evaluation.valid_until ? `· vigente hasta ${formatDateOnly(evaluation.valid_until)}` : ''}
              </span>
            ) : (
              <button type="button" onClick={() => setShowCloseModal(true)} className={buttonClass}>
                <FileCheck2 size={14} /> Cerrar evaluación
              </button>
            )}
          </div>
        </div>
        {results.veto_applied && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-700">
            <AlertTriangle size={13} /> Restricción obligatoria aplicada: hay competencia(s) de criticidad ALTA con calificación menor a 3.
          </p>
        )}
      </section>

      <SectionEditor evaluation={evaluation} section="COMPETENCIA" readOnly={readOnly} onChanged={onChanged} />
      <SectionEditor evaluation={evaluation} section="DESEMPENO" readOnly={readOnly} onChanged={onChanged} />
      <SectionEditor evaluation={evaluation} section="CONOCIMIENTO" readOnly={readOnly} onChanged={onChanged} />
      <ActionsEditor evaluation={evaluation} readOnly={readOnly} onChanged={onChanged} />

      {showCloseModal && (
        <CloseModal evaluation={evaluation} onClose={() => setShowCloseModal(false)} onClosed={onChanged} />
      )}
    </div>
  );
};
