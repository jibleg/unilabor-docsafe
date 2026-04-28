import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  createHelpdeskCatalogAdminItem,
  deactivateHelpdeskCatalogAdminItem,
  getApiErrorMessage,
  listHelpdeskCatalogAdminData,
  type HelpdeskCatalogAdminPayload,
  updateHelpdeskCatalogAdminItem,
} from '../api/service';
import type {
  HelpdeskCatalogAdminItem,
  HelpdeskCatalogAdminKey,
  HelpdeskCatalogAdminResponse,
} from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

type CatalogTab = 'assets' | 'tickets' | 'maintenance';
type ModalMode = 'create' | 'edit' | 'deactivate';

interface CatalogGroupConfig {
  key: HelpdeskCatalogAdminKey;
  tab: CatalogTab;
  title: string;
  helper: string;
  supportsCode?: boolean;
  supportsDescription?: boolean;
  supportsSortOrder?: boolean;
  supportsIsClosed?: boolean;
  supportsResponseHours?: boolean;
  supportsIntervalMonths?: boolean;
}

interface CatalogFormState {
  code: string;
  name: string;
  description: string;
  sort_order: string;
  is_closed: boolean;
  response_hours: string;
  interval_months: string;
}

interface ModalState {
  mode: ModalMode;
  group: CatalogGroupConfig;
  item?: HelpdeskCatalogAdminItem | null;
}

const EMPTY_CATALOGS: HelpdeskCatalogAdminResponse = {
  assets: {
    categories: [],
    units: [],
    areas: [],
    locations: [],
    brands: [],
    purchase_modalities: [],
    purchase_conditions: [],
    criticalities: [],
    operational_statuses: [],
  },
  tickets: {
    request_types: [],
    ticket_statuses: [],
    ticket_priorities: [],
  },
  maintenance: {
    frequencies: [],
  },
};

const EMPTY_FORM: CatalogFormState = {
  code: '',
  name: '',
  description: '',
  sort_order: '0',
  is_closed: false,
  response_hours: '',
  interval_months: '',
};

const tabOptions: Array<{ id: CatalogTab; label: string; helper: string }> = [
  { id: 'assets', label: 'Activos', helper: 'Base maestra de inventario tecnico' },
  { id: 'tickets', label: 'Tickets', helper: 'Clasificaciones operativas de solicitudes' },
  { id: 'maintenance', label: 'Mantenimiento', helper: 'Frecuencias y soporte preventivo' },
];

const catalogGroups: CatalogGroupConfig[] = [
  { key: 'categories', tab: 'assets', title: 'Categorias', helper: 'Clasifica familias tecnicas de equipos.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'units', tab: 'assets', title: 'Unidades', helper: 'Define unidades o areas institucionales.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'areas', tab: 'assets', title: 'Areas', helper: 'Relaciona responsables operativos del inventario.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'locations', tab: 'assets', title: 'Ubicaciones', helper: 'Identifica donde se encuentra cada activo.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'brands', tab: 'assets', title: 'Marcas', helper: 'Normaliza fabricantes y proveedores de equipo.' },
  { key: 'purchase_modalities', tab: 'assets', title: 'Modalidades de compra', helper: 'Describe el origen o esquema de adquisicion.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'purchase_conditions', tab: 'assets', title: 'Condiciones de compra', helper: 'Distingue estatus comerciales o contractuales.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'criticalities', tab: 'assets', title: 'Criticidades', helper: 'Mide impacto tecnico y operativo del activo.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'operational_statuses', tab: 'assets', title: 'Estados operativos', helper: 'Controla disponibilidad y uso institucional del equipo.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'request_types', tab: 'tickets', title: 'Tipos de solicitud', helper: 'Clasifica el motivo de cada ticket.', supportsCode: true, supportsDescription: true, supportsSortOrder: true },
  { key: 'ticket_statuses', tab: 'tickets', title: 'Estados de ticket', helper: 'Modela el flujo operativo de soporte.', supportsCode: true, supportsDescription: true, supportsSortOrder: true, supportsIsClosed: true },
  { key: 'ticket_priorities', tab: 'tickets', title: 'Prioridades', helper: 'Expresa urgencia y tiempo de respuesta.', supportsCode: true, supportsDescription: true, supportsSortOrder: true, supportsResponseHours: true },
  { key: 'frequencies', tab: 'maintenance', title: 'Frecuencias', helper: 'Controla periodicidades de mantenimiento preventivo.', supportsCode: true, supportsDescription: true, supportsSortOrder: true, supportsIntervalMonths: true },
];

const getItemsForGroup = (
  catalogs: HelpdeskCatalogAdminResponse,
  groupKey: HelpdeskCatalogAdminKey,
): HelpdeskCatalogAdminItem[] => {
  switch (groupKey) {
    case 'categories':
      return catalogs.assets.categories;
    case 'units':
      return catalogs.assets.units;
    case 'areas':
      return catalogs.assets.areas;
    case 'locations':
      return catalogs.assets.locations;
    case 'brands':
      return catalogs.assets.brands;
    case 'purchase_modalities':
      return catalogs.assets.purchase_modalities;
    case 'purchase_conditions':
      return catalogs.assets.purchase_conditions;
    case 'criticalities':
      return catalogs.assets.criticalities;
    case 'operational_statuses':
      return catalogs.assets.operational_statuses;
    case 'request_types':
      return catalogs.tickets.request_types;
    case 'ticket_statuses':
      return catalogs.tickets.ticket_statuses;
    case 'ticket_priorities':
      return catalogs.tickets.ticket_priorities;
    case 'frequencies':
      return catalogs.maintenance.frequencies;
    default:
      return [];
  }
};

const getSecondaryLine = (item: HelpdeskCatalogAdminItem, group: CatalogGroupConfig): string => {
  if (group.supportsIntervalMonths) {
    return item.interval_months ? `Cada ${item.interval_months} mes(es)` : 'Frecuencia sin meses definidos';
  }

  if (group.supportsResponseHours) {
    return item.response_hours !== null && item.response_hours !== undefined
      ? `${item.response_hours} hora(s) objetivo`
      : 'Sin horas de respuesta definidas';
  }

  if (group.supportsIsClosed) {
    return item.is_closed ? 'Cierra la solicitud' : 'Mantiene la solicitud abierta';
  }

  return item.description?.trim() ? item.description : 'Sin descripcion operativa registrada.';
};

const getCatalogIdentifier = (item: HelpdeskCatalogAdminItem, group: CatalogGroupConfig): string | null => {
  if (item.code?.trim()) {
    return item.code;
  }

  if (group.key === 'brands') {
    return null;
  }

  return `ID ${item.id}`;
};

const toFormState = (group: CatalogGroupConfig, item?: HelpdeskCatalogAdminItem | null): CatalogFormState => ({
  code: item?.code ?? '',
  name: item?.name ?? '',
  description: item?.description ?? '',
  sort_order: String(item?.sort_order ?? 0),
  is_closed: Boolean(item?.is_closed),
  response_hours:
    item?.response_hours === null || item?.response_hours === undefined ? '' : String(item.response_hours),
  interval_months:
    item?.interval_months === null || item?.interval_months === undefined
      ? group.supportsIntervalMonths
        ? '1'
        : ''
      : String(item.interval_months),
});

const toPayload = (group: CatalogGroupConfig, form: CatalogFormState): HelpdeskCatalogAdminPayload => ({
  code: group.supportsCode ? form.code.trim() || null : null,
  name: form.name.trim(),
  description: group.supportsDescription ? form.description.trim() || null : null,
  sort_order: group.supportsSortOrder ? Number(form.sort_order || 0) : null,
  is_closed: group.supportsIsClosed ? form.is_closed : null,
  response_hours: group.supportsResponseHours
    ? (form.response_hours.trim() ? Number(form.response_hours) : null)
    : null,
  interval_months: group.supportsIntervalMonths ? Number(form.interval_months || 0) : null,
});

const ModalShell = ({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.4)] px-4 py-6">
    <div className="w-full max-w-2xl rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white p-6 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Catalogos Helpdesk
          </p>
          <h2 className="mt-2 text-2xl font-bold text-[var(--color-brand-700)]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  </div>
);

export const HelpdeskCatalogsPage = () => {
  const [activeTab, setActiveTab] = useState<CatalogTab>('assets');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogAdminResponse>(EMPTY_CATALOGS);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [form, setForm] = useState<CatalogFormState>(EMPTY_FORM);
  const [pageSize, setPageSize] = useState(10);
  const [currentPageByGroup, setCurrentPageByGroup] = useState<Partial<Record<HelpdeskCatalogAdminKey, number>>>({});
  const [selectedGroupByTab, setSelectedGroupByTab] = useState<Record<CatalogTab, HelpdeskCatalogAdminKey>>({
    assets: 'categories',
    tickets: 'request_types',
    maintenance: 'frequencies',
  });

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHelpdeskCatalogAdminData();
      setCatalogs(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catalogos de Helpdesk.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  const totals = useMemo(
    () => ({
      assets: catalogGroups
        .filter((group) => group.tab === 'assets')
        .reduce((total, group) => total + getItemsForGroup(catalogs, group.key).length, 0),
      tickets: catalogGroups
        .filter((group) => group.tab === 'tickets')
        .reduce((total, group) => total + getItemsForGroup(catalogs, group.key).length, 0),
      maintenance: catalogGroups
        .filter((group) => group.tab === 'maintenance')
        .reduce((total, group) => total + getItemsForGroup(catalogs, group.key).length, 0),
    }),
    [catalogs],
  );

  const activeGroups = useMemo(
    () => catalogGroups.filter((group) => group.tab === activeTab),
    [activeTab],
  );

  const selectedGroup = useMemo(() => {
    const selectedKey = selectedGroupByTab[activeTab];
    return activeGroups.find((group) => group.key === selectedKey) ?? activeGroups[0] ?? null;
  }, [activeGroups, activeTab, selectedGroupByTab]);

  const selectedItems = useMemo(
    () => (selectedGroup ? getItemsForGroup(catalogs, selectedGroup.key) : []),
    [catalogs, selectedGroup],
  );

  const currentPage = selectedGroup ? currentPageByGroup[selectedGroup.key] ?? 1 : 1;
  const totalPages = Math.max(1, Math.ceil(selectedItems.length / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const startIndex = (normalizedPage - 1) * pageSize;
    return selectedItems.slice(startIndex, startIndex + pageSize);
  }, [normalizedPage, pageSize, selectedItems]);

  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    if (normalizedPage !== currentPage) {
      setCurrentPageByGroup((current) => ({
        ...current,
        [selectedGroup.key]: normalizedPage,
      }));
    }
  }, [currentPage, normalizedPage, selectedGroup]);

  const openCreateModal = (group: CatalogGroupConfig) => {
    setModalState({ mode: 'create', group });
    setForm(toFormState(group));
  };

  const openEditModal = (group: CatalogGroupConfig, item: HelpdeskCatalogAdminItem) => {
    setModalState({ mode: 'edit', group, item });
    setForm(toFormState(group, item));
  };

  const openDeactivateModal = (group: CatalogGroupConfig, item: HelpdeskCatalogAdminItem) => {
    setModalState({ mode: 'deactivate', group, item });
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    setModalState(null);
    setForm(EMPTY_FORM);
  };

  const updateCurrentPage = (page: number) => {
    if (!selectedGroup) {
      return;
    }

    const safePage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPageByGroup((current) => ({
      ...current,
      [selectedGroup.key]: safePage,
    }));
  };

  const validateForm = (group: CatalogGroupConfig): boolean => {
    if (!form.name.trim()) {
      notifyWarning('El nombre del catalogo es obligatorio.');
      return false;
    }

    if (group.supportsCode && !form.code.trim()) {
      notifyWarning('El codigo del catalogo es obligatorio.');
      return false;
    }

    if (group.supportsSortOrder && (form.sort_order.trim() === '' || Number(form.sort_order) < 0)) {
      notifyWarning('El orden debe ser un numero igual o mayor a cero.');
      return false;
    }

    if (group.supportsResponseHours && form.response_hours.trim() !== '' && Number(form.response_hours) < 0) {
      notifyWarning('Las horas de respuesta deben ser iguales o mayores a cero.');
      return false;
    }

    if (group.supportsIntervalMonths && (!form.interval_months.trim() || Number(form.interval_months) <= 0)) {
      notifyWarning('La frecuencia debe indicar meses mayores a cero.');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!modalState || modalState.mode === 'deactivate') {
      return;
    }

    const { group, mode, item } = modalState;
    if (!validateForm(group)) {
      return;
    }

    setSaving(true);
    try {
      const payload = toPayload(group, form);
      if (mode === 'create') {
        await createHelpdeskCatalogAdminItem(group.key, payload);
        notifySuccess('Registro de catalogo creado correctamente.');
      } else if (item) {
        await updateHelpdeskCatalogAdminItem(group.key, item.id, payload);
        notifySuccess('Registro de catalogo actualizado correctamente.');
      }

      closeModal();
      await loadCatalogs();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el registro del catalogo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!modalState || modalState.mode !== 'deactivate' || !modalState.item) {
      return;
    }

    setSaving(true);
    try {
      await deactivateHelpdeskCatalogAdminItem(modalState.group.key, modalState.item.id);
      notifySuccess('Registro de catalogo desactivado correctamente.');
      closeModal();
      await loadCatalogs();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desactivar el registro del catalogo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Mesa de ayuda
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Catalogos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Administra en un solo modulo los catalogos base de activos, tickets y mantenimiento, sin alterar la navegacion principal del sistema.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCatalogs()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.16)] bg-[linear-gradient(180deg,rgba(0,65,106,0.98)_0%,rgba(0,84,136,0.96)_100%)] shadow-xl shadow-[rgba(0,65,106,0.18)]">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {tabOptions.map((tab) => {
            const isActive = tab.id === activeTab;
            const badgeValue = tab.id === 'assets' ? totals.assets : tab.id === 'tickets' ? totals.tickets : totals.maintenance;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedGroupByTab((current) => ({
                    ...current,
                    [tab.id]: current[tab.id] ?? catalogGroups.find((group) => group.tab === tab.id)?.key ?? current[tab.id],
                  }));
                }}
                className={`relative border-r border-[rgba(191,212,230,0.18)] px-6 py-5 text-center transition last:border-r-0 ${
                  isActive
                    ? 'bg-[rgba(191,212,230,0.16)] text-white'
                    : 'bg-transparent text-[rgba(239,245,250,0.84)] hover:bg-[rgba(191,212,230,0.12)] hover:text-white'
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <div>
                    <p className={`font-bold ${isActive ? 'text-white' : 'text-[rgba(239,245,250,0.9)]'}`}>{tab.label}</p>
                    <p className={`text-xs ${isActive ? 'text-[rgba(239,245,250,0.78)]' : 'text-[rgba(191,212,230,0.8)]'}`}>{tab.helper}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      isActive
                        ? 'bg-[rgba(255,255,255,0.16)] text-white'
                        : 'bg-[rgba(0,46,76,0.42)] text-[rgba(239,245,250,0.9)]'
                    }`}
                  >
                    {badgeValue}
                  </span>
                </div>
                <span
                  className={`absolute inset-x-0 bottom-0 h-[2px] transition ${
                    isActive ? 'bg-[var(--color-brand-300)]' : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-6 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-3 text-sm font-semibold text-[var(--color-brand-700)]">
            <Loader2 size={18} className="animate-spin" />
            Cargando catalogos de Helpdesk...
          </div>
        </div>
      ) : (
        selectedGroup ? (
          <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Catalogo seleccionado</h2>
                <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
                  Selecciona un catalogo puntual dentro de {tabOptions.find((tab) => tab.id === activeTab)?.label ?? activeTab} para trabajar sin saturar la pantalla.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Catalogo
                </span>
                <select
                  value={selectedGroup.key}
                  onChange={(event) =>
                    {
                      const nextKey = event.target.value as HelpdeskCatalogAdminKey;
                      setSelectedGroupByTab((current) => ({
                        ...current,
                        [activeTab]: nextKey,
                      }));
                      setCurrentPageByGroup((current) => ({
                        ...current,
                        [nextKey]: 1,
                      }));
                    }
                  }
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                >
                  {activeGroups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(() => {
              const group = selectedGroup;

              return (
                <>
                  <div className="mt-5 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-[var(--color-brand-700)]">{group.title}</h3>
                      <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{group.helper}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                        {selectedItems.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreateModal(group)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.28)]"
                      >
                        <Plus size={14} />
                        Nuevo
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] p-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                        {selectedItems.length} registro(s) en total
                      </p>
                      <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                        Pagina {normalizedPage} de {totalPages}
                      </p>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                        Registros por pagina
                      </span>
                      <select
                        value={pageSize}
                        onChange={(event) => {
                          const nextPageSize = Number(event.target.value);
                          setPageSize(nextPageSize);
                          updateCurrentPage(1);
                        }}
                        className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none lg:w-40"
                      >
                        {[5, 10, 20, 30].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedItems.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                        No hay registros disponibles en este catalogo.
                      </p>
                    ) : (
                      paginatedItems.map((item) => (
                        <article
                          key={`${group.key}-${item.id}`}
                          className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-semibold text-[var(--unilabor-ink)]">{item.name}</p>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                    item.is_active
                                      ? 'bg-[rgba(191,212,230,0.42)] text-[var(--color-brand-700)]'
                                      : 'bg-[rgba(229,231,235,0.9)] text-slate-500'
                                  }`}
                                >
                                  {item.is_active ? 'Activo' : 'Inactivo'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-brand-500)]">
                                {[
                                  getCatalogIdentifier(item, group),
                                  group.supportsSortOrder ? `Orden ${item.sort_order ?? 0}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' | ')}
                              </p>
                              <p className="mt-3 text-sm leading-6 text-[var(--unilabor-neutral)]">
                                {getSecondaryLine(item, group)}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(group, item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                              >
                                <Edit3 size={14} />
                                Editar
                              </button>
                              {item.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => openDeactivateModal(group, item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[rgba(153,27,27,0.16)] bg-[rgba(254,226,226,0.88)] px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-[rgba(254,202,202,0.96)]"
                                >
                                  <Power size={14} />
                                  Desactivar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  {selectedItems.length > 0 ? (
                    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <p className="text-sm text-[var(--unilabor-neutral)]">
                        Mostrando {Math.min((normalizedPage - 1) * pageSize + 1, selectedItems.length)} a{' '}
                        {Math.min(normalizedPage * pageSize, selectedItems.length)} de {selectedItems.length} registros
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCurrentPage(1)}
                          disabled={normalizedPage === 1}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
                          aria-label="Primera pagina"
                        >
                          <ChevronsLeft size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCurrentPage(normalizedPage - 1)}
                          disabled={normalizedPage === 1}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
                          aria-label="Pagina anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-700)]">
                          {normalizedPage} / {totalPages}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCurrentPage(normalizedPage + 1)}
                          disabled={normalizedPage === totalPages}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
                          aria-label="Pagina siguiente"
                        >
                          <ChevronRight size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCurrentPage(totalPages)}
                          disabled={normalizedPage === totalPages}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-40"
                          aria-label="Ultima pagina"
                        >
                          <ChevronsRight size={16} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              );
            })()}
          </section>
        ) : null
      )}

      {modalState && modalState.mode !== 'deactivate' ? (
        <ModalShell
          title={`${modalState.mode === 'create' ? 'Nuevo registro' : 'Editar registro'}: ${modalState.group.title}`}
          onClose={closeModal}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {modalState.group.supportsCode ? (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Codigo
                </span>
                <input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Nombre
              </span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              />
            </label>

            {modalState.group.supportsSortOrder ? (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Orden
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </label>
            ) : null}

            {modalState.group.supportsResponseHours ? (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Horas de respuesta
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.response_hours}
                  onChange={(event) => setForm((current) => ({ ...current, response_hours: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </label>
            ) : null}

            {modalState.group.supportsIntervalMonths ? (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Intervalo en meses
                </span>
                <input
                  type="number"
                  min="1"
                  value={form.interval_months}
                  onChange={(event) => setForm((current) => ({ ...current, interval_months: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </label>
            ) : null}

            {modalState.group.supportsIsClosed ? (
              <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_closed}
                  onChange={(event) => setForm((current) => ({ ...current, is_closed: event.target.checked }))}
                  className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                />
                <span className="text-sm font-semibold text-[var(--color-brand-700)]">Este estado cierra la solicitud</span>
              </label>
            ) : null}

            {modalState.group.supportsDescription ? (
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Descripcion
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
              </label>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--unilabor-ink)] transition hover:bg-[rgba(239,245,250,0.95)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {modalState.mode === 'create' ? 'Crear registro' : 'Guardar cambios'}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {modalState?.mode === 'deactivate' && modalState.item ? (
        <ModalShell
          title={`Desactivar registro: ${modalState.item.name}`}
          onClose={closeModal}
        >
          <p className="text-sm leading-7 text-[var(--unilabor-neutral)]">
            Vas a desactivar este registro del catalogo <span className="font-semibold text-[var(--color-brand-700)]">{modalState.group.title}</span>.
            Seguira visible en esta pantalla para auditoria administrativa, pero dejara de estar disponible en los catalogos activos del modulo.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--unilabor-ink)] transition hover:bg-[rgba(239,245,250,0.95)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDeactivate()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(153,27,27,0.16)] bg-[rgba(254,226,226,0.88)] px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-[rgba(254,202,202,0.96)] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
              Desactivar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
};
