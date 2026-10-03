import { useState } from 'react';
import { ClipboardCheck, Loader2, X } from 'lucide-react';
import { captureEnrollmentPractical } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionRosterRow } from '../../../types/models';
import { todayIsoDate } from '../../../utils/inductionDashboard';
import { notifyError, notifySuccess } from '../../../utils/notify';

interface InductionPracticalCaptureModalProps {
  row: InductionRosterRow;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Captura (o corrección) de la evaluación práctica supervisada de la Fase 6:
 * calificación 0-10 con la plantilla práctica del puesto del colaborador. Al
 * acreditar se emite la constancia y la fase queda aprobada.
 */
export const InductionPracticalCaptureModal = ({ row, onClose, onDone }: InductionPracticalCaptureModalProps) => {
  const [score, setScore] = useState(row.evaluation_percentage !== null ? String(row.evaluation_percentage / 10) : '');
  const [capturedAt, setCapturedAt] = useState(todayIsoDate());
  const [saving, setSaving] = useState(false);
  const numeric = Number(score);
  const valid = score.trim() !== '' && Number.isFinite(numeric) && numeric >= 0 && numeric <= 10;
  const isCorrection = row.evaluation_status === 'failed' || row.evaluation_status === 'passed';

  const handleConfirm = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      notifySuccess(await captureEnrollmentPractical(row.enrollment_id, Math.round(numeric * 10) / 10, capturedAt || undefined));
      onDone();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo capturar la evaluación práctica.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Fase {row.phase_number} · práctica supervisada</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{isCorrection ? 'Corregir calificación' : 'Capturar evaluación práctica'}</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">
              {row.employee_name}
              {row.position_name ? <span className="text-[var(--unilabor-neutral)]"> · {row.position_name}</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-[var(--unilabor-ink)]">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">
              Calificación (0 a 10)
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:border-[var(--color-brand-300)] focus:outline-none"
              />
            </label>
            <label className="block text-xs font-semibold">
              Fecha de la evaluación
              <input
                type="date"
                value={capturedAt}
                max={todayIsoDate()}
                onChange={(e) => setCapturedAt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:border-[var(--color-brand-300)] focus:outline-none"
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Se califica contra la evaluación práctica del puesto (competencias del puesto en sus instrucciones). Si acredita, la Fase 6 queda
            aprobada, se emite su constancia y queda listo para la evaluación de competencia (Fase 7).
            {isCorrection ? ' La captura anterior se corrige en el mismo registro.' : ''}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !valid}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
            Guardar calificación
          </button>
        </div>
      </div>
    </div>
  );
};
