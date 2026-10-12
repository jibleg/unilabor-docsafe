import { useCallback, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { listSettingChanges, type SettingChange } from '../../../api/service.api-attendance-settings';
import { formatDateTime } from '../shared/format';
import { TabStatus } from './TabStatus';

interface SettingsChangesPanelProps {
  /** Cambia para forzar recarga cuando se guarda un parametro. */
  reloadKey: number;
  labelFor: (key: string) => string;
}

export const SettingsChangesPanel = ({ reloadKey, labelFor }: SettingsChangesPanelProps) => {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SettingChange[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (key: number) => {
    setLoading(true);
    setError(false);
    try {
      setChanges(await listSettingChanges(100));
      setLoadedKey(key);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && loadedKey !== reloadKey && !loading) void load(reloadKey);
  };

  // Si se guardo un cambio con el panel abierto, la lista queda obsoleta hasta reabrir o reintentar.
  const stale = open && loadedKey !== null && loadedKey !== reloadKey;

  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/80">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[var(--color-brand-700)]">
        <History size={16} aria-hidden /> Historial de cambios
        <ChevronDown size={16} className={`ml-auto transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-[rgba(0,65,106,0.08)] p-3">
          {stale ? (
            <button type="button" className="mb-2 text-xs font-semibold text-[var(--color-brand-700)] underline" onClick={() => void load(reloadKey)}>
              Hay cambios nuevos: actualizar
            </button>
          ) : null}
          <TabStatus loading={loading && !changes} error={error} onRetry={() => void load(reloadKey)} />
          {changes && changes.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">Aún no hay cambios registrados.</p> : null}
          {changes && changes.length > 0 ? (
            <ul className="max-h-96 divide-y divide-[rgba(0,65,106,0.08)] overflow-y-auto">
              {changes.map((change) => (
                <li key={change.id} className="py-2 text-sm">
                  <p className="font-semibold text-[var(--unilabor-ink)]">
                    {labelFor(change.setting_key)}: <span className="font-normal text-slate-500">{change.previous_value ?? '—'}</span> → {change.new_value}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(change.changed_at)} · {change.changed_by_name ?? 'Sistema'}
                    {change.change_reason ? ` · ${change.change_reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
