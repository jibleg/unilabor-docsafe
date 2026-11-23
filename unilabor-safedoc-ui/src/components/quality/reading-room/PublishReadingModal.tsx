import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-toastify';
import { listDocuments } from '../../../api/service.api-helpdesk';
import { publishReading } from '../../../api/service.api-quality-reading';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { Document, ReadingPublication } from '../../../types/models';
import { SearchableSelect } from '../../SearchableSelect';

interface PublishReadingModalProps {
  onClose: () => void;
  onPublished: (publication: ReadingPublication) => void;
}

/** Publica a lectura un documento vigente del SGC (elegido en una lista con buscador). */
export const PublishReadingModal = ({ onClose, onPublished }: PublishReadingModalProps) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentId, setDocumentId] = useState('');
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    // Solo los vigentes: un documento derogado no se pone a leer.
    listDocuments()
      .then((list) => setDocuments(list.filter((doc) => doc.status === 'active')))
      .catch((error) => toast.error(getApiErrorMessage(error, 'No se pudieron cargar los documentos del SGC.')))
      .finally(() => setLoadingDocuments(false));
  }, []);

  const options = useMemo(
    () =>
      documents
        .map((doc) => ({
          value: String(doc.id),
          label: doc.title,
          hint: [doc.code, doc.category_name].filter(Boolean).join(' · '),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [documents],
  );

  const handlePublish = async () => {
    if (!documentId) {
      toast.error('Elige el documento del SGC que se va a leer.');
      return;
    }
    setPublishing(true);
    try {
      const publication = await publishReading({ document_id: documentId, deadline_hours: deadlineHours });
      toast.success(`"${publication.title_snapshot}" publicado a lectura.`);
      onPublished(publication);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo publicar el documento.'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Publicar documento a lectura">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Publicar documento a lectura</h2>
          <button type="button" onClick={onClose} disabled={publishing} aria-label="Cerrar">
            <X size={18} className="text-[var(--unilabor-neutral)]" />
          </button>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-semibold text-[var(--unilabor-neutral)]">Documento vigente del SGC</span>
          <SearchableSelect
            value={documentId}
            options={options}
            onChange={setDocumentId}
            disabled={loadingDocuments}
            clearable={false}
            placeholder={loadingDocuments ? 'Cargando documentos…' : 'Selecciona un documento…'}
            searchPlaceholder="Buscar por título, código o categoría…"
          />
        </div>

        <label className="mt-3 block text-xs font-semibold text-[var(--unilabor-neutral)]">
          Plazo para leer y firmar (horas)
          <input
            type="number"
            min={1}
            max={8760}
            value={deadlineHours}
            onChange={(event) => setDeadlineHours(Number(event.target.value))}
            className="mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.15)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
          />
        </label>

        <p className="mt-3 text-xs text-[var(--unilabor-neutral)]">
          Al publicar se sella la huella del archivo y su número de páginas: la evidencia queda anclada a esta versión exacta del documento.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={publishing} className="rounded-full border border-[rgba(0,65,106,0.15)] px-4 py-1.5 text-xs font-semibold text-[var(--unilabor-neutral)]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={publishing}
            onClick={() => void handlePublish()}
            className="rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {publishing ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
};
