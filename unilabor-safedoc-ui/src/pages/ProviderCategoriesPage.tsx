import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../api/service';
import {
  createProviderDocumentCategory,
  deactivateProviderDocumentCategory,
  deleteProviderDocumentCategory,
  listProviderDocumentCategories,
  updateProviderDocumentCategory,
} from '../api/service.api-providers';
import type { ProviderDocumentCategory } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { confirmAction } from '../utils/confirm';

interface CategoryFormState {
  code: string;
  name: string;
  description: string;
  sort_order: string;
}

const EMPTY_FORM: CategoryFormState = { code: '', name: '', description: '', sort_order: '0' };

export const ProviderCategoriesPage = () => {
  const [categories, setCategories] = useState<ProviderDocumentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProviderDocumentCategory | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProviderDocumentCategories(true);
      setCategories(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las categorías.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...categories]
      .filter((category) =>
        normalizedQuery.length === 0
          ? true
          : category.name.toLowerCase().includes(normalizedQuery) ||
            category.code.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'));
  }, [categories, query]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (category: ProviderDocumentCategory) => {
    setEditingCategory(category);
    setForm({
      code: category.code,
      name: category.name,
      description: category.description ?? '',
      sort_order: String(category.sort_order),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }
    setIsModalOpen(false);
    setEditingCategory(null);
    setForm(EMPTY_FORM);
  };

  const submitForm = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name) {
      notifyWarning('Código y nombre son obligatorios.');
      return;
    }

    const payload = {
      code,
      name,
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };

    setSaving(true);
    try {
      if (editingCategory) {
        await updateProviderDocumentCategory(editingCategory.id, payload);
        notifySuccess('Categoría actualizada correctamente.');
      } else {
        await createProviderDocumentCategory(payload);
        notifySuccess('Categoría creada correctamente.');
      }
      closeModal();
      await loadCategories();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la categoría.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (category: ProviderDocumentCategory) => {
    const confirmed = await confirmAction(
      `Desactivar: ${category.name}`,
      'Dejará de estar disponible para nuevos documentos. Los documentos existentes con esta categoría no se ven afectados.',
      'Desactivar',
      'primary',
    );
    if (!confirmed) {
      return;
    }

    setBusyId(category.id);
    try {
      await deactivateProviderDocumentCategory(category.id);
      notifySuccess('Categoría desactivada correctamente.');
      await loadCategories();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desactivar la categoría.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (category: ProviderDocumentCategory) => {
    const confirmed = await confirmAction(
      `Eliminar definitivamente: ${category.name}`,
      'El registro se borrará de la base de datos y no se podrá recuperar. Solo procede si ningún documento la usa.',
      'Eliminar definitivamente',
      'danger',
    );
    if (!confirmed) {
      return;
    }

    setBusyId(category.id);
    try {
      await deleteProviderDocumentCategory(category.id);
      notifySuccess('Categoría eliminada definitivamente.');
      await loadCategories();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar la categoría.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Categorías de documento</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Clasificación de los documentos de proveedor (contratos, pólizas, convenios, etc.).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nueva categoría
          </button>
          <button
            type="button"
            onClick={() => void loadCategories()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar categoría..."
          className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] lg:max-w-md"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Código</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-[var(--unilabor-neutral)]">Cargando categorías...</td>
              </tr>
            ) : filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-[var(--unilabor-neutral)]">No hay categorías para mostrar.</td>
              </tr>
            ) : (
              filteredCategories.map((category) => {
                const isBusy = busyId === category.id;
                return (
                  <tr key={category.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                    <td className="px-6 py-4 text-sm font-mono text-[var(--unilabor-neutral)]">{category.code}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-[var(--color-brand-700)]">{category.name}</p>
                      {category.description ? (
                        <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">{category.description}</p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          category.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]'
                        }`}
                      >
                        {category.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(category)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Edit3 size={14} />
                          Editar
                        </button>
                        {category.is_active ? (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(category)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <EyeOff size={14} />
                            Desactivar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDelete(category)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          {isBusy ? 'Procesando...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">
                {editingCategory ? 'Editar categoría' : 'Nueva categoría'}
              </h2>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Código
                </label>
                <input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  placeholder="Ejemplo: CONTRATO"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Nombre
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  placeholder="Ejemplo: Contrato"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Orden
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitForm()}
                  disabled={saving}
                  className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar categoría'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
