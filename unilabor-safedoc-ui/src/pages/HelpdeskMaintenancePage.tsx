import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckSquare,
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
  closeMaintenanceOrderById,
  createMaintenancePlan,
  getApiErrorMessage,
  listEmployees,
  listHelpdeskAssets,
  listMaintenanceCatalogs,
  listMaintenanceOrders,
  listMaintenancePlans,
  rescheduleMaintenanceOrderById,
  startMaintenanceOrderById,
  type HelpdeskMaintenanceOrderClosePayload,
  type HelpdeskMaintenancePlanPayload,
  updateMaintenancePlanById,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Employee,
  HelpdeskAsset,
  HelpdeskMaintenanceCatalogs,
  HelpdeskMaintenanceOrder,
  HelpdeskMaintenancePlan,
} from '../types/models';
import { getModuleRole } from '../utils/modules';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';

interface PlanFormState {
  asset_id: string;
  frequency_id: string;
  responsible_employee_id: string;
  title: string;
  description: string;
  provider_name: string;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: string;
  tolerance_after_days: string;
  checklist_required: boolean;
  evidence_required: boolean;
  tasks_text: string;
}

interface ChecklistExecutionState {
  plan_task_id?: number | null;
  task_text: string;
  result: string;
  notes: string;
}

interface OrderExecutionFormState {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings: string;
  provider_name: string;
  evidence_notes: string;
  checklist: ChecklistExecutionState[];
}

interface RescheduleFormState {
  scheduled_for: string;
  reschedule_reason: string;
}

const EMPTY_CATALOGS: HelpdeskMaintenanceCatalogs = {
  frequencies: [],
};

const EMPTY_FORM: PlanFormState = {
  asset_id: '',
  frequency_id: '',
  responsible_employee_id: '',
  title: '',
  description: '',
  provider_name: '',
  starts_on: '',
  next_due_on: '',
  tolerance_before_days: '0',
  tolerance_after_days: '0',
  checklist_required: true,
  evidence_required: true,
  tasks_text: '',
};

const EMPTY_EXECUTION_FORM: OrderExecutionFormState = {
  completed_at: '',
  performed_activities: '',
  result: 'CONFORME',
  findings: '',
  provider_name: '',
  evidence_notes: '',
  checklist: [],
};

const EMPTY_RESCHEDULE_FORM: RescheduleFormState = {
  scheduled_for: '',
  reschedule_reason: '',
};

const numericOrNull = (value: string): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const numberOrZero = (value: string): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
};

const dateValue = (value?: string | null): string => value ? value.slice(0, 10) : '';

const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const nowInputValue = (): string => new Date().toISOString().slice(0, 16);

const orderStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    SCHEDULED: 'Programada',
    RESCHEDULED: 'Reprogramada',
    IN_PROGRESS: 'En proceso',
    CLOSED: 'Cerrada',
  };

  return labels[status] ?? status;
};

const getPlanState = (plan: HelpdeskMaintenancePlan): 'overdue' | 'soon' | 'ok' => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${plan.next_due_on.slice(0, 10)}T00:00:00`);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return 'overdue';
  }
  if (diffDays <= 30) {
    return 'soon';
  }
  return 'ok';
};

const stateLabel = (state: 'overdue' | 'soon' | 'ok'): string => {
  if (state === 'overdue') {
    return 'Vencido';
  }
  if (state === 'soon') {
    return 'Proximo';
  }
  return 'Vigente';
};

const toFormState = (plan: HelpdeskMaintenancePlan): PlanFormState => ({
  asset_id: String(plan.asset_id),
  frequency_id: plan.frequency_id ? String(plan.frequency_id) : '',
  responsible_employee_id: plan.responsible_employee_id ? String(plan.responsible_employee_id) : '',
  title: plan.title,
  description: plan.description ?? '',
  provider_name: plan.provider_name ?? '',
  starts_on: dateValue(plan.starts_on),
  next_due_on: dateValue(plan.next_due_on),
  tolerance_before_days: String(plan.tolerance_before_days ?? 0),
  tolerance_after_days: String(plan.tolerance_after_days ?? 0),
  checklist_required: plan.checklist_required,
  evidence_required: plan.evidence_required,
  tasks_text: plan.tasks.map((task) => task.task_text).join('\n'),
});

const toPayload = (form: PlanFormState): HelpdeskMaintenancePlanPayload => ({
  asset_id: numericOrNull(form.asset_id) ?? 0,
  frequency_id: numericOrNull(form.frequency_id),
  responsible_employee_id: numericOrNull(form.responsible_employee_id),
  title: form.title.trim(),
  description: form.description.trim() || null,
  provider_name: form.provider_name.trim() || null,
  starts_on: form.starts_on,
  next_due_on: form.next_due_on,
  tolerance_before_days: numberOrZero(form.tolerance_before_days),
  tolerance_after_days: numberOrZero(form.tolerance_after_days),
  checklist_required: form.checklist_required,
  evidence_required: form.evidence_required,
  tasks: form.tasks_text
    .split('\n')
    .map((task) => task.trim())
    .filter(Boolean),
});

export const HelpdeskMaintenancePage = () => {
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canWrite = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);

  const [plans, setPlans] = useState<HelpdeskMaintenancePlan[]>([]);
  const [orders, setOrders] = useState<HelpdeskMaintenanceOrder[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskMaintenanceCatalogs>(EMPTY_CATALOGS);
  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<HelpdeskMaintenancePlan | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<HelpdeskMaintenanceOrder | null>(null);
  const [editingPlan, setEditingPlan] = useState<HelpdeskMaintenancePlan | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExecutionOpen, setIsExecutionOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [executionForm, setExecutionForm] = useState<OrderExecutionFormState>(EMPTY_EXECUTION_FORM);
  const [rescheduleForm, setRescheduleForm] = useState<RescheduleFormState>(EMPTY_RESCHEDULE_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planData, orderData, catalogData, assetData, employeeData] = await Promise.all([
        listMaintenancePlans(),
        listMaintenanceOrders(),
        listMaintenanceCatalogs(),
        listHelpdeskAssets(),
        listEmployees(),
      ]);

      setPlans(planData);
      setOrders(orderData);
      setCatalogs(catalogData);
      setAssets(assetData);
      setEmployees(employeeData);
      if (selectedPlan) {
        setSelectedPlan(planData.find((plan) => plan.id === selectedPlan.id) ?? selectedPlan);
      }
      if (selectedOrder) {
        setSelectedOrder(orderData.find((order) => order.id === selectedOrder.id) ?? selectedOrder);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los planes de mantenimiento.'));
    } finally {
      setLoading(false);
    }
  }, [selectedOrder, selectedPlan]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredPlans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return plans;
    }

    return plans.filter((plan) =>
      [
        plan.plan_code,
        plan.title,
        plan.asset?.asset_code ?? '',
        plan.asset?.name ?? '',
        plan.frequency?.name ?? '',
        plan.responsible_employee?.full_name ?? '',
        plan.provider_name ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [plans, query]);

  const summary = useMemo(() => ({
    total: plans.length,
    overdue: plans.filter((plan) => getPlanState(plan) === 'overdue').length,
    soon: plans.filter((plan) => getPlanState(plan) === 'soon').length,
    inProgress: orders.filter((order) => order.status === 'IN_PROGRESS').length,
  }), [orders, plans]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingPlan(null);
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (plan: HelpdeskMaintenancePlan) => {
    setEditingPlan(plan);
    setForm(toFormState(plan));
    setIsFormOpen(true);
  };

  const validateForm = () => {
    if (!numericOrNull(form.asset_id)) {
      notifyWarning('Selecciona el activo del plan.');
      return false;
    }
    if (!form.title.trim()) {
      notifyWarning('El titulo del plan es obligatorio.');
      return false;
    }
    if (!form.starts_on || !form.next_due_on) {
      notifyWarning('Captura fecha de inicio y proxima ejecucion.');
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
        const updated = await updateMaintenancePlanById(editingPlan.id, toPayload(form));
        setSelectedPlan(updated ?? editingPlan);
        notifySuccess('Plan de mantenimiento actualizado correctamente.');
      } else {
        const created = await createMaintenancePlan(toPayload(form));
        setSelectedPlan(created);
        notifySuccess('Plan de mantenimiento creado correctamente.');
      }

      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el plan de mantenimiento.'));
    } finally {
      setSaving(false);
    }
  };

  const openExecution = (order: HelpdeskMaintenanceOrder) => {
    const fullOrder = orders.find((currentOrder) => currentOrder.id === order.id) ?? order;
    setSelectedOrder(fullOrder);
    setExecutionForm({
      ...EMPTY_EXECUTION_FORM,
      completed_at: nowInputValue(),
      provider_name: fullOrder.provider_name ?? selectedPlan?.provider_name ?? '',
      checklist: (fullOrder.checklist ?? []).map((item) => ({
        plan_task_id: item.plan_task_id,
        task_text: item.task_text,
        result: item.result === 'PENDING' ? 'CUMPLE' : item.result,
        notes: item.notes ?? '',
      })),
    });
    setIsExecutionOpen(true);
  };

  const openReschedule = (order: HelpdeskMaintenanceOrder) => {
    const fullOrder = orders.find((currentOrder) => currentOrder.id === order.id) ?? order;
    setSelectedOrder(fullOrder);
    setRescheduleForm({
      scheduled_for: dateValue(fullOrder.scheduled_for),
      reschedule_reason: fullOrder.reschedule_reason ?? '',
    });
    setIsRescheduleOpen(true);
  };

  const handleStartOrder = async (order: HelpdeskMaintenanceOrder) => {
    if (!canWrite) {
      return;
    }

    setSaving(true);
    try {
      const updated = await startMaintenanceOrderById(order.id);
      if (updated) {
        setSelectedOrder(updated);
      }
      notifySuccess('Orden de mantenimiento iniciada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo iniciar la orden de mantenimiento.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRescheduleOrder = async () => {
    if (!canWrite || !selectedOrder) {
      return;
    }
    if (!rescheduleForm.scheduled_for || !rescheduleForm.reschedule_reason.trim()) {
      notifyWarning('Captura la nueva fecha y la justificacion de reprogramacion.');
      return;
    }

    setSaving(true);
    try {
      const updated = await rescheduleMaintenanceOrderById(selectedOrder.id, {
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
    if (!executionForm.completed_at || !executionForm.performed_activities.trim()) {
      notifyWarning('Captura fecha de cierre y actividades realizadas.');
      return;
    }

    const payload: HelpdeskMaintenanceOrderClosePayload = {
      completed_at: executionForm.completed_at,
      performed_activities: executionForm.performed_activities.trim(),
      result: executionForm.result,
      findings: executionForm.findings.trim() || null,
      provider_name: executionForm.provider_name.trim() || null,
      evidence_notes: executionForm.evidence_notes.trim() || null,
      checklist: executionForm.checklist.map((item) => ({
        plan_task_id: item.plan_task_id ?? null,
        task_text: item.task_text,
        result: item.result,
        notes: item.notes.trim() || null,
      })),
    };

    setSaving(true);
    try {
      const updated = await closeMaintenanceOrderById(selectedOrder.id, payload);
      if (updated) {
        setSelectedOrder(updated);
      }
      setIsExecutionOpen(false);
      notifySuccess('Orden de mantenimiento cerrada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar la orden.'));
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof PlanFormState>(field: K, value: PlanFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setExecutionChecklist = (index: number, update: Partial<ChecklistExecutionState>) => {
    setExecutionForm((current) => ({
      ...current,
      checklist: current.checklist.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...update } : item
      )),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Mantenimiento preventivo
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Planes y calendario</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Programa mantenimientos por activo, frecuencia, responsable, ventana de ejecucion y checklist requerido.
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
          { label: 'Proximos 30 dias', value: summary.soon },
          { label: 'Ordenes en proceso', value: summary.inProgress },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <Search size={18} className="text-[var(--color-brand-700)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por plan, activo, frecuencia, responsable o proveedor..."
              className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Plan</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proxima ejecucion</th>
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
                      No hay planes de mantenimiento registrados.
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
                          <p className="text-xs text-[var(--unilabor-neutral)]">{plan.frequency?.name ?? 'Sin frecuencia'}</p>
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
                  <p className="text-xs text-[var(--unilabor-neutral)]">{selectedPlan.frequency?.name ?? 'Sin frecuencia'}</p>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                {[
                  ['Activo', selectedPlan.asset ? `${selectedPlan.asset.asset_code} | ${selectedPlan.asset.name}` : 'Sin activo'],
                  ['Responsable', selectedPlan.responsible_employee?.full_name ?? 'Sin responsable'],
                  ['Proveedor', selectedPlan.provider_name ?? 'Interno / sin proveedor'],
                  ['Inicio', formatDate(selectedPlan.starts_on)],
                  ['Proxima ejecucion', formatDate(selectedPlan.next_due_on)],
                  ['Ventana', `${selectedPlan.tolerance_before_days} dias antes / ${selectedPlan.tolerance_after_days} dias despues`],
                  ['Evidencia', selectedPlan.evidence_required ? 'Requerida' : 'No requerida'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
                    <p className="mt-1 font-semibold text-[var(--color-brand-700)]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Checklist</p>
                {selectedPlan.tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
                    Sin actividades de checklist.
                  </div>
                ) : (
                  selectedPlan.tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm text-[var(--unilabor-ink)]">
                      <CheckSquare size={15} className="mt-0.5 text-[var(--color-brand-700)]" />
                      <span>{task.task_text}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Ordenes programadas</p>
                {selectedPlan.orders.map((order) => (
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
                          <CheckSquare size={13} />
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
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-6 text-sm leading-6 text-[var(--unilabor-neutral)]">
              Selecciona un plan para ver su calendario, responsable, checklist y orden programada.
            </div>
          )}
        </aside>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Mantenimiento preventivo
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">
                {editingPlan ? 'Editar plan' : 'Nuevo plan'}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Titulo</span>
                  <input
                    value={form.title}
                    onChange={(event) => setField('title', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</span>
                  <select
                    value={form.asset_id}
                    onChange={(event) => setField('asset_id', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Selecciona activo</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.asset_code} - {asset.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Frecuencia</span>
                  <select
                    value={form.frequency_id}
                    onChange={(event) => setField('frequency_id', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Sin frecuencia</option>
                    {catalogs.frequencies.map((frequency) => (
                      <option key={frequency.id} value={frequency.id}>{frequency.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Responsable</span>
                  <select
                    value={form.responsible_employee_id}
                    onChange={(event) => setField('responsible_employee_id', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  >
                    <option value="">Sin responsable</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proveedor externo</span>
                  <input
                    value={form.provider_name}
                    onChange={(event) => setField('provider_name', event.target.value)}
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
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proxima ejecucion</span>
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
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Tolerancia despues</span>
                  <input
                    type="number"
                    min="0"
                    value={form.tolerance_after_days}
                    onChange={(event) => setField('tolerance_after_days', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Descripcion</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) => setField('description', event.target.value)}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Checklist</span>
                  <textarea
                    rows={5}
                    value={form.tasks_text}
                    onChange={(event) => setField('tasks_text', event.target.value)}
                    placeholder="Una actividad por linea"
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.checklist_required}
                    onChange={(event) => setField('checklist_required', event.target.checked)}
                    className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                  />
                  <span className="text-sm font-semibold text-[var(--color-brand-700)]">Checklist requerido</span>
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
              <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Cerrar orden de mantenimiento</h2>
              <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                {selectedOrder.asset?.asset_code ?? selectedPlan?.asset?.asset_code} | {selectedOrder.asset?.name ?? selectedPlan?.asset?.name}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Fecha de cierre</span>
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
                    <option value="CONFORME">Conforme</option>
                    <option value="NO_CONFORME">No conforme</option>
                    <option value="REQUIERE_SEGUIMIENTO">Requiere seguimiento</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Proveedor externo</span>
                  <input
                    value={executionForm.provider_name}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, provider_name: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Evidencia / certificado</span>
                  <input
                    value={executionForm.evidence_notes}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, evidence_notes: event.target.value }))}
                    placeholder="Folio, ruta o referencia documental"
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Actividades realizadas</span>
                  <textarea
                    rows={3}
                    value={executionForm.performed_activities}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, performed_activities: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Hallazgos / observaciones</span>
                  <textarea
                    rows={2}
                    value={executionForm.findings}
                    onChange={(event) => setExecutionForm((current) => ({ ...current, findings: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </label>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Checklist ejecutado</p>
                {executionForm.checklist.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
                    Esta orden no tiene checklist asociado.
                  </div>
                ) : (
                  executionForm.checklist.map((item, index) => (
                    <div key={`${item.plan_task_id ?? index}-${item.task_text}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] p-3 md:grid-cols-[minmax(0,1fr)_170px_minmax(180px,0.7fr)]">
                      <p className="text-sm font-semibold text-[var(--color-brand-700)]">{item.task_text}</p>
                      <select
                        value={item.result}
                        onChange={(event) => setExecutionChecklist(index, { result: event.target.value })}
                        className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm text-[var(--unilabor-ink)] outline-none"
                      >
                        <option value="CUMPLE">Cumple</option>
                        <option value="NO_CUMPLE">No cumple</option>
                        <option value="NO_APLICA">No aplica</option>
                      </select>
                      <input
                        value={item.notes}
                        onChange={(event) => setExecutionChecklist(index, { notes: event.target.value })}
                        placeholder="Nota"
                        className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm text-[var(--unilabor-ink)] outline-none"
                      />
                    </div>
                  ))
                )}
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
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Justificacion</span>
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
    </div>
  );
};
