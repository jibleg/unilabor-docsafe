import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Loader2, Save, Upload, X } from 'lucide-react';
import {
  fetchDocumentCategories,
  getApiErrorMessage,
  updateDocumentById,
} from '../../api/service';
import { FormFieldError } from '../FormFieldError';
import { useNativeFormValidation } from '../../hooks/useNativeFormValidation';
import type { Category, Document } from '../../types/models';

interface EditDocumentModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSuccess: (options: { replacedFile: boolean }) => Promise<void> | void;
  token?: string;
}

interface EditDocumentFormState {
  title: string;
  category_id: string;
  description: string;
  publish_date: string;
  expiry_date: string;
  file: File | null;
}

const normalizeDateInputValue = (value?: string): string => {
  if (!value) {
    return '';
  }

  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmedValue)) {
    return trimmedValue.slice(0, 10);
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
};

const createInitialFormData = (document: Document | null): EditDocumentFormState => ({
  title: document?.title ?? '',
  category_id: document?.category_id ? String(document.category_id) : '',
  description: document?.description ?? '',
  publish_date: normalizeDateInputValue(document?.publish_date ?? document?.created_at),
  expiry_date: normalizeDateInputValue(document?.expiry_date),
  file: null,
});

export const EditDocumentModal = ({
  document,
  isOpen,
  onClose,
  onUpdateSuccess,
  token,
}: EditDocumentModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditDocumentFormState>(createInitialFormData(document));
  const { clearErrors, getFieldError, getFieldProps, handleChange, handleInvalid } =
    useNativeFormValidation();

  const titleError = getFieldError('title');
  const categoryError = getFieldError('category_id');
  const canReplaceDocument = document?.status === 'active';

  const matchedCategoryId = useMemo(() => {
    if (!document?.category_name) {
      return '';
    }

    const match = categories.find(
      (category) => category.name.trim().toLowerCase() === document.category_name?.trim().toLowerCase(),
    );

    return match ? String(match.id) : '';
  }, [categories, document?.category_name]);

  useEffect(() => {
    if (!isOpen || !document) {
      return;
    }

    setError(null);
    clearErrors();
    setFormData(createInitialFormData(document));
    setLoadingCategories(true);

    fetchDocumentCategories(token)
      .then((nextCategories) => {
        setCategories(nextCategories);
      })
      .catch((requestError) => {
        setCategories([]);
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
      })
      .finally(() => {
        setLoadingCategories(false);
      });
  }, [clearErrors, document, isOpen, token]);

  useEffect(() => {
    if (!matchedCategoryId) {
      return;
    }

    setFormData((currentForm) =>
      currentForm.category_id
        ? currentForm
        : {
            ...currentForm,
            category_id: matchedCategoryId,
          },
    );
  }, [matchedCategoryId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!document) {
      return;
    }

    if (formData.file && !canReplaceDocument) {
      setError('Solo los documentos vigentes pueden reemplazarse por una nueva version.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateDocumentById(document.id, formData);
      await onUpdateSuccess({ replacedFile: Boolean(formData.file) });
      clearErrors();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el documento'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !document) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              {canReplaceDocument ? 'Editar documento vigente' : 'Editar metadata del documento'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {canReplaceDocument
                ? 'Actualiza metadata y, si adjuntas un nuevo PDF, se publicara una nueva version vigente.'
                : 'Puedes actualizar la metadata, pero el reemplazo de archivo solo aplica para documentos vigentes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onInvalidCapture={handleInvalid}
          onChangeCapture={handleChange}
          className="space-y-5 p-6"
        >
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Titulo del documento <span className="text-rose-300">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                data-value-missing="Ingresa el titulo del documento."
                {...getFieldProps('title')}
                className={`w-full rounded-xl border px-4 py-2.5 text-slate-100 outline-none transition-all ${
                  titleError
                    ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
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
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Area / Categoria <span className="text-rose-300">*</span>
              </label>
              <select
                required
                value={formData.category_id}
                data-value-missing="Selecciona el area o categoria del documento."
                {...getFieldProps('category_id')}
                disabled={loadingCategories}
                className={`w-full appearance-none rounded-xl border px-4 py-2.5 text-slate-100 outline-none transition-all ${
                  categoryError
                    ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
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

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Archivo vigente
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                <FileText size={16} className="text-cyan-300" />
                {document.filename}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Fecha de publicacion
              </label>
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="date"
                  value={formData.publish_date}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-slate-100 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
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
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Fecha de vencimiento
              </label>
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="date"
                  value={formData.expiry_date}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-slate-100 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
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
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Descripcion y metadatos de busqueda
              </label>
              <textarea
                rows={3}
                value={formData.description}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
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
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Reemplazar PDF vigente
                </label>
                {canReplaceDocument && formData.file && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((currentForm) => ({
                        ...currentForm,
                        file: null,
                      }))
                    }
                    className="text-xs font-semibold text-rose-300 transition hover:text-rose-200"
                  >
                    Quitar archivo
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-100/90">
                {canReplaceDocument
                  ? 'Si adjuntas un nuevo PDF, el backend derogara la version actual y publicara la nueva como vigente.'
                  : 'Este documento no esta vigente. Puedes editar su metadata, pero no reemplazar el archivo desde aqui.'}
              </div>

              {canReplaceDocument ? (
                <div className="relative mt-3 flex cursor-pointer justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950 px-6 pb-6 pt-5 transition-all hover:border-cyan-500/40 hover:bg-slate-900">
                  <div className="space-y-2 text-center">
                    <p className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <Upload size={16} className="text-cyan-300" />
                      {formData.file ? (
                        <span className="font-bold text-cyan-200">{formData.file.name}</span>
                      ) : (
                        'Haz clic para seleccionar el nuevo PDF'
                      )}
                    </p>
                    <p className="text-xs text-slate-500">Opcional. Solo PDF.</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(event) =>
                      setFormData((currentForm) => ({
                        ...currentForm,
                        file: event.target.files ? event.target.files[0] : null,
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-400">
                  Reactiva el documento desde la pagina principal si necesitas devolverlo a estado
                  vigente antes de reemplazarlo.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loadingCategories}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando cambios...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
