import { Clock3, X } from 'lucide-react';
import type { DocumentType, EmployeeDocument } from '../../types/models';

interface EmployeeDocumentHistoryModalProps {
  isOpen: boolean;
  documentType: DocumentType | null;
  documents: EmployeeDocument[];
  loading?: boolean;
  onClose: () => void;
}

const formatDisplayDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('es-MX');
};

export const EmployeeDocumentHistoryModal = ({
  isOpen,
  documentType,
  documents,
  loading = false,
  onClose,
}: EmployeeDocumentHistoryModalProps) => {
  if (!isOpen || !documentType) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Historial documental RH
            </p>
            <h3 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{documentType.name}</h3>
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
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">Cargando historial documental...</div>
          ) : documents.length === 0 ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">
              No hay versiones registradas para este documento.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(0,65,106,0.08)]">
              {documents.map((document) => (
                <div key={document.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[var(--color-brand-700)]">{document.title}</p>
                      <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                        Version {document.version}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        document.is_current
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]'
                      }`}>
                        {document.is_current ? 'Vigente' : 'Historico'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">
                      Emitido: {formatDisplayDate(document.issue_date)} | Vence: {formatDisplayDate(document.expiry_date)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                      Cargado por: {document.uploaded_by_name || 'Sistema'}
                    </p>
                    {document.description ? (
                      <p className="mt-2 text-sm text-[var(--unilabor-ink)]">{document.description}</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                    <div className="flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                      <Clock3 size={14} />
                      Trazabilidad de version
                    </div>
                    <p className="mt-2">Estado: {document.status}</p>
                    <p>Documento ID: {document.id}</p>
                    <p>
                      {document.replaces_document_id
                        ? `Sustituye a ${document.replaces_document_id}`
                        : 'Primera version registrada'}
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
