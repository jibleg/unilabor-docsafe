import { useState } from 'react';
import { GripVertical, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { SearchableSelect } from '../../SearchableSelect';
import type { MaintenanceAnchorMode, MaintenanceExecutorKind, MaintenanceIntervalUnit, MaintenanceServiceKind } from '../../../types/helpdesk-program';
import { newRoutineDraft, type RoutineDraft } from '../../../utils/maintenanceProgram';
import type { Employee, HelpdeskCatalogItem, HelpdeskMaintenanceFrequency } from '../../../types/models';
import { EXECUTOR_LABELS, SERVICE_KIND_OPTIONS } from '../../../utils/maintenanceProgram';
import { notifyWarning } from '../../../utils/notify';

/**
 * Editor de una rutina. `mode = 'program'` edita la rutina real del activo
 * (fechas, anclaje, fin de recurrencia, proveedor); `mode = 'template'` edita
 * la rutina base de una plantilla (sin fechas ni proveedor).
 */
interface RoutineEditorModalProps {
  open: boolean;
  mode: 'program' | 'template';
  initial: RoutineDraft | null;
  frequencies: HelpdeskMaintenanceFrequency[];
  suppliers: HelpdeskCatalogItem[];
  employees: Employee[];
  criticalityCode?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: RoutineDraft) => void;
}

const WINDOW_CAP: Record<string, number> = { CRITICAL: 0, HIGH: 7, MEDIUM: 15, LOW: 30 };

const inputClass = 'mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] focus:border-[var(--color-brand-500)] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[var(--unilabor-ink)]';

/** Wrapper: monta el formulario solo cuando esta abierto y lo reinicia por rutina (key). */
export const RoutineEditorModal = (props: RoutineEditorModalProps) => {
  if (!props.open) return null;
  return <RoutineEditorForm key={props.initial?._key ?? 'new'} {...props} />;
};

const RoutineEditorForm = ({ mode, initial, frequencies, suppliers, employees, criticalityCode, saving = false, onClose, onSave }: RoutineEditorModalProps) => {
  const [draft, setDraft] = useState<RoutineDraft>(() => initial ?? newRoutineDraft());
  const [intervalMode, setIntervalMode] = useState<'CATALOG' | 'CUSTOM'>(() => (initial?.custom_interval_value && initial?.custom_interval_unit ? 'CUSTOM' : 'CATALOG'));
  const [newTask, setNewTask] = useState('');

  const patch = (partial: Partial<RoutineDraft>) => setDraft((current) => ({ ...current, ...partial }));
  const cap = criticalityCode ? WINDOW_CAP[criticalityCode.toUpperCase()] : undefined;
  const frequencyOptions = frequencies.filter((f) => f.code !== 'CUSTOM').map((f) => ({ value: String(f.id), label: `${f.name} (cada ${f.interval_months} ${f.interval_months === 1 ? 'mes' : 'meses'})` }));
  const supplierOptions = suppliers.map((s) => ({ value: String(s.id), label: s.name }));
  const employeeOptions = employees.filter((e) => e.is_active).map((e) => ({ value: String(e.id), label: e.full_name, hint: e.position ?? e.area ?? undefined }));

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    patch({ tasks: [...draft.tasks, { task_text: text, is_required: true }] });
    setNewTask('');
  };

  const submit = () => {
    if (!draft.title.trim()) return notifyWarning('Escribe el título de la rutina.');
    if (draft.schedule_mode !== 'CALENDAR') {
      if (intervalMode === 'CATALOG' && !draft.frequency_id) return notifyWarning('Selecciona la frecuencia.');
      if (intervalMode === 'CUSTOM' && (!draft.custom_interval_value || !draft.custom_interval_unit)) return notifyWarning('Indica el intervalo personalizado (valor y unidad).');
    }
    if (draft.executor_kind === 'EXTERNAL_PROVIDER' && mode === 'program' && !draft.supplier_id) return notifyWarning('Selecciona el proveedor del catálogo.');
    if (mode === 'program' && draft.next_due_on < draft.starts_on) return notifyWarning('La próxima ejecución no puede ser anterior al inicio.');
    if (draft.deviates_from_template && !draft.deviation_reason?.trim()) return notifyWarning('Justifica la desviación respecto a la plantilla.');
    onSave({
      ...draft,
      title: draft.title.trim(),
      frequency_id: intervalMode === 'CATALOG' ? draft.frequency_id : null,
      custom_interval_value: intervalMode === 'CUSTOM' ? draft.custom_interval_value : null,
      custom_interval_unit: intervalMode === 'CUSTOM' ? draft.custom_interval_unit : null,
      tasks: draft.tasks.filter((t) => t.task_text.trim()),
    });
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(11,34,53,0.5)] p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{mode === 'template' ? 'Rutina de plantilla' : 'Rutina del programa'}</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">{initial?.title || 'Nueva rutina'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Tipo de servicio
              <select value={draft.service_kind} onChange={(e) => patch({ service_kind: e.target.value as MaintenanceServiceKind })} className={inputClass}>
                {SERVICE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Título
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={inputClass} placeholder="Ej. Mantenimiento preventivo semestral" />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Descripción / referencia del manual
              <textarea value={draft.description ?? ''} onChange={(e) => patch({ description: e.target.value || null })} rows={2} className={inputClass} placeholder="Sección del manual del fabricante o del programa del proveedor" />
            </label>
          </div>

          <fieldset className="mt-4 rounded-2xl border border-[rgba(0,65,106,0.1)] p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Recurrencia</legend>
            {mode === 'program' ? (
              <div className="mb-2 inline-flex rounded-xl border border-[rgba(0,65,106,0.12)] p-0.5 text-xs font-semibold">
                {(['FREQUENCY', 'CALENDAR'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => patch({ schedule_mode: m })} className={`rounded-lg px-3 py-1.5 ${draft.schedule_mode === m ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--color-brand-700)]'}`}>
                    {m === 'FREQUENCY' ? 'Por frecuencia' : 'Cronograma provisto'}
                  </button>
                ))}
              </div>
            ) : null}
            {draft.schedule_mode === 'CALENDAR' ? (
              <p className="text-xs text-[var(--unilabor-neutral)]">Las fechas las carga Help Desk desde el cronograma del proveedor (página de Mantenimiento → Cargar cronograma). No se proyectan ocurrencias.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 inline-flex rounded-xl border border-[rgba(0,65,106,0.12)] p-0.5 text-xs font-semibold">
                  {(['CATALOG', 'CUSTOM'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setIntervalMode(m)} className={`rounded-lg px-3 py-1.5 ${intervalMode === m ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--color-brand-700)]'}`}>
                      {m === 'CATALOG' ? 'Mensual · Bimestral · Trimestral · Semestral · Anual' : 'Personalizada'}
                    </button>
                  ))}
                </div>
                {intervalMode === 'CATALOG' ? (
                  <label className={`${labelClass} sm:col-span-2`}>
                    Frecuencia
                    <div className="mt-1">
                      <SearchableSelect value={draft.frequency_id ? String(draft.frequency_id) : ''} options={frequencyOptions} onChange={(v) => patch({ frequency_id: v ? Number(v) : null })} placeholder="Frecuencia" emptyLabel="Selecciona" />
                    </div>
                  </label>
                ) : (
                  <>
                    <label className={labelClass}>
                      Cada
                      <input type="number" min={1} value={draft.custom_interval_value ?? ''} onChange={(e) => patch({ custom_interval_value: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Unidad
                      <select value={draft.custom_interval_unit ?? ''} onChange={(e) => patch({ custom_interval_unit: (e.target.value || null) as MaintenanceIntervalUnit | null })} className={inputClass}>
                        <option value="">Selecciona</option>
                        <option value="DAY">Días</option>
                        <option value="WEEK">Semanas</option>
                        <option value="MONTH">Meses</option>
                      </select>
                    </label>
                  </>
                )}
                {mode === 'program' ? (
                  <>
                    <label className={labelClass}>
                      Anclaje
                      <select value={draft.anchor_mode ?? 'FIXED'} onChange={(e) => patch({ anchor_mode: e.target.value as MaintenanceAnchorMode })} className={inputClass}>
                        <option value="FIXED">Fijo: desde la fecha programada</option>
                        <option value="FLOATING">Flotante: desde la fecha real de ejecución</option>
                      </select>
                    </label>
                    <label className={labelClass}>
                      Inicio del programa
                      <input type="date" value={draft.starts_on} onChange={(e) => patch({ starts_on: e.target.value, next_due_on: draft.next_due_on < e.target.value ? e.target.value : draft.next_due_on })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Primera / próxima ejecución
                      <input type="date" value={draft.next_due_on} onChange={(e) => patch({ next_due_on: e.target.value })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Termina el (opcional)
                      <input type="date" value={draft.recurrence_end_on ?? ''} onChange={(e) => patch({ recurrence_end_on: e.target.value || null })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Máximo de ocurrencias (opcional)
                      <input type="number" min={1} value={draft.recurrence_max_occurrences ?? ''} onChange={(e) => patch({ recurrence_max_occurrences: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
                    </label>
                  </>
                ) : null}
              </div>
            )}
          </fieldset>

          <fieldset className="mt-4 rounded-2xl border border-[rgba(0,65,106,0.1)] p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Ventana y ejecución</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Días antes (desde)
                <input type="number" min={0} value={draft.tolerance_before_days ?? 0} onChange={(e) => patch({ tolerance_before_days: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Días después (hasta){cap !== undefined ? <span className="ml-1 text-[10px] font-semibold text-[#b02a2a]">tope por criticidad: {cap}</span> : null}
                <input type="number" min={0} value={draft.tolerance_after_days ?? 0} onChange={(e) => patch({ tolerance_after_days: Number(e.target.value) })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Ejecutor
                <select value={draft.executor_kind} onChange={(e) => patch({ executor_kind: e.target.value as MaintenanceExecutorKind })} className={inputClass}>
                  {(Object.keys(EXECUTOR_LABELS) as MaintenanceExecutorKind[]).map((k) => (
                    <option key={k} value={k}>
                      {EXECUTOR_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {mode === 'program' && draft.executor_kind === 'EXTERNAL_PROVIDER' ? (
                <label className={labelClass}>
                  Proveedor (catálogo)
                  <div className="mt-1">
                    <SearchableSelect value={draft.supplier_id ? String(draft.supplier_id) : ''} options={supplierOptions} onChange={(v) => patch({ supplier_id: v ? Number(v) : null })} placeholder="Proveedor" emptyLabel="Selecciona proveedor" />
                  </div>
                </label>
              ) : null}
              {mode === 'program' ? (
                <label className={labelClass}>
                  Responsable de la rutina (opcional)
                  <div className="mt-1">
                    <SearchableSelect value={draft.responsible_employee_id ? String(draft.responsible_employee_id) : ''} options={employeeOptions} onChange={(v) => patch({ responsible_employee_id: v ? Number(v) : null })} placeholder="Colaborador" emptyLabel="Responsable del activo" />
                  </div>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--unilabor-ink)]">
                  <input type="checkbox" checked={draft.checklist_required ?? true} onChange={(e) => patch({ checklist_required: e.target.checked })} /> Checklist obligatorio
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--unilabor-ink)]">
                  <input type="checkbox" checked={draft.evidence_required ?? true} onChange={(e) => patch({ evidence_required: e.target.checked })} /> Evidencia obligatoria
                </label>
                {mode === 'program' ? (
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--unilabor-ink)]">
                    <input type="checkbox" checked={draft.deviates_from_template ?? false} onChange={(e) => patch({ deviates_from_template: e.target.checked })} /> Se aparta de la plantilla
                  </label>
                ) : null}
              </div>
              {mode === 'program' && draft.deviates_from_template ? (
                <label className={`${labelClass} sm:col-span-2`}>
                  Justificación de la desviación
                  <input value={draft.deviation_reason ?? ''} onChange={(e) => patch({ deviation_reason: e.target.value || null })} className={inputClass} placeholder="Ej. El fabricante indica servicio trimestral por uso intensivo" />
                </label>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="mt-4 rounded-2xl border border-[rgba(0,65,106,0.1)] p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Checklist ({draft.tasks.length})</legend>
            <ul className="space-y-1.5">
              {draft.tasks.map((task, index) => (
                <li key={`${task.id ?? 'n'}-${index}`} className="flex items-center gap-2 rounded-xl bg-[rgba(248,251,253,0.9)] px-2 py-1.5">
                  <GripVertical size={14} className="shrink-0 text-[var(--unilabor-neutral)]" />
                  <input
                    value={task.task_text}
                    onChange={(e) => patch({ tasks: draft.tasks.map((t, i) => (i === index ? { ...t, task_text: e.target.value } : t)) })}
                    className="h-8 flex-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 text-sm"
                  />
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--unilabor-neutral)]">
                    <input type="checkbox" checked={task.is_required ?? true} onChange={(e) => patch({ tasks: draft.tasks.map((t, i) => (i === index ? { ...t, is_required: e.target.checked } : t)) })} /> Oblig.
                  </label>
                  <button type="button" onClick={() => patch({ tasks: draft.tasks.filter((_, i) => i !== index) })} className="rounded-lg p-1 text-[#b02a2a] hover:bg-[rgba(190,40,40,0.1)]">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTask();
                  }
                }}
                placeholder="Nueva tarea del checklist (Enter para agregar)"
                className="h-9 flex-1 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 text-sm"
              />
              <button type="button" onClick={addTask} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]">
                <Plus size={14} /> Agregar
              </button>
            </div>
          </fieldset>
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[var(--color-brand-600)] disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar rutina
          </button>
        </div>
      </div>
    </div>
  );
};
