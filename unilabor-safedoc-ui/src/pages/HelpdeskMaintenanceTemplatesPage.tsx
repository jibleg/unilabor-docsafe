import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Pencil, Plus, Power, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  createMaintenanceTemplate,
  getApiErrorMessage,
  listHelpdeskCatalogs,
  listMaintenanceCatalogs,
  listMaintenanceTemplates,
  setMaintenanceTemplateActive,
  updateMaintenanceTemplate,
} from '../api/service';
import { RoutineEditorModal } from '../components/helpdesk/program/RoutineEditorModal';
import { Pagination } from '../components/Pagination';
import { SearchableSelect } from '../components/SearchableSelect';
import type { MaintenanceTemplate, MaintenanceTemplatePayload } from '../types/helpdesk-program';
import type { HelpdeskCatalogs, HelpdeskMaintenanceFrequency } from '../types/models';
import { confirmAction } from '../utils/confirm';
import { EXECUTOR_LABELS, KIND_LABELS, KIND_STYLES, describeDraftInterval, newRoutineDraft, type RoutineDraft } from '../utils/maintenanceProgram';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

const actionClass = 'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50';
const primaryClass = 'inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-[var(--color-brand-600)] disabled:opacity-60';
const headClass = 'px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]';
const rowActionClass = 'inline-flex items-center rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 p-1.5 transition hover:bg-[rgba(191,212,230,0.28)]';
const inputClass = 'mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] focus:border-[var(--color-brand-500)] focus:outline-none';

const PAGE_SIZE_OPTIONS = [20, 30, 50];

interface TemplateDraft {
  id: number | null;
  category_id: string;
  name: string;
  description: string;
  routines: RoutineDraft[];
}

const toDraft = (template: MaintenanceTemplate | null): TemplateDraft => ({
  id: template?.id ?? null,
  category_id: template?.category_id ? String(template.category_id) : '',
  name: template?.name ?? '',
  description: template?.description ?? '',
  routines: (template?.routines ?? []).map((r) =>
    newRoutineDraft({
      plan_id: r.id ?? null, // en plantillas plan_id transporta el id de la rutina de plantilla
      service_kind: r.service_kind,
      title: r.title,
      description: r.description,
      frequency_id: r.frequency_id,
      custom_interval_value: r.custom_interval_value,
      custom_interval_unit: r.custom_interval_unit,
      executor_kind: r.executor_kind,
      tolerance_before_days: r.window_before_days,
      tolerance_after_days: r.window_after_days,
      checklist_required: r.checklist_required,
      evidence_required: r.evidence_required,
      tasks: r.tasks.map((t) => ({ id: t.id ?? null, task_text: t.task_text, is_required: t.is_required })),
    }),
  ),
});

export const HelpdeskMaintenanceTemplatesPage = () => {
  const [templates, setTemplates] = useState<MaintenanceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [frequencies, setFrequencies] = useState<HelpdeskMaintenanceFrequency[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<RoutineDraft | null>(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await listMaintenanceTemplates(includeInactive));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las plantillas.'));
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    Promise.allSettled([listMaintenanceCatalogs(), listHelpdeskCatalogs()]).then(([freq, cat]) => {
      if (freq.status === 'fulfilled') setFrequencies(freq.value.frequencies);
      if (cat.status === 'fulfilled') setCatalogs(cat.value);
    });
  }, []);

  const categoryOptions = useMemo(() => (catalogs?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })), [catalogs]);
  // Orden estable por categoría y nombre; las plantillas sin categoría van al final.
  const sorted = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (!a.category_name !== !b.category_name) return a.category_name ? -1 : 1;
        return (a.category_name ?? '').localeCompare(b.category_name ?? '', 'es') || a.name.localeCompare(b.name, 'es') || a.id - b.id;
      }),
    [templates],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Se acota al vuelo: si la lista se acorta (p. ej. al desactivar sin "Ver inactivas") la página no queda fuera de rango.
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const saveTemplate = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return notifyWarning('Escribe el nombre de la plantilla.');
    if (draft.routines.length === 0) return notifyWarning('Agrega al menos una rutina.');
    const payload: MaintenanceTemplatePayload = {
      category_id: draft.category_id ? Number(draft.category_id) : null,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      routines: draft.routines.map((r) => ({
        id: r.plan_id ?? null,
        service_kind: r.service_kind,
        title: r.title,
        description: r.description ?? null,
        frequency_id: r.frequency_id ?? null,
        custom_interval_value: r.custom_interval_value ?? null,
        custom_interval_unit: r.custom_interval_unit ?? null,
        executor_kind: r.executor_kind,
        window_before_days: r.tolerance_before_days ?? 0,
        window_after_days: r.tolerance_after_days ?? 7,
        checklist_required: r.checklist_required ?? true,
        evidence_required: r.evidence_required ?? true,
        tasks: r.tasks.map((t) => ({ id: t.id ?? null, task_text: t.task_text, is_required: t.is_required ?? true })),
      })),
    };
    setSaving(true);
    try {
      if (draft.id) {
        await updateMaintenanceTemplate(draft.id, payload);
        notifySuccess('Plantilla actualizada.');
      } else {
        await createMaintenanceTemplate(payload);
        notifySuccess('Plantilla creada.');
      }
      setDraft(null);
      await load();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la plantilla.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (template: MaintenanceTemplate) => {
    const ok = await confirmAction(
      template.is_active ? `Desactivar "${template.name}"` : `Activar "${template.name}"`,
      template.is_active ? 'Dejará de proponerse al crear programas. Los programas ya creados no cambian.' : 'Volverá a proponerse al crear programas de su categoría.',
      template.is_active ? 'Desactivar' : 'Activar',
      template.is_active ? 'danger' : 'primary',
    );
    if (!ok) return;
    try {
      await setMaintenanceTemplateActive(template.id, !template.is_active);
      notifySuccess(template.is_active ? 'Plantilla desactivada.' : 'Plantilla activada.');
      await load();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cambiar el estado.'));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Help Desk · Configuración</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <BookOpen size={22} /> Plantillas de mantenimiento
          </h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Rutinas base por categoría de activo. Solo pre-llenan el programa: cada activo se personaliza con el plan del fabricante o del proveedor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--unilabor-neutral)]">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked);
                setPage(1);
              }}
            />
            Ver inactivas
          </label>
          <button type="button" className={actionClass} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Recargar
          </button>
          <button type="button" className={primaryClass} onClick={() => setDraft(toDraft(null))}>
            <Plus size={14} /> Nueva plantilla
          </button>
        </div>
      </div>

      {loading && templates.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 size={16} className="animate-spin" /> Cargando plantillas...
        </p>
      ) : sorted.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[rgba(0,65,106,0.2)] p-10 text-center">
          <p className="text-sm font-semibold text-[var(--color-brand-700)]">Aún no hay plantillas.</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">Crea una por categoría (equipo de laboratorio, refrigeración, cómputo...) con sus rutinas y checklist base.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className={headClass}>Plantilla</th>
                  <th className={headClass}>Categoría</th>
                  <th className={headClass}>Rutinas</th>
                  <th className={`${headClass} text-right`}>Activos</th>
                  <th className={`${headClass} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {pageRows.map((template) => (
                  <tr key={template.id} className={`align-top transition-colors hover:bg-[rgba(191,212,230,0.22)] ${template.is_active ? '' : 'opacity-70'}`}>
                    <td className="px-5 py-4">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                        {template.name}
                        {!template.is_active ? <span className="rounded-full border border-dashed border-[rgba(0,65,106,0.3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Inactiva</span> : null}
                      </p>
                      {template.description ? <p className="mt-0.5 text-xs text-[var(--unilabor-ink)]">{template.description}</p> : null}
                    </td>
                    <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">{template.category_name ?? <span className="text-[var(--unilabor-neutral)]">Sin categoría</span>}</td>
                    <td className="px-5 py-4">
                      {template.routines.length === 0 ? (
                        <span className="text-xs text-[var(--unilabor-neutral)]">Sin rutinas</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {template.routines.map((routine) => (
                            <li key={routine.id} className="flex items-center gap-2 text-xs">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLES[routine.service_kind].dot}`} title={KIND_LABELS[routine.service_kind]} />
                              <span>
                                <span className="font-semibold text-[var(--unilabor-ink)]">{routine.title}</span>
                                <span className="text-[var(--unilabor-neutral)]"> · {routine.interval_label} · {EXECUTOR_LABELS[routine.executor_kind]} · {routine.tasks.length} tareas</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-[var(--unilabor-ink)]" title={`${template.assets_using} activo(s) la usan`}>
                      {template.assets_using}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setDraft(toDraft(template))} className={`${rowActionClass} text-[var(--color-brand-700)]`} title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => void toggleActive(template)} className={`${rowActionClass} ${template.is_active ? 'text-[#b02a2a]' : 'text-[#1c7a4a]'}`} title={template.is_active ? 'Desactivar' : 'Activar'}>
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[rgba(0,65,106,0.08)]">
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={sorted.length}
              pageSize={pageSize}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </div>
      )}

      {draft ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[rgba(11,34,53,0.5)] p-3 backdrop-blur-[2px]">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-6 py-4">
              <h3 className="text-lg font-bold text-[var(--color-brand-700)]">{draft.id ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]" title="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--unilabor-ink)]">
                  Categoría de activo
                  <div className="mt-1">
                    <SearchableSelect value={draft.category_id} options={categoryOptions} onChange={(v) => setDraft({ ...draft, category_id: v })} placeholder="Categoría" emptyLabel="Cualquier categoría" />
                  </div>
                </label>
                <label className="block text-xs font-semibold text-[var(--unilabor-ink)]">
                  Nombre
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} placeholder="Ej. Equipo de laboratorio analítico" />
                </label>
                <label className="block text-xs font-semibold text-[var(--unilabor-ink)] sm:col-span-2">
                  Descripción
                  <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} placeholder="Alcance y criterio de la plantilla" />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <h4 className="text-sm font-bold text-[var(--color-brand-700)]">Rutinas base ({draft.routines.length})</h4>
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => {
                    setEditingRoutine(newRoutineDraft({ tolerance_after_days: 7 }));
                    setRoutineOpen(true);
                  }}
                >
                  <Plus size={14} /> Agregar rutina
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {draft.routines.map((routine) => (
                  <li key={routine._key} className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] px-3 py-2.5">
                    <span className={`h-8 w-1.5 shrink-0 rounded-full ${KIND_STYLES[routine.service_kind].dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--color-brand-700)]">
                        {routine.title} <span className="text-[10px] font-semibold text-[var(--unilabor-neutral)]">· {KIND_LABELS[routine.service_kind]}</span>
                      </p>
                      <p className="text-xs text-[var(--unilabor-neutral)]">
                        {describeDraftInterval(routine, frequencies)} · ventana −{routine.tolerance_before_days ?? 0}/+{routine.tolerance_after_days ?? 0} d · {EXECUTOR_LABELS[routine.executor_kind]} · {routine.tasks.length} tareas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoutine(routine);
                        setRoutineOpen(true);
                      }}
                      className="rounded-lg p-1.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
                      title="Editar rutina"
                    >
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setDraft({ ...draft, routines: draft.routines.filter((r) => r._key !== routine._key) })} className="rounded-lg p-1.5 text-[#b02a2a] hover:bg-[rgba(190,40,40,0.1)]" title="Quitar rutina">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
                {draft.routines.length === 0 ? <li className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.2)] p-4 text-center text-xs text-[var(--unilabor-neutral)]">Sin rutinas todavía.</li> : null}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-6 py-3">
              <button type="button" onClick={() => setDraft(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
                Cancelar
              </button>
              <button type="button" onClick={() => void saveTemplate()} disabled={saving} className={primaryClass}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar plantilla
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RoutineEditorModal
        open={routineOpen}
        mode="template"
        initial={editingRoutine}
        frequencies={frequencies}
        suppliers={catalogs?.suppliers ?? []}
        employees={[]}
        onClose={() => {
          setRoutineOpen(false);
          setEditingRoutine(null);
        }}
        onSave={(routine) => {
          if (!draft) return;
          setDraft({
            ...draft,
            routines: draft.routines.some((r) => r._key === routine._key) ? draft.routines.map((r) => (r._key === routine._key ? routine : r)) : [...draft.routines, routine],
          });
          setRoutineOpen(false);
          setEditingRoutine(null);
        }}
      />
    </div>
  );
};
