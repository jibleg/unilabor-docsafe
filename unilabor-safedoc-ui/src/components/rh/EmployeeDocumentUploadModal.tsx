import { useEffect, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import type { DocumentType, Employee, EmployeeDocument } from '../../types/models';

interface EmployeeDocumentUploadModalProps {
  isOpen: boolean;
  employee: Employee | null;
  documentType: DocumentType | null;
  currentDocument?: EmployeeDocument | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    issue_date: string;
    expiry_date: string;
    file: File | null;
  }) => Promise<void>;
}

export const EmployeeDocumentUploadModal = ({
  isOpen,
  employee,
  documentType,
  currentDocument,
  saving,
  onClose,
  onSubmit,
}: EmployeeDocumentUploadModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle(currentDocument?.title ?? documentType?.name ?? '');
    setDescription(currentDocument?.description ?? '');
    setIssueDate(currentDocument?.issue_date ?? '');
    setExpiryDate(currentDocument?.expiry_date ?? '');
    setFile(null);
  }, [currentDocument, documentType, isOpen]);

  if (!isOpen || !employee || !documentType) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Expediente RH
          </p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-brand-700)]">
            {currentDocument ? 'Reemplazar documento' : 'Cargar documento'}
          </h2>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            {employee.full_name} | {documentType.name}
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Titulo
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                placeholder="Titulo visible en el expediente"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Archivo PDF
              </label>
              <label className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(239,245,250,0.72)] px-4 py-3 text-sm text-[var(--unilabor-ink)] transition hover:border-[var(--color-brand-300)]">
                <span className="truncate pr-3">
                  {file ? file.name : 'Selecciona el PDF del expediente'}
                </span>
                <UploadCloud size={18} className="text-[var(--color-brand-500)]" />
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-3 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              placeholder="Notas internas del documento RH"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fecha de emision {documentType.has_expiry ? '*' : ''}
                  </label>
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </div>
            <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fecha de vencimiento {documentType.has_expiry ? '*' : ''}
                  </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                disabled={!documentType.has_expiry}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
            {documentType.has_expiry
              ? 'Este tipo documental controla vigencia. Debes capturar fecha de emision y fecha de vencimiento. Si cargas una nueva version, la anterior quedara marcada como derogada dentro del expediente.'
              : 'La nueva carga sustituye la version vigente anterior y conserva el historial dentro del expediente RH.'}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[rgba(0,65,106,0.08)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-[rgba(0,65,106,0.12)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void onSubmit({
                title,
                description,
                issue_date: issueDate,
                expiry_date: expiryDate,
                file,
              })
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <UploadCloud size={16} />
                {currentDocument ? 'Reemplazar documento' : 'Cargar documento'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
