import { useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { reopenInductionReading } from '../../api/service.api-rh-induction';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhInductionPhaseEnrollmentSummary } from '../../types/models';

interface InductionReopenReadingModalProps {
  enrollment: RhInductionPhaseEnrollmentSummary;
  onClose: () => void;
  /** Se invoca tras reabrir, para refrescar la lista de inscritos. */
  onReopened: () => void;
}

const NOTE_MAX = 500;
const HOURS_MAX = 720;
const DEFAULT_HOURS = 48;

const formatDeadline = (date: Date): string =>
  date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * "Reabrir lectura": el plazo de lectura de la fase vencio (o esta por vencer)
 * y el colaborador no termino de firmar sus documentos. RH le da N horas mas;
 * si el cuestionario ya se habia abierto por vencimiento y nadie lo inicio, se
 * retira y se abrira de nuevo al terminar de leer o al vencer el nuevo plazo.
 * No envia correo ni SMS.
 */
export const InductionReopenReadingModal = ({
  enrollment,
  onClose,
  onReopened,
}: InductionReopenReadingModalProps) => {
  const [hours, setHours] = useState<string>(String(DEFAULT_HOURS));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedHours = Number(hours);
  const hoursValid = Number.isInteger(parsedHours) && parsedHours >= 1 && parsedHours <= HOURS_MAX;
  const resultingDeadline = hoursValid ? new Date(Date.now() + parsedHours * 3_600_000) : null;
  const readingExpired = Boolean(enrollment.reading_deadline_at) && new Date(enrollment.reading_deadline_at as string) < new Date();
  const hasUnstartedExam = enrollment.evaluation_status === 'pending';

  const handleConfirm = async () => {
    if (!hoursValid) {
      return;
    }
    setSaving(true);
    try {
      const result = await reopenInductionReading(enrollment.enrollment_id, parsedHours, note.trim() || undefined);
      toast.success(
        `Lectura reabierta para ${enrollment.employee_name}: vence ${formatDeadline(new Date(result.new_deadline_at))}. Avísale en persona.`,
      );
      onReopened();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo reabrir la lectura.'));
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
              Reabrir lectura
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{enrollment.employee_name}</h2>
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
              Lleva{' '}
              <span className="font-semibold">
                {enrollment.reading_signed} de {enrollment.reading_total}
              </span>{' '}
              documentos firmados
              {enrollment.reading_deadline_at
                ? ` y su plazo ${readingExpired ? 'venció' : 'vence'} el ${formatDeadline(new Date(enrollment.reading_deadline_at))}`
                : ''}
              . Se le darán las horas indicadas a partir de ahora; el avance que ya tiene (páginas leídas y
              tiempo acumulado) se conserva.
            </p>
            {hasUnstartedExam ? (
              <p className="mt-2">
                El cuestionario que se abrió al vencer <span className="font-semibold">se retira</span> (nadie lo
                inició) y volverá a abrirse cuando termine de leer o al vencer el nuevo plazo.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
              No se envía correo ni SMS: avisa al colaborador en persona.
            </p>
          </div>

          <div>
            <label htmlFor="reopen-hours" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
              Horas adicionales de lectura
            </label>
            <div className="flex items-center gap-3">
              <input
                id="reopen-hours"
                type="number"
                min={1}
                max={HOURS_MAX}
                step={1}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className="w-28 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-500)]"
              />
              <div className="flex gap-1.5">
                {[24, 48, 72].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHours(String(preset))}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                      parsedHours === preset
                        ? 'bg-[var(--color-brand-700)] text-white ring-[var(--color-brand-700)]'
                        : 'bg-white text-[var(--color-brand-700)] ring-[rgba(0,65,106,0.14)] hover:bg-[rgba(191,212,230,0.2)]'
                    }`}
                  >
                    {preset} h
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
              {hoursValid && resultingDeadline
                ? `Nuevo límite de lectura: ${formatDeadline(resultingDeadline)}`
                : `Indica un número entero entre 1 y ${HOURS_MAX} horas.`}
            </p>
          </div>

          <div>
            <label htmlFor="reopen-note" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
              Motivo (opcional)
            </label>
            <textarea
              id="reopen-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
              rows={2}
              placeholder="Ej. Estuvo de vacaciones la semana del vencimiento."
              className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-500)]"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--unilabor-neutral)]">
              {note.length}/{NOTE_MAX} · queda registrado en la auditoría
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
            disabled={saving || !hoursValid}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
            Reabrir {hoursValid ? `${parsedHours} h` : 'lectura'}
          </button>
        </div>
      </div>
    </div>
  );
};
