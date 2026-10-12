import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus } from 'lucide-react';
import { listAttendanceIncidentTypes, type AttendanceIncidentType } from '../../../api/service.api-attendance-settings';
import { primaryButtonClass } from '../devices/ModalShell';
import { FLAG_FIELDS } from './incidentFlags';
import { IncidentTypeModal } from './IncidentTypeModal';
import { TabStatus } from './TabStatus';

export const IncidentTypesTab = () => {
  const [types, setTypes] = useState<AttendanceIncidentType[] | null>(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<{ type: AttendanceIncidentType | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setTypes(await listAttendanceIncidentTypes(true));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listAttendanceIncidentTypes(true)
      .then((data) => { if (active) { setTypes(data); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  const nextSortOrder = (types ?? []).reduce((max, item) => Math.max(max, item.sort_order), 0) + 10;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Define qué ausencias o permisos se pueden registrar y cómo afectan el día.</p>
        <button type="button" className={primaryButtonClass} onClick={() => setModal({ type: null })}>
          <Plus size={16} /> Nuevo tipo
        </button>
      </div>
      <TabStatus loading={!types && !error} error={error && !types} onRetry={() => void load()} label="Cargando tipos…" />
      {types && types.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No hay tipos de incidencia.</p> : null}
      {types && types.length > 0 ? (
        <ul className="divide-y divide-[rgba(0,65,106,0.08)] rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90">
          {types.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${item.is_active ? 'text-[var(--unilabor-ink)]' : 'text-slate-400'}`}>
                  {item.name}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">{item.code}</code>
                  {item.is_system ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"><Lock size={11} aria-hidden /> Sistema</span>
                  ) : null}
                  {!item.is_active ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Inactivo</span> : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {FLAG_FIELDS.filter((field) => item[field.key]).map((field) => (
                    <span key={field.key} className="rounded-full bg-[rgba(191,212,230,0.35)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-700)]">{field.badge}</span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Editar ${item.name}`}
                onClick={() => setModal({ type: item })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]"
              >
                <Pencil size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {modal ? (
        <IncidentTypeModal
          type={modal.type}
          nextSortOrder={nextSortOrder}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
};
