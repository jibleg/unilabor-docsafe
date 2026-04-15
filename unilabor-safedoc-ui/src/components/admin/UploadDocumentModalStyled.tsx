import { useEffect, useState } from 'react';
import {
  fetchDocumentCategories,
  getApiErrorMessage,
  uploadDocumentWithMetadata,
} from '../../api/service';
import { FormFieldError } from '../FormFieldError';
import { useNativeFormValidation } from '../../hooks/useNativeFormValidation';
import type { Category } from '../../types/models';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
  token?: string;
}

const createInitialFormData = () => ({
  title: '',
  category_id: '',
  description: '',
  publish_date: new Date().toISOString().split('T')[0],
  expiry_date: '',
  file: null as File | null,
});

export const UploadDocumentModal = ({
  isOpen,
  onClose,
  onUploadSuccess,
  token,
}: UploadDocumentModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(createInitialFormData);
  const { clearErrors, getFieldError, getFieldProps, handleChange, handleInvalid } =
    useNativeFormValidation();

  const titleError = getFieldError('title');
  const categoryError = getFieldError('category_id');
  const fileError = getFieldError('file');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError(null);
    clearErrors();
    setFormData(createInitialFormData());

    fetchDocumentCategories(token)
      .then(setCategories)
      .catch((requestError) => {
        setCategories([]);
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
      });
  }, [clearErrors, isOpen, token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.file || !formData.category_id) {
      setError('Archivo y categoria son obligatorios');
      return;
    }

    setLoading(true);
    setError(null);

    const data = new FormData();
    data.append('file', formData.file);
    data.append('title', formData.title || formData.file.name);
    data.append('category_id', formData.category_id);

    const normalizedDescription = formData.description.trim();
    const normalizedPublishDate = formData.publish_date.trim();
    const normalizedExpiryDate = formData.expiry_date.trim();

    if (normalizedDescription) {
      data.append('description', normalizedDescription);
    }

    if (normalizedPublishDate) {
      data.append('publish_date', normalizedPublishDate);
    }

    if (normalizedExpiryDate) {
      data.append('expiry_date', normalizedExpiryDate);
    }

    try {
      await uploadDocumentWithMetadata(data, token);
      clearErrors();
      setFormData(createInitialFormData());
      onUploadSuccess();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Error al subir el documento'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-100">Publicar nuevo documento controlado</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 transition hover:text-slate-200"
          >
            X
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onInvalidCapture={handleInvalid}
          onChangeCapture={handleChange}
          className="space-y-5 p-6"
        >
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
                placeholder="Ej: Manual de Procedimientos de Hematologia"
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
                className={`w-full appearance-none rounded-xl border px-4 py-2.5 text-slate-100 outline-none transition-all ${
                  categoryError
                    ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-700 bg-slate-950 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                }`}
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    category_id: event.target.value,
                  }))
                }
              >
                <option value="">Seleccionar area...</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FormFieldError id="category_id-error" message={categoryError} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Fecha de publicacion
              </label>
              <input
                type="date"
                value={formData.publish_date}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    publish_date: event.target.value,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Descripcion y metadatos de busqueda
              </label>
              <textarea
                rows={3}
                value={formData.description}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none transition-all focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                placeholder="Palabras clave para facilitar la busqueda al personal..."
                onChange={(event) =>
                  setFormData((currentForm) => ({
                    ...currentForm,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Archivo PDF <span className="text-rose-300">*</span>
              </label>
              <div
                className={`relative mt-1 flex cursor-pointer justify-center rounded-2xl border-2 border-dashed px-6 pb-6 pt-5 transition-all ${
                  fileError
                    ? 'border-rose-500/50 bg-rose-950/10'
                    : 'border-slate-700 bg-slate-950 hover:border-cyan-500/40 hover:bg-slate-900'
                }`}
              >
                <div className="space-y-1 text-center">
                  <p className={`text-sm ${fileError ? 'text-rose-200' : 'text-slate-400'}`}>
                    {formData.file ? (
                      <span className="font-bold text-cyan-200">{formData.file.name}</span>
                    ) : (
                      'Haz clic para seleccionar el PDF'
                    )}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  required
                  data-value-missing="Adjunta el archivo PDF que deseas publicar."
                  {...getFieldProps('file')}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) =>
                    setFormData((currentForm) => ({
                      ...currentForm,
                      file: event.target.files ? event.target.files[0] : null,
                    }))
                  }
                />
              </div>
              <FormFieldError id="file-error" message={fileError} />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 py-2.5 font-bold text-slate-300 transition-colors hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="unilabor-button-primary flex-1 rounded-xl py-2.5 font-bold shadow-lg shadow-cyan-900/30 transition-all disabled:bg-slate-600 disabled:text-slate-300"
            >
              {loading ? 'Subiendo...' : 'Publicar documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
