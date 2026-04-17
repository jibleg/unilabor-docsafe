import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, RefreshCw, ShieldCheck, Tags, TimerReset, Trash2 } from 'lucide-react';
import {
  createDocumentType,
  deleteDocumentTypeById,
  getApiErrorMessage,
  listDocumentSections,
  listDocumentTypes,
  type DocumentTypePayload,
  updateDocumentTypeById,
} from '../api/service';
import type { DocumentSection, DocumentType } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

interface TypeFormState {
  section_id: string;
  code: string;
  name: string;
  description: string;
  sort_order: string;
  is_required: boolean;
  is_sensitive: boolean;
  has_expiry: boolean;
  is_active: boolean;
}

const EMPTY_FORM: TypeFormState = {
  section_id: '',
  code: '',
  name: '',
  description: '',
  sort_order: '0',
  is_required: false,
  is_sensitive: false,
  has_expiry: false,
  is_active: true,
};

const buildPayload = (form: TypeFormState): DocumentTypePayload => ({
  section_id: Number.parseInt(form.section_id, 10),
  code: form.code.trim() || undefined,
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  sort_order: Number.parseInt(form.sort_order || '0', 10) || 0,
  is_required: form.is_required,
  is_sensitive: form.is_sensitive,
  has_expiry: form.has_expiry,
  is_active: form.is_active,
});

export const DocumentTypesPage = () => {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [form, setForm] = useState<TypeFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sectionsData, typesData] = await Promise.all([
        listDocumentSections(),
        listDocumentTypes(),
      ]);
      setSections(sectionsData.filter((section) => section.is_active));
      setTypes(typesData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la configuracion documental RH.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return types.filter((documentType) => {
      const matchesSection =
        sectionFilter === 'all' || String(documentType.section_id) === sectionFilter;

      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          documentType.name,
          documentType.code ?? '',
          documentType.description ?? '',
          documentType.section?.name ?? '',
        ].some((value) => value.toLowerCase().includes(normalizedQuery));

      return matchesSection && matchesQuery;
    });
  }, [query, sectionFilter, types]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedType(null);
  };

  const validateForm = (): boolean => {
    if (!form.section_id) {
      notifyWarning('Debes seleccionar una seccion documental.');
      return false;
    }
    if (!form.name.trim()) {
      notifyWarning('El nombre del tipo documental es obligatorio.');
      return false;
    }
    return true;
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (documentType: DocumentType) => {
    setSelectedType(documentType);
    setForm({
      section_id: String(documentType.section_id),
      code: documentType.code ?? '',
      name: documentType.name,
      description: documentType.description ?? '',
      sort_order: String(documentType.sort_order ?? 0),
      is_required: documentType.is_required,
      is_sensitive: documentType.is_sensitive,
      has_expiry: documentType.has_expiry,
      is_active: documentType.is_active,
    });
    setIsEditOpen(true);
  };

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await createDocumentType(buildPayload(form));
      notifySuccess('Tipo documental creado correctamente.');
      setIsCreateOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear el tipo documental.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedType || !validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await updateDocumentTypeById(selectedType.id, buildPayload(form));
      notifySuccess('Tipo documental actualizado correctamente.');
      setIsEditOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar el tipo documental.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (documentType: DocumentType) => {
    setDeletingId(documentType.id);
    try {
      await deleteDocumentTypeById(documentType.id);
      notifySuccess('Tipo documental inactivado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar el tipo documental.'));
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
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Tipos documentales</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--unilabor-neutral)]">
            Gestiona el catalogo mixto del expediente: tipos base del sistema y tipos personalizados por necesidad operativa.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
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
            Nuevo tipo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, codigo, descripcion o seccion..."
          className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
        />
        <select
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
          className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
        >
          <option value="all">Todas las secciones</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Seccion</th>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Tipo</th>
              <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Propiedades</th>
              <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                  Cargando tipos documentales...
                </td>
              </tr>
            ) : filteredTypes.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                  No hay tipos documentales para mostrar.
                </td>
              </tr>
            ) : (
              filteredTypes.map((documentType) => (
                <tr key={documentType.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--color-brand-700)]">
                    {documentType.section?.name ?? `Seccion ${documentType.section_id}`}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-[var(--color-brand-700)]">{documentType.name}</p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">
                      {documentType.code || 'Sin codigo'} · Orden {documentType.sort_order}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      {documentType.is_required ? (
                        <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Obligatorio
                        </span>
                      ) : null}
                      {documentType.is_sensitive ? (
                        <span className="rounded-full border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Sensible
                        </span>
                      ) : null}
                      {documentType.has_expiry ? (
                        <span className="rounded-full border border-[rgba(124,173,211,0.28)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Con vencimiento
                        </span>
                      ) : null}
                      {documentType.is_system_defined ? (
                        <span className="rounded-full border border-[rgba(0,65,106,0.08)] bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Base
                        </span>
                      ) : (
                        <span className="rounded-full border border-[rgba(0,65,106,0.08)] bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Personalizado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(documentType)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(documentType)}
                        disabled={deletingId === documentType.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        {deletingId === documentType.id ? 'Inactivando...' : 'Inactivar'}
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
          <div className="w-full max-w-3xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">
                {isCreateOpen ? 'Nuevo tipo documental' : 'Editar tipo documental'}
              </h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Seccion
                  </label>
                  <select
                    value={form.section_id}
                    onChange={(event) => setForm((current) => ({ ...current, section_id: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Selecciona una seccion</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Codigo
                  </label>
                  <input
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
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
                  />
                </div>
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

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-3 py-3 text-sm text-[var(--unilabor-ink)]">
                  <input
                    type="checkbox"
                    checked={form.is_required}
                    onChange={(event) => setForm((current) => ({ ...current, is_required: event.target.checked }))}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                  />
                  <ShieldCheck size={16} />
                  Obligatorio
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-3 py-3 text-sm text-[var(--unilabor-ink)]">
                  <input
                    type="checkbox"
                    checked={form.is_sensitive}
                    onChange={(event) => setForm((current) => ({ ...current, is_sensitive: event.target.checked }))}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                  />
                  <Tags size={16} />
                  Sensible
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-3 py-3 text-sm text-[var(--unilabor-ink)]">
                  <input
                    type="checkbox"
                    checked={form.has_expiry}
                    onChange={(event) => setForm((current) => ({ ...current, has_expiry: event.target.checked }))}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                  />
                  <TimerReset size={16} />
                  Con vencimiento
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-3 py-3 text-sm text-[var(--unilabor-ink)]">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                  />
                  <RefreshCw size={16} />
                  Activo
                </label>
              </div>

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
                      {isCreateOpen ? 'Guardar tipo' : 'Guardar cambios'}
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
