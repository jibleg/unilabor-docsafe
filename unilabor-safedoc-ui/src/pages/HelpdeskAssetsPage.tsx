import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  FolderOpen,
  Laptop,
  Link2,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Unlink,
} from 'lucide-react';
import { AssetLabelModal } from '../components/helpdesk/AssetLabelModal';
import { AssetLabelsPrintModal } from '../components/helpdesk/AssetLabelsPrintModal';
import { AddComponentModal, AttachComponentModal } from '../components/helpdesk/AssetComponentModals';
import { ActionsMenu } from '../components/ActionsMenu';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  createHelpdeskAsset,
  detachAssetComponent,
  fetchHelpdeskAssetById,
  getApiErrorMessage,
  getAssetReviewProgress,
  getHelpdeskOrgStructure,
  getHelpdeskSummary,
  listEmployees,
  listHelpdeskAssetsForLabels,
  listHelpdeskAssetsPaginated,
  listHelpdeskCatalogs,
  setAssetReviewStatus,
  type AssetReviewProgress,
  type HelpdeskAssetPayload,
  updateHelpdeskAssetById,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Employee,
  HelpdeskAsset,
  HelpdeskAssetSummary,
  HelpdeskCatalogItem,
  HelpdeskCatalogs,
  HelpdeskOrgStructure,
} from '../types/models';
import { getModuleRole } from '../utils/modules';
import { confirmAction } from '../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';
import { CatalogSelect } from '../components/CatalogSelect';

const EMPTY_ASSET_SUMMARY: HelpdeskAssetSummary = {
  assets: 0,
  open_tickets: 0,
  preventive_due: 0,
  out_of_service: 0,
  critical: 0,
  assigned: 0,
};

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
  supplier_id: string;
  received_on: string;
  placed_in_service_on: string;
  receipt_condition_id: string;
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
  suppliers: [],
  receipt_conditions: [],
  disposal_reasons: [],
  document_kinds: [],
  lifecycle_event_types: [],
};

const EMPTY_ORG_STRUCTURE: HelpdeskOrgStructure = {
  units: [],
  areas: [],
  users: [],
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
  supplier_id: '',
  received_on: '',
  placed_in_service_on: '',
  receipt_condition_id: '',
};

const catalogName = (item?: HelpdeskCatalogItem | null): string => item?.name ?? 'Sin clasificar';

// Badges de la columna Clasificación (color según el código del catálogo).
const BADGE_BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold';
const BADGE_NEUTRAL = 'bg-[rgba(0,65,106,0.08)] text-[var(--color-brand-700)]';
const STATUS_BADGE: Record<string, string> = {
  OPERATIONAL: 'bg-[rgba(22,128,74,0.12)] text-[#16804a]',
  CONDITIONAL: 'bg-[rgba(180,120,20,0.16)] text-[#8a5a00]',
  MAINTENANCE: 'bg-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)]',
  OUT_OF_SERVICE: 'bg-[rgba(176,42,42,0.12)] text-[#b02a2a]',
  RETIRED: 'bg-[rgba(82,96,109,0.14)] text-[#52606d]',
};
const CRITICALITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-[rgba(176,42,42,0.12)] text-[#b02a2a]',
  HIGH: 'bg-[rgba(180,120,20,0.16)] text-[#8a5a00]',
  MEDIUM: 'bg-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)]',
  LOW: 'bg-[rgba(22,128,74,0.12)] text-[#16804a]',
};

// Badge de revisión de la carga (eje independiente del estado operativo).
const ReviewBadge = ({ status }: { status?: 'PENDING' | 'REVIEWED' }) =>
  status === 'REVIEWED' ? (
    <span className={`${BADGE_BASE} gap-1 bg-[rgba(22,128,74,0.12)] text-[#16804a]`}>
      <CheckCircle2 size={11} /> Revisado
    </span>
  ) : (
    <span className={`${BADGE_BASE} gap-1 bg-[rgba(180,120,20,0.16)] text-[#8a5a00]`}>
      <Clock size={11} /> Pendiente
    </span>
  );

const ClassificationBadge = ({ item, palette }: { item?: HelpdeskCatalogItem | null; palette: Record<string, string> }) => {
  if (!item) {
    return null;
  }
  const className = palette[(item.code ?? '').toUpperCase()] ?? BADGE_NEUTRAL;
  return <span className={`${BADGE_BASE} ${className}`}>{item.name}</span>;
};

const employeeLabel = (employee: Employee): string =>
  `${employee.employee_code} - ${employee.full_name}`;

const catalogToOptions = (items: HelpdeskCatalogItem[]) =>
  items.map((item) => ({ value: String(item.id), label: item.name, hint: item.code ?? undefined }));

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
  supplier_id: asset.supplier_id ? String(asset.supplier_id) : '',
  received_on: dateValue(asset.received_on),
  placed_in_service_on: dateValue(asset.placed_in_service_on),
  receipt_condition_id: asset.receipt_condition_id ? String(asset.receipt_condition_id) : '',
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
  supplier_id: numericOrNull(form.supplier_id),
  received_on: form.received_on || null,
  placed_in_service_on: form.placed_in_service_on || null,
  receipt_condition_id: numericOrNull(form.receipt_condition_id),
});

// Snapshot del estado del listado (página, búsqueda y filtros) para restaurarlo
// al volver del expediente de un activo. Persiste en sessionStorage (vive dentro
// de la pestaña, se limpia al cerrarla).
type AssetsListState = {
  page: number;
  search: string;
  unitFilter: string;
  areaFilter: string;
  userFilter: string;
  reviewFilter: '' | 'PENDING' | 'REVIEWED';
};

const LIST_STATE_KEY = 'helpdesk.assets.list-state';
const DEFAULT_LIST_STATE: AssetsListState = {
  page: 1,
  search: '',
  unitFilter: '',
  areaFilter: '',
  userFilter: '',
  reviewFilter: '',
};

const readListState = (): AssetsListState => {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_KEY);
    if (raw) {
      return { ...DEFAULT_LIST_STATE, ...(JSON.parse(raw) as Partial<AssetsListState>) };
    }
  } catch {
    // sessionStorage no disponible o JSON inválido: se usa el estado por defecto.
  }
  return DEFAULT_LIST_STATE;
};

const writeListState = (state: AssetsListState): void => {
  try {
    sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    // Sin persistencia: el listado simplemente no recordará su estado.
  }
};

export const HelpdeskAssetsPage = () => {
  const navigate = useNavigate();
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canWrite = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);

  // Estado restaurado (una sola lectura al montar) para conservar filtros y
  // paginación al volver del expediente de un activo.
  const restoredState = useRef(readListState()).current;

  const [orgStructure, setOrgStructure] = useState<HelpdeskOrgStructure>(EMPTY_ORG_STRUCTURE);
  const [unitFilter, setUnitFilter] = useState(restoredState.unitFilter);
  const [areaFilter, setAreaFilter] = useState(restoredState.areaFilter);
  const [userFilter, setUserFilter] = useState(restoredState.userFilter);
  // Filtro de revisión de la carga masiva: '' = todos, 'PENDING', 'REVIEWED'.
  const [reviewFilter, setReviewFilter] = useState<'' | 'PENDING' | 'REVIEWED'>(restoredState.reviewFilter);
  const [reviewProgress, setReviewProgress] = useState<AssetReviewProgress>({ total: 0, reviewed: 0, pending: 0 });
  const assetFilters = useMemo(
    () => ({ unit_id: unitFilter, area_id: areaFilter, responsible_user_id: userFilter, review_status: reviewFilter }),
    [unitFilter, areaFilter, userFilter, reviewFilter],
  );

  // Cascada Unidad -> Área -> Responsable, construida sobre la estructura M:N.
  const unitOptions = useMemo(
    () => orgStructure.units.map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [orgStructure.units],
  );
  // Solo áreas de la unidad seleccionada; sin unidad no hay áreas que filtrar.
  const areaOptions = useMemo(() => {
    const unitId = numericOrNull(unitFilter);
    if (!unitId) {
      return [];
    }
    return orgStructure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [orgStructure.areas, unitFilter]);
  // Solo responsables del área seleccionada; sin área no hay responsables.
  const userOptions = useMemo(() => {
    const areaId = numericOrNull(areaFilter);
    if (!areaId) {
      return [];
    }
    const responsibleIds = new Set(
      orgStructure.areas.find((area) => area.id === areaId)?.responsible_user_ids ?? [],
    );
    return orgStructure.users
      .filter((user) => responsibleIds.has(user.id))
      .map((user) => ({ value: user.id, label: user.full_name, hint: user.email || undefined }));
  }, [orgStructure.areas, orgStructure.users, areaFilter]);

  const hasActiveFilters = Boolean(unitFilter || areaFilter || userFilter);

  // Al cambiar un filtro superior se limpian los inferiores para no quedar con
  // combinaciones imposibles (área de otra unidad, usuario de otra área).
  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    setAreaFilter('');
    setUserFilter('');
  };
  const handleAreaFilterChange = (value: string) => {
    setAreaFilter(value);
    setUserFilter('');
  };

  const {
    items: assets,
    pagination,
    page,
    setPage,
    search: query,
    setSearch: setQuery,
    loading,
    reload: reloadAssets,
    updateItems: updateAssetItems,
  } = usePaginatedList<HelpdeskAsset>(
    (q) =>
      listHelpdeskAssetsPaginated({
        page: q.page,
        limit: q.limit,
        search: q.search,
        unitId: numericOrNull(q.filters.unit_id ?? ''),
        areaId: numericOrNull(q.filters.area_id ?? ''),
        responsibleUserId: q.filters.responsible_user_id || null,
        reviewStatus: (q.filters.review_status as '' | 'PENDING' | 'REVIEWED') || null,
      }),
    {
      pageSize: 20,
      filters: assetFilters,
      initialPage: restoredState.page,
      initialSearch: restoredState.search,
      onError: (error) =>
        notifyError(getApiErrorMessage(error, 'No se pudo cargar el inventario técnico.')),
    },
  );

  // Persiste el estado del listado (para restaurarlo al volver del expediente).
  useEffect(() => {
    writeListState({
      page,
      search: query,
      unitFilter,
      areaFilter,
      userFilter,
      reviewFilter,
    });
  }, [page, query, unitFilter, areaFilter, userFilter, reviewFilter]);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs>(EMPTY_CATALOGS);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assetSummary, setAssetSummary] = useState<HelpdeskAssetSummary>(EMPTY_ASSET_SUMMARY);
  const [saving, setSaving] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<HelpdeskAsset | null>(null);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [attachComponentOpen, setAttachComponentOpen] = useState(false);
  const [labelAsset, setLabelAsset] = useState<HelpdeskAsset | null>(null);
  const [bulkLabels, setBulkLabels] = useState<HelpdeskAsset[] | null>(null);
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [editingAsset, setEditingAsset] = useState<HelpdeskAsset | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM);

  // Cascada del formulario Unidad -> Área -> Responsable (estricto, sin fallback).
  // El Área solo lista las áreas de la unidad; el Responsable técnico solo los
  // empleados cuyo usuario vinculado es responsable del área (empleado.user_id ->
  // responsables del área en la Estructura).
  const formAreaOptions = useMemo(() => {
    const unitId = numericOrNull(form.unit_id);
    if (!unitId) {
      return [];
    }
    return orgStructure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [orgStructure.areas, form.unit_id]);
  const formResponsibleOptions = useMemo(() => {
    const areaId = numericOrNull(form.area_id);
    if (!areaId) {
      return [];
    }
    const responsibleUserIds = new Set(
      orgStructure.areas.find((area) => area.id === areaId)?.responsible_user_ids ?? [],
    );
    return employees
      .filter((employee) => employee.user_id && responsibleUserIds.has(employee.user_id))
      .map((employee) => ({ value: String(employee.id), label: employeeLabel(employee), hint: employee.area ?? undefined }));
  }, [orgStructure.areas, employees, form.area_id]);

  const handleFormUnitChange = (value: string) => {
    setForm((current) => ({ ...current, unit_id: value, area_id: '', responsible_employee_id: '' }));
  };
  const handleFormAreaChange = (value: string) => {
    setForm((current) => ({ ...current, area_id: value, responsible_employee_id: '' }));
  };

  // Campos obligatorios del activo (el código de inventario se autogenera). El
  // botón Guardar permanece deshabilitado hasta completarlos todos.
  const isFormValid = Boolean(
    form.name.trim() &&
      numericOrNull(form.category_id) &&
      numericOrNull(form.unit_id) &&
      numericOrNull(form.area_id) &&
      numericOrNull(form.responsible_employee_id),
  );

  const loadAuxData = useCallback(async () => {
    try {
      const [catalogData, employeeData, orgData] = await Promise.all([
        listHelpdeskCatalogs(),
        listEmployees(),
        getHelpdeskOrgStructure(),
      ]);
      setCatalogs(catalogData);
      setEmployees(employeeData);
      setOrgStructure(orgData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catálogos del inventario.'));
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const [summaryData, progress] = await Promise.all([getHelpdeskSummary(), getAssetReviewProgress()]);
      setAssetSummary(summaryData);
      setReviewProgress(progress);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el resumen de activos.'));
    }
  }, []);

  useEffect(() => {
    void loadAuxData();
    void loadSummary();
  }, [loadAuxData, loadSummary]);

  const refreshAssets = useCallback(() => {
    reloadAssets();
    void loadSummary();
  }, [reloadAssets, loadSummary]);

  // El listado paginado NO trae el arreglo components[] (solo component_count). Al
  // abrir la ficha se muestra de inmediato la fila y en paralelo se trae el activo
  // completo (con components[] y parent) para poblar el panel de componentes. El
  // update es tolerante a carreras: solo aplica si la ficha sigue en el mismo id.
  const openFicha = useCallback(async (asset: HelpdeskAsset) => {
    setSelectedAsset(asset);
    try {
      const full = await fetchHelpdeskAssetById(asset.id);
      if (full) {
        setSelectedAsset((current) => (current && current.id === full.id ? full : current));
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del activo.'));
    }
  }, []);

  const refetchSelected = useCallback(async (assetId: number) => {
    const full = await fetchHelpdeskAssetById(assetId);
    if (full) {
      setSelectedAsset((current) => (current && current.id === full.id ? full : current));
    }
  }, []);

  // Desvincula un componente (vuelve a ser activo independiente). Refresca la ficha
  // activa: si la ficha es el padre, se recarga con su lista actualizada; si es el
  // propio componente, se recarga ya como activo independiente.
  const handleDetachComponent = async (component: HelpdeskAsset) => {
    const confirmed = await confirmAction(
      'Desvincular componente',
      `Desvincular ${component.asset_code} - ${component.name}? Volvera a ser un activo independiente.`,
      'Desvincular',
    );
    if (!confirmed) {
      return;
    }
    try {
      await detachAssetComponent(component.id);
      notifySuccess('Componente desvinculado correctamente.');
      if (selectedAsset) {
        await refetchSelected(selectedAsset.id);
      }
      refreshAssets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo desvincular el componente.'));
    }
  };

  // Marca/desmarca un activo como revisado tras depurar su dato de la carga.
  // Reversible. Actualiza SOLO la fila afectada y el contador en memoria (sin
  // recargar todo el inventario), para no re-renderizar todo el contenedor.
  const handleToggleReview = async (asset: HelpdeskAsset) => {
    const willReview = asset.review_status !== 'REVIEWED';
    try {
      const updated = await setAssetReviewStatus(asset.id, willReview);
      notifySuccess(willReview ? 'Activo marcado como revisado.' : 'Activo devuelto a pendiente.');

      const newStatus: 'PENDING' | 'REVIEWED' = willReview ? 'REVIEWED' : 'PENDING';
      const patch: Partial<HelpdeskAsset> = updated
        ? {
            review_status: updated.review_status,
            reviewed_at: updated.reviewed_at,
            reviewed_by: updated.reviewed_by,
            reviewed_by_name: updated.reviewed_by_name,
          }
        : { review_status: newStatus };

      updateAssetItems((items) => {
        // Con filtro de revisión activo, si la fila deja de coincidir, se quita
        // de la vista; en cualquier otro caso se parchea en su lugar.
        const dropsOut =
          (reviewFilter === 'PENDING' && newStatus === 'REVIEWED') ||
          (reviewFilter === 'REVIEWED' && newStatus === 'PENDING');
        if (dropsOut) {
          return items.filter((item) => item.id !== asset.id);
        }
        return items.map((item) => (item.id === asset.id ? { ...item, ...patch } : item));
      });

      setReviewProgress((prev) =>
        willReview
          ? { ...prev, reviewed: prev.reviewed + 1, pending: Math.max(0, prev.pending - 1) }
          : { ...prev, reviewed: Math.max(0, prev.reviewed - 1), pending: prev.pending + 1 },
      );

      if (updated && selectedAsset && selectedAsset.id === updated.id) {
        setSelectedAsset(updated);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la revisión del activo.'));
    }
  };

  const handleComponentMutated = (updatedParent: HelpdeskAsset) => {
    setSelectedAsset(updatedParent);
    setAddComponentOpen(false);
    setAttachComponentOpen(false);
    refreshAssets();
  };

  const summary = {
    total: assetSummary.assets,
    outOfService: assetSummary.out_of_service,
    critical: assetSummary.critical,
    assigned: assetSummary.assigned,
  };

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
    // El código de inventario se autogenera (UNIDAD-ÁREA-CLASIFICACIÓN-###). Son
    // obligatorios: nombre, categoría, unidad, área y responsable técnico.
    if (!form.name.trim()) {
      notifyWarning('El nombre del activo es obligatorio.');
      return false;
    }
    if (!numericOrNull(form.category_id)) {
      notifyWarning('La categoría es obligatoria.');
      return false;
    }
    if (!numericOrNull(form.unit_id)) {
      notifyWarning('La unidad es obligatoria.');
      return false;
    }
    if (!numericOrNull(form.area_id)) {
      notifyWarning('El área es obligatoria.');
      return false;
    }
    if (!numericOrNull(form.responsible_employee_id)) {
      notifyWarning('El responsable técnico es obligatorio.');
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
      await refreshAssets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el activo.'));
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: keyof AssetFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // Impresión de etiquetas en lote: trae TODOS los activos que cumplen los
  // filtros actuales (unidad/área/responsable) y abre el modal de impresión.
  const handleBulkPrint = async () => {
    setLoadingBulk(true);
    try {
      const matches = await listHelpdeskAssetsForLabels({
        unitId: numericOrNull(unitFilter),
        areaId: numericOrNull(areaFilter),
        responsibleUserId: userFilter || null,
      });
      if (matches.length === 0) {
        notifyWarning('No hay activos que cumplan los filtros seleccionados.');
        return;
      }
      setBulkLabels(matches);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las etiquetas del lote.'));
    } finally {
      setLoadingBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Gestión técnica
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Inventario de activos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Controla equipos, instrumentos, computadoras y bienes del laboratorio con identificación única, estado operativo, ubicación y responsable.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refreshAssets()}
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
          { label: 'Críticos', value: summary.critical },
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
          <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="flex items-center gap-3">
              <Search size={18} className="text-[var(--color-brand-700)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por código, nombre, marca, modelo, serie, categoría o responsable..."
                className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Unidad
                </span>
                <SearchableSelect
                  value={unitFilter}
                  onChange={handleUnitFilterChange}
                  options={unitOptions}
                  placeholder="Todas las unidades"
                  emptyLabel="Todas las unidades"
                  searchPlaceholder="Buscar unidad por nombre o código..."
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Área
                </span>
                <SearchableSelect
                  value={areaFilter}
                  onChange={handleAreaFilterChange}
                  options={areaOptions}
                  placeholder={unitFilter ? 'Todas las áreas' : 'Selecciona una unidad'}
                  emptyLabel="Todas las áreas"
                  searchPlaceholder="Buscar área por nombre o código..."
                  disabled={!unitFilter}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Responsable
                </span>
                <SearchableSelect
                  value={userFilter}
                  onChange={setUserFilter}
                  options={userOptions}
                  placeholder={areaFilter ? 'Todos los responsables' : 'Selecciona un área'}
                  emptyLabel="Todos los responsables"
                  searchPlaceholder="Buscar responsable por nombre o correo..."
                  disabled={!areaFilter}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(0,65,106,0.06)] pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Revisión
                </span>
                <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)]">
                  {([
                    { value: '', label: 'Todos' },
                    { value: 'PENDING', label: 'Pendientes' },
                    { value: 'REVIEWED', label: 'Revisados' },
                  ] as const).map((option) => (
                    <button
                      key={option.value || 'all'}
                      type="button"
                      onClick={() => setReviewFilter(option.value)}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${
                        reviewFilter === option.value
                          ? 'bg-[var(--color-brand-700)] text-white'
                          : 'bg-white text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {reviewProgress.total > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand-700)]">
                  <CheckCircle2 size={14} className="text-[#16804a]" />
                  {reviewProgress.reviewed} de {reviewProgress.total} revisados
                  <span className="font-normal text-[var(--unilabor-neutral)]">
                    ({reviewProgress.pending} pendientes)
                  </span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,65,106,0.06)] pt-3">
              <p className="text-xs text-[var(--unilabor-neutral)]">
                {hasActiveFilters
                  ? 'Imprime las etiquetas de todos los activos que cumplen los filtros seleccionados.'
                  : 'Selecciona unidad, área o responsable para imprimir sus etiquetas en lote.'}
              </p>
              <button
                type="button"
                onClick={() => void handleBulkPrint()}
                disabled={loadingBulk}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {loadingBulk ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                Imprimir etiquetas (lote)
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Clasificación</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Asignación</th>
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
                ) : assets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      No hay activos registrados.
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => (
                    <tr key={asset.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-[var(--color-brand-700)]">{asset.asset_code}</p>
                        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{asset.name}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {[asset.brand?.name ?? asset.brand_name, asset.model, asset.serial_number]
                            .filter(Boolean)
                            .join(' | ') || 'Sin marca/modelo/serie'}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <ReviewBadge status={asset.review_status} />
                          {asset.component_count && asset.component_count > 0 ? (
                            <span className={`gap-1 ${BADGE_BASE} ${BADGE_NEUTRAL}`}>
                              <Boxes size={11} />
                              {asset.component_count}{' '}
                              {asset.component_count === 1 ? 'componente' : 'componentes'}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{catalogName(asset.category)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <ClassificationBadge item={asset.operational_status} palette={STATUS_BADGE} />
                          <ClassificationBadge item={asset.criticality} palette={CRITICALITY_BADGE} />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{asset.assigned_employee?.full_name ?? 'Sin colaborador'}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {catalogName(asset.area)} | {catalogName(asset.location)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end">
                          <ActionsMenu
                            items={[
                              { key: 'ver', label: 'Ver ficha', icon: <Eye size={14} />, onClick: () => void openFicha(asset) },
                              {
                                key: 'expediente',
                                label: 'Ver expediente',
                                icon: <FolderOpen size={14} />,
                                onClick: () => navigate(`/helpdesk/assets/${asset.id}/expedient`),
                              },
                              {
                                key: 'etiqueta',
                                label: 'Imprimir etiqueta',
                                icon: <Printer size={14} />,
                                onClick: () => setLabelAsset(asset),
                              },
                              ...(canWrite
                                ? [
                                    {
                                      key: 'revisar',
                                      label: asset.review_status === 'REVIEWED' ? 'Devolver a pendiente' : 'Marcar revisado',
                                      icon:
                                        asset.review_status === 'REVIEWED' ? (
                                          <RotateCcw size={14} />
                                        ) : (
                                          <CheckCircle2 size={14} />
                                        ),
                                      onClick: () => void handleToggleReview(asset),
                                    },
                                    { key: 'editar', label: 'Editar', icon: <Edit3 size={14} />, onClick: () => openEdit(asset) },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-[rgba(0,65,106,0.08)]">
              <Pagination
                page={page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.limit}
                onPageChange={setPage}
                loading={loading}
              />
            </div>
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
                    Ficha técnica
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{selectedAsset.name}</h2>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{selectedAsset.asset_code}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/helpdesk/assets/${selectedAsset.id}/expedient`)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <FolderOpen size={16} /> Ver expediente del equipo
              </button>

              <button
                type="button"
                onClick={() => setLabelAsset(selectedAsset)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
              >
                <Printer size={16} /> Imprimir etiqueta
              </button>

              {/* Revisión de la carga: estado + acción para marcar/desmarcar. */}
              <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Revisión de carga
                  </p>
                  <ReviewBadge status={selectedAsset.review_status} />
                </div>
                {selectedAsset.review_status === 'REVIEWED' && (selectedAsset.reviewed_by_name || selectedAsset.reviewed_at) ? (
                  <p className="text-[11px] text-[var(--unilabor-neutral)]">
                    {selectedAsset.reviewed_by_name ? `Por ${selectedAsset.reviewed_by_name}` : ''}
                    {selectedAsset.reviewed_at
                      ? ` · ${new Date(selectedAsset.reviewed_at).toLocaleDateString('es-MX')}`
                      : ''}
                  </p>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => void handleToggleReview(selectedAsset)}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      selectedAsset.review_status === 'REVIEWED'
                        ? 'border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]'
                        : 'bg-[#16804a] text-white hover:opacity-90'
                    }`}
                  >
                    {selectedAsset.review_status === 'REVIEWED' ? (
                      <>
                        <RotateCcw size={16} /> Devolver a pendiente
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} /> Marcar como revisado
                      </>
                    )}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 text-sm">
                {[
                  ['Unidad', catalogName(selectedAsset.unit)],
                  ['Área', catalogName(selectedAsset.area)],
                  ['Categoría', catalogName(selectedAsset.category)],
                  ['Responsable', selectedAsset.responsible_employee?.full_name ?? 'Sin responsable'],
                  ['Estado operativo', catalogName(selectedAsset.operational_status)],
                  ['Criticidad', catalogName(selectedAsset.criticality)],
                  ['Ubicación', catalogName(selectedAsset.location)],
                  ['Marca', selectedAsset.brand?.name ?? selectedAsset.brand_name ?? 'Sin marca'],
                  ['Modelo', selectedAsset.model ?? 'Sin modelo'],
                  ['Serie', selectedAsset.serial_number ?? 'Sin serie'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
                    <p className="mt-1 font-semibold text-[var(--color-brand-700)]">{value}</p>
                  </div>
                ))}
              </div>

              {/* Componentes: si el activo es a su vez componente, muestra su padre y
                  permite desvincularlo; si es un activo "todo", lista/gestiona sus
                  componentes. */}
              <div className="space-y-3 border-t border-[rgba(0,65,106,0.08)] pt-4">
                {selectedAsset.parent_asset_id != null ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
                      <Boxes size={14} /> Componente
                    </div>
                    <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">
                        Este activo es componente de:
                      </p>
                      {selectedAsset.parent ? (
                        <button
                          type="button"
                          onClick={() => selectedAsset.parent && void openFicha({ id: selectedAsset.parent.id, asset_code: selectedAsset.parent.asset_code, name: selectedAsset.parent.name } as HelpdeskAsset)}
                          className="mt-1 text-left font-semibold text-[var(--color-brand-700)] underline decoration-dotted underline-offset-2 hover:opacity-80"
                        >
                          {selectedAsset.parent.asset_code} - {selectedAsset.parent.name}
                        </button>
                      ) : (
                        <p className="mt-1 font-semibold text-[var(--color-brand-700)]">Activo padre</p>
                      )}
                    </div>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => void handleDetachComponent(selectedAsset)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[rgba(176,42,42,0.28)] px-3 py-2 text-sm font-semibold text-[#b02a2a] transition hover:bg-[rgba(176,42,42,0.08)]"
                      >
                        <Unlink size={14} /> Desvincular de su activo padre
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
                        <Boxes size={14} /> Componentes ({selectedAsset.components?.length ?? 0})
                      </div>
                      {canWrite ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setAddComponentOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                          >
                            <Plus size={13} /> Agregar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAttachComponentOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
                          >
                            <Link2 size={13} /> Vincular existente
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {selectedAsset.components && selectedAsset.components.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedAsset.components.map((component) => (
                          <li
                            key={component.id}
                            className="flex items-start justify-between gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => void openFicha(component)}
                                className="block truncate text-left text-sm font-semibold text-[var(--color-brand-700)] underline decoration-dotted underline-offset-2 hover:opacity-80"
                              >
                                {component.asset_code}
                              </button>
                              <p className="truncate text-xs text-[var(--unilabor-ink)]">{component.name}</p>
                              {component.serial_number ? (
                                <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
                                  Serie: {component.serial_number}
                                </p>
                              ) : null}
                            </div>
                            {canWrite ? (
                              <button
                                type="button"
                                onClick={() => void handleDetachComponent(component)}
                                title="Desvincular componente"
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(176,42,42,0.28)] px-2 py-1 text-xs font-semibold text-[#b02a2a] transition hover:bg-[rgba(176,42,42,0.08)]"
                              >
                                <Unlink size={13} /> Desvincular
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] px-3 py-3 text-xs text-[var(--unilabor-neutral)]">
                        Sin componentes.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-6 text-sm leading-6 text-[var(--unilabor-neutral)]">
              Selecciona un activo para revisar su ficha técnica, asignación, estado operativo e información de trazabilidad.
            </div>
          )}
        </aside>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Inventario técnico
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
                {editingAsset ? 'Editar activo' : 'Nuevo activo'}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Código de inventario
                  </span>
                  <input
                    value={form.asset_code}
                    readOnly
                    placeholder="Se autogenera (UNIDAD-ÁREA-CLASIF-###)"
                    title="El código se genera automáticamente y no es editable."
                    className="w-full cursor-not-allowed rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(232,238,243,0.9)] px-3 py-2.5 text-sm text-[var(--unilabor-neutral)] outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Nombre del activo <span className="text-[#b02a2a]">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => setField('name', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                {/* Prioridad: Unidad -> Área -> Responsable (cascada estricta, obligatorios) */}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Unidad <span className="text-[#b02a2a]">*</span>
                  </span>
                  <SearchableSelect
                    value={form.unit_id}
                    onChange={handleFormUnitChange}
                    options={catalogToOptions(catalogs.units)}
                    placeholder="Selecciona una unidad"
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar unidad por nombre o codigo..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Área <span className="text-[#b02a2a]">*</span>
                  </span>
                  <SearchableSelect
                    value={form.area_id}
                    onChange={handleFormAreaChange}
                    options={formAreaOptions}
                    placeholder={form.unit_id ? 'Sin seleccionar' : 'Selecciona una unidad'}
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar area por nombre o codigo..."
                    disabled={!form.unit_id}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Responsable técnico <span className="text-[#b02a2a]">*</span>
                  </span>
                  <SearchableSelect
                    value={form.responsible_employee_id}
                    onChange={(value) => setField('responsible_employee_id', value)}
                    options={formResponsibleOptions}
                    placeholder={form.area_id ? 'Sin responsable' : 'Selecciona un área'}
                    emptyLabel="Sin responsable"
                    searchPlaceholder="Buscar responsable del área..."
                    disabled={!form.area_id}
                  />
                  {form.area_id && formResponsibleOptions.length === 0 ? (
                    <span className="mt-1 block text-xs text-[var(--unilabor-neutral)]">
                      Esta área no tiene responsables configurados. Asígnalos en Help Desk → Estructura.
                    </span>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Categoría <span className="text-[#b02a2a]">*</span>
                  </span>
                  <SearchableSelect
                    value={form.category_id}
                    onChange={(value) => setField('category_id', value)}
                    options={catalogToOptions(catalogs.categories)}
                    placeholder="Sin seleccionar"
                    emptyLabel="Sin seleccionar"
                    searchPlaceholder="Buscar categoria por nombre o codigo..."
                  />
                </label>
                <CatalogSelect label="Estado operativo" value={form.operational_status_id} options={catalogs.operational_statuses} onChange={(value) => setField('operational_status_id', value)} />
                <CatalogSelect label="Criticidad" value={form.criticality_id} options={catalogs.criticalities} onChange={(value) => setField('criticality_id', value)} />
                <CatalogSelect label="Ubicación" value={form.location_id} options={catalogs.locations} onChange={(value) => setField('location_id', value)} />

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
                    Número de serie
                  </span>
                  <input
                    value={form.serial_number}
                    onChange={(event) => setField('serial_number', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <CatalogSelect label="Modalidad de compra" value={form.purchase_modality_id} options={catalogs.purchase_modalities} onChange={(value) => setField('purchase_modality_id', value)} />
                <CatalogSelect label="Condición de compra" value={form.purchase_condition_id} options={catalogs.purchase_conditions} onChange={(value) => setField('purchase_condition_id', value)} />
                <CatalogSelect label="Proveedor" value={form.supplier_id} options={catalogs.suppliers} onChange={(value) => setField('supplier_id', value)} />
                <CatalogSelect label="Condición al recibir (ISO 6.4)" value={form.receipt_condition_id} options={catalogs.receipt_conditions} onChange={(value) => setField('receipt_condition_id', value)} />

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fecha de recepción
                  </span>
                  <input
                    type="date"
                    value={form.received_on}
                    onChange={(event) => setField('received_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Puesta en servicio
                  </span>
                  <input
                    type="date"
                    value={form.placed_in_service_on}
                    onChange={(event) => setField('placed_in_service_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Fecha de adquisición
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
                    Garantía hasta
                  </span>
                  <input
                    type="date"
                    value={form.warranty_expires_on}
                    onChange={(event) => setField('warranty_expires_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Descripción
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
                    Información complementaria y observaciones
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
                disabled={saving || !isFormValid}
                title={isFormValid ? undefined : 'Completa nombre, categoría, unidad, área y responsable.'}
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

      {labelAsset ? (
        <AssetLabelModal
          assetCode={labelAsset.asset_code}
          name={labelAsset.name}
          brand={labelAsset.brand?.name ?? labelAsset.brand_name ?? null}
          model={labelAsset.model ?? null}
          onClose={() => setLabelAsset(null)}
        />
      ) : null}

      {bulkLabels ? (
        <AssetLabelsPrintModal
          assets={bulkLabels.map((asset) => ({
            assetCode: asset.asset_code,
            name: asset.name,
            brand: asset.brand?.name ?? asset.brand_name ?? null,
            model: asset.model ?? null,
          }))}
          onClose={() => setBulkLabels(null)}
        />
      ) : null}

      {addComponentOpen && selectedAsset ? (
        <AddComponentModal
          parent={selectedAsset}
          onClose={() => setAddComponentOpen(false)}
          onCreated={handleComponentMutated}
        />
      ) : null}

      {attachComponentOpen && selectedAsset ? (
        <AttachComponentModal
          parent={selectedAsset}
          onClose={() => setAttachComponentOpen(false)}
          onAttached={handleComponentMutated}
        />
      ) : null}
    </div>
  );
};
