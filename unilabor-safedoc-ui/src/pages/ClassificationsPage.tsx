import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, EyeOff, Plus, RefreshCw, Trash2, Truck } from 'lucide-react';
import { getApiErrorMessage } from '../api/service';
import {
  createClassification,
  deactivateClassification,
  deleteClassification,
  listClassifications,
  updateClassification,
} from '../api/service.api-classifications';
import type { Classification, ClassificationType } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { confirmAction } from '../utils/confirm';

interface ClassificationFormState {
  name: string;
  description: string;
  sort_order: string;
}

const EMPTY_FORM: ClassificationFormState = { name: '', description: '', sort_order: '0' };

const TYPE_TABS: { key: ClassificationType; label: string; icon: typeof Truck }[] = [
  { key: 'PROVIDER', label: 'Proveedores', icon: Truck },
  { key: 'CLIENT', label: 'Clientes', icon: Building2 },
];

export const ClassificationsPage = () => {
  const [activeType, setActiveType] = useState<ClassificationType>('PROVIDER');
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClassification, setEditingClassification] = useState<Classification | null>(null);
  const [form, setForm] = useState<ClassificationFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadClassifications = useCallback(async (type: ClassificationType) => {
    setLoading(true);
    try {
      const data = await listClassifications({ type, includeInactive: true });
      setClassifications(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las clasificaciones.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClassifications(activeType);
  }, [activeType, loadClassifications]);

  const filteredClassifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...classifications]
      .filter((classification) =>
        normalizedQuery.length === 0 ? true : classification.name.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'));
  }, [classifications, query]);

  const openCreateModal = () => {
    setEditingClassification(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (classification: Classification) => {
    setEditingClassification(classification);
    setForm({
      name: classification.name,
      description: classification.description ?? '',
      sort_order: String(classification.sort_order),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }
    setIsModalOpen(false);
    setEditingClassification(null);
    setForm(EMPTY_FORM);
  };

  const submitForm = async () => {
    const name = form.name.trim();
    if (!name) {
      notifyWarning('El nombre es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      if (editingClassification) {
        await updateClassification(editingClassification.id, {
          name,
          description: form.description.trim() || null,
          sort_order: Number(form.sort_order) || 0,
        });
        notifySuccess('Clasificación actualizada correctamente.');
      } else {
        await createClassification({
          type: activeType,
          name,
          description: form.description.trim() || null,
          sort_order: Number(form.sort_order) || 0,
        });
        notifySuccess('Clasificación creada correctamente.');
      }
      closeModal();
      await loadClassifications(activeType);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la clasificación.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (classification: Classification) => {
    const confirmed = await confirmAction(
      `Desactivar: ${classification.name}`,
      'Dejará de estar disponible para asignarse a nuevos registros. Los registros existentes no se ven afectados.',
      'Desactivar',
      'primary',
    );
    if (!confirmed) {
      return;
    }

    setBusyId(classification.id);
    try {
      await deactivateClassification(classification.id);
      notifySuccess('Clasificación desactivada correctamente.');
      await loadClassifications(activeType);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desactivar la clasificación.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (classification: Classification) => {
    const confirmed = await confirmAction(
      `Eliminar definitivamente: ${classification.name}`,
      'El registro se borrará de la base de datos y no se podrá recuperar. Solo procede si ningún registro la usa.',
      'Eliminar definitivamente',
      'danger',
    );
    if (!confirmed) {
      return;
    }

    setBusyId(classification.id);
    try {
      await deleteClassification(classification.id);
      notifySuccess('Clasificación eliminada definitivamente.');
      await loadClassifications(activeType);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar la clasificación.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Clasificación</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Catálogo de clasificación para proveedores y clientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nueva clasificación
          </button>
          <button
            type="button"
            onClick={() => void loadClassifications(activeType)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-2 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        {TYPE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveType(tab.key)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeType === tab.key
                  ? 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)]'
                  : 'text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.2)]'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar clasificación..."
          className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] lg:max-w-md"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Descripción</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-[var(--unilabor-neutral)]">Cargando clasificaciones...</td>
              </tr>
            ) : filteredClassifications.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-[var(--unilabor-neutral)]">No hay clasificaciones para mostrar.</td>
              </tr>
            ) : (
              filteredClassifications.map((classification) => {
                const isBusy = busyId === classification.id;
                return (
                  <tr key={classification.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--color-brand-700)]">
                      {classification.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--unilabor-neutral)]">
                      {classification.description || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          classification.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]'
                        }`}
                      >
                        {classification.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(classification)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Edit3 size={14} />
                          Editar
                        </button>
                        {classification.is_active ? (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(classification)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <EyeOff size={14} />
                            Desactivar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDelete(classification)}
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
                {editingClassification
                  ? 'Editar clasificación'
                  : `Nueva clasificación de ${activeType === 'PROVIDER' ? 'proveedores' : 'clientes'}`}
              </h2>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Nombre
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  placeholder="Ejemplo: Estratégico"
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
                  {saving ? 'Guardando...' : 'Guardar clasificación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
