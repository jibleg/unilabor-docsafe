import { useState } from 'react';
import { Loader2, PenLine } from 'lucide-react';
import { batchSignFromInbox } from '../../../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SignatureInboxBatchResult, SignatureInboxEntry } from '../../../types/models';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { SignaturePad } from '../../helpdesk/SignaturePad';
import { primaryButtonClass } from '../supervision/supervision-ui';

interface BatchSignPanelProps {
  entries: SignatureInboxEntry[];
  onBusyChange: (busy: boolean) => void;
  onSigned: (result: SignatureInboxBatchResult) => void;
}

/**
 * Firma en lote: el firmante confirma que revisó los registros elegidos y traza
 * su firma una sola vez; se aplica a cada uno por separado (cada firma queda en
 * la auditoría con su fecha). Si alguno ya no se puede firmar, los demás sí.
 */
export const BatchSignPanel = ({ entries, onBusyChange, onSigned }: BatchSignPanelProps) => {
  const [signature, setSignature] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (!reviewed) return notifyWarning('Confirma que revisaste los registros seleccionados.');
    if (!signature) return notifyWarning('Traza tu firma.');
    setBusy(true);
    onBusyChange(true);
    try {
      onSigned(await batchSignFromInbox(entries.map((entry) => ({ kind: entry.kind, id: entry.id })), signature));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la firma en lote.'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="max-h-72 divide-y divide-[rgba(0,65,106,0.08)] overflow-y-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white">
        {entries.map((entry) => (
          <li key={`${entry.kind}:${entry.id}`} className="px-3 py-2">
            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
              {entry.employee_name} · <span className="text-[var(--color-brand-700)]">{entry.position_code}</span>
            </p>
            <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
              {entry.form_code} {entry.title} · {entry.folio} · firmas como <span className="font-semibold text-[var(--unilabor-ink)]">{entry.pending_roles_label}</span>
            </p>
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-700)]" />
        <span>
          Revisé los {entries.length} registros seleccionados y estoy de acuerdo con su contenido. Mi firma se colocará en cada uno, con el rol que tengo en
          cada registro.
        </span>
      </label>

      <SignaturePad label="Tu firma" hint="Se aplicará a todos los registros seleccionados" onChange={setSignature} />

      <div className="flex justify-end">
        <button type="button" onClick={() => void sign()} disabled={busy} className={primaryButtonClass}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} Firmar {entries.length} registro(s)
        </button>
      </div>
    </div>
  );
};
