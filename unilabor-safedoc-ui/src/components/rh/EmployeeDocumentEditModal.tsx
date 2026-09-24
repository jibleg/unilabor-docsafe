import { useState } from 'react';
import { Loader2, PencilLine } from 'lucide-react';
import type { DocumentType, Employee, EmployeeDocument } from '../../types/models';

interface EmployeeDocumentEditModalProps {
  isOpen: boolean;
  employee: Employee | null;
  documentType: DocumentType | null;
  document: EmployeeDocument | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string }) => Promise<void>;
}

/**
 * Correccion de texto de un documento ya cargado: solo titulo y descripcion.
 * A diferencia del modal de carga, NO genera version nueva ni toca el PDF,
 * las fechas o el estado; es para ajustes de ortografia o redaccion.
 */
export const EmployeeDocumentEditModal = ({
  isOpen,
  employee,
  documentType,
  document,
  saving,
  onClose,
  onSubmit,
}: EmployeeDocumentEditModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lastSync, setLastSync] = useState<{ doc: EmployeeDocument | null; open: boolean }>({
    doc: document,
    open: isOpen,
  });

  // Reinicia el formulario al abrir o al cambiar de documento, durante el
  // render (mismo patron que EmployeeDocumentUploadModal).
  if (lastSync.doc !== document || lastSync.open !== isOpen) {
    setLastSync({ doc: document, open: isOpen });
    if (isOpen) {
      setTitle(document?.title ?? '');
      setDescription(document?.description ?? '');
    }
  }

  if (!isOpen || !employee || !documentType || !document) {
    return null;
  }

  const trimmedTitle = title.trim();
  const unchanged =
    trimmedTitle === document.title.trim() && description.trim() === (document.description ?? '').trim();
  const canSave = trimmedTitle.length > 0 && !unchanged && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Expediente RH
          </p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-brand-700)]">Corregir título o descripción</h2>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            {employee.full_name} | {documentType.name} | Versión {document.version}
          </p>
        </div>

        <form
          className="space-y-5 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) {
              void onSubmit({ title: trimmedTitle, description: description.trim() });
            }
          }}
        >
          <div>
            <label htmlFor="rh-doc-edit-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Título
            </label>
            <input
              id="rh-doc-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              autoFocus
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              placeholder="Título visible en el expediente"
            />
          </div>

          <div>
            <label htmlFor="rh-doc-edit-description" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Descripción
            </label>
            <textarea
              id="rh-doc-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-3 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
              placeholder="Notas internas del documento RH"
            />
          </div>

          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.88)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
            Solo se corrige el texto. El PDF, la versión, las fechas de emisión y vencimiento y el estado del
            documento no cambian. El ajuste queda registrado en la trazabilidad del expediente.
          </div>

          <div className="flex justify-end gap-3 border-t border-[rgba(0,65,106,0.08)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl border border-[rgba(0,65,106,0.12)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <PencilLine size={16} />
                  Guardar corrección
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
