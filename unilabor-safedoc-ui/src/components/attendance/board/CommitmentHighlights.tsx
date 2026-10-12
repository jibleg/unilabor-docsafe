import { Award, BarChart3, ShieldAlert } from 'lucide-react';
import type { CommitmentBoard, CommitmentPerson } from '../../../api/service.api-attendance-boards';
import { COMMITMENT_LEVEL_LABEL } from '../shared/dayResult';
import { formatDate } from '../shared/format';
import { MEDALS, levelColor } from './boardHelpers';
import { EmptyNote, LevelBadge, SectionCard } from './BoardParts';
import { StackedTrend } from './TrendChart';

const PersonButton = ({ person, onSelect, badge }: { person: CommitmentPerson; onSelect: (id: number) => void; badge?: string }) => (
  <button type="button" onClick={() => onSelect(person.employee_id)}
    className="flex w-full items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-left transition hover:border-[var(--color-brand-300)]">
    {badge && <span className="text-lg font-black" style={{ color: badge }} aria-hidden="true">●</span>}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-[var(--color-brand-700)]">{person.full_name}</span>
      <span className="block text-xs text-[var(--unilabor-neutral)]">
        {person.summary.lates} retardos · {person.summary.absences} faltas
      </span>
    </span>
    <span className="text-right">
      <span className="block text-xl font-black" style={{ color: levelColor(person.level) }}>{person.index ?? '—'}</span>
      <LevelBadge label={COMMITMENT_LEVEL_LABEL[person.level] ?? person.level} color={levelColor(person.level)} />
    </span>
  </button>
);

export const CommitmentHighlights = ({ board, onSelect }: { board: CommitmentBoard; onSelect: (id: number) => void }) => (
  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    <SectionCard title="Reconocimientos" icon={<Award size={18} />}>
      {board.recognitions.length === 0 ? (
        <EmptyNote>Aún no hay colaboradores con nivel comprometido o ejemplar (se requieren al menos 3 días esperados).</EmptyNote>
      ) : (
        <ol className="space-y-2">
          {board.recognitions.map((person, i) => (
            <li key={person.employee_id}>
              <PersonButton person={person} onSelect={onSelect} badge={MEDALS[i]} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
    <SectionCard title="Requieren atención" icon={<ShieldAlert size={18} />}>
      {board.attention.length === 0 ? (
        <EmptyNote>Nadie requiere atención en este periodo.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {board.attention.map((person) => (
            <li key={person.employee_id}><PersonButton person={person} onSelect={onSelect} /></li>
          ))}
        </ul>
      )}
    </SectionCard>
    <SectionCard title="Tendencia" icon={<BarChart3 size={18} />} className="xl:col-span-2"
      aside={<span className="text-xs text-[var(--unilabor-neutral)]">
        Por {board.trend.granularity === 'day' ? 'día' : board.trend.granularity === 'week' ? 'semana' : 'mes'}
        {board.closed_through ? ` · cerrado al ${formatDate(board.closed_through)}` : ''}
      </span>}>
      <StackedTrend title={`Tendencia de ${board.label}`}
        blocks={board.trend.blocks.map((b) => ({ key: b.date, label: b.label, attendances: b.attendances, lates: b.lates, absences: b.absences, incidents: b.incidents }))} />
    </SectionCard>
  </div>
);
