import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  createDocumentSection,
  deleteDocumentSectionById,
  getApiErrorMessage,
  listDocumentSections,
  type DocumentSectionPayload,
  updateDocumentSectionById,
} from '../api/service';
import type { DocumentSection } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

interface SectionFormState {
  code: string;
  name: string;
  description: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: SectionFormState = {
  code: '',
  name: '',
  description: '',
  sort_order: '0',
  is_active: true,
};

const buildPayload = (form: SectionFormState): DocumentSectionPayload => ({
  code: form.code.trim() || undefined,
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  sort_order: Number.parseInt(form.sort_order || '0', 10) || 0,
  is_active: form.is_active,
});

export const DocumentSectionsPage = () => {
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<DocumentSection | null>(null);
  const [form, setForm] = useState<SectionFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDocumentSections();
      setSections(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las secciones documentales.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sections;
    }

    return sections.filter((section) =>
      [section.code, section.name, section.description ?? '']
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, sections]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedSection(null);
  };

  const validateForm = (): boolean => {
    if (!form.name.trim()) {
      notifyWarning('El nombre de la seccion es obligatorio.');
      return false;
    }
    return true;
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (section: DocumentSection) => {
    setSelectedSection(section);
    setForm({
      code: section.code,
      name: section.name,
      description: section.description ?? '',
      sort_order: String(section.sort_order ?? 0),
      is_active: section.is_active,
    });
    setIsEditOpen(true);
  };

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await createDocumentSection(buildPayload(form));
      notifySuccess('Seccion documental creada correctamente.');
      setIsCreateOpen(false);
      resetForm();
      await loadSections();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear la seccion documental.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedSection || !validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await updateDocumentSectionById(selectedSection.id, buildPayload(form));
      notifySuccess('Seccion documental actualizada correctamente.');
      setIsEditOpen(false);
      resetForm();
      await loadSections();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la seccion documental.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (section: DocumentSection) => {
    setDeletingId(section.id);
    try {
      await deleteDocumentSectionById(section.id);
      notifySuccess('Seccion documental inactivada correctamente.');
      await loadSections();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar la seccion documental.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Secciones documentales</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--unilabor-neutral)]">
            Define los grandes bloques del expediente digital del colaborador y su orden dentro del modulo RH.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadSections()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nueva seccion
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por codigo, nombre o descripcion..."
          className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Orden</th>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Codigo</th>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</th>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
              <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                  Cargando secciones...
                </td>
              </tr>
            ) : filteredSections.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                  No hay secciones para mostrar.
                </td>
              </tr>
            ) : (
              filteredSections.map((section) => (
                <tr key={section.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--color-brand-700)]">{section.sort_order}</td>
                  <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">{section.code}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-[var(--color-brand-700)]">{section.name}</p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{section.description || 'Sin descripcion'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                        {section.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                      {section.is_system_defined ? (
                        <span className="rounded-full border border-[rgba(124,173,211,0.28)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Base
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(section)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(section)}
                        disabled={deletingId === section.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        {deletingId === section.id ? 'Inactivando...' : 'Inactivar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(isCreateOpen || isEditOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">
                {isCreateOpen ? 'Nueva seccion documental' : 'Editar seccion documental'}
              </h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Codigo
                  </label>
                  <input
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="PERSONAL, CONTRACTS..."
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Orden
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.sort_order}
                    onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Nombre
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Descripcion
                </label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-ink)]">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                  className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                />
                Mantener activa
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void (isCreateOpen ? handleCreate() : handleUpdate())}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      {isCreateOpen ? 'Guardar seccion' : 'Guardar cambios'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
