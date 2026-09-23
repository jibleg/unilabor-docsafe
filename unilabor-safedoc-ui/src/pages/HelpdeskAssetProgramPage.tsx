import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, FileText, History, Layers, Loader2, Pause, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  deactivateProgramRoutine,
  fetchAssetProgram,
  getApiErrorMessage,
  listEmployees,
  listHelpdeskCatalogs,
  listMaintenanceCatalogs,
  pauseProgramRoutine,
  resumeProgramRoutine,
  saveAssetProgramVersion,
  setProgramProjectionMonths,
  updateProgramRoutine,
} from '../api/service';
import { ProgramVersionModal } from '../components/helpdesk/program/ProgramVersionModal';
import { RoutineEditorModal } from '../components/helpdesk/program/RoutineEditorModal';
import type { AssetProgramOverview, ProgramPayload, ProgramRoutine } from '../types/helpdesk-program';
import type { Employee, HelpdeskCatalogs, HelpdeskMaintenanceFrequency } from '../types/models';
import { confirmAction } from '../utils/confirm';
import { CRITICALITY_STYLES, EXECUTOR_LABELS, KIND_LABELS, KIND_STYLES, SOURCE_LABELS, STATUS_LABELS, formatDateShort, formatDateTime, newRoutineDraft, stripDraftKey, todayIso, type RoutineDraft } from '../utils/maintenanceProgram';
import { useHasPermission } from '../utils/permissions';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const actionClass = 'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50';
const primaryClass = 'inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-[var(--color-brand-600)] disabled:opacity-60';

const Stat = ({ label, value, tone = 'text-[var(--color-brand-700)]' }: { label: string; value: string | number; tone?: string }) => (
  <div className="rounded-xl bg-[rgba(248,251,253,0.9)] px-3 py-2">
    <p className={`text-lg font-bold leading-none ${tone}`}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
  </div>
);

const toDraft = (r: ProgramRoutine): RoutineDraft =>
  newRoutineDraft({
    plan_id: r.id,
    template_routine_id: r.template_routine_id,
    service_kind: r.service_kind,
    title: r.title,
    description: r.description,
    schedule_mode: r.schedule_mode,
    frequency_id: r.frequency_id,
    custom_interval_value: r.custom_interval_value,
    custom_interval_unit: r.custom_interval_unit,
    anchor_mode: r.anchor_mode,
    starts_on: r.starts_on,
    next_due_on: r.next_order?.scheduled_for ?? r.next_due_on,
    tolerance_before_days: r.tolerance_before_days,
    tolerance_after_days: r.tolerance_after_days,
    recurrence_end_on: r.recurrence_end_on,
    recurrence_max_occurrences: r.recurrence_max_occurrences,
    executor_kind: r.executor_kind,
    supplier_id: r.supplier_id,
    responsible_employee_id: r.responsible_employee_id,
    quality_document_id: r.quality_document_id,
    checklist_required: r.checklist_required,
    evidence_required: r.evidence_required,
    deviates_from_template: r.deviates_from_template,
    deviation_reason: r.deviation_reason,
    tasks: r.tasks.map((t) => ({ id: t.id, task_text: t.task_text, is_required: t.is_required })),
  });

export const HelpdeskAssetProgramPage = () => {
  const { id } = useParams();
  const assetId = Number(id);
  const navigate = useNavigate();
  const canWrite = useHasPermission('HELPDESK.MAINTENANCE.WRITE');
  const [overview, setOverview] = useState<AssetProgramOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequencies, setFrequencies] = useState<HelpdeskMaintenanceFrequency[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showVersion, setShowVersion] = useState(false);
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [pausing, setPausing] = useState<ProgramRoutine | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [resuming, setResuming] = useState<ProgramRoutine | null>(null);
  const [resumeDate, setResumeDate] = useState(todayIso());

  const load = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      setOverview(await fetchAssetProgram(assetId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el programa del activo.'));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
    Promise.allSettled([listMaintenanceCatalogs(), listHelpdeskCatalogs(), listEmployees()]).then(([freq, cat, emp]) => {
      if (freq.status === 'fulfilled') setFrequencies(freq.value.frequencies);
      if (cat.status === 'fulfilled') setCatalogs(cat.value);
      if (emp.status === 'fulfilled') setEmployees(emp.value);
    });
  }, [load]);

  const run = async (action: () => Promise<{ message?: string } | void>, fallback: string) => {
    setSaving(true);
    try {
      const result = await action();
      notifySuccess((result && 'message' in result && result.message) || fallback);
      await load();
      return true;
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo completar la operación.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const overdueTotal = useMemo(() => overview?.routines.reduce((sum, r) => sum + r.overdue_count, 0) ?? 0, [overview]);

  if (loading && !overview) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={16} className="animate-spin" /> Cargando programa...
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="space-y-3">
        <button onClick={() => navigate('/helpdesk/assets')} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
          <ArrowLeft size={16} /> Volver a activos
        </button>
        <p className="text-sm text-[var(--unilabor-neutral)]">Activo no encontrado.</p>
      </div>
    );
  }
  const { asset, program, routines, versions } = overview;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate(`/helpdesk/assets/${assetId}/expedient`)} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
          <ArrowLeft size={16} /> Volver al expediente
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionClass} onClick={() => navigate(`/helpdesk/maintenance-program?asset_id=${assetId}&view=agenda`)}>
            <CalendarDays size={14} /> Ver en calendario
          </button>
          {canWrite ? (
            <button type="button" className={primaryClass} onClick={() => setShowVersion(true)}>
              <Layers size={14} /> {program ? 'Nueva versión del programa' : 'Crear programa'}
            </button>
          ) : null}
        </div>
      </div>

      <section className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Programa de mantenimiento · ISO 15189:2022 6.4.5</p>
            <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">{asset.asset_code}</h1>
            <p className="text-sm text-[var(--unilabor-ink)]">{asset.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
              {[asset.category_name, asset.brand_name, asset.model, asset.serial_number ? `S/N ${asset.serial_number}` : null].filter(Boolean).join(' · ')}
              {asset.criticality_code ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CRITICALITY_STYLES[asset.criticality_code] ?? ''}`}>{asset.criticality_name}</span> : <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-[10px] font-bold text-[var(--unilabor-neutral)]">Sin criticidad</span>}
              {asset.operational_status_name ? <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-700)]">{asset.operational_status_name}</span> : null}
            </p>
            <p className="text-xs text-[var(--unilabor-neutral)]">
              {asset.unit_name ?? '—'} / {asset.area_name ?? '—'} · Responsable: {asset.responsible_employee_name ?? '—'} · Operador: {asset.assigned_employee_name ?? '—'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Rutinas activas" value={routines.length} />
            <Stat label="Vencidas" value={overdueTotal} tone={overdueTotal > 0 ? 'text-[#b02a2a]' : 'text-[#1c7a4a]'} />
            <Stat label="Ejecutadas" value={routines.reduce((s, r) => s + r.closed_count, 0)} tone="text-[#1c7a4a]" />
            <Stat label="Proyectadas" value={routines.reduce((s, r) => s + r.projected_count, 0)} tone="text-[var(--unilabor-neutral)]" />
          </div>
        </div>

        {program ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] p-3 md:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Versión vigente</p>
              <p className="text-sm font-bold text-[var(--color-brand-700)]">v{program.version} · desde {formatDateShort(program.effective_from)}</p>
              {program.template_name ? <p className="text-[11px] text-[var(--unilabor-neutral)]">Plantilla: {program.template_name}</p> : null}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Fuente</p>
              <p className="text-sm text-[var(--unilabor-ink)]">{SOURCE_LABELS[program.source_kind]}</p>
              <p className="text-[11px] text-[var(--unilabor-neutral)]">{program.source_reference ?? program.source_asset_document_title ?? program.source_notes ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Horizonte de proyección</p>
              {canWrite ? (
                <select
                  value={program.projection_months}
                  disabled={saving}
                  onChange={(e) => void run(() => setProgramProjectionMonths(program.id, Number(e.target.value)), 'Horizonte actualizado.')}
                  className="mt-1 h-8 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 text-sm"
                >
                  {[3, 6, 12, 18, 24, 36].map((m) => (
                    <option key={m} value={m}>
                      {m} meses
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-[var(--unilabor-ink)]">{program.projection_months} meses</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Cumplimiento de plantilla</p>
              {program.deviates_from_template ? (
                <p className="text-sm font-semibold text-[#4c1d95]">Se aparta de la plantilla</p>
              ) : (
                <p className="inline-flex items-center gap-1 text-sm text-[#1c7a4a]">
                  <CheckCircle2 size={14} /> Sigue la regla general
                </p>
              )}
              {program.deviation_reason ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{program.deviation_reason}</p> : null}
              <button type="button" onClick={() => setShowVersions((v) => !v)} className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline">
                <History size={12} /> {versions.length} versión(es)
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[rgba(0,65,106,0.2)] p-8 text-center">
            <ClipboardList size={28} className="mx-auto text-[var(--unilabor-neutral)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--color-brand-700)]">Este activo no tiene programa de mantenimiento.</p>
            <p className="text-xs text-[var(--unilabor-neutral)]">Créalo desde una plantilla de su categoría y ajústalo al plan del fabricante o del proveedor.</p>
            {canWrite ? (
              <button type="button" className={`${primaryClass} mt-3`} onClick={() => setShowVersion(true)}>
                <Plus size={14} /> Crear programa
              </button>
            ) : null}
          </div>
        )}

        {showVersions && versions.length > 0 ? (
          <ul className="mt-3 divide-y divide-[rgba(0,65,106,0.06)] rounded-2xl border border-[rgba(0,65,106,0.08)]">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="font-bold text-[var(--color-brand-700)]">
                  v{v.version} · {v.status === 'ACTIVE' ? 'Vigente' : 'Histórica'} · {formatDateShort(v.effective_from)}
                  {v.effective_to ? ` → ${formatDateShort(v.effective_to)}` : ''}
                </span>
                <span className="text-[var(--unilabor-neutral)]">
                  {SOURCE_LABELS[v.source_kind]}
                  {v.change_reason ? ` · ${v.change_reason}` : ''}
                  {v.created_by_name ? ` · ${v.created_by_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {routines.length > 0 ? (
        <section className="space-y-3">
          {routines.map((routine) => {
            const style = KIND_STYLES[routine.service_kind];
            const isOpen = expanded === routine.id;
            return (
              <article key={routine.id} className={`rounded-3xl border bg-white shadow-sm ${routine.paused_at ? 'border-[rgba(180,120,20,0.35)]' : 'border-[rgba(0,65,106,0.1)]'}`}>
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <span className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--color-brand-700)]">{routine.title}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.chip}`}>{KIND_LABELS[routine.service_kind]}</span>
                      <span className="text-[11px] font-semibold text-[var(--unilabor-neutral)]">{routine.plan_code}</span>
                      {routine.paused_at ? <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(245,196,110,0.3)] px-2 py-0.5 text-[10px] font-bold text-[#8a5a12]"><Pause size={10} /> Pausada: {routine.pause_reason}</span> : null}
                      {routine.deviates_from_template ? <span className="rounded-full bg-[rgba(124,58,237,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#4c1d95]" title={routine.deviation_reason ?? ''}>Se aparta de la plantilla</span> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">
                      <strong className="text-[var(--unilabor-ink)]">{routine.interval_label}</strong> · anclaje {routine.anchor_mode === 'FLOATING' ? 'flotante' : 'fijo'} · ventana −{routine.tolerance_before_days}/+{routine.tolerance_after_days} d · {EXECUTOR_LABELS[routine.executor_kind]}
                      {routine.supplier_name ? ` · ${routine.supplier_name}` : ''}
                      {routine.requires_responsible_signature ? ' · firma del responsable obligatoria' : ''}
                      {routine.recurrence_end_on ? ` · termina ${formatDateShort(routine.recurrence_end_on)}` : ''}
                    </p>
                    {routine.description ? <p className="mt-1 text-xs text-[var(--unilabor-ink)]">{routine.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {routine.next_order ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${routine.next_order.window_ends_on && routine.next_order.window_ends_on < todayIso() ? 'bg-[rgba(190,40,40,0.12)] text-[#b02a2a]' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)]'}`}>
                          Próxima: {formatDateShort(routine.next_order.scheduled_for)} · {STATUS_LABELS[routine.next_order.status] ?? routine.next_order.status}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2.5 py-1 font-semibold text-[var(--unilabor-neutral)]">Sin órdenes pendientes</span>
                      )}
                      <span className="text-[var(--unilabor-neutral)]">
                        {routine.closed_count} ejecutadas · {routine.projected_count} proyectadas{routine.overdue_count ? ` · ${routine.overdue_count} vencidas` : ''} · {routine.tasks.length} tareas
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={actionClass} onClick={() => setExpanded(isOpen ? null : routine.id)}>
                      <FileText size={13} /> {isOpen ? 'Ocultar' : 'Detalle'}
                    </button>
                    {canWrite ? (
                      <>
                        <button type="button" className={actionClass} disabled={saving} onClick={() => setEditing(toDraft(routine))}>
                          <Pencil size={13} /> Editar
                        </button>
                        {routine.paused_at ? (
                          <button
                            type="button"
                            className={actionClass}
                            disabled={saving}
                            onClick={() => {
                              setResuming(routine);
                              setResumeDate(todayIso());
                            }}
                          >
                            <Play size={13} /> Reanudar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={actionClass}
                            disabled={saving}
                            onClick={() => {
                              setPausing(routine);
                              setPauseReason('');
                            }}
                          >
                            <Pause size={13} /> Pausar
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${actionClass} text-[#b02a2a]`}
                          disabled={saving}
                          onClick={() =>
                            void confirmAction(
                              `Retirar la rutina "${routine.title}"`,
                              'Se desactiva la rutina y se retiran sus órdenes proyectadas no iniciadas. Las órdenes ejecutadas se conservan como evidencia.',
                              'Retirar',
                              'danger',
                            ).then((ok) => ok && run(() => deactivateProgramRoutine(routine.id), 'Rutina retirada.'))
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {isOpen ? (
                  <div className="grid gap-4 border-t border-[rgba(0,65,106,0.08)] px-4 py-3 md:grid-cols-3">
                    <div>
                      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Checklist ({routine.tasks.length})</h4>
                      <ul className="space-y-0.5 text-xs text-[var(--unilabor-ink)]">
                        {routine.tasks.map((task) => (
                          <li key={task.id} className="flex items-start gap-1.5">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-300)]" /> {task.task_text}
                            {!task.is_required ? <span className="text-[10px] text-[var(--unilabor-neutral)]">(opcional)</span> : null}
                          </li>
                        ))}
                        {routine.tasks.length === 0 ? <li className="text-[var(--unilabor-neutral)]">Sin tareas.</li> : null}
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                        <Sparkles size={11} /> Próximas ({routine.upcoming.length})
                      </h4>
                      <ul className="space-y-0.5 text-xs">
                        {routine.upcoming.map((o) => (
                          <li key={o.id} className="flex items-center justify-between gap-2">
                            <button type="button" onClick={() => navigate(`/helpdesk/maintenance-program?asset_id=${assetId}&view=agenda&date=${o.scheduled_for}`)} className="text-[var(--color-brand-700)] hover:underline">
                              {formatDateShort(o.scheduled_for)} · {o.order_code}
                            </button>
                            <span className={`text-[10px] font-semibold ${o.window_ends_on && o.window_ends_on < todayIso() && o.status !== 'CLOSED' ? 'text-[#b02a2a]' : 'text-[var(--unilabor-neutral)]'}`}>
                              {o.is_projected ? 'proyectada' : STATUS_LABELS[o.status] ?? o.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Historial ({routine.closed_count})</h4>
                      <ul className="space-y-0.5 text-xs">
                        {routine.history.map((o) => (
                          <li key={o.id} className="flex items-center justify-between gap-2 text-[var(--unilabor-ink)]">
                            <span>
                              {formatDateShort(o.scheduled_for)} · {o.order_code}
                            </span>
                            <span className="text-[10px] font-semibold text-[#1c7a4a]">{o.result ?? 'Cerrada'} · {formatDateTime(o.completed_at)}</span>
                          </li>
                        ))}
                        {routine.history.length === 0 ? <li className="text-[var(--unilabor-neutral)]">Sin ejecuciones todavía.</li> : null}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <ProgramVersionModal
        open={showVersion}
        overview={overview}
        frequencies={frequencies}
        suppliers={catalogs?.suppliers ?? []}
        employees={employees}
        saving={saving}
        onClose={() => setShowVersion(false)}
        onSubmit={(payload: ProgramPayload) =>
          void run(async () => {
            const result = await saveAssetProgramVersion(assetId, payload);
            setShowVersion(false);
            return result;
          }, 'Programa guardado.')
        }
      />

      <RoutineEditorModal
        open={Boolean(editing)}
        mode="program"
        initial={editing}
        frequencies={frequencies}
        suppliers={catalogs?.suppliers ?? []}
        employees={employees}
        criticalityCode={asset.criticality_code}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (!draft.plan_id) return;
          const planId = draft.plan_id;
          const payload = stripDraftKey(draft);
          void run(async () => {
            const result = await updateProgramRoutine(planId, payload);
            setEditing(null);
            return result;
          }, 'Rutina actualizada.');
        }}
      />

      {pausing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.45)] p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">Pausar "{pausing.title}"</h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">Se retiran las órdenes proyectadas no iniciadas. Las ya iniciadas o con recordatorio enviado se conservan.</p>
            <textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} rows={3} placeholder="Motivo (ej. equipo en préstamo, fuera de servicio, baja temporal)" className="mt-3 w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPausing(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)]">
                Cancelar
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={saving}
                onClick={() => {
                  if (pauseReason.trim().length < 3) return notifyWarning('Indica el motivo de la pausa.');
                  void run(async () => {
                    const result = await pauseProgramRoutine(pausing.id, pauseReason.trim());
                    setPausing(null);
                    return result;
                  }, 'Rutina pausada.');
                }}
              >
                <Pause size={14} /> Pausar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resuming ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.45)] p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">Reanudar "{resuming.title}"</h3>
            <label className="mt-3 block text-xs font-semibold text-[var(--unilabor-ink)]">
              Próxima ejecución
              <input type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[rgba(0,65,106,0.14)] px-3 text-sm" />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setResuming(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)]">
                Cancelar
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={saving}
                onClick={() =>
                  void run(async () => {
                    const result = await resumeProgramRoutine(resuming.id, resumeDate || null);
                    setResuming(null);
                    return result;
                  }, 'Rutina reanudada.')
                }
              >
                <Play size={14} /> Reanudar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
