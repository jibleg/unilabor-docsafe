import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  createCategory,
  deleteCategoryById,
  fetchCategories,
  getApiErrorMessage,
  updateCategory,
} from '../api/service';
import type { Category } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const PAGE_SIZE_OPTIONS = [5, 10, 20];

export const CategoriesPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  const filteredCategories = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    return [...categories]
      .filter((category) =>
        queryValue.length === 0 ? true : category.name.toLowerCase().includes(queryValue),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [categories, query]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleCategories = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredCategories.slice(start, end);
  }, [filteredCategories, currentPage, pageSize]);

  const startRecord = filteredCategories.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, filteredCategories.length);

  const beginEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdition = async (categoryId: number) => {
    const nextName = editingName.trim();
    if (!nextName) {
      notifyWarning('El nombre de la categoria es obligatorio');
      return;
    }

    setSavingId(categoryId);
    try {
      const updated = await updateCategory(categoryId, nextName);
      setCategories((currentCategories) =>
        currentCategories.map((category) =>
          category.id === categoryId ? { ...category, name: updated.name } : category,
        ),
      );
      cancelEdit();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo actualizar la categoria'));
    } finally {
      setSavingId(null);
    }
  };

  const confirmDeleteCategory = (categoryName: string): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;

      const settle = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      toast.warning(
        ({ closeToast }) => (
          <div className="space-y-3">
            <p className="text-sm text-slate-100">
              Se eliminara la categoria <span className="font-bold">"{categoryName}"</span>.
            </p>
            <p className="text-xs text-slate-300">Esta accion no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                onClick={() => {
                  settle(false);
                  closeToast();
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                onClick={() => {
                  settle(true);
                  closeToast();
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ),
        {
          autoClose: false,
          closeOnClick: false,
          closeButton: false,
          draggable: false,
          onClose: () => settle(false),
        },
      );
    });

  const removeCategory = async (category: Category) => {
    const shouldDelete = await confirmDeleteCategory(category.name);
    if (!shouldDelete) {
      return;
    }

    setDeletingId(category.id);
    try {
      await deleteCategoryById(category.id);
      setCategories((currentCategories) =>
        currentCategories.filter((currentCategory) => currentCategory.id !== category.id),
      );
      if (editingId === category.id) {
        cancelEdit();
      }
      notifySuccess('Categoria eliminada correctamente');
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo eliminar la categoria'));
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateModal = () => {
    setNewCategoryName('');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) {
      return;
    }
    setIsCreateModalOpen(false);
    setNewCategoryName('');
  };

  const submitNewCategory = async () => {
    const normalizedName = newCategoryName.trim();
    if (!normalizedName) {
      notifyWarning('El nombre de la categoria es obligatorio');
      return;
    }

    setCreating(true);
    try {
      await createCategory(normalizedName);
      setIsCreateModalOpen(false);
      setNewCategoryName('');
      await loadCategories();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo crear la categoria'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Categorias</h1>
          <p className="text-sm text-slate-400">
            Gestiona las categorias disponibles para clasificar documentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            <Plus size={16} />
            Nueva categoria
          </button>
          <button
            type="button"
            onClick={() => void loadCategories()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar categoria..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 lg:max-w-md"
          />

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Filas por pagina</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-slate-800 bg-slate-900/80">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">
                Nombre
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-slate-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={2} className="p-10 text-center text-slate-500">
                  Cargando categorias...
                </td>
              </tr>
            ) : visibleCategories.length === 0 ? (
              <tr>
                <td colSpan={2} className="p-10 text-center text-slate-500">
                  No hay categorias para mostrar.
                </td>
              </tr>
            ) : (
              visibleCategories.map((category) => {
                const isEditing = editingId === category.id;
                const isSaving = savingId === category.id;
                const isDeleting = deletingId === category.id;
                return (
                  <tr key={category.id} className="transition-colors hover:bg-slate-800/50">
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-100">{category.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdition(category.id)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Save size={14} />
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <X size={14} />
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEdit(category)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Edit3 size={14} />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeCategory(category)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 size={14} />
                              {isDeleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Mostrando {startRecord} - {endRecord} de {filteredCategories.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-xs font-semibold text-slate-300">
            Pagina {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-base font-bold text-slate-100">Nueva categoria</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Nombre
                </label>
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void submitNewCategory();
                    }
                  }}
                  autoFocus
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="Ejemplo: Calidad"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitNewCategory()}
                  disabled={creating}
                  className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Guardar categoria'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
