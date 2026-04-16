import { useId, useState } from 'react';
import { CalendarDays, FileText, Loader2, Save, Upload } from 'lucide-react';
import { FormFieldError } from '../FormFieldError';
import type { Category } from '../../types/models';

export interface DocumentEditorFormData {
  title: string;
  category_id: string;
  description: string;
  publish_date: string;
  expiry_date: string;
  file: File | null;
}

interface DocumentEditorModalProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  error: string | null;
  categories: Category[];
  loadingCategories: boolean;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  formData: DocumentEditorFormData;
  setFormData: React.Dispatch<React.SetStateAction<DocumentEditorFormData>>;
  titleError?: string;
  categoryError?: string;
  fileError?: string;
  getFieldProps: (fieldName: string) => Record<string, unknown>;
  onChangeCapture: React.FormEventHandler<HTMLFormElement>;
  onInvalidCapture: React.FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  fileSectionTitle: string;
  fileSectionDescription: string;
  existingFileName?: string;
  emptyFileStateLabel?: string;
  fileInputPlaceholder: string;
  fileHint: string;
  fileRequired?: boolean;
  allowFileSelection?: boolean;
  allowRemoveSelectedFile?: boolean;
}

export const DocumentEditorModal = ({
  isOpen,
  title,
  subtitle,
  error,
  categories,
  loadingCategories,
  submitting,
  submitLabel,
  submittingLabel,
  formData,
  setFormData,
  titleError,
  categoryError,
  fileError,
  getFieldProps,
  onChangeCapture,
  onInvalidCapture,
  onClose,
  onSubmit,
  fileSectionTitle,
  fileSectionDescription,
  existingFileName,
  emptyFileStateLabel = 'Sin archivo seleccionado',
  fileInputPlaceholder,
  fileHint,
  fileRequired = false,
  allowFileSelection = true,
  allowRemoveSelectedFile = true,
}: DocumentEditorModalProps) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputId = useId();

  if (!isOpen) {
    return null;
  }

  const applySelectedFile = (selectedFile: File | null) => {
    setFormData((currentForm) => ({
      ...currentForm,
      file: selectedFile,
    }));
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const selectedFile = event.dataTransfer.files?.[0] ?? null;
    applySelectedFile(selectedFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)] backdrop-blur-xl">
        <div className="border-b border-[rgba(0,65,106,0.08)] bg-white/96 px-6 py-4">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{subtitle}</p>
        </div>

        <form
          onSubmit={onSubmit}
          onInvalidCapture={onInvalidCapture}
          onChangeCapture={onChangeCapture}
          className="space-y-5 p-6"
        >
          {error && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                Titulo del documento <span className="text-rose-300">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                data-value-missing="Ingresa el titulo del documento."
                {...getFieldProps('title')}
                className={`w-full rounded-xl border px-4 py-2.5 text-[var(--unilabor-ink)] outline-none transition-all ${
                  titleError
                    ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                }`}
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    title: event.target.value,
                  }))
                }
              />
              <FormFieldError id="title-error" message={titleError} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                Area / Categoria <span className="text-rose-300">*</span>
              </label>
              <select
                required
                value={formData.category_id}
                data-value-missing="Selecciona el area o categoria del documento."
                {...getFieldProps('category_id')}
                disabled={loadingCategories}
                className={`w-full appearance-none rounded-xl border px-4 py-2.5 text-[var(--unilabor-ink)] outline-none transition-all ${
                  categoryError
                    ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    category_id: event.target.value,
                  }))
                }
              >
                <option value="">{loadingCategories ? 'Cargando categorias...' : 'Seleccionar area...'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FormFieldError id="category_id-error" message={categoryError} />
            </div>

            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                {fileSectionTitle}
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
                <FileText size={16} className="text-[var(--color-brand-500)]" />
                {existingFileName || formData.file?.name || emptyFileStateLabel}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                Fecha de publicacion
              </label>
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]"
                />
                <input
                  type="date"
                  value={formData.publish_date}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-10 pr-4 text-[var(--unilabor-ink)] outline-none transition-all focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  onChange={(event) =>
                    setFormData((currentForm) => ({
                      ...currentForm,
                      publish_date: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                Fecha de vencimiento
              </label>
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]"
                />
                <input
                  type="date"
                  value={formData.expiry_date}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2.5 pl-10 pr-4 text-[var(--unilabor-ink)] outline-none transition-all focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  onChange={(event) =>
                    setFormData((currentForm) => ({
                      ...currentForm,
                      expiry_date: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                Descripcion y metadatos de busqueda
              </label>
              <textarea
                rows={3}
                value={formData.description}
                className="w-full resize-none rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-[var(--unilabor-ink)] outline-none transition-all focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                  Archivo PDF {fileRequired ? <span className="text-rose-300">*</span> : null}
                </label>
                {allowRemoveSelectedFile && formData.file && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((currentForm) => ({
                        ...currentForm,
                        file: null,
                      }))
                    }
                    className="text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]"
                  >
                    Quitar archivo
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-[rgba(124,173,211,0.2)] bg-[rgba(191,212,230,0.24)] px-4 py-3 text-xs leading-6 text-[var(--color-brand-700)]">
                {fileSectionDescription}
              </div>

              {allowFileSelection ? (
                <label
                  htmlFor={fileInputId}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative mt-3 flex cursor-pointer justify-center rounded-2xl border-2 border-dashed px-6 pb-6 pt-5 transition-all ${
                    fileError
                      ? 'border-rose-500/30 bg-rose-50'
                      : isDragActive
                        ? 'border-[rgba(0,105,166,0.4)] bg-[rgba(191,212,230,0.28)] shadow-[0_16px_32px_rgba(0,65,106,0.08)]'
                      : 'border-[rgba(0,65,106,0.16)] bg-[rgba(248,251,253,0.95)] hover:border-[rgba(124,173,211,0.4)] hover:bg-white'
                  }`}
                >
                  <div className="space-y-2 text-center">
                    <p className={`inline-flex items-center gap-2 text-sm ${fileError ? 'text-rose-700' : 'text-[var(--unilabor-ink)]'}`}>
                      <Upload size={16} className="text-[var(--color-brand-500)]" />
                      {formData.file ? (
                        <span className="font-bold text-[var(--color-brand-700)]">{formData.file.name}</span>
                      ) : (
                        fileInputPlaceholder
                      )}
                    </p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">
                      {isDragActive ? 'Suelta el archivo aqui para cargarlo.' : fileHint}
                    </p>
                  </div>
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".pdf"
                    required={fileRequired}
                    data-value-missing="Adjunta el archivo PDF que deseas publicar."
                    {...getFieldProps('file')}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(event) =>
                      applySelectedFile(event.target.files ? event.target.files[0] : null)
                    }
                  />
                </label>
              ) : (
                <div className="mt-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                  {fileHint}
                </div>
              )}
              <FormFieldError id="file-error" message={fileError} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-[rgba(0,65,106,0.12)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loadingCategories}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {submitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
