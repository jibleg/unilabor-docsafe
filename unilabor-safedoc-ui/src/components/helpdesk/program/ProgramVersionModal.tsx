import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Pencil, Plus, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { getApiErrorMessage, listAssetDocuments, listMaintenanceTemplates, proposeRoutinesFromTemplate } from '../../../api/service';
import { SearchableSelect } from '../../SearchableSelect';
import type { AssetProgramOverview, MaintenanceProgramSourceKind, MaintenanceTemplate, ProgramPayload } from '../../../types/helpdesk-program';
import type { Employee, HelpdeskAssetDocument, HelpdeskCatalogItem, HelpdeskMaintenanceFrequency } from '../../../types/models';
import { EXECUTOR_LABELS, KIND_LABELS, SOURCE_LABELS, describeDraftInterval, newRoutineDraft, stripDraftKey, todayIso, type RoutineDraft } from '../../../utils/maintenanceProgram';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { RoutineEditorModal } from './RoutineEditorModal';

interface ProgramVersionModalProps {
  open: boolean;
  overview: AssetProgramOverview;
  frequencies: HelpdeskMaintenanceFrequency[];
  suppliers: HelpdeskCatalogItem[];
  employees: Employee[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: ProgramPayload) => void;
}

const inputClass = 'mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] focus:border-[var(--color-brand-500)] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[var(--unilabor-ink)]';

export const ProgramVersionModal = ({ open, overview, frequencies, suppliers, employees, saving, onClose, onSubmit }: ProgramVersionModalProps) => {
  const isNewVersion = Boolean(overview.program);
  const [templates, setTemplates] = useState<MaintenanceTemplate[]>([]);
  const [assetDocs, setAssetDocs] = useState<HelpdeskAssetDocument[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [sourceKind, setSourceKind] = useState<MaintenanceProgramSourceKind>(overview.program?.source_kind ?? 'MANUFACTURER_MANUAL');
  const [sourceReference, setSourceReference] = useState(overview.program?.source_reference ?? '');
  const [sourceNotes, setSourceNotes] = useState('');
  const [sourceAssetDocId, setSourceAssetDocId] = useState(overview.program?.source_asset_document_id ? String(overview.program.source_asset_document_id) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [changeReason, setChangeReason] = useState('');
  const [projectionMonths, setProjectionMonths] = useState(overview.program?.projection_months ?? 12);
  const [routines, setRoutines] = useState<RoutineDraft[]>([]);
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    if (!open) return;
    listMaintenanceTemplates().then(setTemplates).catch(() => setTemplates([]));
    listAssetDocuments(overview.asset.id).then(setAssetDocs).catch(() => setAssetDocs([]));
    // Nueva version: arranca con las rutinas vigentes (plan_id) para conservarlas o ajustarlas.
    setRoutines(
      overview.routines.map((r) =>
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
        }),
      ),
    );
    setTemplateId(overview.program?.template_id ? String(overview.program.template_id) : '');
    setChangeReason('');
    setEffectiveFrom(todayIso());
  }, [open, overview]);

  const templateOptions = useMemo(() => {
    const own = templates.filter((t) => !overview.asset.category_id || t.category_id === overview.asset.category_id || t.category_id === null);
    const rest = templates.filter((t) => !own.includes(t));
    return [...own, ...rest].map((t) => ({ value: String(t.id), label: t.name, hint: t.category_name ? `${t.category_name} · ${t.routines.length} rutinas` : `${t.routines.length} rutinas` }));
  }, [templates, overview.asset.category_id]);
  const docOptions = useMemo(() => assetDocs.map((d) => ({ value: String(d.id), label: d.title, hint: d.document_kind_name ?? undefined })), [assetDocs]);

  if (!open) return null;

  const applyTemplate = async () => {
    if (!templateId) return notifyWarning('Selecciona una plantilla.');
    setProposing(true);
    try {
      const proposal = await proposeRoutinesFromTemplate(Number(templateId), effectiveFrom);
      setRoutines((current) => [...current, ...proposal.map((r) => newRoutineDraft(r))]);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la propuesta de la plantilla.'));
    } finally {
      setProposing(false);
    }
  };

  const saveRoutine = (draft: RoutineDraft) => {
    setRoutines((current) => (current.some((r) => r._key === draft._key) ? current.map((r) => (r._key === draft._key ? draft : r)) : [...current, draft]));
    setEditorOpen(false);
    setEditing(null);
  };

  const submit = () => {
    if (routines.length === 0) return notifyWarning('Agrega al menos una rutina (desde una plantilla o manualmente).');
    if (isNewVersion && changeReason.trim().length < 5) return notifyWarning('Indica el motivo del cambio para la nueva versión.');
    const deviates = routines.some((r) => r.deviates_from_template);
    onSubmit({
      template_id: templateId ? Number(templateId) : null,
      source_kind: sourceKind,
      source_reference: sourceReference.trim() || null,
      source_notes: sourceNotes.trim() || null,
      source_asset_document_id: sourceAssetDocId ? Number(sourceAssetDocId) : null,
      effective_from: effectiveFrom,
      change_reason: changeReason.trim() || null,
      deviates_from_template: deviates,
      deviation_reason: deviates ? routines.filter((r) => r.deviates_from_template).map((r) => `${r.title}: ${r.deviation_reason ?? ''}`).join(' | ') : null,
      projection_months: projectionMonths,
      routines: routines.map(stripDraftKey),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.5)] p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{isNewVersion ? `Nueva versión (v${(overview.program?.version ?? 0) + 1})` : 'Crear programa de mantenimiento'}</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">
              {overview.asset.asset_code} <span className="font-medium text-[var(--unilabor-ink)]">{overview.asset.name}</span>
            </h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">La plantilla solo pre-llena: ajusta cada rutina al plan del fabricante o del proveedor del servicio.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <section className="grid gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] p-3 sm:grid-cols-2">
            <label className={labelClass}>
              Fuente del programa
              <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as MaintenanceProgramSourceKind)} className={inputClass}>
                {(Object.keys(SOURCE_LABELS) as MaintenanceProgramSourceKind[]).map((k) => (
                  <option key={k} value={k}>
                    {SOURCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Referencia (manual, contrato, sección)
              <input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} className={inputClass} placeholder="Ej. Manual de servicio ABC-200 rev. 3, cap. 7" />
            </label>
            <label className={labelClass}>
              Documento del expediente (opcional)
              <div className="mt-1">
                <SearchableSelect value={sourceAssetDocId} options={docOptions} onChange={setSourceAssetDocId} placeholder="Documento" emptyLabel="Sin documento ligado" />
              </div>
            </label>
            <label className={labelClass}>
              Vigente desde
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputClass} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Notas de la fuente
              <input value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} className={inputClass} placeholder="Observaciones sobre el plan del fabricante o del proveedor" />
            </label>
            {isNewVersion ? (
              <label className={`${labelClass} sm:col-span-2`}>
                Motivo del cambio (obligatorio)
                <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={inputClass} placeholder="Ej. Cambio de proveedor; el fabricante actualizó la periodicidad" />
              </label>
            ) : null}
            <label className={labelClass}>
              Horizonte de proyección
              <select value={projectionMonths} onChange={(e) => setProjectionMonths(Number(e.target.value))} className={inputClass}>
                {[3, 6, 12, 18, 24, 36].map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="mt-4 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${labelClass} min-w-[260px] flex-1`}>
                <span className="inline-flex items-center gap-1">
                  <BookOpen size={13} /> Plantilla por categoría
                </span>
                <div className="mt-1">
                  <SearchableSelect value={templateId} options={templateOptions} onChange={setTemplateId} placeholder="Plantilla" emptyLabel="Sin plantilla" />
                </div>
              </label>
              <button type="button" onClick={() => void applyTemplate()} disabled={proposing} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50">
                {proposing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Cargar propuesta
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(newRoutineDraft({ starts_on: effectiveFrom, next_due_on: effectiveFrom }));
                  setEditorOpen(true);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-brand-600)]"
              >
                <Plus size={14} /> Rutina manual
              </button>
            </div>
          </section>

          <section className="mt-4">
            <h4 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">Rutinas del programa ({routines.length})</h4>
            {routines.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.2)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">Carga una plantilla o agrega rutinas manualmente.</p>
            ) : (
              <ul className="space-y-2">
                {routines.map((routine) => (
                  <li key={routine._key} className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[var(--color-brand-700)]">{routine.title || 'Sin título'}</span>
                        <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-700)]">{KIND_LABELS[routine.service_kind]}</span>
                        {routine.plan_id ? <span className="rounded-full bg-[rgba(34,139,84,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#1c7a4a]">Vigente · se conserva</span> : <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(245,196,110,0.3)] px-2 py-0.5 text-[10px] font-bold text-[#8a5a12]"><Sparkles size={10} /> Nueva</span>}
                        {routine.deviates_from_template ? <span className="rounded-full bg-[rgba(124,58,237,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#4c1d95]">Se aparta de la plantilla</span> : null}
                      </div>
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {describeDraftInterval(routine, frequencies)} · {routine.anchor_mode === 'FLOATING' ? 'flotante' : 'fijo'} · desde {routine.next_due_on} · ventana −{routine.tolerance_before_days ?? 0}/+{routine.tolerance_after_days ?? 0} d · {EXECUTOR_LABELS[routine.executor_kind]}
                        {routine.executor_kind === 'EXTERNAL_PROVIDER' ? ` · ${suppliers.find((s) => s.id === routine.supplier_id)?.name ?? 'sin proveedor'}` : ''} · {routine.tasks.length} tareas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(routine);
                        setEditorOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
                      title="Editar rutina"
                    >
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setRoutines((current) => current.filter((r) => r._key !== routine._key))} className="rounded-lg p-1.5 text-[#b02a2a] hover:bg-[rgba(190,40,40,0.1)]" title={routine.plan_id ? 'Retirar del programa (se conserva su historial)' : 'Quitar'}>
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,65,106,0.08)] px-6 py-3">
          <p className="text-[11px] text-[var(--unilabor-neutral)]">
            {isNewVersion ? 'La versión vigente pasa a histórico; las órdenes ejecutadas conservan su versión.' : 'Al activar, se genera la primera orden de cada rutina y la proyección al horizonte elegido.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
              Cancelar
            </button>
            <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[var(--color-brand-600)] disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {isNewVersion ? 'Activar nueva versión' : 'Activar programa'}
            </button>
          </div>
        </div>
      </div>

      <RoutineEditorModal
        open={editorOpen}
        mode="program"
        initial={editing}
        frequencies={frequencies}
        suppliers={suppliers}
        employees={employees}
        criticalityCode={overview.asset.criticality_code}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={saveRoutine}
      />
    </div>
  );
};
