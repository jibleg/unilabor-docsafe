import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import {
  deleteQuestionBankItem,
  generateQuestionBank,
  listQuestionBankItems,
  reviewQuestionBankItem,
} from '../../api/service.api-rh-question-bank';
import { getApiErrorMessage } from '../../api/service';
import type {
  EvaluationQuestion,
  EvaluationQuestionType,
  QuestionBankCounts,
  QuestionBankItem,
  QuestionBankScope,
} from '../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';

/** Documento fuente del banco (fase de Induccion o puesto): lo minimo para listar y ligar. */
export interface QuestionBankSourceDocument {
  document_id: string;
  code: string | null;
  title: string;
}

interface QuestionBankPanelProps {
  scope: QuestionBankScope;
  documents: QuestionBankSourceDocument[];
  /**
   * Induccion: "Usar" copia la pregunta a la plantilla y la marca APPROVED.
   * Competencia (sin onUseQuestion): "Aprobar" la deja en el banco vivo del
   * puesto, de donde se sortean los cuestionarios de Conocimiento.
   */
  onUseQuestion?: (question: EvaluationQuestion) => void;
  /** Se invoca cuando cambia el conjunto de preguntas aprobadas (competencia). */
  onApprovedChanged?: () => void;
  /** Ambito de la explicacion en pantalla. */
  sourceLabel?: string;
}

const TYPE_LABELS: Record<EvaluationQuestionType, string> = {
  single: 'Opción única',
  multiple: 'Opción múltiple',
  boolean: 'Verdadero / Falso',
  open: 'Abierta',
};

const TYPE_BADGE_CLASS: Record<EvaluationQuestionType, string> = {
  single: 'bg-[rgba(124,173,211,0.22)] text-[var(--color-brand-700)]',
  multiple: 'bg-[rgba(157,124,211,0.2)] text-[#5b3fa6]',
  boolean: 'bg-[rgba(56,161,105,0.16)] text-[#2f7a4d]',
  open: 'bg-[rgba(217,158,52,0.18)] text-[#8a5f10]',
};

const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const DEFAULT_COUNTS: QuestionBankCounts = { boolean: 5, multiple: 5, single: 3, open: 2 };
// Competencia: solo tipos autocalificables (el colaborador contesta en el sistema).
const DEFAULT_COUNTS_COMPETENCY: QuestionBankCounts = { boolean: 5, multiple: 5, single: 5, open: 0 };

export const QuestionBankPanel = ({
  scope,
  documents: phaseDocuments,
  onUseQuestion,
  onApprovedChanged,
  sourceLabel,
}: QuestionBankPanelProps) => {
  const competencyMode = !onUseQuestion;
  const scopeKey = scope.phaseId !== undefined ? `phase:${scope.phaseId}` : `position:${scope.positionId}`;
  const sourceText = sourceLabel ?? (competencyMode ? 'los documentos obligatorios de este puesto' : 'los documentos de esta fase');
  const [expanded, setExpanded] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(
    new Set(phaseDocuments.map((doc) => doc.document_id)),
  );
  const [counts, setCounts] = useState<QuestionBankCounts>(competencyMode ? DEFAULT_COUNTS_COMPETENCY : DEFAULT_COUNTS);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [usedIds, setUsedIds] = useState<Set<number>>(new Set());

  const loadItems = async () => {
    setLoading(true);
    try {
      const pending = await listQuestionBankItems(scope, 'PENDING_REVIEW');
      setItems(pending);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el banco de preguntas generado por IA.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      void loadItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, scopeKey]);

  const toggleDocument = (documentId: string) =>
    setSelectedDocIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });

  const handleGenerate = async () => {
    if (selectedDocIds.size === 0) {
      notifyWarning('Selecciona al menos un documento.');
      return;
    }
    const total = counts.boolean + counts.multiple + counts.single + counts.open;
    if (total === 0) {
      notifyWarning('Indica al menos una pregunta a generar.');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateQuestionBank(scope, [...selectedDocIds], counts);
      notifySuccess(`Se generaron ${result.question_count} preguntas candidatas. Revísalas abajo.`);
      setShowGenerateForm(false);
      await loadItems();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el banco de preguntas.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = async (item: QuestionBankItem) => {
    if (!onUseQuestion) {
      // Competencia: aprobar = dejarla en el banco vivo del puesto.
      try {
        await reviewQuestionBankItem(scope, item.id, { status: 'APPROVED' });
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setUsedIds((current) => new Set(current).add(item.id));
        onApprovedChanged?.();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo aprobar la pregunta.'));
      }
      return;
    }
    // Evaluacion guiada: la pregunta conserva el documento del que la IA la
    // derivo, para mostrarlo como pista al colaborador durante el examen.
    const sourceDocument = item.document_id
      ? phaseDocuments.find((doc) => doc.document_id === item.document_id) ?? null
      : null;
    onUseQuestion({
      type: item.type,
      text: item.text,
      points: item.points,
      source_document_id: item.document_id,
      source_document_code: sourceDocument?.code ?? null,
      source_document_title: sourceDocument?.title ?? null,
      options: item.options.map((option) => ({ text: option.text, is_correct: option.is_correct })),
    });
    setUsedIds((current) => new Set(current).add(item.id));
    try {
      await reviewQuestionBankItem(scope, item.id, { status: 'APPROVED' });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'La pregunta se agregó a la evaluación, pero no se pudo marcar como usada en el banco.'));
    }
  };

  const handleDiscard = async (item: QuestionBankItem) => {
    try {
      await reviewQuestionBankItem(scope, item.id, { status: 'REJECTED' });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo descartar la pregunta.'));
    }
  };

  const handleSaveEdit = async (item: QuestionBankItem, text: string, options: QuestionBankItem['options']) => {
    try {
      const updated = await reviewQuestionBankItem(scope, item.id, { text, options });
      if (updated) {
        setItems((current) => current.map((entry) => (entry.id === item.id ? updated : entry)));
      }
      setEditingId(null);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los cambios.'));
    }
  };

  const handleDelete = async (item: QuestionBankItem) => {
    try {
      await deleteQuestionBankItem(scope, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar la pregunta.'));
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[rgba(124,92,191,0.35)] bg-[linear-gradient(150deg,#f6f3fd_0%,#efe9fb_38%,#eaf2fa_100%)] shadow-[0_16px_38px_rgba(91,63,166,0.16)]">
      {/* Barra hero: siempre visible, resalta el modulo como capacidad destacada */}
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="relative flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[rgba(255,255,255,0.35)]"
      >
        <span className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,#9c82df,#5b3fa6)]" />
        <div className="flex items-center gap-3 pl-2">
          <div className="relative shrink-0">
            <motion.span
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#9c82df,#5b3fa6)] text-white shadow-[0_6px_16px_rgba(91,63,166,0.35)]"
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
            >
              <Sparkles size={20} />
            </motion.span>
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-[#9c82df]"
                animate={{ scale: [1, 1.9], opacity: [0.65, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#5b3fa6]" />
            </span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(91,63,166,0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5b3fa6]">
              <Sparkles size={10} /> Generado con IA
            </span>
            <p className="mt-1 bg-[linear-gradient(90deg,#5b3fa6,var(--color-brand-700))] bg-clip-text text-sm font-extrabold text-transparent">
              Banco de preguntas con IA
            </p>
            <p className="text-xs text-[var(--unilabor-neutral)]">
              Genera preguntas automáticamente desde {sourceText}
            </p>
          </div>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
          <ChevronDown size={20} className="text-[#5b3fa6]" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-[rgba(124,92,191,0.2)] bg-white/55 px-5 py-4">
              <p className="text-xs text-[var(--unilabor-neutral)]">
                {competencyMode ? (
                  <>
                    Genera preguntas candidatas a partir de {sourceText}. Ninguna entra al banco del puesto
                    hasta que la revises y hagas clic en <strong>Aprobar</strong>; de las aprobadas se arma el
                    cuestionario de Conocimiento de cada colaborador.
                  </>
                ) : (
                  <>
                    Genera preguntas candidatas a partir de {sourceText}. Ninguna se agrega a la evaluación
                    hasta que la revises y hagas clic en <strong>Usar</strong>.
                  </>
                )}
              </p>

              <AnimatePresence mode="wait" initial={false}>
                {!showGenerateForm ? (
                  <motion.button
                    key="cta"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setShowGenerateForm(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#9c82df] bg-[linear-gradient(135deg,#9c82df,#5b3fa6)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,63,166,0.28)] transition hover:brightness-110"
                  >
                    <Sparkles size={14} /> Generar preguntas con IA
                  </motion.button>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white p-3"
                  >
                    <div>
                      <label className={labelClass}>Documentos a usar</label>
                      <div className="space-y-1.5">
                        {phaseDocuments.map((doc) => (
                          <label
                            key={doc.document_id}
                            className="flex items-center gap-2 text-sm text-[var(--unilabor-ink)]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocIds.has(doc.document_id)}
                              onChange={() => toggleDocument(doc.document_id)}
                              className="h-4 w-4 accent-[#5b3fa6]"
                            />
                            {doc.code ? `${doc.code} — ${doc.title}` : doc.title}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className={labelClass}>V/F</label>
                        <input
                          type="number"
                          min={0}
                          max={15}
                          value={counts.boolean}
                          onChange={(event) => setCounts((c) => ({ ...c, boolean: Number(event.target.value) }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Opción múltiple</label>
                        <input
                          type="number"
                          min={0}
                          max={15}
                          value={counts.multiple}
                          onChange={(event) => setCounts((c) => ({ ...c, multiple: Number(event.target.value) }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Opción única</label>
                        <input
                          type="number"
                          min={0}
                          max={15}
                          value={counts.single}
                          onChange={(event) => setCounts((c) => ({ ...c, single: Number(event.target.value) }))}
                          className={inputClass}
                        />
                      </div>
                      {!competencyMode && (
                        <div>
                          <label className={labelClass}>Abiertas</label>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={counts.open}
                            onChange={(event) => setCounts((c) => ({ ...c, open: Number(event.target.value) }))}
                            className={inputClass}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowGenerateForm(false)}
                        disabled={generating}
                        className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <motion.button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={generating}
                        whileTap={{ scale: 0.97 }}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#9c82df] bg-[linear-gradient(135deg,#9c82df,#5b3fa6)] px-3 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(91,63,166,0.28)] transition hover:brightness-110 disabled:opacity-50"
                      >
                        {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Generar
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {loading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
                  <Loader2 size={14} className="animate-spin" /> Cargando preguntas generadas...
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[#5b3fa6]">
                    {competencyMode
                      ? `${usedIds.size} de ${items.length + usedIds.size} preguntas generadas ya aprobadas en el banco del puesto.`
                      : `${usedIds.size} de ${items.length + usedIds.size} preguntas generadas ya agregadas a esta evaluación.`}
                  </p>
                  <AnimatePresence initial={false}>
                    {items.map((item, index) => (
                      <motion.div
                        // Cambiar de key al entrar/salir de edicion remonta la tarjeta, asi el
                        // borrador (draftText/draftOptions) nace del item actual sin necesitar
                        // un efecto que sincronice estado derivado (evita el lint set-state-in-effect).
                        key={`${item.id}-${editingId === item.id ? 'edit' : 'view'}`}
                        layout
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
                      >
                        <QuestionBankCard
                          item={item}
                          isEditing={editingId === item.id}
                          onStartEdit={() => setEditingId(item.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={(text, options) => void handleSaveEdit(item, text, options)}
                          onUse={() => void handleUse(item)}
                          onDiscard={() => void handleDiscard(item)}
                          onDelete={() => void handleDelete(item)}
                          useLabel={competencyMode ? 'Aprobar' : 'Usar'}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  No hay preguntas pendientes de revisión. Genera un lote nuevo cuando quieras.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

interface QuestionBankCardProps {
  item: QuestionBankItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string, options: QuestionBankItem['options']) => void;
  onUse: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  useLabel: string;
}

const QuestionBankCard = ({
  item,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onUse,
  onDiscard,
  onDelete,
  useLabel,
}: QuestionBankCardProps) => {
  const [draftText, setDraftText] = useState(item.text);
  const [draftOptions, setDraftOptions] = useState(item.options);

  return (
    <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.1)] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE_CLASS[item.type]}`}>
          {TYPE_LABELS[item.type]}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-[11px] font-medium text-[var(--unilabor-neutral)] underline-offset-2 hover:underline"
        >
          Eliminar
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={2}
            className={inputClass}
          />
          {item.type !== 'open' &&
            draftOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={option.is_correct}
                  onChange={() =>
                    setDraftOptions((current) =>
                      current.map((o, i) => (i === index ? { ...o, is_correct: !o.is_correct } : o)),
                    )
                  }
                  className="h-4 w-4 accent-[var(--color-brand-500)]"
                />
                <input
                  value={option.text}
                  onChange={(event) =>
                    setDraftOptions((current) =>
                      current.map((o, i) => (i === index ? { ...o, text: event.target.value } : o)),
                    )
                  }
                  className={inputClass}
                />
              </div>
            ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSaveEdit(draftText, draftOptions)}
              className="rounded-lg border border-[var(--color-brand-300)] bg-[rgba(191,212,230,0.4)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--unilabor-ink)]">{item.text}</p>
          {item.type !== 'open' && (
            <ul className="space-y-1">
              {item.options.map((option, index) => (
                <li
                  key={index}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    option.is_correct
                      ? 'bg-[rgba(56,161,105,0.14)] font-semibold text-[#2f7a4d]'
                      : 'bg-[rgba(0,65,106,0.04)] text-[var(--unilabor-neutral)]'
                  }`}
                >
                  {option.text}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(220,38,38,0.2)] px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              <X size={13} /> Descartar
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <Pencil size={13} /> Editar
            </button>
            <button
              type="button"
              onClick={onUse}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-brand-300)] bg-[rgba(56,161,105,0.14)] px-3 py-1.5 text-xs font-semibold text-[#2f7a4d] transition hover:bg-[rgba(56,161,105,0.24)]"
            >
              <Check size={13} /> {useLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
