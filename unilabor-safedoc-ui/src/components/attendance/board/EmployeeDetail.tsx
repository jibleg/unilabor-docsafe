import { ArrowLeft, CalendarCheck, ClipboardList, Flame, Sparkles, Users } from 'lucide-react';
import type { CommitmentBoard, CommitmentComparisonItem } from '../../../api/service.api-attendance-boards';
import { COMMITMENT_LEVEL_LABEL, DAY_RESULT_COLOR, DAY_RESULT_LABEL } from '../shared/dayResult';
import { formatDate, formatDateShort, formatHours } from '../shared/format';
import { REVIEW_REASON_LABEL, formatDifference, formatMinutes, formatNumber, formatPercent, levelColor, percentColor } from './boardHelpers';
import { EmptyNote, LevelBadge, MiniBar, ProgressRing, SectionCard } from './BoardParts';
import { buildKpis } from './boardKpis';
import { cardClass, ghostButtonClass, tdClass, thClass } from './boardStyles';

const Comparison = ({ label, item, weights }: { label: string; item: CommitmentComparisonItem; weights: CommitmentBoard['weights'] }) => {
  const color = percentColor(item.person, weights);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-brand-700)]">{label}</span>
        <span className="text-xs text-[var(--unilabor-neutral)]">
          <strong style={{ color }}>{formatPercent(item.person)}</strong> · equipo {formatPercent(item.team)} · {formatDifference(item.difference)}
        </span>
      </div>
      <div className="mt-2"><MiniBar value={item.person} color={color} marker={item.team} /></div>
    </div>
  );
};

export const EmployeeDetail = ({ board, onBack }: { board: CommitmentBoard; onBack: () => void }) => {
  const detail = board.detail;
  if (!detail) return null;
  const s = detail.summary;
  const color = levelColor(s.level);
  const cells = buildKpis(s, board.weights).slice(0, 7);
  const dayMap = new Map(detail.days.map((d) => [d.date, d]));

  return (
    <div className="space-y-5">
      <div className={`${cardClass} flex flex-wrap items-center gap-5`}>
        <ProgressRing value={s.index} color={color} size={112} sub="Índice" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onBack} className={`${ghostButtonClass} mb-2 !px-2.5 !py-1.5 text-xs`}>
            <ArrowLeft size={14} /> Volver al equipo
          </button>
          <h2 className="text-2xl font-bold text-[var(--color-brand-700)]">{detail.full_name}</h2>
          <p className="text-sm text-[var(--unilabor-neutral)]">{detail.code} · {board.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <LevelBadge label={COMMITMENT_LEVEL_LABEL[s.level] ?? s.level} color={color} />
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--unilabor-ink)]">
              <Flame size={16} className="text-[#d98b00]" aria-hidden="true" />
              Racha {detail.streak.current} · mejor {detail.streak.best}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cells.map((kpi) => (
            <div key={kpi.label} className="min-w-[6.5rem] rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
              <p className="text-[11px] text-[var(--unilabor-neutral)]">{kpi.label}</p>
              <p className="text-lg font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Logros" icon={<Sparkles size={18} />}>
          {detail.achievements.length === 0 ? (
            <EmptyNote>Sin logros en este periodo todavía.</EmptyNote>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {detail.achievements.map((a) => (
                <li key={a.code} className="inline-flex items-center gap-1.5 rounded-full bg-[#0ca30c1f] px-3 py-1 text-sm font-semibold text-[#0a7a0a]">
                  <Sparkles size={14} aria-hidden="true" /> {a.label}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Contra el equipo" icon={<Users size={18} />}>
          <div className="space-y-4">
            <Comparison label="Asistencia" item={detail.comparison.attendance} weights={board.weights} />
            <Comparison label="Puntualidad" item={detail.comparison.punctuality} weights={board.weights} />
            <Comparison label="Salidas completas" item={detail.comparison.exits} weights={board.weights} />
          </div>
          <p className="mt-3 text-xs text-[var(--unilabor-neutral)]">La marca vertical indica el promedio del equipo.</p>
        </SectionCard>
      </div>

      <SectionCard title="Días del periodo" icon={<CalendarCheck size={18} />}>
        {detail.days.length === 0 ? (
          <EmptyNote>No hay días cerrados en este periodo.</EmptyNote>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Resultado por día">
              {detail.days.map((day) => {
                const c = DAY_RESULT_COLOR[day.day_result] ?? '#898781';
                const label = DAY_RESULT_LABEL[day.day_result] ?? day.day_result;
                const tip = `${formatDateShort(day.date)}: ${label}${day.clock_in ? ` · ${day.clock_in}–${day.clock_out ?? '?'}` : ''}${day.late_minutes ? ` · ${day.late_minutes} min de retardo` : ''}`;
                return (
                  <span key={day.date} role="listitem" title={tip} aria-label={tip}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold text-white"
                    style={{ background: c, outline: day.has_pending_review ? '2px solid #0284c7' : undefined, outlineOffset: 1 }}>
                    {day.date.slice(8, 10)}
                  </span>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--unilabor-neutral)]">
              {Array.from(new Set(detail.days.map((d) => d.day_result))).map((r) => (
                <li key={r} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DAY_RESULT_COLOR[r] }} aria-hidden="true" />
                  {DAY_RESULT_LABEL[r] ?? r}
                </li>
              ))}
              <li className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-[#0284c7]" aria-hidden="true" /> Con revisión pendiente
              </li>
            </ul>
          </>
        )}
      </SectionCard>

      <SectionCard title="Días por revisar" icon={<ClipboardList size={18} />}>
        {detail.days_to_review.length === 0 ? (
          <EmptyNote>Sin días pendientes de revisión.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[rgba(0,65,106,0.08)]">
              <thead>
                <tr>
                  <th className={thClass}>Fecha</th><th className={thClass}>Resultado</th><th className={thClass}>Motivo</th>
                  <th className={thClass}>Entrada / salida</th><th className={`${thClass} text-right`}>Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
                {detail.days_to_review.map((row) => {
                  const day = dayMap.get(row.date);
                  return (
                    <tr key={`${row.date}-${row.reason}`}>
                      <td className={tdClass}>{formatDate(row.date)}</td>
                      <td className={tdClass}>
                        <span className="inline-flex items-center gap-2 font-medium" style={{ color: DAY_RESULT_COLOR[row.day_result] }}>
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DAY_RESULT_COLOR[row.day_result] }} aria-hidden="true" />
                          {DAY_RESULT_LABEL[row.day_result] ?? row.day_result}
                        </span>
                      </td>
                      <td className={tdClass}>{REVIEW_REASON_LABEL[row.reason] ?? row.reason}</td>
                      <td className={tdClass}>{day ? `${day.clock_in ?? '—'} / ${day.clock_out ?? '—'}` : '—'}</td>
                      <td className={`${tdClass} text-right`}>{formatHours(day?.worked_hours)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--unilabor-neutral)]">
          Retardos: {s.lates} ({formatMinutes(s.late_minutes)}) · Horas extra: {formatNumber(s.overtime_hours, 1)} h
        </p>
      </SectionCard>
    </div>
  );
};
