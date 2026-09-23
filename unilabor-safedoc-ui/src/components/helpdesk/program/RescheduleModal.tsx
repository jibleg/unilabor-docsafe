import { useState } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { notifyWarning } from '../../../utils/notify';
import { formatDateShort } from '../../../utils/maintenanceProgram';

interface RescheduleModalProps {
  open: boolean;
  code: string;
  currentDate: string;
  initialDate?: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (date: string, reason: string) => void;
}

export const RescheduleModal = ({ open, code, currentDate, initialDate, saving, onClose, onSubmit }: RescheduleModalProps) => {
  const [date, setDate] = useState(initialDate ?? currentDate);
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(initialDate ?? currentDate);
      setReason('');
    }
  }
  if (!open) {
    return null;
  }
  const submit = () => {
    if (!date) {
      notifyWarning('Indica la nueva fecha.');
      return;
    }
    if (reason.trim().length < 5) {
      notifyWarning('La justificación de la reprogramación es obligatoria (queda en la auditoría del activo).');
      return;
    }
    onSubmit(date, reason.trim());
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.45)] p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Reprogramar</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">{code}</h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">Fecha actual: {formatDateShort(currentDate)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>
        <label className="mt-4 block text-xs font-semibold text-[var(--unilabor-ink)]">
          Nueva fecha programada
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 text-sm" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-[var(--unilabor-ink)]">
          Justificación (obligatoria)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Ej. Proveedor reprogramó la visita; equipo en uso por corrida urgente..."
            className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm"
          />
        </label>
        <p className="mt-2 text-[11px] text-[var(--unilabor-neutral)]">La ventana desde/hasta se recalcula con la tolerancia de la rutina y el tope por criticidad del activo.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[var(--color-brand-600)] disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            Reprogramar
          </button>
        </div>
      </div>
    </div>
  );
};
