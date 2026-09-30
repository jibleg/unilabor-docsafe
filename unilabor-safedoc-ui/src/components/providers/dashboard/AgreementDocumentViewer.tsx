import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getClientDocumentBlobUrl } from '../../../api/service.api-clients';
import { getProviderDocumentBlobUrl } from '../../../api/service.api-providers';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AgreementItem } from '../../../types/models';
import { notifyError } from '../../../utils/notify';
import { PdfSafeViewer } from '../../PdfSafeViewerSafe';

interface AgreementDocumentViewerProps {
  item: AgreementItem;
  /** Debe ser estable (useCallback): se usa dentro del efecto de carga. */
  onClose: () => void;
}

// Con responseType 'blob' el cuerpo del error llega como Blob: se lee su JSON
// para mostrar el mensaje del servidor (p. ej. "Archivo no encontrado fisicamente.").
const describeViewError = async (error: unknown): Promise<string> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed?.message) return parsed.message;
    } catch {
      // Cuerpo no JSON: se usa el mensaje genérico.
    }
  }
  return getApiErrorMessage(error, 'No se pudo abrir el documento.');
};

/**
 * Visor protegido del documento de un acuerdo (proveedor o cliente) desde el
 * Panorama de contratos: mismo endpoint y visor que la ficha de la contraparte.
 */
export const AgreementDocumentViewer = ({ item, onClose }: AgreementDocumentViewerProps) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    const fetchBlob = item.party_type === 'provider' ? getProviderDocumentBlobUrl : getClientDocumentBlobUrl;
    fetchBlob(item.id)
      .then((url) => {
        created = url;
        if (alive) setFileUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch(async (error) => {
        const message = await describeViewError(error);
        if (!alive) return;
        notifyError(message);
        onClose();
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [item.id, item.party_type, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Documento: ${item.title}`}>
      <div className="w-full max-w-4xl">
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-white/90 px-4 py-2.5 shadow-lg">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--color-brand-700)]">{item.title}</p>
            <p className="truncate text-xs text-[var(--unilabor-neutral)]">
              {item.party_name}
              {item.category_name ? ` · ${item.category_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
          >
            <X size={14} />
            Cerrar
          </button>
        </div>
        {fileUrl ? (
          <PdfSafeViewer key={fileUrl} fileUrl={fileUrl} />
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/90 p-10 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={16} className="animate-spin" /> Cargando documento…
          </div>
        )}
      </div>
    </div>
  );
};
