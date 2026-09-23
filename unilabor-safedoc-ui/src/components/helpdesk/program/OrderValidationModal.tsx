import { useState } from 'react';
import { Loader2, PenLine, X } from 'lucide-react';
import { SignaturePad } from '../SignaturePad';
import { notifyWarning } from '../../../utils/notify';

interface OrderValidationModalProps {
  open: boolean;
  code: string;
  responsibleName: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (signature: string, notes: string) => void;
}

export const OrderValidationModal = ({ open, code, responsibleName, saving, onClose, onSubmit }: OrderValidationModalProps) => {
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.45)] p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Validación del responsable del activo</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">{code}</h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">
              Firma de {responsibleName ?? 'quien valida'}. Al validar, la orden se cierra y la constancia se archiva en el expediente.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">
          <SignaturePad label="Firma del responsable" hint="Firma con el dedo o el mouse" onChange={setSignature} />
        </div>
        <label className="mt-3 block text-xs font-semibold text-[var(--unilabor-ink)]">
          Observaciones (opcional)
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!signature) {
                notifyWarning('Captura la firma del responsable para validar.');
                return;
              }
              onSubmit(signature, notes.trim());
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[var(--color-brand-600)] disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
            Validar y cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
