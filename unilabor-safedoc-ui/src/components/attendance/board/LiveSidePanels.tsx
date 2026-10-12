import { CalendarClock, Cpu, Trophy, WifiOff } from 'lucide-react';
import type { LiveBoard } from '../../../api/service.api-attendance-boards';
import { formatDateShort, formatDateTime } from '../shared/format';
import { BAD_COLOR, GOOD_COLOR, percentColor } from './boardHelpers';
import { EmptyNote, SectionCard, StatusDot } from './BoardParts';

export const AbsencesPanel = ({ board }: { board: LiveBoard }) => {
  const { items, total } = board.absences_next_7_days;
  return (
    <SectionCard title="Ausencias próximos 7 días" icon={<CalendarClock size={18} />}
      aside={<span className="text-xs font-semibold text-[var(--unilabor-neutral)]">{total}</span>}>
      {items.length === 0 ? (
        <EmptyNote>Sin ausencias autorizadas en los próximos 7 días.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.incident_id} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--color-brand-700)]">{item.full_name}</p>
              <p className="text-xs text-[var(--unilabor-neutral)]">
                {item.type_name} · {formatDateShort(item.start_date)}
                {item.end_date !== item.start_date ? ` → ${formatDateShort(item.end_date)}` : ''}
              </p>
            </li>
          ))}
          {total > items.length && (
            <li className="text-xs text-[var(--unilabor-neutral)]">y {total - items.length} más…</li>
          )}
        </ul>
      )}
    </SectionCard>
  );
};

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

export const MonthRanking = ({ board }: { board: LiveBoard }) => (
  <SectionCard title="Ranking del mes" icon={<Trophy size={18} />}>
    {board.month_ranking.length === 0 ? (
      <EmptyNote>Aún no hay días cerrados este mes para calcular el ranking.</EmptyNote>
    ) : (
      <ol className="space-y-2">
        {board.month_ranking.map((item, idx) => (
          <li key={item.employee_id} className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
            <span className="w-6 text-center text-sm font-black text-[var(--unilabor-neutral)]">{idx + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--color-brand-700)]">{item.full_name}</span>
              <span className="block text-xs text-[var(--unilabor-neutral)]">
                {item.lates} retardos · {item.absences} faltas · racha {item.streak}
              </span>
            </span>
            <span className="text-lg font-black" style={{ color: percentColor(item.index) }}>
              {item.index ?? '—'}
            </span>
          </li>
        ))}
      </ol>
    )}
  </SectionCard>
);
