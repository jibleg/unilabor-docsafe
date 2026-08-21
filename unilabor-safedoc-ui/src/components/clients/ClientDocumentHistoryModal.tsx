import { Clock3, Eye, X } from 'lucide-react';
import type { ClientDocument, ClientDocumentCategory } from '../../types/models';

interface ClientDocumentHistoryModalProps {
  isOpen: boolean;
  category: ClientDocumentCategory | null;
  documents: ClientDocument[];
  loading?: boolean;
  onClose: () => void;
  onView: (document: ClientDocument) => void;
}

const formatDisplayDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('es-MX');
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Vigente',
  superseded: 'Derogado',
  inactive: 'Inactivo',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  superseded: 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]',
  inactive: 'border-rose-200 bg-rose-50 text-rose-700',
};

export const ClientDocumentHistoryModal = ({
  isOpen,
  category,
  documents,
  loading = false,
  onClose,
  onView,
}: ClientDocumentHistoryModalProps) => {
  if (!isOpen || !category) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Trazabilidad documental
            </p>
            <h3 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{category.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.08)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Cerrar historial"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">Cargando trazabilidad...</div>
          ) : documents.length === 0 ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">
              No hay versiones registradas para esta categoría.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(0,65,106,0.08)]">
              {documents.map((document) => (
                <div key={document.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[var(--color-brand-700)]">{document.title}</p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_CLASS[document.status] ?? STATUS_CLASS.inactive}`}
                      >
                        {STATUS_LABEL[document.status] ?? document.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
                      Documento: {formatDisplayDate(document.document_date)} | Vigencia desde:{' '}
                      {formatDisplayDate(document.effective_from)} | Vence: {formatDisplayDate(document.expiry_date)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                      Cargado por: {document.uploaded_by_name || 'Sistema'} el {formatDisplayDate(document.created_at)}
                    </p>
                    {document.description ? (
                      <p className="mt-2 text-sm text-[var(--unilabor-ink)]">{document.description}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onView(document)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                    >
                      <Eye size={14} />
                      Ver documento
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                    <div className="flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                      <Clock3 size={14} />
                      Cadena de vigencia
                    </div>
                    <p className="mt-2">Documento ID: {document.id}</p>
                    <p>
                      {document.replaces_document_id
                        ? `Sustituye al documento ${document.replaces_document_id}`
                        : 'Primera versión registrada'}
                    </p>
                    <p>
                      {document.replaced_by_document_id
                        ? `Derogado por el documento ${document.replaced_by_document_id}`
                        : 'Sin reemplazo posterior'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
