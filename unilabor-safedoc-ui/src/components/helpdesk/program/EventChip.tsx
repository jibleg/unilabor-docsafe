import { AlertTriangle, CheckCircle2, Clock3, PenLine, Sparkles } from 'lucide-react';
import type { DragEvent } from 'react';
import type { CalendarEvent } from '../../../types/helpdesk-program';
import { KIND_STYLES, canRescheduleEvent, eventTooltip } from '../../../utils/maintenanceProgram';

interface EventChipProps {
  event: CalendarEvent;
  selected?: boolean;
  compact?: boolean;
  onSelect: (event: CalendarEvent) => void;
  draggable?: boolean;
}

const statusIcon = (event: CalendarEvent) => {
  if (event.status === 'CLOSED') return <CheckCircle2 size={11} className="shrink-0 opacity-70" />;
  if (event.window_state === 'OVERDUE') return <AlertTriangle size={11} className="shrink-0 text-[#b02a2a]" />;
  if (event.status === 'PENDING_VALIDATION') return <PenLine size={11} className="shrink-0" />;
  if (event.status === 'IN_PROGRESS') return <Clock3 size={11} className="shrink-0" />;
  if (event.is_projected) return <Sparkles size={11} className="shrink-0 opacity-60" />;
  return null;
};

export const EventChip = ({ event, selected = false, compact = false, onSelect, draggable = true }: EventChipProps) => {
  const style = KIND_STYLES[event.kind];
  const closed = event.status === 'CLOSED';
  const overdue = event.window_state === 'OVERDUE';
  const canDrag = draggable && canRescheduleEvent(event);

  const handleDragStart = (dragEvent: DragEvent<HTMLButtonElement>) => {
    dragEvent.dataTransfer.setData('text/plain', event.id);
    dragEvent.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      type="button"
      draggable={canDrag}
      onDragStart={canDrag ? handleDragStart : undefined}
      onClick={() => onSelect(event)}
      title={eventTooltip(event)}
      className={`group flex w-full items-center gap-1.5 rounded-lg border-l-[3px] px-1.5 py-[3px] text-left text-[11px] font-semibold leading-tight transition hover:shadow-md ${style.chip} ${
        closed ? 'opacity-55' : ''
      } ${event.is_projected && !closed ? 'border-dashed' : ''} ${overdue ? 'ring-1 ring-[rgba(190,40,40,0.55)]' : ''} ${
        selected ? 'ring-2 ring-[var(--color-brand-500)]' : ''
      } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ borderLeftColor: 'currentColor' }}
    >
      {statusIcon(event)}
      <span className="truncate">
        <span className="font-bold">{event.asset.asset_code}</span>
        {!compact ? <span className="font-medium opacity-90"> · {event.title}</span> : null}
      </span>
    </button>
  );
};
