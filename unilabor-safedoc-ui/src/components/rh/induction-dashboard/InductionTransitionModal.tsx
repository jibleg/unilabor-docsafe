import { useState } from 'react';
import { CheckCircle2, Loader2, StepForward, X, XCircle } from 'lucide-react';
import { executeInductionTransition } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionTransitionResult, InductionTransitionTarget } from '../../../types/models';
import { TRANSITION_TARGET_META, todayIsoDate } from '../../../utils/inductionDashboard';
import { notifyError, notifySuccess } from '../../../utils/notify';

export interface TransitionCandidateRef {
  employee_id: number;
  employee_name: string;
  position_code: string | null;
}

interface InductionTransitionModalProps {
  target: InductionTransitionTarget;
  candidates: TransitionCandidateRef[];
  onClose: () => void;
  /** Se llama al terminar (haya o no fallidos) para refrescar el tablero. */
  onDone: () => void;
}

const TARGET_EXPLANATION: Record<InductionTransitionTarget, string> = {
  5: 'Quedan inscritos en la Fase 5 con los documentos de su puesto. Si la fase tiene periodo de descanso, sus lecturas se activan al terminar; si no, reciben de inmediato sus lecturas, su plazo y el aviso por SMS.',
  6: 'Quedan inscritos en la Fase 6 (práctica supervisada, sin lectura). Después RH captura su evaluación práctica desde la Fase 6 del tablero.',
  7: 'Se abre en borrador su evaluación de competencia inicial (REH-REG-003) con las competencias de su puesto precargadas. Se completa y cierra en Evaluación de competencia.',
};

/**
 * Confirmación del avance de fase desde la bandeja (o desde la fila de una
 * fase). El servidor revalida a cada colaborador: solo mueve a los LISTOS y
 * devuelve el motivo de los que no; el resultado se muestra uno por uno.
 */
export const InductionTransitionModal = ({ target, candidates, onClose, onDone }: InductionTransitionModalProps) => {
  const [evaluatorName, setEvaluatorName] = useState('');
  const [evaluationDate, setEvaluationDate] = useState(todayIsoDate());
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<InductionTransitionResult[] | null>(null);
  const meta = TRANSITION_TARGET_META[target];
  const needsEvaluator = target === 7;
  const canConfirm = !needsEvaluator || evaluatorName.trim().length >= 3;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const response = await executeInductionTransition({
        target,
        employee_ids: candidates.map((candidate) => candidate.employee_id),
        ...(needsEvaluator ? { evaluator_name: evaluatorName.trim(), evaluation_date: evaluationDate } : {}),
      });
      setResults(response.results);
      if (response.results.some((result) => result.ok)) notifySuccess(response.message);
      else notifyError(response.message);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo completar el avance.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">{meta.label}</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{meta.action}</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">{candidates.length} colaborador(es)</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-[var(--unilabor-ink)]">
          {results ? (
            <ul className="space-y-1.5">
              {results.map((result) => (
                <li
                  key={result.employee_id}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                    result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {result.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                  <span>
                    <strong>{result.employee_name}</strong>: {result.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">{TARGET_EXPLANATION[target]}</p>
              {needsEvaluator ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="block text-xs font-semibold">
                    Evaluador (quien aplicará la evaluación)
                    <input
                      value={evaluatorName}
                      onChange={(e) => setEvaluatorName(e.target.value.slice(0, 160))}
                      placeholder="Ej. Responsable del área analítica"
                      className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:border-[var(--color-brand-300)] focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    Fecha
                    <input
                      type="date"
                      value={evaluationDate}
                      onChange={(e) => setEvaluationDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:border-[var(--color-brand-300)] focus:outline-none"
                    />
                  </label>
                </div>
              ) : null}
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] p-2 text-xs">
                {candidates.map((candidate) => (
                  <li key={candidate.employee_id} className="flex justify-between gap-2 px-1">
                    <span className="truncate">{candidate.employee_name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--unilabor-neutral)]">{candidate.position_code ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          {results ? (
            <button type="button" onClick={onClose} className="rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Cerrar
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || !canConfirm}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <StepForward size={14} />}
                {meta.action}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
