import { useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import { reopenInductionReading } from '../../../api/service.api-rh-induction';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InductionRosterRow } from '../../../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';

interface InductionBulkReopenModalProps {
  rows: InductionRosterRow[];
  onClose: () => void;
  onDone: () => void;
}

const HOURS_MAX = 720;
const PRESETS = [24, 48, 72];

/**
 * "Mandar a lectura" en lote: reabre o amplía el plazo de lectura de varios
 * inscritos a la vez (mismo endpoint por inscrito que el botón individual).
 * Reporta cuántos se reabrieron y cuáles no aplicaron.
 */
export const InductionBulkReopenModal = ({ rows, onClose, onDone }: InductionBulkReopenModalProps) => {
  const [hours, setHours] = useState('48');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Instante en que se abrió el modal: base fija para la vista previa del nuevo límite.
  const [openedAt] = useState(() => Date.now());
  const parsedHours = Number(hours);
  const hoursValid = Number.isInteger(parsedHours) && parsedHours >= 1 && parsedHours <= HOURS_MAX;
  const deadline = hoursValid ? new Date(openedAt + parsedHours * 3_600_000) : null;

  const handleConfirm = async () => {
    if (!hoursValid) {
      notifyError(`Indica entre 1 y ${HOURS_MAX} horas.`);
      return;
    }
    setProgress({ done: 0, total: rows.length });
    const failed: string[] = [];
    let ok = 0;
    for (const row of rows) {
      try {
        await reopenInductionReading(row.enrollment_id, parsedHours, note.trim() || undefined);
        ok += 1;
      } catch (error) {
        failed.push(`${row.employee_name}: ${getApiErrorMessage(error, 'no aplicó')}`);
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    if (ok > 0) notifySuccess(`Lectura reabierta por ${parsedHours} h a ${ok} colaborador(es).`);
    if (failed.length > 0) notifyWarning(`${failed.length} no aplicaron: ${failed.slice(0, 3).join(' · ')}${failed.length > 3 ? ' …' : ''}`);
    setProgress(null);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/96 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Acción en lote</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Mandar a lectura a {rows.length} colaborador(es)</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-[var(--unilabor-ink)]">
          <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
            Se reabre (o amplía) el plazo de lectura de cada inscrito seleccionado. Si su cuestionario se había abierto por vencimiento y
            nadie lo inició, se retira y volverá a abrirse al terminar de leer o al vencer el nuevo plazo. Sin correo ni SMS.
          </p>
          <div>
            <label className="text-xs font-semibold">Horas de lectura</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={HOURS_MAX}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-28 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm focus:outline-none"
              />
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setHours(String(preset))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${Number(hours) === preset ? 'bg-[var(--color-brand-700)] text-white' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)]'}`}
                >
                  {preset} h
                </button>
              ))}
            </div>
            {deadline ? (
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
                Nuevo límite: {deadline.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            ) : null}
          </div>
          <label className="block text-xs font-semibold">
            Nota (opcional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm font-normal focus:outline-none"
            />
          </label>
          <ul className="max-h-32 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-xs">
            {rows.map((row) => (
              <li key={row.enrollment_id} className="flex justify-between gap-2 py-0.5">
                <span>{row.employee_name}</span>
                <span className="text-[var(--unilabor-neutral)]">
                  {row.reading_signed}/{row.reading_total} firmados
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-3">
          <span className="text-xs text-[var(--unilabor-neutral)]">{progress ? `Procesando ${progress.done}/${progress.total}…` : ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={progress !== null} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-slate-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={progress !== null || !hoursValid}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {progress ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
              Reabrir lectura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
