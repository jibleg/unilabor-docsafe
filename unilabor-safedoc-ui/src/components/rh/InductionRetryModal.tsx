import { useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { authorizeInductionRetry } from '../../api/service.api-rh-induction';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhInductionPhaseEnrollmentSummary } from '../../types/models';

interface InductionRetryModalProps {
  enrollment: RhInductionPhaseEnrollmentSummary;
  onClose: () => void;
  /** Se invoca tras autorizar, para refrescar la lista de inscritos. */
  onAuthorized: () => void;
}

const NOTE_MAX = 500;

const STATUS_LABEL: Record<string, string> = {
  failed: 'no acreditada',
  expired: 'vencida sin presentar',
};

/**
 * "Autorizar nuevo intento" del cuestionario de una fase de Inducción. El
 * colaborador no reintenta por su cuenta: RH da la retroalimentación y desde
 * aquí abre un intento nuevo. El intento anterior se conserva como evidencia.
 * No envía correo ni SMS.
 */
export const InductionRetryModal = ({
  enrollment,
  onClose,
  onAuthorized,
}: InductionRetryModalProps) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const previousLabel =
    STATUS_LABEL[enrollment.evaluation_status ?? ''] ??
    enrollment.evaluation_status ??
    '';
  const nextAttempt = (enrollment.evaluation_attempt_no ?? 1) + 1;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const result = await authorizeInductionRetry(
        enrollment.enrollment_id,
        note.trim() || undefined,
      );
      toast.success(
        `Nuevo intento autorizado para ${enrollment.employee_name} (intento #${result.attempt_no}). Avísale que ya puede presentar.`,
      );
      onAuthorized();
      onClose();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, 'No se pudo autorizar el nuevo intento.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
              Autorizar nuevo intento
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
              {enrollment.employee_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-[rgba(191,212,230,0.22)] px-4 py-3 text-sm text-[var(--unilabor-ink)]">
            <p>
              La evaluación actual está{' '}
              <span className="font-semibold">{previousLabel}</span>
              {enrollment.evaluation_percentage !== null
                ? ` (${enrollment.evaluation_percentage}%)`
                : ''}
              . Se abrirá el{' '}
              <span className="font-semibold">intento #{nextAttempt}</span> con
              preguntas sorteadas de nuevo y su propio plazo. El intento
              anterior se conserva como evidencia y la lectura firmada no se
              repite.
            </p>
            <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
              No se envía correo ni SMS: avisa al colaborador en persona.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
              Retroalimentación / recapacitación (opcional)
            </label>
            <textarea
              value={note}
              onChange={(event) =>
                setNote(event.target.value.slice(0, NOTE_MAX))
              }
              rows={3}
              placeholder="Ej. Se revisaron con el colaborador los temas del Reglamento Interno antes del nuevo intento."
              className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-500)]"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--unilabor-neutral)]">
              {note.length}/{NOTE_MAX} · queda registrada en la auditoría
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[rgba(0,65,106,0.14)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.2)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            Autorizar intento #{nextAttempt}
          </button>
        </div>
      </div>
    </div>
  );
};
