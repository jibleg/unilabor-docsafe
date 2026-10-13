import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import {
  getDevicesOverview,
  syncAgent,
  type BranchAgentOverview,
  type SyncResult,
} from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError } from '../../../utils/notify';
import { modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from './ui';

interface Props {
  onClose: () => void;
  onSynced: () => void;
}

/** Encola la sincronizacion con los relojes por sucursal (necesita el agente de la sucursal). */
export const SyncDevicesModal = ({ onClose, onSynced }: Props) => {
  const [branches, setBranches] = useState<BranchAgentOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, SyncResult>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBranches(await getDevicesOverview());
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo consultar los relojes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async (branch: BranchAgentOverview) => {
    if (!branch.agent) return;
    setBusyId(branch.branch_id);
    try {
      const result = await syncAgent(branch.agent.id);
      setResults((current) => ({ ...current, [branch.branch_id]: result }));
      onSynced();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo encolar la sincronización.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Sincronizar con relojes">
      <div className={`${modalPanelClass} max-w-2xl`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Sincronizar con relojes</h2>
          <p className="text-xs text-[var(--unilabor-neutral)]">
            Se envían a cada reloj los colaboradores por sincronizar o con error; el agente de la sucursal los aplica en unos minutos.
          </p>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Consultando sucursales…</p>
          ) : error ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-red-800"><AlertTriangle size={16} /> {error}</p>
              <button type="button" className={secondaryButtonClass} onClick={() => void load()}>Reintentar</button>
            </div>
          ) : branches.length === 0 ? (
            <p className="text-sm text-[var(--unilabor-neutral)]">No hay sucursales activas.</p>
          ) : (
            branches.map((branch) => {
              const result = results[branch.branch_id];
              return (
                <div key={branch.branch_id} className="rounded-xl border border-[rgba(0,65,106,0.1)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{branch.branch_name}</p>
                      <p className="flex items-center gap-1 text-xs text-[var(--unilabor-neutral)]">
                        {branch.agent ? (
                          <>
                            {branch.agent.is_online ? <Wifi size={13} className="text-emerald-700" /> : <WifiOff size={13} className="text-amber-700" />}
                            {branch.agent.name} · {branch.agent.is_online ? 'en línea' : 'sin conexión'} · {branch.pending_sync_count} por sincronizar
                          </>
                        ) : (
                          'Sin agente instalado'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={primaryButtonClass}
                      disabled={!branch.agent || !branch.agent.is_active || busyId !== null}
                      onClick={() => void handleSync(branch)}
                    >
                      {busyId === branch.branch_id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} aria-hidden="true" />} Sincronizar
                    </button>
                  </div>
                  {result ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-emerald-800">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {result.queued} orden(es): {result.queued_sync} alta(s), {result.queued_remove} baja(s)
                      {result.skipped_without_number > 0 ? `, ${result.skipped_without_number} omitido(s) sin número` : ''}
                      {(result.skipped_invalid_number ?? 0) > 0 ? `, ${result.skipped_invalid_number} con número no válido` : ''}.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <div className="flex justify-end border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};
