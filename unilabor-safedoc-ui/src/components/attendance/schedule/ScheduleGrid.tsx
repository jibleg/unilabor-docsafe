import { AlertTriangle, Plus } from 'lucide-react';
import type { ScheduleChip, ScheduleEmployeeRow, ScheduleDay } from '../../../api/service.api-attendance-schedule';
import { WEEKDAY_SHORT, formatHoursValue, isoWeekday } from './scheduleHelpers';
import { ScheduleChipView } from './ScheduleChipView';

interface ScheduleGridProps {
  rows: ScheduleEmployeeRow[];
  dates: string[];
  today: string;
  maxShiftsPerDay: number;
  canWrite: boolean;
  selected: Set<number>;
  onToggleRow: (row: ScheduleEmployeeRow) => void;
  onToggleAll: () => void;
  onCellClick: (row: ScheduleEmployeeRow, date: string) => void;
  onChipClick: (row: ScheduleEmployeeRow, day: ScheduleDay, chip: ScheduleChip) => void;
}

export const ScheduleGrid = ({ rows, dates, today, maxShiftsPerDay, canWrite, selected, onToggleRow, onToggleAll, onCellClick, onChipClick }: ScheduleGridProps) => {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.employee_id));
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 shadow-sm">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <th className="sticky left-0 z-10 w-60 min-w-60 bg-[rgba(248,251,253,0.98)] px-3 py-2 text-left">
              <label className="flex items-center gap-2">
                {canWrite && <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Marcar todos los visibles" />}
                Colaborador
              </label>
            </th>
            {dates.map((date) => {
              const isToday = date === today;
              return (
                <th key={date} className={`min-w-32 px-2 py-2 text-center ${isToday ? 'bg-[rgba(249,179,24,0.16)] text-[var(--color-brand-700)]' : ''}`}>
                  <div>{WEEKDAY_SHORT[isoWeekday(date)]}</div>
                  <div className="text-sm font-bold normal-case tabular-nums">{date.slice(8, 10)}/{date.slice(5, 7)}</div>
                </th>
              );
            })}
            <th className="w-16 min-w-16 px-2 py-2 text-center">Horas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_id} className="border-b border-[rgba(0,65,106,0.06)] align-top last:border-0">
              <td className="sticky left-0 z-10 bg-white px-3 py-2">
                <label className="flex items-start gap-2">
                  {canWrite && (
                    <input type="checkbox" className="mt-1" checked={selected.has(row.employee_id)} onChange={() => onToggleRow(row)} aria-label={`Marcar a ${row.full_name}`} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--unilabor-ink)]">{row.full_name}</span>
                    <span className="block truncate text-xs text-[var(--unilabor-neutral)]">
                      {[row.employee_code, row.branch_name].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </label>
              </td>
              {dates.map((date) => {
                const day = row.days.find((d) => d.date === date);
                const isToday = date === today;
                // Un dia de descanso no admite turnos: primero se elimina el descanso (clic en su pildora).
                const canProgram = canWrite && !day?.is_rest_day;
                return (
                  <td
                    key={date}
                    onClick={canProgram ? () => onCellClick(row, date) : undefined}
                    title={canWrite && day?.is_rest_day ? 'Día de descanso: elimina el descanso para programar un turno' : undefined}
                    className={`group/cell relative px-1.5 py-1.5 ${isToday ? 'bg-[rgba(249,179,24,0.08)]' : ''} ${canProgram ? 'cursor-pointer hover:bg-[rgba(191,212,230,0.18)]' : ''}`}
                  >
                    <div className="space-y-1">
                      {day?.chips.map((chip) => (
                        <ScheduleChipView key={`${chip.assignment_id}-${chip.shift_id}`} chip={chip} onClick={canWrite ? () => onChipClick(row, day, chip) : undefined} />
                      ))}
                      {day?.is_split && !day.is_rest_day && (
                        <p className="px-1 text-[10px] font-semibold text-[var(--unilabor-neutral)]">
                          Jornada partida · {day.chips.length} tramos · {formatHoursValue(day.total_hours)}
                        </p>
                      )}
                      {day?.has_conflict_limit && (
                        <p className="flex items-center gap-1 px-1 text-[10px] font-semibold text-amber-700">
                          <AlertTriangle size={10} /> Límite de {maxShiftsPerDay} turnos
                        </p>
                      )}
                    </div>
                    {canProgram && (
                      <button
                        type="button"
                        aria-label={`Programar a ${row.full_name} el ${date}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCellClick(row, date);
                        }}
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-700)] text-white shadow focus:flex group-hover/cell:flex"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center text-xs font-bold tabular-nums text-[var(--color-brand-700)]">{formatHoursValue(row.week_hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
