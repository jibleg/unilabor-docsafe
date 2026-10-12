import { Ban, CheckCircle2, FlaskConical, KeyRound, Loader2, Monitor, Plus, RefreshCcw, Trash2, Wifi, WifiOff } from 'lucide-react';
import type { DevicesBranchOverview } from '../../../api/service.api-attendance-devices';
import { timeSince } from './deviceHelpers';
import { primaryButtonClass, secondaryButtonClass } from './ModalShell';
import { TerminalRow } from './TerminalRow';

export interface BranchCardActions {
  onCreateAgent: (branch: DevicesBranchOverview) => void;
  onRotateKey: (agentId: number) => void;
  onTest: (agentId: number) => void;
  onSync: (agentId: number, all: boolean) => void;
  onToggleActive: (agentId: number, active: boolean) => void;
  onDelete: (agentId: number) => void;
  onRenameTerminal: (terminalId: number, name: string) => Promise<boolean>;
}

interface BranchCardProps extends BranchCardActions {
  branch: DevicesBranchOverview;
  /** Accion en curso para el agente (deshabilita botones). */
  busy: boolean;
}

const smallButton = `${secondaryButtonClass} !px-2.5 !py-1.5 !text-xs`;

export const BranchCard = ({ branch, busy, ...actions }: BranchCardProps) => {
  const { agent, terminals } = branch;
  const inactive = agent ? !agent.is_active : false;

  return (
    <section className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm sm:p-5" aria-label={`Sucursal ${branch.branch_name}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-[var(--color-brand-700)]">{branch.branch_name}</h2>
          <p className="text-xs text-slate-500">Sucursal {branch.branch_code}</p>
        </div>
        {agent ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              inactive ? 'bg-slate-100 text-slate-600' : agent.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
            }`}
          >
            {inactive ? <Ban size={14} aria-hidden /> : agent.is_online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />}
            {inactive ? 'Agente inactivo' : agent.is_online ? 'Agente en línea' : `Fuera de línea · ${timeSince(agent.last_heartbeat_at)}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Sin agente
          </span>
        )}
      </header>

      {!agent ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[rgba(0,65,106,0.2)] p-4">
          <p className="text-sm text-slate-600">Esta sucursal aún no tiene agente. Créalo para conectar sus relojes.</p>
          <button type="button" className={primaryButtonClass} onClick={() => actions.onCreateAgent(branch)}>
            <Plus size={16} /> Crear agente
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--unilabor-ink)]"><Monitor size={14} aria-hidden /> {agent.name}</span>
            <span>PC: {agent.host_name ?? '—'}</span>
            <span>SO: {agent.operating_system ?? '—'}</span>
            <span>Versión: {agent.software_version ?? '—'}</span>
            <span>IP: {agent.local_ip ?? '—'}</span>
            <span>Clave: {agent.api_key_prefix}…</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${branch.pending_sync_count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
              title="Colaboradores con alta pendiente o con error de sincronización"
            >
              {branch.pending_sync_count} por sincronizar
            </span>
            {branch.open_orders_count > 0 ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">{branch.open_orders_count} órdenes abiertas</span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={smallButton} disabled={busy || inactive} onClick={() => actions.onTest(agent.id)}>
              <FlaskConical size={14} /> Probar
            </button>
            <button type="button" className={smallButton} disabled={busy || inactive} onClick={() => actions.onSync(agent.id, false)}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Sincronizar pendientes
            </button>
            <button type="button" className={smallButton} disabled={busy || inactive} onClick={() => actions.onSync(agent.id, true)}>
              <RefreshCcw size={14} /> Sincronizar todos
            </button>
            <button type="button" className={smallButton} disabled={busy} onClick={() => actions.onRotateKey(agent.id)}>
              <KeyRound size={14} /> Rotar clave
            </button>
            <button type="button" className={smallButton} disabled={busy} onClick={() => actions.onToggleActive(agent.id, !agent.is_active)}>
              {agent.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />} {agent.is_active ? 'Desactivar' : 'Reactivar'}
            </button>
            {inactive ? (
              <button type="button" className={`${smallButton} !border-red-200 !text-red-700 hover:!bg-red-50`} disabled={busy} onClick={() => actions.onDelete(agent.id)}>
                <Trash2 size={14} /> Eliminar
              </button>
            ) : null}
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Relojes ({terminals.length})</h3>
            {terminals.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                Aún no hay relojes. Aparecen solos cuando el agente reporta su primer latido.
              </p>
            ) : (
              <ul className="space-y-2">
                {terminals.map((terminal) => (
                  <TerminalRow key={terminal.id} terminal={terminal} agentOnline={agent.is_online} onRename={actions.onRenameTerminal} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
};
