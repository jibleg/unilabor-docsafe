import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import { listScheduleLog, type ScheduleLogEntry, type SchedulePagination } from '../../../api/service.api-attendance-schedule';
import { Pagination } from '../../Pagination';
import { formatDateTime, pastDateBounds } from '../shared/format';
import { cardClass, inputClass, labelClass, secondaryButton } from './ui';

const ACTION_LABEL: Record<string, string> = {
  schedule: 'Programó',
  edit: 'Editó',
  remove: 'Quitó',
  end: 'Terminó',
  copy: 'Copió',
};
const ACTION_STYLE: Record<string, string> = {
  schedule: 'bg-emerald-50 text-emerald-700',
  edit: 'bg-sky-50 text-sky-700',
  remove: 'bg-red-50 text-red-700',
  end: 'bg-amber-50 text-amber-800',
  copy: 'bg-violet-50 text-violet-700',
};
const PAGE_SIZE = 20;

/** Bitacora de cambios del calendario con filtros y paginacion. */
export const ScheduleLogPanel = ({ refreshKey }: { refreshKey: number }) => {
  const bounds = pastDateBounds();
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ScheduleLogEntry[]>([]);
  const [pagination, setPagination] = useState<SchedulePagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listScheduleLog({ action, from, to, page, limit: PAGE_SIZE });
        if (!active) return;
        setEntries(res.data);
        setPagination(res.pagination);
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, 'No se pudo cargar la bitácora.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [action, from, to, page, reloadKey, refreshKey]);

  return (
    <div className="space-y-3">
      <div className={`${cardClass} flex flex-wrap items-end gap-3 p-3`}>
        <div>
          <label className={labelClass} htmlFor="log-action">Acción</label>
          <select id="log-action" className={inputClass} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="log-from">Desde</label>
          <input id="log-from" type="date" min={bounds.min} max={bounds.max} className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className={labelClass} htmlFor="log-to">Hasta</label>
          <input id="log-to" type="date" min={bounds.min} max={bounds.max} className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <button type="button" className={secondaryButton} aria-label="Actualizar bitácora" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className={`${cardClass} flex flex-col items-center gap-3 p-8 text-center`}>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" className={secondaryButton} onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button>
        </div>
      ) : loading && entries.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-[var(--unilabor-neutral)]`}>Cargando bitácora…</div>
      ) : entries.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-[var(--unilabor-neutral)]`}>No hay cambios registrados con esos filtros.</div>
      ) : (
        <div className={`${cardClass} divide-y divide-[rgba(0,65,106,0.06)]`}>
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ACTION_STYLE[entry.action] ?? 'bg-slate-100 text-slate-700'}`}>{ACTION_LABEL[entry.action] ?? entry.action}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--unilabor-ink)]">{entry.employee_name}{entry.shift_name ? ` · ${entry.shift_name}` : ''}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">{entry.description}</p>
              </div>
              <div className="text-right text-xs text-[var(--unilabor-neutral)]">
                <p>{formatDateTime(entry.changed_at)}</p>
                <p>{entry.changed_by_name ?? '—'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={PAGE_SIZE} onPageChange={setPage} loading={loading} />
    </div>
  );
};
