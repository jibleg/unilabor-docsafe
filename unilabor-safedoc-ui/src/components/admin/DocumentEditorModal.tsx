import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, FileText, Loader2, Save, SlidersHorizontal, Upload } from 'lucide-react';
import { FormFieldError } from '../FormFieldError';
import { SearchableSelect } from '../SearchableSelect';
import type { Category } from '../../types/models';

export interface DocumentEditorFormData {
  title: string;
  category_id: string;
  description: string;
  code: string;
  publish_date: string;
  expiry_date: string;
  file: File | null;
}

type EditorTab = 'properties' | 'file';

const TABS: Array<{ key: EditorTab; label: string; icon: typeof FileText }> = [
  { key: 'properties', label: 'Propiedades', icon: SlidersHorizontal },
  { key: 'file', label: 'Archivo PDF', icon: FileText },
];

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
  // Pestañas: las propiedades y el archivo van en paneles distintos para que el
  // modal no desborde en altura. Ambos paneles quedan montados (solo se ocultan)
  // para que la validación nativa del formulario siga viendo todos los campos.
  const [activeTab, setActiveTab] = useState<EditorTab>('properties');
  const fileInputId = useId();
  // La categoria se elige en un dropdown con buscador; un input oculto conserva
  // la validacion nativa (obligatorio) y avisa al formulario cuando cambia.
  const categoryInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (categoryInputRef.current && formData.category_id) {
      categoryInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [formData.category_id]);

  if (!isOpen) {
    return null;
  }

  // Los dos paneles se apilan en la misma celda: el modal mide siempre lo que
  // mide el panel mas alto y no cambia de tamanio al pasar de una pestaña a otra.
  const panelClass = (tab: EditorTab) =>
    `col-start-1 row-start-1 grid gap-5 self-start md:grid-cols-2 ${activeTab === tab ? '' : 'invisible pointer-events-none'}`;
  const propertiesHasError = Boolean(titleError || categoryError);
  const fileHasError = Boolean(fileError);

  // Un campo inválido en la pestaña oculta no se puede enfocar: se cambia a su pestaña.
  const handleInvalid: React.FormEventHandler<HTMLFormElement> = (event) => {
    const target = event.target as HTMLInputElement | null;
    setActiveTab(target?.type === 'file' ? 'file' : 'properties');
    onInvalidCapture(event);
  };

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
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)] backdrop-blur-xl">
        <div className="border-b border-[rgba(0,65,106,0.08)] bg-white/96 px-6 py-4">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{subtitle}</p>
          <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Secciones del documento">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const hasError = tab.key === 'properties' ? propertiesHasError : fileHasError;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white shadow-md'
                      : 'border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]'
                  }`}
                >
                  <Icon size={13} /> {tab.label}
                  {hasError ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Con errores" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          onInvalidCapture={handleInvalid}
          onChangeCapture={onChangeCapture}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {error && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="grid">
            <div className={panelClass('properties')} role="tabpanel" aria-label="Propiedades" aria-hidden={activeTab !== 'properties'}>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                  Título del documento <span className="text-rose-300">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  data-value-missing="Ingresa el título del documento."
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
                  Área / Categoría <span className="text-rose-300">*</span>
                </label>
                <div className={categoryError ? 'rounded-xl ring-2 ring-rose-500/30' : ''}>
                  <SearchableSelect
                    value={formData.category_id}
                    onChange={(value) =>
                      setFormData((currentForm) => ({
                        ...currentForm,
                        category_id: value,
                      }))
                    }
                    options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
                    placeholder={loadingCategories ? 'Cargando categorías...' : 'Seleccionar área...'}
                    searchPlaceholder="Buscar área o categoría..."
                    disabled={loadingCategories}
                    clearable={false}
                  />
                </div>
                <input
                  ref={categoryInputRef}
                  type="text"
                  required
                  tabIndex={-1}
                  aria-hidden="true"
                  value={formData.category_id}
                  // readOnly dejaria al campo fuera de la validacion nativa; el valor lo fija el dropdown.
                  onChange={() => undefined}
                  data-value-missing="Selecciona el área o categoría del documento."
                  {...getFieldProps('category_id')}
                  className="sr-only"
                />
                <FormFieldError id="category_id-error" message={categoryError} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                  Código del documento (SGC)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  placeholder="Ej. REH-INS-001"
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-[var(--unilabor-ink)] outline-none transition-all focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  onChange={(event) =>
                    setFormData((currentForm) => ({
                      ...currentForm,
                      code: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[var(--unilabor-neutral)]">
                  Fecha de publicación
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
                  Descripción y metadatos de búsqueda
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

            </div>

            <div className={panelClass('file')} role="tabpanel" aria-label="Archivo PDF" aria-hidden={activeTab !== 'file'}>
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-4 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  {fileSectionTitle}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]">
                  <FileText size={16} className="text-[var(--color-brand-500)]" />
                  {existingFileName || formData.file?.name || emptyFileStateLabel}
                </p>
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
                        {isDragActive ? 'Suelta el archivo aquí para cargarlo.' : fileHint}
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
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[rgba(0,65,106,0.08)] bg-white/96 px-6 py-4">
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
