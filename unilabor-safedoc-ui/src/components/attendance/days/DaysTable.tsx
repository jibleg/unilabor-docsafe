import { PenLine, ShieldCheck } from 'lucide-react';
import type { AttendanceDay, DaySegment } from '../../../api/service.api-attendance-days';
import { DAY_RESULT_COLOR, DAY_RESULT_LABEL } from '../shared/dayResult';
import { formatClock, formatDateShort, formatHours, formatTime, todayIso } from '../shared/format';
import { canJustifyDay, dayRowTone, reasonLabel } from './dayHelpers';

const AMBER = '#b97300';
const RED = '#d03b3b';
const thClass = 'whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]';

const ResultBadge = ({ day }: { day: AttendanceDay }) => {
  const color = DAY_RESULT_COLOR[day.day_result] ?? '#898781';
  const detail = day.day_result === 'incident' ? day.incident?.name : reasonLabel(day.reason);
  return (
    <div className="space-y-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold"
        style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {DAY_RESULT_LABEL[day.day_result] ?? day.day_result}
      </span>
      {detail && day.day_result !== 'present' ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{detail}</p> : null}
      {day.is_late_accumulation_absence ? <p className="text-[11px] font-bold" style={{ color: RED }}>Falta por retardos acumulados</p> : null}
      {day.has_pending_review ? <p className="text-[11px] font-bold" style={{ color: AMBER }}>Checada en revisión</p> : null}
    </div>
  );
};

/** Lineas por bloque (jornada partida) o una sola linea con los datos del dia. */
const toLines = (day: AttendanceDay): DaySegment[] =>
  day.segments.length > 0
    ? day.segments
    : [{
        shift_id: null, name: null, expected_start: day.expected_start_time, expected_end: day.expected_end_time,
        clock_in_at: day.clock_in_at, clock_out_at: day.clock_out_at, clock_in_punch_id: null, clock_out_punch_id: null,
        late_minutes: day.late_minutes, early_departure_minutes: day.early_departure_minutes, hours: Number(day.worked_hours ?? 0), has_punches: false,
      }];

interface DaysTableProps {
  days: AttendanceDay[];
  canAuthorize: boolean;
  onJustify: (day: AttendanceDay) => void;
  onManualPunch: (day: AttendanceDay) => void;
}

export const DaysTable = ({ days, canAuthorize, onJustify, onManualPunch }: DaysTableProps) => {
  const today = todayIso();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
          <tr>
            <th className={thClass}>Día</th>
            <th className={thClass}>Colaborador</th>
            <th className={thClass}>Horario</th>
            <th className={thClass}>Entrada</th>
            <th className={thClass}>Salida</th>
            <th className={thClass}>Resultado</th>
            <th className={`${thClass} text-right`}>Horas</th>
            <th className={`${thClass} text-right`}>Extra</th>
            {canAuthorize ? <th className={`${thClass} text-center`}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
          {days.map((day) => {
            const tone = dayRowTone(day);
            const lines = toLines(day);
            const rowBg = tone === 'absent' ? 'bg-[rgba(208,59,59,0.06)]' : tone === 'review' ? 'bg-[rgba(217,139,0,0.08)]' : '';
            const justifiable = canJustifyDay(day);
            const manualAllowed = day.work_date <= today;
            return (
              <tr key={day.id} className={`align-top ${rowBg}`}>
                <td className="whitespace-nowrap px-3 py-3 font-semibold capitalize text-[var(--color-brand-700)]">{formatDateShort(day.work_date)}</td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-[var(--unilabor-ink)]">{day.employee.full_name}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {[day.employee.code, day.employee.branch_name].filter(Boolean).join(' · ') || 'Sin sucursal'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--unilabor-ink)]">
                  {lines.some((l) => l.expected_start) ? (
                    lines.map((l, i) => (
                      <p key={i}>{l.expected_start ? `${formatClock(l.expected_start)} – ${formatClock(l.expected_end)}` : '—'}</p>
                    ))
                  ) : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {lines.map((l, i) => (
                    <p key={i} className="text-[var(--unilabor-ink)]">
                      {formatTime(l.clock_in_at)}
                      {l.late_minutes > 0 ? <span className="ml-1.5 text-xs font-bold" style={{ color: AMBER }}>+{l.late_minutes} min</span> : null}
                    </p>
                  ))}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {lines.map((l, i) => (
                    <p key={i} className="text-[var(--unilabor-ink)]">
                      {formatTime(l.clock_out_at)}
                      {l.early_departure_minutes > 0 ? <span className="ml-1.5 text-xs font-bold" style={{ color: AMBER }}>−{l.early_departure_minutes} min</span> : null}
                    </p>
                  ))}
                </td>
                <td className="px-3 py-3"><ResultBadge day={day} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-[var(--unilabor-ink)]">{Number(day.worked_hours) > 0 ? formatHours(day.worked_hours) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--color-brand-700)]">{Number(day.overtime_hours) > 0 ? formatHours(day.overtime_hours) : '—'}</td>
                {canAuthorize ? (
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      {justifiable ? (
                        <button type="button" title="Justificar" aria-label={`Justificar ${day.employee.full_name} ${day.work_date}`} onClick={() => onJustify(day)}
                          className="rounded-lg p-1.5 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]">
                          <ShieldCheck size={17} />
                        </button>
                      ) : (
                        <span title="Solo se justifican faltas, retardos y salidas anticipadas" className="px-1.5 text-[var(--unilabor-neutral)]">—</span>
                      )}
                      {manualAllowed ? (
                        <button type="button" title="Checada manual" aria-label={`Checada manual ${day.employee.full_name} ${day.work_date}`} onClick={() => onManualPunch(day)}
                          className="rounded-lg p-1.5 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]">
                          <PenLine size={17} />
                        </button>
                      ) : (
                        <span title="No se permiten checadas en fechas futuras" className="px-1.5 text-[var(--unilabor-neutral)]">—</span>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
