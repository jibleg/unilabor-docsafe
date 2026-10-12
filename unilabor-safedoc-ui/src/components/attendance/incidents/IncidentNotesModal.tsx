import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { inputClass, labelClass, modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from '../employees/ui';

interface Props {
  title: string;
  confirmLabel: string;
  description?: string;
  /** Devuelve un mensaje de error si falla; el modal permanece abierto. */
  onSubmit: (notes: string) => Promise<string | null>;
  onClose: () => void;
}

/** Modal con notas opcionales (rechazo de incidencias). */
export const IncidentNotesModal = ({ title, confirmLabel, description, onSubmit, onClose }: Props) => {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    const message = await onSubmit(notes.trim());
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${modalPanelClass} max-w-md`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">{title}</h2>
        </div>
        <div className="space-y-3 px-5 py-5">
          {description ? <p className="text-sm text-[var(--unilabor-ink)]">{description}</p> : null}
          <label className={labelClass} htmlFor="inc-notes">Notas</label>
          <textarea id="inc-notes" rows={3} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={primaryButtonClass} onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
