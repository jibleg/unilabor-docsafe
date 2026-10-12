import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { listAttendanceSettings, type AttendanceSetting } from '../../../api/service.api-attendance-settings';
import { SettingEditModal } from './SettingEditModal';
import { SettingsChangesPanel } from './SettingsChangesPanel';
import { formatSettingValue, GROUP_ORDER, groupLabel } from './settingsHelpers';
import { TabStatus } from './TabStatus';

export const RulesTab = () => {
  const [settings, setSettings] = useState<AttendanceSetting[] | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<AttendanceSetting | null>(null);
  const [changesKey, setChangesKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setSettings(await listAttendanceSettings());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listAttendanceSettings()
      .then((data) => { if (active) { setSettings(data); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const list = settings ?? [];
    const known = GROUP_ORDER.filter((group) => list.some((item) => item.group === group));
    const extra = [...new Set(list.map((item) => item.group))].filter((group) => !GROUP_ORDER.some((known) => known === group));
    return [...known, ...extra].map((group) => ({ group, items: list.filter((item) => item.group === group) }));
  }, [settings]);

  const labelFor = useCallback((key: string) => settings?.find((item) => item.key === key)?.label ?? key, [settings]);

  return (
    <div className="space-y-4">
      <TabStatus loading={!settings && !error} error={error && !settings} onRetry={() => void load()} label="Cargando reglas…" />
      {groups.map(({ group, items }) => (
        <section key={group} className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">{groupLabel(group)}</h2>
          <ul className="divide-y divide-[rgba(0,65,106,0.08)]">
            {items.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--unilabor-ink)]">
                    {item.label}
                    {item.is_modified ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Modificado</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[var(--color-brand-700)]">{formatSettingValue(item, item.value)}</p>
                  {item.is_modified ? <p className="text-[11px] text-slate-400">Por defecto: {formatSettingValue(item, item.default_value)}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  aria-label={`Editar ${item.label}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]"
                >
                  <Pencil size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {settings ? <SettingsChangesPanel reloadKey={changesKey} labelFor={labelFor} /> : null}
      {editing ? (
        <SettingEditModal
          setting={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setSettings(next);
            setChangesKey((key) => key + 1);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
};
