import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Edit3,
  Eye,
  Loader2,
  Plus,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import {
  closeCalibrationOrderById,
  createCalibrationPlan,
  getApiErrorMessage,
  getHelpdeskOrgStructure,
  listCalibrationCatalogs,
  listCalibrationOrders,
  listCalibrationPlans,
  listEmployees,
  listHelpdeskAssets,
  loadCalibrationSchedule,
  rescheduleCalibrationOrderById,
  startCalibrationOrderById,
  type HelpdeskCalibrationOrderClosePayload,
  updateCalibrationPlanById,
} from '../api/service';
import { SearchableSelect } from '../components/SearchableSelect';
import { ScheduleDatesModal } from '../components/helpdesk/ScheduleDatesModal';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Employee,
  HelpdeskAsset,
  HelpdeskCalibrationCatalogs,
  HelpdeskCalibrationOrder,
  HelpdeskCalibrationPlan,
  HelpdeskOrgStructure,
  HelpdeskScheduleMode,
} from '../types/models';
import { getModuleRole } from '../utils/modules';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';

import {
  EMPTY_CALIBRATION_CATALOGS,
  EMPTY_CALIBRATION_FORM,
  EMPTY_CALIBRATION_EXECUTION_FORM,
  EMPTY_CALIBRATION_RESCHEDULE_FORM,
  numericOrNull,
  getPlanState,
  nowInputValue,
  dateValue,
  stateLabel,
  orderStatusLabel,
  scheduleModeLabel,
  formatDate,
  formatDateTime,
  toCalibrationFormState,
  toCalibrationPayload,
  type CalibrationPlanFormState,
  type CalibrationExecutionFormState,
  type CalibrationRescheduleFormState,
} from './HelpdeskCalibrationPage.helpers';

const EMPTY_ORG_STRUCTURE: HelpdeskOrgStructure = { units: [], areas: [], users: [] };

export const HelpdeskCalibrationPage = () => {
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canWrite = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);

  const [plans, setPlans] = useState<HelpdeskCalibrationPlan[]>([]);
  const [orders, setOrders] = useState<HelpdeskCalibrationOrder[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskCalibrationCatalogs>(EMPTY_CALIBRATION_CATALOGS);
  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orgStructure, setOrgStructure] = useState<HelpdeskOrgStructure>(EMPTY_ORG_STRUCTURE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<HelpdeskCalibrationPlan | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<HelpdeskCalibrationOrder | null>(null);
  const [editingPlan, setEditingPlan] = useState<HelpdeskCalibrationPlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExecutionOpen, setIsExecutionOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [form, setForm] = useState<CalibrationPlanFormState>(EMPTY_CALIBRATION_FORM);
  const [executionForm, setExecutionForm] = useState<CalibrationExecutionFormState>(EMPTY_CALIBRATION_EXECUTION_FORM);
  const [rescheduleForm, setRescheduleForm] = useState<CalibrationRescheduleFormState>(EMPTY_CALIBRATION_RESCHEDULE_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planResult, orderResult, catalogResult, assetResult, employeeResult, orgResult] = await Promise.allSettled([
        listCalibrationPlans(),
        listCalibrationOrders(),
        listCalibrationCatalogs(),
        listHelpdeskAssets(),
        listEmployees(),
        getHelpdeskOrgStructure(),
      ]);

      if (planResult.status === 'fulfilled') {
        const planData = planResult.value;
        setPlans(planData);
        setSelectedPlan((current) => {
          if (!current) {
            return current;
          }

          const refreshed = planData.find((plan) => plan.id === current.id);
          return refreshed ?? current;
        });
      } else {
        notifyError(getApiErrorMessage(planResult.reason, 'No se pudieron cargar los planes de calibración.'));
      }

      if (orderResult.status === 'fulfilled') {
        const orderData = orderResult.value;
        setOrders(orderData);
        setSelectedOrder((current) => {
          if (!current) {
            return current;
          }

          const refreshed = orderData.find((order) => order.id === current.id);
          return refreshed ?? current;
        });
      } else {
        notifyError(getApiErrorMessage(orderResult.reason, 'No se pudieron cargar las órdenes de calibración.'));
      }

      if (catalogResult.status === 'fulfilled') {
        setCatalogs(catalogResult.value);
      } else {
        notifyError(getApiErrorMessage(catalogResult.reason, 'No se pudieron cargar los catálogos de calibración.'));
      }

      if (assetResult.status === 'fulfilled') {
        setAssets(assetResult.value);
      } else {
        notifyError(getApiErrorMessage(assetResult.reason, 'No se pudieron cargar los activos de Helpdesk.'));
      }

      if (employeeResult.status === 'fulfilled') {
        setEmployees(employeeResult.value);
      } else {
        notifyError(getApiErrorMessage(employeeResult.reason, 'No se pudieron cargar los colaboradores.'));
      }

      if (orgResult.status === 'fulfilled') {
        setOrgStructure(orgResult.value);
      } else {
        notifyError(getApiErrorMessage(orgResult.reason, 'No se pudo cargar la estructura organizacional.'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Cascada Unidad -> Área -> Responsable (misma lógica que helpdesk/assets),
  // construida sobre la estructura organizacional M:N.
  const unitOptions = useMemo(
    () => orgStructure.units.map((unit) => ({ value: String(unit.id), label: unit.name, hint: unit.code ?? undefined })),
    [orgStructure.units],
  );
  const areaOptions = useMemo(() => {
    const unitId = numericOrNull(unitFilter);
    if (!unitId) {
      return [];
    }
    return orgStructure.areas
      .filter((area) => area.unit_ids.includes(unitId))
      .map((area) => ({ value: String(area.id), label: area.name, hint: area.code ?? undefined }));
  }, [orgStructure.areas, unitFilter]);
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

  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    setAreaFilter('');
    setUserFilter('');
  };
  const handleAreaFilterChange = (value: string) => {
    setAreaFilter(value);
    setUserFilter('');
  };

  // Opciones de los selectores del formulario (activo, frecuencia, responsable).
  const assetOptions = useMemo(
    () =>
      assets.map((asset) => ({
        value: String(asset.id),
        label: `${asset.asset_code} - ${asset.name}`,
        hint: asset.name,
      })),
    [assets],
  );
  const frequencyOptions = useMemo(
    () => catalogs.frequencies.map((frequency) => ({ value: String(frequency.id), label: frequency.name })),
    [catalogs.frequencies],
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: String(employee.id),
        label: employee.full_name,
        hint: employee.employee_code,
      })),
    [employees],
  );

  // Los planes no traen unit_id/area_id, pero sí referencian asset_id: se resuelve
  // la unidad/área del plan desde el listado completo de activos ya cargado.
  const assetById = useMemo(() => {
    const map = new Map<number, HelpdeskAsset>();
    assets.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [assets]);

  const filteredPlans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const unitId = numericOrNull(unitFilter);
    const areaId = numericOrNull(areaFilter);
    const responsibleAreaIds = userFilter
      ? new Set(
          orgStructure.areas
            .filter((area) => area.responsible_user_ids.includes(userFilter))
            .map((area) => area.id),
        )
      : null;

    return plans.filter((plan) => {
      const asset = assetById.get(plan.asset_id);
      if (unitId && asset?.unit_id !== unitId) {
        return false;
      }
      if (areaId && asset?.area_id !== areaId) {
        return false;
      }
      if (responsibleAreaIds && !(asset?.area_id != null && responsibleAreaIds.has(asset.area_id))) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        plan.plan_code,
        plan.title,
        plan.asset?.asset_code ?? '',
        plan.asset?.name ?? '',
        plan.frequency?.name ?? '',
        plan.responsible_employee?.full_name ?? '',
        plan.provider_name ?? '',
        plan.standard_ref ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [plans, query, unitFilter, areaFilter, userFilter, orgStructure.areas, assetById]);

  const summary = useMemo(() => ({
    total: plans.length,
    overdue: plans.filter((plan) => getPlanState(plan) === 'overdue').length,
    soon: plans.filter((plan) => getPlanState(plan) === 'soon').length,
    inProgress: orders.filter((order) => order.status === 'IN_PROGRESS').length,
  }), [orders, plans]);

  const resetForm = () => {
    setForm(EMPTY_CALIBRATION_FORM);
    setEditingPlan(null);
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (plan: HelpdeskCalibrationPlan) => {
    setEditingPlan(plan);
    setForm(toCalibrationFormState(plan));
    setIsFormOpen(true);
  };

  const validateForm = () => {
    if (!numericOrNull(form.asset_id)) {
      notifyWarning('Selecciona el activo del plan.');
      return false;
    }
    if (!form.title.trim()) {
      notifyWarning('El título del plan es obligatorio.');
      return false;
    }
    if (!form.starts_on || !form.next_due_on) {
      notifyWarning('Captura fecha de inicio y próxima calibración.');
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
      if (editingPlan) {
        const updated = await updateCalibrationPlanById(editingPlan.id, toCalibrationPayload(form));
        setSelectedPlan(updated ?? editingPlan);
        notifySuccess('Plan de calibración actualizado correctamente.');
      } else {
        const created = await createCalibrationPlan(toCalibrationPayload(form));
        setSelectedPlan(created);
        notifySuccess('Plan de calibración creado correctamente.');
      }

      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el plan de calibración.'));
    } finally {
      setSaving(false);
    }
  };

  const openExecution = (order: HelpdeskCalibrationOrder) => {
    const fullOrder = orders.find((currentOrder) => currentOrder.id === order.id) ?? order;
    setSelectedOrder(fullOrder);
    setExecutionForm({
      ...EMPTY_CALIBRATION_EXECUTION_FORM,
      completed_at: nowInputValue(),
      result: fullOrder.result ?? 'APROBADA',
      certificate_no: fullOrder.certificate_no ?? '',
      calibration_due_on: dateValue(fullOrder.calibration_due_on),
      provider_name: fullOrder.provider_name ?? selectedPlan?.provider_name ?? '',
    });
    setIsExecutionOpen(true);
  };

  const openReschedule = (order: HelpdeskCalibrationOrder) => {
    const fullOrder = orders.find((currentOrder) => currentOrder.id === order.id) ?? order;
    setSelectedOrder(fullOrder);
    setRescheduleForm({
      scheduled_for: dateValue(fullOrder.scheduled_for),
      reschedule_reason: fullOrder.reschedule_reason ?? '',
    });
    setIsRescheduleOpen(true);
  };

  const handleStartOrder = async (order: HelpdeskCalibrationOrder) => {
    if (!canWrite) {
      return;
    }

    setSaving(true);
    try {
      const updated = await startCalibrationOrderById(order.id);
      if (updated) {
        setSelectedOrder(updated);
      }
      notifySuccess('Orden de calibración iniciada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo iniciar la orden de calibración.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRescheduleOrder = async () => {
    if (!canWrite || !selectedOrder) {
      return;
    }
    if (!rescheduleForm.scheduled_for || !rescheduleForm.reschedule_reason.trim()) {
      notifyWarning('Captura la nueva fecha y la justificación de reprogramación.');
      return;
    }

    setSaving(true);
    try {
      const updated = await rescheduleCalibrationOrderById(selectedOrder.id, {
        scheduled_for: rescheduleForm.scheduled_for,
        reschedule_reason: rescheduleForm.reschedule_reason.trim(),
      });
      if (updated) {
        setSelectedOrder(updated);
      }
      setIsRescheduleOpen(false);
      notifySuccess('Orden reprogramada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo reprogramar la orden.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseOrder = async () => {
    if (!canWrite || !selectedOrder) {
      return;
    }
    if (!executionForm.completed_at || !executionForm.result.trim()) {
      notifyWarning('Captura fecha de calibración y resultado.');
      return;
    }

    const payload: HelpdeskCalibrationOrderClosePayload = {
      completed_at: executionForm.completed_at,
      result: executionForm.result.trim(),
      certificate_no: executionForm.certificate_no.trim() || null,
      calibration_due_on: executionForm.calibration_due_on || null,
      findings: executionForm.findings.trim() || null,
      provider_name: executionForm.provider_name.trim() || null,
      evidence_notes: executionForm.evidence_notes.trim() || null,
    };

    setSaving(true);
    try {
      const updated = await closeCalibrationOrderById(selectedOrder.id, payload);
      if (updated) {
        setSelectedOrder(updated);
      }
      setIsExecutionOpen(false);
      notifySuccess('Orden de calibración cerrada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la orden.'));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSchedule = async (dates: string[]) => {
    if (!canWrite || !selectedPlan) {
      return;
    }

    setSaving(true);
    try {
      const updated = await loadCalibrationSchedule(selectedPlan.id, { dates });
      if (updated) {
        setSelectedPlan(updated);
      }
      setIsScheduleOpen(false);
      notifySuccess('Cronograma cargado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el cronograma.'));
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof CalibrationPlanFormState>(field: K, value: CalibrationPlanFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Calibración (ISO 15189)
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Planes y calendario de calibración</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Controla la calibración metrológica de cada equipo por operador, con calendario provisto por el proveedor o
            responsable, norma de referencia y certificado.
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
              Nuevo plan
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Planes', value: summary.total },
          { label: 'Vencidos', value: summary.overdue },
          { label: 'Próximos 30 días', value: summary.soon },
          { label: 'Órdenes en proceso', value: summary.inProgress },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="flex items-center gap-3">
              <Search size={18} className="text-[var(--color-brand-700)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por plan, activo, frecuencia, responsable, proveedor o norma..."
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
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Plan</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Próxima calibración</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      Cargando planes...
                    </td>
                  </tr>
                ) : filteredPlans.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      No hay planes de calibración registrados.
                    </td>
                  </tr>
                ) : (
                  filteredPlans.map((plan) => {
                    const planState = getPlanState(plan);
                    return (
                      <tr key={plan.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-[var(--color-brand-700)]">{plan.plan_code}</p>
                          <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{plan.title}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{scheduleModeLabel(plan.schedule_mode)}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                          <p>{plan.asset?.asset_code ?? 'Sin activo'}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{plan.asset?.name ?? ''}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                          <p>{formatDate(plan.next_due_on)}</p>
                          <p className="text-xs text-[var(--unilabor-neutral)]">{stateLabel(planState)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPlan(plan)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                            >
                              <Eye size={14} />
                              Ver
                            </button>
                            {canWrite ? (
                              <button
                                type="button"
                                onClick={() => openEdit(plan)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                              >
                                <Edit3 size={14} />
                                Editar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          {selectedPlan ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                  <CalendarClock size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
                    {selectedPlan.plan_code}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{selectedPlan.title}</h2>
                  <span className="mt-1 inline-flex items-center rounded-full border border-[rgba(0,65,106,0.12)] bg-[rgba(191,212,230,0.32)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-brand-700)]">
                    {scheduleModeLabel(selectedPlan.schedule_mode)}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                {[
                  ['Activo', selectedPlan.asset ? `${selectedPlan.asset.asset_code} | ${selectedPlan.asset.name}` : 'Sin activo'],
                  ['Frecuencia', selectedPlan.frequency?.name ?? 'Sin frecuencia'],
                  ['Responsable técnico', selectedPlan.responsible_employee?.full_name ?? 'Sin responsable'],
                  ['Proveedor', selectedPlan.provider_name ?? 'Interno / sin proveedor'],
                  ['Norma / patrón', selectedPlan.standard_ref ?? 'Sin referencia'],
                  ['Inicio', formatDate(selectedPlan.starts_on)],
                  ['Próxima calibración', formatDate(selectedPlan.next_due_on)],
                  ['Ventana', `${selectedPlan.tolerance_before_days} días antes / ${selectedPlan.tolerance_after_days} días después`],
                  ['Certificado', selectedPlan.certificate_required ? 'Requerido' : 'No requerido'],
                  ['Evidencia', selectedPlan.evidence_required ? 'Requerida' : 'No requerida'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
                    <p className="mt-1 font-semibold text-[var(--color-brand-700)]">{value}</p>
                  </div>
                ))}
              </div>

              {canWrite ? (
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                >
                  <CalendarPlus size={16} />
                  Cargar cronograma
                </button>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Órdenes programadas</p>
                {selectedPlan.orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
                    Sin órdenes programadas. Carga un cronograma o configura la frecuencia.
                  </div>
                ) : (
                  selectedPlan.orders.map((order) => (
                    <div key={order.id} className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                      <div>
                        <p className="font-bold text-[var(--color-brand-700)]">{order.order_code}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {formatDate(order.scheduled_for)} | {orderStatusLabel(order.status)}
                        </p>
                        {order.completed_at ? (
                          <p className="text-xs text-[var(--unilabor-neutral)]">
                            Cierre: {formatDateTime(order.completed_at)} | {order.result ?? 'Sin resultado'}
                          </p>
                        ) : null}
                        {order.certificate_no ? (
                          <p className="text-xs text-[var(--unilabor-neutral)]">Certificado: {order.certificate_no}</p>
                        ) : null}
                      </div>
                      {canWrite && order.status !== 'CLOSED' ? (
                        <div className="flex flex-wrap gap-2">
                          {order.status !== 'IN_PROGRESS' ? (
                            <button
                              type="button"
                              onClick={() => void handleStartOrder(order)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                            >
                              <PlayCircle size={13} />
                              Iniciar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openExecution(order)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                          >
                            <Send size={13} />
                            Cerrar
                          </button>
                          {order.status !== 'IN_PROGRESS' ? (
                            <button
                              type="button"
                              onClick={() => openReschedule(order)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                            >
                              <CalendarClock size={13} />
                              Reprogramar
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-6 text-sm leading-6 text-[var(--unilabor-neutral)]">
              Selecciona un plan para ver su calendario, responsable técnico, norma de referencia y órdenes programadas.
            </div>
          )}
        </aside>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Calibración (ISO 15189)
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
                {editingPlan ? 'Editar plan' : 'Nuevo plan'}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Título</span>
                  <input
                    value={form.title}
                    onChange={(event) => setField('title', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</span>
                  <SearchableSelect
                    value={form.asset_id}
                    onChange={(value) => setField('asset_id', value)}
                    options={assetOptions}
                    placeholder="Selecciona activo"
                    emptyLabel="Sin activo"
                    searchPlaceholder="Buscar activo por código o nombre..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Modo de programación</span>
                  <select
                    value={form.schedule_mode}
                    onChange={(event) => setField('schedule_mode', event.target.value as HelpdeskScheduleMode)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="FREQUENCY">Por frecuencia</option>
                    <option value="CALENDAR">Calendario provisto</option>
                  </select>
                  {form.schedule_mode === 'CALENDAR' ? (
                    <span className="mt-1 block text-[11px] text-[var(--unilabor-neutral)]">
                      Las fechas se cargan desde el detalle del plan con "Cargar cronograma".
                    </span>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Frecuencia</span>
                  <SearchableSelect
                    value={form.frequency_id}
                    onChange={(value) => setField('frequency_id', value)}
                    options={frequencyOptions}
                    placeholder="Sin frecuencia"
                    emptyLabel="Sin frecuencia"
                    searchPlaceholder="Buscar frecuencia..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Responsable técnico</span>
                  <SearchableSelect
                    value={form.responsible_employee_id}
                    onChange={(value) => setField('responsible_employee_id', value)}
                    options={employeeOptions}
                    placeholder="Sin responsable"
                    emptyLabel="Sin responsable"
                    searchPlaceholder="Buscar responsable por nombre o código..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proveedor</span>
                  <input
                    value={form.provider_name}
                    onChange={(event) => setField('provider_name', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Norma / patrón de referencia</span>
                  <input
                    value={form.standard_ref}
                    onChange={(event) => setField('standard_ref', event.target.value)}
                    placeholder="p. ej. ISO 17025, patrón trazable..."
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Inicio</span>
                  <input
                    type="date"
                    value={form.starts_on}
                    onChange={(event) => setField('starts_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Próxima calibración</span>
                  <input
                    type="date"
                    value={form.next_due_on}
                    onChange={(event) => setField('next_due_on', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Tolerancia antes</span>
                  <input
                    type="number"
                    min="0"
                    value={form.tolerance_before_days}
                    onChange={(event) => setField('tolerance_before_days', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Tolerancia después</span>
                  <input
                    type="number"
                    min="0"
                    value={form.tolerance_after_days}
                    onChange={(event) => setField('tolerance_after_days', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Descripción</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) => setField('description', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.certificate_required}
                    onChange={(event) => setField('certificate_required', event.target.checked)}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                  />
                  <span className="text-sm font-semibold text-[var(--color-brand-700)]">Certificado requerido</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.evidence_required}
                    onChange={(event) => setField('evidence_required', event.target.checked)}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                  />
                  <span className="text-sm font-semibold text-[var(--color-brand-700)]">Evidencia requerida</span>
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
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                Guardar plan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isExecutionOpen && selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                {selectedOrder.order_code}
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Cerrar orden de calibración</h2>
              <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                {selectedOrder.asset?.asset_code ?? selectedPlan?.asset?.asset_code} | {selectedOrder.asset?.name ?? selectedPlan?.asset?.name}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Fecha de calibración</span>
                  <input
                    type="datetime-local"
                    value={executionForm.completed_at}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, completed_at: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Resultado</span>
                  <select
                    value={executionForm.result}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, result: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="APROBADA">Aprobada</option>
                    <option value="CONDICIONADA">Condicionada</option>
                    <option value="RECHAZADA">Rechazada</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">N° de certificado</span>
                  <input
                    value={executionForm.certificate_no}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, certificate_no: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Próxima calibración / vencimiento del certificado</span>
                  <input
                    type="date"
                    value={executionForm.calibration_due_on}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, calibration_due_on: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                  <span className="mt-1 block text-[11px] text-[var(--unilabor-neutral)]">
                    Si se captura, define la próxima orden en modo por frecuencia.
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proveedor</span>
                  <input
                    value={executionForm.provider_name}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, provider_name: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Evidencia</span>
                  <input
                    value={executionForm.evidence_notes}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, evidence_notes: event.target.value }))}
                    placeholder="Folio, ruta o referencia documental"
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Observaciones</span>
                  <textarea
                    rows={3}
                    value={executionForm.findings}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, findings: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsExecutionOpen(false)}
                disabled={saving}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCloseOrder()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Cerrar orden
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isRescheduleOpen && selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                {selectedOrder.order_code}
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Reprogramar orden</h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nueva fecha</span>
                <input
                  type="date"
                  value={rescheduleForm.scheduled_for}
                  onChange={(event) => setRescheduleForm((current) => ({ ...current, scheduled_for: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Justificación</span>
                <textarea
                  rows={3}
                  value={rescheduleForm.reschedule_reason}
                  onChange={(event) => setRescheduleForm((current) => ({ ...current, reschedule_reason: event.target.value }))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsRescheduleOpen(false)}
                disabled={saving}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleRescheduleOrder()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                Reprogramar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ScheduleDatesModal
        open={isScheduleOpen}
        saving={saving}
        onClose={() => setIsScheduleOpen(false)}
        onSubmit={(dates) => void handleLoadSchedule(dates)}
      />
    </div>
  );
};
