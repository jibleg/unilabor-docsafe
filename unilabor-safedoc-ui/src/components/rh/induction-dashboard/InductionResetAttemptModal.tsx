import { useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { resetTruncatedAttempt } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionRosterRow } from '../../../types/models';
import { formatDateTime } from '../../../utils/inductionDashboard';
import { notifyError, notifySuccess } from '../../../utils/notify';

interface InductionResetAttemptModalProps {
  row: InductionRosterRow;
  onClose: () => void;
  onDone: () => void;
}

const NOTE_MAX = 500;

/**
 * "Reabrir intento truncado": el intento vigente quedó inservible (cronómetro
 * agotado por caída de internet, snapshot sin preguntas o iniciado sin enviar).
 * Se cierra como no presentado (sus respuestas parciales se conservan como
 * evidencia) y se abre un intento nuevo. Sin correo ni SMS.
 */
export const InductionResetAttemptModal = ({ row, onClose, onDone }: InductionResetAttemptModalProps) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const nextAttempt = (row.evaluation_attempt_no ?? 1) + 1;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const result = await resetTruncatedAttempt(row.enrollment_id, note.trim() || undefined);
      notifySuccess(`${result.message} (${row.employee_name})`);
      onDone();
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo reabrir el intento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Fase {row.phase_number}</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Reabrir intento truncado</h2>
            <p className="text-sm text-[var(--unilabor-ink)]">{row.employee_name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-[var(--unilabor-ink)]">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            Intento #{row.evaluation_attempt_no ?? 1}: iniciado {formatDateTime(row.evaluation_started_at)} · {row.evaluation_response_count} de{' '}
            {row.evaluation_question_count} respuestas guardadas
            {row.attempt_time_limit_minutes ? ` · cronómetro de ${row.attempt_time_limit_minutes} min` : ''}.
          </div>
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            El intento actual se cierra como <strong>no presentado</strong> y sus respuestas parciales se conservan como evidencia. Se abre el{' '}
            <strong>intento #{nextAttempt}</strong> con nuevo sorteo de preguntas y ventana completa. No se envía correo ni SMS: avísale al
            colaborador que ya puede presentar.
          </p>
          <label className="block text-xs font-semibold">
            Motivo (opcional, queda en la auditoría)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              rows={3}
              placeholder="Ej. se cortó la conexión a internet durante el examen"
              className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:border-[var(--color-brand-300)] focus:outline-none"
            />
            <span className="text-[10px] font-normal text-[var(--unilabor-neutral)]">
              {note.length}/{NOTE_MAX}
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Reabrir intento #{nextAttempt}
          </button>
        </div>
      </div>
    </div>
  );
};
