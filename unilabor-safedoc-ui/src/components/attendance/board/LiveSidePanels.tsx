import { Cpu, WifiOff } from 'lucide-react';
import type { LiveBoard } from '../../../api/service.api-attendance-boards';
import { formatDateTime } from '../shared/format';
import { BAD_COLOR, GOOD_COLOR } from './boardHelpers';
import { EmptyNote, SectionCard, StatusDot } from './BoardParts';

export const DevicesPanel = ({ board }: { board: LiveBoard }) => (
  <SectionCard title="Agentes y relojes" icon={<Cpu size={18} />}>
    {board.devices.length === 0 ? (
      <EmptyNote>Aún no hay sucursales con agente o relojes configurados.</EmptyNote>
    ) : (
      <ul className="space-y-2">
        {board.devices.map((device) => {
          const online = device.agent?.online ?? false;
          const noAgent = device.agent === null;
          const color = online ? GOOD_COLOR : BAD_COLOR;
          return (
            <li key={device.branch_id} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-[var(--color-brand-700)]">{device.branch_name}</p>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold" style={{ color }}>
                  {online ? <StatusDot color={color} /> : <WifiOff size={13} />}
                  {noAgent ? 'Sin agente' : online ? 'En línea' : 'Fuera de línea'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--unilabor-neutral)]">
                {device.agent ? `${device.agent.name} · ` : ''}
                Relojes {device.terminals_online}/{device.terminals_total} en línea · Último evento: {formatDateTime(device.last_event_at)}
              </p>
              {!online && !noAgent && (
                <p className="mt-1 text-xs font-medium" style={{ color: BAD_COLOR }}>
                  Sin latido reciente ({formatDateTime(device.agent?.last_heartbeat_at)}). Las checadas pueden llegar con retraso.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </SectionCard>
);
