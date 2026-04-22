import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Eye,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createHelpdeskAsset,
  deleteHelpdeskAssetById,
  getApiErrorMessage,
  listEmployees,
  listHelpdeskAssets,
  listHelpdeskCatalogs,
  type HelpdeskAssetPayload,
  updateHelpdeskAssetById,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type { Employee, HelpdeskAsset, HelpdeskCatalogItem, HelpdeskCatalogs } from '../types/models';
import { getModuleRole } from '../utils/modules';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';

interface AssetFormState {
  asset_code: string;
  name: string;
  description: string;
  category_id: string;
  unit_id: string;
  area_id: string;
  location_id: string;
  brand_name: string;
  model: string;
  serial_number: string;
  complementary_info: string;
  purchase_modality_id: string;
  purchase_condition_id: string;
  assigned_employee_id: string;
  responsible_employee_id: string;
  criticality_id: string;
  operational_status_id: string;
  acquired_on: string;
  warranty_expires_on: string;
  inventory_legacy_code: string;
  legacy_consecutive: string;
  legacy_component_consecutive: string;
  notes: string;
}

const EMPTY_CATALOGS: HelpdeskCatalogs = {
  categories: [],
  units: [],
  areas: [],
  locations: [],
  brands: [],
  purchase_modalities: [],
  purchase_conditions: [],
  criticalities: [],
  operational_statuses: [],
};

const EMPTY_FORM: AssetFormState = {
  asset_code: '',
  name: '',
  description: '',
  category_id: '',
  unit_id: '',
  area_id: '',
  location_id: '',
  brand_name: '',
  model: '',
  serial_number: '',
  complementary_info: '',
  purchase_modality_id: '',
  purchase_condition_id: '',
  assigned_employee_id: '',
  responsible_employee_id: '',
  criticality_id: '',
  operational_status_id: '',
  acquired_on: '',
  warranty_expires_on: '',
  inventory_legacy_code: '',
  legacy_consecutive: '',
  legacy_component_consecutive: '',
  notes: '',
};

const catalogName = (item?: HelpdeskCatalogItem | null): string => item?.name ?? 'Sin clasificar';

const employeeLabel = (employee: Employee): string =>
  `${employee.employee_code} - ${employee.full_name}`;

const getEmployeeOptionValue = (employee: Employee): string =>
  `${employeeLabel(employee)}${employee.area ? ` | ${employee.area}` : ''}`;

const numericOrNull = (value: string): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const dateValue = (value?: string | null): string => {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
};

const toFormState = (asset: HelpdeskAsset): AssetFormState => ({
  asset_code: asset.asset_code,
  name: asset.name,
  description: asset.description ?? '',
  category_id: asset.category_id ? String(asset.category_id) : '',
  unit_id: asset.unit_id ? String(asset.unit_id) : '',
  area_id: asset.area_id ? String(asset.area_id) : '',
  location_id: asset.location_id ? String(asset.location_id) : '',
  brand_name: asset.brand?.name ?? asset.brand_name ?? '',
  model: asset.model ?? '',
  serial_number: asset.serial_number ?? '',
  complementary_info: asset.complementary_info ?? '',
  purchase_modality_id: asset.purchase_modality_id ? String(asset.purchase_modality_id) : '',
  purchase_condition_id: asset.purchase_condition_id ? String(asset.purchase_condition_id) : '',
  assigned_employee_id: asset.assigned_employee_id ? String(asset.assigned_employee_id) : '',
  responsible_employee_id: asset.responsible_employee_id ? String(asset.responsible_employee_id) : '',
  criticality_id: asset.criticality_id ? String(asset.criticality_id) : '',
  operational_status_id: asset.operational_status_id ? String(asset.operational_status_id) : '',
  acquired_on: dateValue(asset.acquired_on),
  warranty_expires_on: dateValue(asset.warranty_expires_on),
  inventory_legacy_code: asset.inventory_legacy_code ?? '',
  legacy_consecutive: asset.legacy_consecutive ?? '',
  legacy_component_consecutive: asset.legacy_component_consecutive ?? '',
  notes: asset.notes ?? '',
});

const toPayload = (form: AssetFormState): HelpdeskAssetPayload => ({
  asset_code: form.asset_code.trim(),
  name: form.name.trim(),
  description: form.description.trim() || null,
  category_id: numericOrNull(form.category_id),
  unit_id: numericOrNull(form.unit_id),
  area_id: numericOrNull(form.area_id),
  location_id: numericOrNull(form.location_id),
  brand_name: form.brand_name.trim() || null,
  model: form.model.trim() || null,
  serial_number: form.serial_number.trim() || null,
  complementary_info: form.complementary_info.trim() || null,
  purchase_modality_id: numericOrNull(form.purchase_modality_id),
  purchase_condition_id: numericOrNull(form.purchase_condition_id),
  assigned_employee_id: numericOrNull(form.assigned_employee_id),
  responsible_employee_id: numericOrNull(form.responsible_employee_id),
  criticality_id: numericOrNull(form.criticality_id),
  operational_status_id: numericOrNull(form.operational_status_id),
  acquired_on: form.acquired_on || null,
  warranty_expires_on: form.warranty_expires_on || null,
  inventory_legacy_code: form.inventory_legacy_code.trim() || null,
  legacy_consecutive: form.legacy_consecutive.trim() || null,
  legacy_component_consecutive: form.legacy_component_consecutive.trim() || null,
  notes: form.notes.trim() || null,
});

const CatalogSelect = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: HelpdeskCatalogItem[];
  onChange: (value: string) => void;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
      {label}
    </span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
    >
      <option value="">Sin seleccionar</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  </label>
);

export const HelpdeskAssetsPage = () => {
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canWrite = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);
  const canDelete = hasAnyRole(moduleRole, ['ADMIN']);

  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs>(EMPTY_CATALOGS);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<HelpdeskAsset | null>(null);
  const [editingAsset, setEditingAsset] = useState<HelpdeskAsset | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetData, catalogData, employeeData] = await Promise.all([
        listHelpdeskAssets(),
        listHelpdeskCatalogs(),
        listEmployees(),
      ]);

      setAssets(assetData);
      setCatalogs(catalogData);
      setEmployees(employeeData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el inventario tecnico.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return assets;
    }

    return assets.filter((asset) =>
      [
        asset.asset_code,
        asset.name,
        asset.description ?? '',
        asset.brand?.name ?? asset.brand_name ?? '',
        asset.model ?? '',
        asset.serial_number ?? '',
        asset.category?.name ?? '',
        asset.location?.name ?? '',
        asset.assigned_employee?.full_name ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [assets, query]);

  const summary = useMemo(() => {
    const outOfService = assets.filter((asset) => asset.operational_status?.code === 'OUT_OF_SERVICE').length;
    const critical = assets.filter((asset) => asset.criticality?.code === 'CRITICAL').length;

    return {
      total: assets.length,
      outOfService,
      critical,
      assigned: assets.filter((asset) => asset.assigned_employee_id).length,
    };
  }, [assets]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingAsset(null);
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (asset: HelpdeskAsset) => {
    setEditingAsset(asset);
    setForm(toFormState(asset));
    setIsFormOpen(true);
  };

  const validateForm = () => {
    if (!form.asset_code.trim()) {
      notifyWarning('El codigo interno del activo es obligatorio.');
      return false;
    }

    if (!form.name.trim()) {
      notifyWarning('El nombre del activo es obligatorio.');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!canWrite || !validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (editingAsset) {
        const updated = await updateHelpdeskAssetById(editingAsset.id, toPayload(form));
        if (updated) {
          setSelectedAsset(updated);
        }
        notifySuccess('Activo actualizado correctamente.');
      } else {
        const created = await createHelpdeskAsset(toPayload(form));
        setSelectedAsset(created);
        notifySuccess('Activo registrado correctamente.');
      }

      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el activo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset: HelpdeskAsset) => {
    if (!canDelete) {
      return;
    }

    setDeletingId(asset.id);
    try {
      await deleteHelpdeskAssetById(asset.id);
      notifySuccess('Activo dado de baja correctamente.');
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset(null);
      }
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo dar de baja el activo.'));
    } finally {
      setDeletingId(null);
    }
  };

  const setField = (field: keyof AssetFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Gestion tecnica
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Inventario de activos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Controla equipos, instrumentos, computadoras y bienes del laboratorio con identificacion unica, estado operativo, ubicacion y responsable.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          {canWrite ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
            >
              <Plus size={16} />
              Nuevo activo
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Activos', value: summary.total },
          { label: 'Asignados', value: summary.assigned },
          { label: 'Criticos', value: summary.critical },
          { label: 'Fuera de servicio', value: summary.outOfService },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.8fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <Search size={18} className="text-[var(--color-brand-700)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por codigo, nombre, marca, modelo, serie, categoria o responsable..."
              className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Clasificacion</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Asignacion</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      Cargando inventario...
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      No hay activos registrados.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr key={asset.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-[var(--color-brand-700)]">{asset.asset_code}</p>
                        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{asset.name}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {[asset.brand?.name ?? asset.brand_name, asset.model, asset.serial_number]
                            .filter(Boolean)
                            .join(' | ') || 'Sin marca/modelo/serie'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{catalogName(asset.category)}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {catalogName(asset.operational_status)} | {catalogName(asset.criticality)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{asset.assigned_employee?.full_name ?? 'Sin colaborador'}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {catalogName(asset.area)} | {catalogName(asset.location)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAsset(asset)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                          >
                            <Eye size={14} />
                            Ver
                          </button>
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => openEdit(asset)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                            >
                              <Edit3 size={14} />
                              Editar
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(asset)}
                              disabled={deletingId === asset.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:opacity-60"
                            >
                              <Trash2 size={14} />
                              Baja
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          {selectedAsset ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                  <Laptop size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
                    Ficha tecnica
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{selectedAsset.name}</h2>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{selectedAsset.asset_code}</p>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                {[
                  ['Categoria', catalogName(selectedAsset.category)],
                  ['Estado operativo', catalogName(selectedAsset.operational_status)],
                  ['Criticidad', catalogName(selectedAsset.criticality)],
                  ['Unidad', catalogName(selectedAsset.unit)],
                  ['Area', catalogName(selectedAsset.area)],
                  ['Ubicacion', catalogName(selectedAsset.location)],
                  ['Marca', selectedAsset.brand?.name ?? selectedAsset.brand_name ?? 'Sin marca'],
                  ['Modelo', selectedAsset.model ?? 'Sin modelo'],
                  ['Serie', selectedAsset.serial_number ?? 'Sin serie'],
                  ['Asignado a', selectedAsset.assigned_employee?.full_name ?? 'Sin asignacion'],
                  ['Responsable', selectedAsset.responsible_employee?.full_name ?? 'Sin responsable'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
                    <p className="mt-1 font-semibold text-[var(--color-brand-700)]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-6 text-sm leading-6 text-[var(--unilabor-neutral)]">
              Selecciona un activo para revisar su ficha tecnica, asignacion, estado operativo e informacion de trazabilidad.
            </div>
          )}
        </aside>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Inventario tecnico
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
                {editingAsset ? 'Editar activo' : 'Nuevo activo'}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Codigo interno
                  </span>
                  <input
                    value={form.asset_code}
                    onChange={(event) => setField('asset_code', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Nombre del activo
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => setField('name', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <CatalogSelect label="Categoria" value={form.category_id} options={catalogs.categories} onChange={(value) => setField('category_id', value)} />
                <CatalogSelect label="Estado operativo" value={form.operational_status_id} options={catalogs.operational_statuses} onChange={(value) => setField('operational_status_id', value)} />
                <CatalogSelect label="Criticidad" value={form.criticality_id} options={catalogs.criticalities} onChange={(value) => setField('criticality_id', value)} />
                <CatalogSelect label="Unidad" value={form.unit_id} options={catalogs.units} onChange={(value) => setField('unit_id', value)} />
                <CatalogSelect label="Area" value={form.area_id} options={catalogs.areas} onChange={(value) => setField('area_id', value)} />
                <CatalogSelect label="Ubicacion" value={form.location_id} options={catalogs.locations} onChange={(value) => setField('location_id', value)} />

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Marca
                  </span>
                  <input
                    list="helpdesk-brands"
                    value={form.brand_name}
                    onChange={(event) => setField('brand_name', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                  <datalist id="helpdesk-brands">
                    {catalogs.brands.map((brand) => (
                      <option key={brand.id} value={brand.name} />
                    ))}
                  </datalist>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Modelo
                  </span>
                  <input
                    value={form.model}
                    onChange={(event) => setField('model', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Numero de serie
                  </span>
                  <input
                    value={form.serial_number}
                    onChange={(event) => setField('serial_number', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Asignado a colaborador
                  </span>
                  <select
                    value={form.assigned_employee_id}
                    onChange={(event) => setField('assigned_employee_id', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Sin colaborador</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {getEmployeeOptionValue(employee)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Responsable tecnico
                  </span>
                  <select
                    value={form.responsible_employee_id}
                    onChange={(event) => setField('responsible_employee_id', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Sin responsable</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {getEmployeeOptionValue(employee)}
                      </option>
                    ))}
                  </select>
                </label>

                <CatalogSelect label="Modalidad de compra" value={form.purchase_modality_id} options={catalogs.purchase_modalities} onChange={(value) => setField('purchase_modality_id', value)} />
                <CatalogSelect label="Condicion de compra" value={form.purchase_condition_id} options={catalogs.purchase_conditions} onChange={(value) => setField('purchase_condition_id', value)} />

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fecha de adquisicion
                  </span>
                  <input
                    type="date"
                    value={form.acquired_on}
                    onChange={(event) => setField('acquired_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Garantia hasta
                  </span>
                  <input
                    type="date"
                    value={form.warranty_expires_on}
                    onChange={(event) => setField('warranty_expires_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Codigo inventario previo
                  </span>
                  <input
                    value={form.inventory_legacy_code}
                    onChange={(event) => setField('inventory_legacy_code', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Consecutivo
                  </span>
                  <input
                    value={form.legacy_consecutive}
                    onChange={(event) => setField('legacy_consecutive', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Descripcion
                  </span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setField('description', event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Informacion complementaria y observaciones
                  </span>
                  <textarea
                    value={form.complementary_info}
                    onChange={(event) => setField('complementary_info', event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
                disabled={saving}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
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
                    <Laptop size={14} />
                    Guardar activo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
