import { useEffect, useState } from 'react';
import { FileSignature, FileText, Loader2, X } from 'lucide-react';
import { getInductionReadingDocumentUrl, getInductionSignatureSheetUrl } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { PdfSafeViewer } from '../../PdfSafeViewerSafe';
import { formatDateTime } from '../../../utils/inductionDashboard';

/** Con responseType 'blob' el mensaje de error del servidor llega como Blob JSON. */
const readBlobErrorMessage = async (error: unknown): Promise<string | null> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text()) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
};

export type ReadingEvidenceTab = 'document' | 'signature';

interface InductionReadingEvidenceViewerProps {
  acknowledgementId: number;
  title: string;
  documentCode: string | null;
  signedAt: string | null;
  employeeName: string;
  initialTab: ReadingEvidenceTab;
  onClose: () => void;
}

/**
 * Documento leído por el colaborador y su hoja de firma, ambos en el visor
 * protegido (sin descarga ni impresión). La hoja es la evidencia de la firma:
 * una página con el título del documento, su SHA-256 y la firma autógrafa.
 */
export const InductionReadingEvidenceViewer = ({
  acknowledgementId,
  title,
  documentCode,
  signedAt,
  employeeName,
  initialTab,
  onClose,
}: InductionReadingEvidenceViewerProps) => {
  const signed = Boolean(signedAt);
  const [tab, setTab] = useState<ReadingEvidenceTab>(signed ? initialTab : 'document');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const load = tab === 'signature' ? getInductionSignatureSheetUrl : getInductionReadingDocumentUrl;
    load(acknowledgementId)
      .then((next) => {
        objectUrl = next;
        if (active) setUrl(next);
        else URL.revokeObjectURL(next);
      })
      .catch(async (err) => {
        const message = await readBlobErrorMessage(err);
        if (active) setError(message ?? getApiErrorMessage(err, 'No se pudo abrir el archivo.'));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [acknowledgementId, tab]);

  const changeTab = (value: ReadingEvidenceTab) => {
    if (value === tab) return;
    setUrl(null);
    setError(null);
    setTab(value);
  };

  const tabClass = (value: ReadingEvidenceTab) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
      tab === value ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.4)]'
    }`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--color-brand-700)]">
              {documentCode ? <span className="mr-1.5 rounded bg-slate-100 px-1 font-mono text-[11px]">{documentCode}</span> : null}
              {title}
            </p>
            <p className="text-[11px] text-[var(--unilabor-neutral)]">
              {employeeName} · {signed ? `firmado ${formatDateTime(signedAt)}` : 'sin firmar'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-[rgba(191,212,230,0.25)] p-0.5">
              <button type="button" className={tabClass('document')} onClick={() => changeTab('document')}>
                <FileText size={13} /> Documento
              </button>
              <button
                type="button"
                className={`${tabClass('signature')} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => changeTab('signature')}
                disabled={!signed}
                title={signed ? 'Hoja de acuse con la firma del colaborador' : 'Aún no firma este documento'}
              >
                <FileSignature size={13} /> Hoja de firma
              </button>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-slate-100" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-[50vh] flex-1 overflow-auto">
          {error ? (
            <p className="px-6 py-10 text-center text-sm text-rose-700">{error}</p>
          ) : url ? (
            <PdfSafeViewer key={url} fileUrl={url} />
          ) : (
            <div className="flex h-[50vh] items-center justify-center">
              <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
