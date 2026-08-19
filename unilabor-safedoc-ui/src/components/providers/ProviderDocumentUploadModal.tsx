import { useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import type { ProviderDocument, ProviderDocumentCategory, ProviderSummary } from '../../types/models';

export interface ProviderDocumentUploadSubmitPayload {
  title: string;
  description: string;
  document_date: string;
  effective_from: string;
  expiry_date: string;
  file: File | null;
}

interface ProviderDocumentUploadModalProps {
  isOpen: boolean;
  provider: ProviderSummary | null;
  category: ProviderDocumentCategory | null;
  currentDocument?: ProviderDocument | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: ProviderDocumentUploadSubmitPayload) => Promise<void>;
}

export const ProviderDocumentUploadModal = ({
  isOpen,
  provider,
  category,
  currentDocument,
  saving,
  onClose,
  onSubmit,
}: ProviderDocumentUploadModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [lastSync, setLastSync] = useState<{
    doc: ProviderDocument | null | undefined;
    category: ProviderDocumentCategory | null;
    open: boolean;
  }>({ doc: currentDocument, category, open: isOpen });

  // Reinicia el formulario al abrir el modal o al cambiar de documento/categoria,
  // durante el render (en vez de un efecto que llama setState).
  if (lastSync.doc !== currentDocument || lastSync.category !== category || lastSync.open !== isOpen) {
    setLastSync({ doc: currentDocument, category, open: isOpen });
    if (isOpen) {
      setTitle(currentDocument?.title ?? category?.name ?? '');
      setDescription(currentDocument?.description ?? '');
      setDocumentDate(currentDocument?.document_date ?? '');
      setEffectiveFrom(currentDocument?.effective_from ?? '');
      setExpiryDate(currentDocument?.expiry_date ?? '');
      setFile(null);
    }
  }

  if (!isOpen || !provider || !category) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Proveedores
          </p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-brand-700)]">
            {currentDocument ? 'Reemplazar documento' : 'Cargar documento'}
          </h2>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            {provider.name} | {category.name}
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Título
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                placeholder="Título del documento"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Archivo PDF
              </label>
              <label className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(239,245,250,0.72)] px-4 py-3 text-sm text-[var(--unilabor-ink)] transition hover:border-[var(--color-brand-300)]">
                <span className="truncate pr-3">{file ? file.name : 'Selecciona el PDF del documento'}</span>
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
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-3 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              placeholder="Notas internas del documento"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Fecha del documento
              </label>
              <input
                type="date"
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Vigencia desde
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Vence
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
            {currentDocument
              ? 'La nueva carga sustituye la versión vigente: el documento actual quedará derogado y visible en el histórico.'
              : 'Este documento quedará como vigente para esta categoría.'}
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
                document_date: documentDate,
                effective_from: effectiveFrom,
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
