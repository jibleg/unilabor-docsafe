import { useEffect, useState } from 'react';
import {
  fetchDocumentCategories,
  getApiErrorMessage,
  uploadDocumentWithMetadata,
} from '../../api/service';
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
  const { clearErrors, handleChange, handleInvalid } = useNativeFormValidation();

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-800 bg-slate-900/90 backdrop-blur-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-100">Publicar nuevo documento controlado</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form
          onSubmit={handleSubmit}
          onInvalidCapture={handleInvalid}
          onChangeCapture={handleChange}
          className="p-6 space-y-5"
        >
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Título */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título del Documento</label>
              <input 
                type="text" required
                className="w-full px-4 py-2.5 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 outline-none transition-all"
                placeholder="Ej: Manual de Procedimientos de Hematología"
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
            </div>

            {/* Categoría Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Área / Categoría</label>
              <select 
                required
                className="w-full px-4 py-2.5 border border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 outline-none appearance-none bg-slate-950 text-slate-100"
                onChange={(e) => setFormData({...formData, category_id: e.target.value})}
              >
                <option value="">Seleccionar área...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Fecha Publicación */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de Publicación</label>
              <input 
                type="date"
                value={formData.publish_date}
                className="w-full px-4 py-2.5 border border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 outline-none bg-slate-950 text-slate-100"
                onChange={(e) => setFormData({...formData, publish_date: e.target.value})}
              />
            </div>

            {/* Descripción */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción y Metadatos de Búsqueda</label>
              <textarea 
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400 outline-none resize-none bg-slate-950 text-slate-100"
                placeholder="Palabras clave para facilitar la búsqueda al personal..."
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              ></textarea>
            </div>

            {/* Dropzone / Input File */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Archivo PDF</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-700 border-dashed rounded-2xl hover:border-cyan-500/40 hover:bg-slate-900 transition-all cursor-pointer relative bg-slate-950">
                <div className="space-y-1 text-center">
                  <p className="text-sm text-slate-400">
                    {formData.file ? <span className="font-bold text-cyan-200">{formData.file.name}</span> : "Haz clic para seleccionar el PDF"}
                  </p>
                </div>
                <input 
                  type="file" accept=".pdf" required
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => setFormData({...formData, file: e.target.files ? e.target.files[0] : null})}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-700 bg-slate-900 text-slate-300 font-bold rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" disabled={loading}
              className="unilabor-button-primary flex-1 py-2.5 font-bold rounded-xl disabled:bg-slate-600 disabled:text-slate-300 shadow-lg shadow-cyan-900/30 transition-all"
            >
              {loading ? "Subiendo..." : "Publicar Documento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
