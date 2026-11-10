import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, PenLine, RefreshCw, Undo2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { DocumentSignerStatus } from '../../../types/models';
import { confirmAction } from '../../../utils/confirm';
import { notifyError } from '../../../utils/notify';
import { buttonClass, formatDateTime } from '../supervision/supervision-ui';
import { DocumentSignatureProgress } from './DocumentSignatureProgress';
import { signedCount } from './document-signature-ui';

interface DocumentInSignatureCardProps {
  /** "REH-REG-003" o "REH-REG-008". */
  formCode: string;
  requestedAt: string | null;
  requestedByName: string | null;
  loadSigners: () => Promise<DocumentSignerStatus[]>;
  onOpenPdf: () => Promise<void>;
  /** Regresa el registro a borrador (las firmas recabadas se invalidan). */
  onCancel: () => Promise<void>;
}

/**
 * Vista de RH de un registro de la Fase 7 enviado al Buzón de firmas: quién ya
 * firmó, quién falta, el PDF con las firmas recabadas y cancelar el envío para
 * corregirlo. Con la última firma el registro se cierra solo.
 */
export const DocumentInSignatureCard = ({ formCode, requestedAt, requestedByName, loadSigners, onOpenPdf, onCancel }: DocumentInSignatureCardProps) => {
  const [signers, setSigners] = useState<DocumentSignerStatus[] | null>(null);
  const [busy, setBusy] = useState<'load' | 'pdf' | 'cancel' | null>(null);

  const refresh = useCallback(async () => {
    setBusy('load');
    try {
      setSigners(await loadSigners());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los firmantes.'));
    } finally {
      setBusy(null);
    }
  }, [loadSigners]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (kind: 'pdf' | 'cancel', action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const done = signers ? signedCount(signers) : 0;
    const ok = await confirmAction(
      'Cancelar envío a firma',
      done > 0
        ? `El ${formCode} vuelve a borrador para corregirlo. Las ${done} firma(s) ya recabadas se invalidan (quedan en el historial) y todos tendrán que volver a firmar.`
        : `El ${formCode} vuelve a borrador para corregirlo y sale del Buzón de los firmantes.`,
      'Cancelar envío',
      'danger',
    );
    if (ok) await run('cancel', onCancel);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-900">
            <PenLine size={15} /> En firma · {signers ? `${signedCount(signers)} de ${signers.length} firmas` : '…'}
          </p>
          <p className="text-xs text-sky-900/80">
            Enviado{requestedByName ? ` por ${requestedByName}` : ''} el {formatDateTime(requestedAt)}. Cada firmante lo ve en su Buzón de firmas; con la última
            firma se cierra solo y se archiva en el expediente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} disabled={busy !== null} className={buttonClass} title="Actualizar firmas">
            {busy === 'load' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button type="button" onClick={() => void run('pdf', onOpenPdf)} disabled={busy !== null} className={buttonClass} title="Ver PDF con las firmas recabadas">
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
          </button>
          <button type="button" onClick={() => void cancel()} disabled={busy !== null} className={`${buttonClass} text-rose-700`} title="Regresar a borrador para corregir">
            {busy === 'cancel' ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Cancelar envío
          </button>
        </div>
      </div>
      {signers ? <DocumentSignatureProgress signers={signers} /> : null}
    </section>
  );
};
