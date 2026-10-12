import { Medal, Trophy } from 'lucide-react';
import type { CommitmentBoard, CommitmentPerson } from '../../../api/service.api-attendance-boards';
import { COMMITMENT_LEVEL_LABEL } from '../shared/dayResult';
import { MEDALS, formatMinutes, formatNumber, formatPercent, levelColor, percentColor } from './boardHelpers';
import { EmptyNote, MiniBar, SectionCard } from './BoardParts';
import { tdClass, thClass } from './boardStyles';

const PctCell = ({ value, weights }: { value: number | null; weights: CommitmentBoard['weights'] }) => {
  const color = percentColor(value, weights);
  return (
    <td className={`${tdClass} min-w-[6.5rem]`}>
      <span className="text-sm font-bold" style={{ color }}>{formatPercent(value)}</span>
      <div className="mt-1"><MiniBar value={value} color={color} /></div>
    </td>
  );
};

const Place = ({ place }: { place: number }) =>
  place <= 3 ? (
    <span className="inline-flex items-center gap-1 font-black" style={{ color: MEDALS[place - 1] }} aria-label={`Lugar ${place}`}>
      <Medal size={18} aria-hidden="true" /> {place}
    </span>
  ) : (
    <span className="font-bold text-[var(--unilabor-neutral)]">{place}</span>
  );

export const CommitmentRanking = ({ board, onSelect }: { board: CommitmentBoard; onSelect: (person: CommitmentPerson) => void }) => (
  <SectionCard title="Ranking de compromiso" icon={<Trophy size={18} />}
    aside={<span className="text-xs text-[var(--unilabor-neutral)]">{board.people.length} colaboradores</span>}>
    {board.people.length === 0 ? (
      <EmptyNote>No hay colaboradores con control de asistencia habilitado para estos filtros.</EmptyNote>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[rgba(0,65,106,0.08)]">
          <thead>
            <tr>
              <th className={thClass}>Lugar</th>
              <th className={thClass}>Colaborador</th>
              <th className={`${thClass} text-center`}>Índice</th>
              <th className={thClass}>Asistencia</th>
              <th className={thClass}>Puntualidad</th>
              <th className={thClass}>Salidas</th>
              <th className={thClass}>Retardos</th>
              <th className={thClass}>Faltas</th>
              <th className={thClass}>Racha</th>
              <th className={`${thClass} text-right`}>Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
            {board.people.map((person) => {
              const s = person.summary;
              const color = levelColor(person.level);
              return (
                <tr key={person.employee_id} tabIndex={0} aria-label={`Ver detalle de ${person.full_name}`}
                  onClick={() => onSelect(person)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(person); } }}
                  className="cursor-pointer transition hover:bg-[rgba(191,212,230,0.2)] focus:bg-[rgba(191,212,230,0.2)] focus:outline-none">
                  <td className={tdClass}><Place place={person.place} /></td>
                  <td className={tdClass}>
                    <span className="block font-semibold text-[var(--color-brand-700)]">{person.full_name}</span>
                    <span className="block text-xs text-[var(--unilabor-neutral)]">
                      {person.code}{person.branch_name ? ` · ${person.branch_name}` : ''}
                    </span>
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <span className="block text-2xl font-black leading-none" style={{ color }}>{person.index ?? '—'}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase" style={{ color }}>
                      {COMMITMENT_LEVEL_LABEL[person.level] ?? person.level}
                    </span>
                  </td>
                  <PctCell value={s.pct_attendance} weights={board.weights} />
                  <PctCell value={s.pct_punctuality} weights={board.weights} />
                  <PctCell value={s.pct_exits} weights={board.weights} />
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span className="font-semibold">{s.lates}</span>
                    <span className="block text-xs text-[var(--unilabor-neutral)]">{formatMinutes(s.late_minutes)}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span className="font-semibold">{s.absences}</span>
                    <span className="block text-xs text-[var(--unilabor-neutral)]">{s.partial_absences} parciales</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span className="font-semibold">{s.current_streak}</span>
                    <span className="block text-xs text-[var(--unilabor-neutral)]">mejor {s.best_streak}</span>
                  </td>
                  <td className={`${tdClass} text-right`}>{formatNumber(s.hours, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </SectionCard>
);
