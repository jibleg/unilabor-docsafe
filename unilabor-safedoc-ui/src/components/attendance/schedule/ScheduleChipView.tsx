import { Repeat } from 'lucide-react';
import type { ScheduleChip } from '../../../api/service.api-attendance-schedule';
import { formatHoursValue, readableTextColor } from './scheduleHelpers';

interface ScheduleChipViewProps {
  chip: ScheduleChip;
  onClick?: () => void;
}

/** Pildora de un turno (o de Descanso) dentro de una celda del calendario. */
export const ScheduleChipView = ({ chip, onClick }: ScheduleChipViewProps) => {
  const rest = chip.shift_id === null;
  const label = rest
    ? 'Descanso'
    : `${chip.start_time?.slice(0, 5)}-${chip.end_time?.slice(0, 5)} · ${formatHoursValue(chip.hours)} · ${chip.name}`;
  const style = rest
    ? undefined
    : { backgroundColor: chip.color_hex, color: readableTextColor(chip.color_hex) };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={`${label}${chip.is_recurring ? ' (se repite)' : ''}${chip.duplicate_count > 1 ? ` ×${chip.duplicate_count}` : ''}`}
      aria-label={`Editar ${label}`}
      style={style}
      className={`flex w-full items-center gap-1 rounded-full px-2 py-0.5 text-left text-[11px] font-semibold leading-tight shadow-sm transition hover:brightness-95 ${rest ? 'border border-dashed border-slate-400 bg-slate-50 text-slate-600' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {chip.is_recurring && <Repeat size={11} className="shrink-0" aria-label="Se repite" />}
      {chip.duplicate_count > 1 && <span className="shrink-0">×{chip.duplicate_count}</span>}
    </button>
  );
};
